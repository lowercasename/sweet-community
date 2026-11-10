package images

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"net/http"

	"github.com/disintegration/imaging"
	"github.com/rwcarlsen/goexif/exif"
	_ "golang.org/x/image/webp" // decode only, since Go cannot encode WebP
)

const (
	// MaxUpload is the maximum number of bytes accepted in an upload.
	MaxUpload = 20 << 20
	// MaxSide is the maximum length of the longer edge after processing.
	MaxSide = 2000
	// maxAnimationPixels caps the sum of an animated GIF's frame areas. An
	// animated GIF is stored as uploaded and the server never decodes all of
	// its frames, so the cap protects the browsers that show it.
	maxAnimationPixels = 100_000_000
	jpegQuality        = 85
)

// slots limits how many images are processed at once. A community may run in
// a 128 MB container, so images are processed one at a time.
var slots = make(chan struct{}, 1)

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

// Process validates the image by its content rather than its file name. It refuses an image whose decoding would
// take more than decodeBudget, judged from the header before any pixel is decoded. It caps the dimensions, turns a
// photo upright and strips metadata by re-encoding. A transparent image becomes a PNG. An opaque JPEG stays a JPEG.
// Any other opaque image becomes whichever of JPEG and PNG is smaller. An animated GIF is the exception. It is
// stored without its metadata blocks but otherwise as uploaded, because re-encoding would lose the animation.
func Process(data []byte) (Processed, error) {
	if len(data) > MaxUpload {
		return Processed{}, ErrTooLarge
	}
	slots <- struct{}{}
	defer func() { <-slots }()
	switch http.DetectContentType(data) {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
	default:
		return Processed{}, ErrNotImage
	}
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Processed{}, ErrNotImage
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || estimate(data, format, cfg) > decodeBudget {
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
			// Only the first frame is decoded, to check that the file is a GIF. Its size is within the budget.
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

// The bytes for each pixel that decoding and processing take, measured on 2000 by 2000 images in a 128 MB container
// and rounded up. Processing includes the conversion for the encoder and both encodings of an opaque lossless image.
// See decodeCost. A JPEG's cost is read from its header, by jpegCost.
const (
	costJPEGWorst  = 28 // a progressive CMYK JPEG, measured 26
	costPNGGray    = 3  // measured 2.8
	costPNGGray16  = 9  // measured 8.3
	costPNG8       = 5  // measured 4.3
	costPNG16      = 16 // measured 15.5
	costPNGPalette = 8  // measured 7
	costGIF        = 8  // measured 7.5
	costWebPLossy  = 7  // measured 5.8
	costWebPAlpha  = 12 // measured 11.5
	costWebPLoss   = 5  // measured 4, lossless
)

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

// estimate returns the memory that decoding and processing an image will take, from its header. An image larger
// than MaxSide is resized through an intermediate image as wide as the result and as tall as the original, then into
// the result, both 4 bytes a pixel, while the decoded image is still held. A photo that EXIF says to turn is turned
// after the resize, which makes another copy of the result.
func estimate(data []byte, format string, cfg image.Config) int64 {
	perPixel := float64(decodeCost(format, cfg.ColorModel))
	if format == "jpeg" {
		perPixel = jpegCost(data)
	}
	cost := int64(float64(cfg.Width) * float64(cfg.Height) * perPixel)
	w, h := fit(cfg.Width, cfg.Height)
	if w != cfg.Width || h != cfg.Height {
		cost += int64(w)*int64(cfg.Height)*4 + int64(w)*int64(h)*4
	}
	if format == "jpeg" && orientation(data) != 1 {
		cost += int64(w) * int64(h) * 4
	}
	return cost
}

// jpegCost returns the bytes for each pixel that decoding a JPEG takes, from its frame header. Go's decoder keeps
// one byte for each colour sample, so 1.5 bytes a pixel for the usual 4:2:0 colour and 3 for full-resolution colour.
// A progressive JPEG also keeps 4 bytes for each sample until the last scan. A CMYK JPEG is converted twice, 8 bytes
// a pixel more. On 2000 by 2000 files the figures are at or a little above what was measured. A header that cannot
// be read is counted at the worst cost.
func jpegCost(data []byte) float64 {
	progressive, samples, components, ok := jpegFrame(data)
	if !ok {
		return costJPEGWorst
	}
	cost := samples
	if progressive {
		cost += 4 * samples
	}
	if components == 4 {
		cost += 8
	}
	return cost
}

// jpegFrame reads a JPEG's frame header, from the markers before the image data. It returns whether the JPEG is
// progressive, the colour samples for each pixel, the number of colour components, and whether a frame header was
// found.
func jpegFrame(data []byte) (progressive bool, samples float64, components int, ok bool) {
	if len(data) < 4 || data[0] != 0xff || data[1] != 0xd8 {
		return false, 0, 0, false
	}
	for i := 2; i+4 <= len(data); {
		if data[i] != 0xff {
			return false, 0, 0, false
		}
		marker := data[i+1]
		switch {
		case marker == 0xff: // a fill byte before a marker
			i++
			continue
		case marker == 0x01 || (marker >= 0xd0 && marker <= 0xd8): // markers without a length
			i += 2
			continue
		case marker == 0xda || marker == 0xd9: // the image data, or the end, before any frame header
			return false, 0, 0, false
		}
		length := int(data[i+2])<<8 | int(data[i+3])
		if length < 2 || i+2+length > len(data) {
			return false, 0, 0, false
		}
		// Start-of-frame markers are C0 to CF, except C4, C8 and CC, which are tables.
		if marker >= 0xc0 && marker <= 0xcf && marker != 0xc4 && marker != 0xc8 && marker != 0xcc {
			body := data[i+4 : i+2+length]
			if len(body) < 6 {
				return false, 0, 0, false
			}
			n := int(body[5])
			if n == 0 || len(body) < 6+3*n {
				return false, 0, 0, false
			}
			hmax, vmax := 1, 1
			for c := range n {
				f := body[6+3*c+1]
				// Sampling factors are 1 to 4. Go's decoder refuses any other.
				if h, v := int(f>>4), int(f&15); h < 1 || h > 4 || v < 1 || v > 4 {
					return false, 0, 0, false
				}
				hmax, vmax = max(hmax, int(f>>4)), max(vmax, int(f&15))
			}
			for c := range n {
				f := body[6+3*c+1]
				samples += float64(int(f>>4)*int(f&15)) / float64(hmax*vmax)
			}
			progressive = marker == 0xc2 || marker == 0xc6 || marker == 0xca || marker == 0xce
			return progressive, samples, n, true
		}
		i += 2 + length
	}
	return false, 0, 0, false
}

// decodeBudget is the most memory that decoding and processing one image may take. A community may run in a
// 128 MB container, and the server needs the rest.
const decodeBudget = 64 << 20

// decodeCost returns the bytes for each pixel that decoding and processing an image takes, by its format and the
// colour model in its header. A JPEG is costed from its frame header instead, by jpegCost.
func decodeCost(format string, m color.Model) int64 {
	switch format {
	case "png":
		switch m {
		case color.GrayModel:
			return costPNGGray
		case color.Gray16Model:
			return costPNGGray16
		case color.RGBAModel, color.NRGBAModel:
			return costPNG8
		case color.RGBA64Model, color.NRGBA64Model:
			return costPNG16
		}
		return costPNGPalette
	case "gif":
		return costGIF
	case "webp":
		switch m {
		case color.YCbCrModel:
			return costWebPLossy
		case color.NRGBAModel:
			return costWebPLoss
		}
		return costWebPAlpha
	}
	return costJPEGWorst
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
