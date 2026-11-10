package images

import (
	"bytes"
	"errors"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"sync"

	"github.com/disintegration/imaging"
	"github.com/rwcarlsen/goexif/exif"
	_ "golang.org/x/image/webp" // decode only, since Go cannot encode WebP
)

const (
	// MaxUpload is the maximum number of bytes accepted in an upload.
	MaxUpload = 20 << 20
	// MaxSide is the maximum length of the longer edge after processing.
	MaxSide = 2000
	// maxPixels is the largest image the server decodes. The app never sends a larger one. Decoding takes memory in
	// proportion to the pixels, and the worst file of this size, a progressive CMYK JPEG, takes about 130 MB.
	maxPixels = MaxSide * MaxSide
	// maxAnimationPixels caps the sum of an animated GIF's frame areas. An
	// animated GIF is stored as uploaded and the server never decodes all of
	// its frames, so the cap protects the browsers that show it.
	maxAnimationPixels = 100_000_000
	jpegQuality        = 85
)

// processing makes the server process one image at a time. Decoding one image may take about 130 MB.
var processing sync.Mutex

var (
	ErrNotImage = errors.New("That is not a JPEG, PNG, WebP or GIF")
	ErrTooLarge = errors.New("That image is too large")
)

// Processed is a processed image: its bytes, their content type, and its dimensions.
type Processed struct {
	Data        []byte
	ContentType string // image/jpeg, image/png or image/gif
	Ext         string // jpg, png or gif
	Width       int
	Height      int
}

// Ext is the stored file extension for a content type.
func Ext(contentType string) string {
	switch contentType {
	case "image/png":
		return "png"
	case "image/gif":
		return "gif"
	default:
		return "jpg"
	}
}

// Process validates the image by its content rather than its file name. It refuses an image larger than maxPixels,
// from its header, before any pixel is decoded. It caps the dimensions, turns a
// photo upright and strips metadata by re-encoding. A transparent image becomes a PNG. An opaque JPEG stays a JPEG.
// Any other opaque image becomes whichever of JPEG and PNG is smaller. An animated GIF is the exception. It is
// stored without its metadata blocks but otherwise as uploaded, because re-encoding would lose the animation.
func Process(r io.Reader) (Processed, error) {
	processing.Lock()
	defer processing.Unlock()
	data, err := io.ReadAll(io.LimitReader(r, MaxUpload+1))
	if err != nil {
		return Processed{}, err
	}
	if len(data) > MaxUpload {
		return Processed{}, ErrTooLarge
	}
	switch http.DetectContentType(data) {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
	default:
		return Processed{}, ErrNotImage
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Processed{}, ErrNotImage
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxPixels {
		return Processed{}, ErrTooLarge
	}
	if format == "gif" {
		frames, area, _, err := scanGIF(data, false)
		if err != nil {
			return Processed{}, ErrNotImage
		}
		if frames > 1 {
			if area > maxAnimationPixels {
				return Processed{}, ErrTooLarge
			}
			_, _, clean, _ := scanGIF(data, true)
			// Only the first frame is decoded, to check that the file is a GIF.
			if _, err := gif.Decode(bytes.NewReader(clean)); err != nil {
				return Processed{}, ErrNotImage
			}
			return Processed{Data: clean, ContentType: "image/gif", Ext: "gif", Width: cfg.Width, Height: cfg.Height}, nil
		}
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return Processed{}, ErrNotImage
	}

	b := src.Bounds()
	w, h := fit(b.Dx(), b.Dy())
	if w != b.Dx() || h != b.Dy() {
		// imaging resizes in two passes through an intermediate image of 4 bytes a pixel. x/image/draw's kernel
		// scaler kept 32 bytes a pixel, about 194 MB for a 12-megapixel phone photo, and the server was killed.
		src = imaging.Resize(src, w, h, imaging.CatmullRom)
	}
	// A phone stores a photo as its sensor read it and records in EXIF how to turn it upright. The image is turned
	// after the resize, because turning it at full size takes another 4 bytes a pixel.
	if format == "jpeg" {
		src = upright(src, orientation(data))
		w, h = src.Bounds().Dx(), src.Bounds().Dy()
	}

	out := Processed{Width: w, Height: h}
	if !opaque(src) {
		// A transparent image is stored as PNG, which keeps the transparency.
		out.Data, err = encodePNG(src)
		out.ContentType, out.Ext = "image/png", "png"
		return out, err
	}
	jpg, err := encodeJPEG(src)
	if err != nil {
		return Processed{}, err
	}
	out.Data, out.ContentType, out.Ext = jpg, "image/jpeg", "jpg"
	// An opaque image from a lossless file, such as a screenshot, may be smaller as PNG, and PNG keeps text sharp. A
	// photo is smaller as JPEG. The smaller of the two is kept. A JPEG upload stays JPEG.
	if format != "jpeg" {
		if p, err := encodePNG(src); err == nil && len(p) < len(jpg) {
			out.Data, out.ContentType, out.Ext = p, "image/png", "png"
		}
	}
	return out, nil
}

// fit returns the size of an image of w by h after it is scaled to MaxSide on its longer side. A smaller image keeps
// its size.
func fit(w, h int) (int, int) {
	if w <= MaxSide && h <= MaxSide {
		return w, h
	}
	if w >= h {
		return MaxSide, max(1, h*MaxSide/w)
	}
	return max(1, w*MaxSide/h), MaxSide
}

// encodeJPEG encodes an opaque image. Go's JPEG encoder reads *image.RGBA, *image.YCbCr and *image.Gray directly and
// any other type one pixel at a time, which allocates for every pixel. An opaque *image.NRGBA holds the same bytes as
// an *image.RGBA, because every alpha value is 255, so it is passed as one without copying.
func encodeJPEG(img image.Image) ([]byte, error) {
	switch m := img.(type) {
	case *image.RGBA, *image.YCbCr, *image.Gray:
	case *image.NRGBA:
		img = &image.RGBA{Pix: m.Pix, Stride: m.Stride, Rect: m.Rect}
	default:
		n := imaging.Clone(img)
		img = &image.RGBA{Pix: n.Pix, Stride: n.Stride, Rect: n.Rect}
	}
	var buf bytes.Buffer
	err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: jpegQuality})
	return buf.Bytes(), err
}

