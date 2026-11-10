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

	"github.com/disintegration/imaging"
	"github.com/rwcarlsen/goexif/exif"
	_ "golang.org/x/image/webp" // decode only, since Go cannot encode WebP
)

const (
	// MaxUpload is the maximum number of bytes accepted in an upload.
	MaxUpload = 20 << 20
	// MaxSide is the maximum length of the longer edge after processing.
	MaxSide = 2000
	// maxPixels guards against decompression bombs before decoding.
	maxPixels = 40_000_000
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

// Process validates the image by its content rather than its file name, caps
// its dimensions, turns a photo upright, strips metadata by re-encoding it, and returns a JPEG for an
// opaque image or a PNG for an image with transparency. An animated GIF is the
// exception. It is stored as uploaded, because re-encoding would lose the
// animation.
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
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return Processed{}, ErrNotImage
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width*cfg.Height > maxPixels {
		return Processed{}, ErrTooLarge
	}
	if http.DetectContentType(data) == "image/gif" {
		frames, area, err := gifFrames(data)
		if err != nil {
			return Processed{}, ErrNotImage
		}
		if frames > 1 {
			if area > maxAnimationPixels {
				return Processed{}, ErrTooLarge
			}
			// Only the first frame is decoded, to check that the file is a GIF. Its size is bounded by maxPixels.
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
	if http.DetectContentType(data) == "image/jpeg" {
		src = upright(src, orientation(data))
		w, h = src.Bounds().Dx(), src.Bounds().Dy()
	}

	var buf bytes.Buffer
	out := Processed{Width: w, Height: h}
	if opaque(src) {
		if err := jpeg.Encode(&buf, src, &jpeg.Options{Quality: jpegQuality}); err != nil {
			return Processed{}, err
		}
		out.ContentType, out.Ext = "image/jpeg", "jpg"
	} else {
		if err := (&png.Encoder{CompressionLevel: png.BestCompression}).Encode(&buf, src); err != nil {
			return Processed{}, err
		}
		out.ContentType, out.Ext = "image/png", "png"
	}
	out.Data = buf.Bytes()
	return out, nil
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
