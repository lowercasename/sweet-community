package images

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
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
// stored as uploaded, because re-encoding would lose the animation.
func Process(r io.Reader) (Processed, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxUpload+1))
	if err != nil {
		return Processed{}, err
	}
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
	if cfg.Width <= 0 || cfg.Height <= 0 || int64(cfg.Width)*int64(cfg.Height)*decodeCost(format, cfg.ColorModel) > decodeBudget {
		return Processed{}, ErrTooLarge
	}
	if format == "gif" {
		frames, area, err := gifFrames(data)
		if err != nil {
			return Processed{}, ErrNotImage
		}
		if frames > 1 {
			if area > maxAnimationPixels {
				return Processed{}, ErrTooLarge
			}
			// Only the first frame is decoded, to check that the file is a GIF. Its size is within the budget.
			if _, err := gif.Decode(bytes.NewReader(data)); err != nil {
				return Processed{}, ErrNotImage
			}
			return Processed{Data: data, ContentType: "image/gif", Ext: "gif", Width: cfg.Width, Height: cfg.Height}, nil
		}
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return Processed{}, ErrNotImage
	}

	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w > MaxSide || h > MaxSide {
		if w >= h {
			h = h * MaxSide / w
			w = MaxSide
		} else {
			w = w * MaxSide / h
			h = MaxSide
		}
		if w < 1 {
			w = 1
		}
		if h < 1 {
			h = 1
		}
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
// and rounded up. Processing includes the resize, the conversion for the encoder and both encodings of an opaque
// lossless image. See decodeCost.
const (
	costJPEGGray   = 6  // measured 5
	costJPEGColour = 16 // measured 14.5, progressive with full-resolution colour
	costJPEGCMYK   = 28 // measured 26
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

// decodeBudget is the most memory that decoding and processing one image may take. A community may run in a
// 128 MB container, and the server needs the rest.
const decodeBudget = 64 << 20

// decodeCost returns the bytes for each pixel that decoding and processing an image takes, by its format and the
// colour model in its header. The figures were measured. A JPEG is counted as progressive, its worst case: Go's
// progressive decoder keeps 4 bytes a pixel for each colour component, besides the image itself.
func decodeCost(format string, m color.Model) int64 {
	switch format {
	case "jpeg":
		switch m {
		case color.GrayModel:
			return costJPEGGray
		case color.CMYKModel:
			return costJPEGCMYK
		}
		return costJPEGColour
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
	return costJPEGCMYK
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

// gifFrames reads a GIF's block structure and returns the number of frames and
// the sum of their areas. It skips the compressed image data without
// decompressing it, so a file whose frames would take gigabytes to decode
// costs one pass over its bytes. A file that ends without the trailer byte is
// accepted if it has a frame, because browsers show such files.
func gifFrames(data []byte) (frames int, area int64, err error) {
	bad := errors.New("malformed GIF")
	if len(data) < 13 || (string(data[:6]) != "GIF87a" && string(data[:6]) != "GIF89a") {
		return 0, 0, bad
	}
	i := 13
	if data[10]&0x80 != 0 {
		i += 3 << ((data[10] & 7) + 1) // the global colour table
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
		switch data[i] {
		case 0x3b: // trailer
			return frames, area, nil
		case 0x21: // extension: introducer, label, sub-blocks
			i += 2
			if !skip() {
				return 0, 0, bad
			}
		case 0x2c: // image descriptor
			if i+10 > len(data) {
				return 0, 0, bad
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
				return 0, 0, bad
			}
			frames++
			area += int64(w) * int64(h)
		default:
			return 0, 0, bad
		}
	}
	if frames == 0 {
		return 0, 0, bad
	}
	return frames, area, nil
}