// encodePNG encodes an image as PNG. Go's PNG encoder reads the common types directly. Any other type, such as a
// WebP with transparency or a CMYK JPEG, is copied to *image.NRGBA first, because the encoder would otherwise
// allocate for every pixel.
func encodePNG(img image.Image) ([]byte, error) {
	switch img.(type) {
	case *image.NRGBA, *image.RGBA, *image.Gray, *image.Gray16, *image.RGBA64, *image.NRGBA64, *image.Paletted:
	default:
		img = imaging.Clone(img)
	}
	var buf bytes.Buffer
	err := (&png.Encoder{CompressionLevel: png.BestCompression}).Encode(&buf, img)
	return buf.Bytes(), err
}

// orientation returns a JPEG's EXIF orientation, from 1 to 8. It returns 1, upright, when the file has no EXIF block
// or the block cannot be read, so a damaged block does not reject the photo.
func orientation(data []byte) (o int) {
	defer func() {
		if recover() != nil {
			o = 1
		}
	}()
	x, err := exif.Decode(bytes.NewReader(data))
	if err != nil {
		return 1
	}
	tag, err := x.Get(exif.Orientation)
	if err != nil {
		return 1
	}
	o, err = tag.Int(0)
	if err != nil || o < 1 || o > 8 {
		return 1
	}
	return o
}

// upright turns or flips an image as its EXIF orientation says.
func upright(img image.Image, o int) image.Image {
	switch o {
	case 2:
		return imaging.FlipH(img)
	case 3:
		return imaging.Rotate180(img)
	case 4:
		return imaging.FlipV(img)
	case 5:
		return imaging.Transpose(img)
	case 6:
		return imaging.Rotate270(img)
	case 7:
		return imaging.Transverse(img)
	case 8:
		return imaging.Rotate90(img)
	}
	return img
}

func opaque(img image.Image) bool {
	if o, ok := img.(interface{ Opaque() bool }); ok {
		return o.Opaque()
	}
	return true
}

// scanGIF reads a GIF's block structure. It returns the number of frames, the sum of their areas, and, when keep is
// true, a copy of the file without its metadata blocks. It skips the compressed image data without decompressing it, so a file whose
// frames would take gigabytes to decode costs one pass over its bytes. The copy keeps the frames, their timing and
// the loop count. It drops comments, plain text and every other application block, such as XMP. A file that ends
// without the trailer byte is accepted if it has a frame, because browsers show such files. The copy gets the
// trailer.
func scanGIF(data []byte, keep bool) (frames int, area int64, clean []byte, err error) {
	bad := errors.New("malformed GIF")
	if len(data) < 13 || (string(data[:6]) != "GIF87a" && string(data[:6]) != "GIF89a") {
		return 0, 0, nil, bad
	}
	i := 13
	if data[10]&0x80 != 0 {
		i += 3 << ((data[10] & 7) + 1) // the global colour table
	}
	if i > len(data) {
		return 0, 0, nil, bad
	}
	if keep {
		clean = append(make([]byte, 0, len(data)), data[:i]...)
	}
	// skip moves past a run of data sub-blocks and the zero byte that ends it.
	skip := func() bool {
		for i < len(data) {
			n := int(data[i])
			i++
			if n == 0 {
				return true
			}
			i += n
		}
		return false
	}
	for i < len(data) {
		start := i
		switch data[i] {
		case 0x3b: // trailer
			if keep {
				clean = append(clean, 0x3b)
			}
			return frames, area, clean, nil
		case 0x21: // extension: introducer, label, sub-blocks
			if i+2 > len(data) {
				return 0, 0, nil, bad
			}
			label := data[i+1]
			// An application block's first sub-block is 11 bytes: its identifier and version.
			loop := label == 0xff && i+14 <= len(data) && data[i+2] == 11 &&
				(string(data[i+3:i+14]) == "NETSCAPE2.0" || string(data[i+3:i+14]) == "ANIMEXTS1.0")
			i += 2
			if !skip() {
				return 0, 0, nil, bad
			}
			if keep && (label == 0xf9 || loop) { // graphic control, which holds a frame's timing, or the loop count
				clean = append(clean, data[start:i]...)
			}
		case 0x2c: // image descriptor
			if i+10 > len(data) {
				return 0, 0, nil, bad
			}
			w := int(data[i+5]) | int(data[i+6])<<8
			h := int(data[i+7]) | int(data[i+8])<<8
			packed := data[i+9]
			i += 10
			if packed&0x80 != 0 {
				i += 3 << ((packed & 7) + 1) // the local colour table
			}
			i++ // the LZW minimum code size
			if !skip() {
				return 0, 0, nil, bad
			}
			frames++
			area += int64(w) * int64(h)
			if keep {
				clean = append(clean, data[start:i]...)
			}
		default:
			return 0, 0, nil, bad
		}
	}
	if frames == 0 {
		return 0, 0, nil, bad
	}
	if keep {
		clean = append(clean, 0x3b)
	}
	return frames, area, clean, nil
}
