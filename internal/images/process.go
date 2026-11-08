package images

import (
	"bytes"
	"errors"
	"image"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // decode only, since Go cannot encode WebP
)

const (
	// MaxUpload is the maximum number of bytes accepted in an upload.
	MaxUpload = 20 << 20
	// MaxSide is the maximum length of the longer edge after processing.
	MaxSide = 2000
	// maxPixels guards against decompression bombs before decoding.
	maxPixels   = 40_000_000
	jpegQuality = 85
)

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
// its dimensions, strips metadata by re-encoding it, and returns a JPEG for an
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
		if g, err := gif.DecodeAll(bytes.NewReader(data)); err == nil && len(g.Image) > 1 {
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
		dst := image.NewNRGBA(image.Rect(0, 0, w, h))
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
		src = dst
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

func opaque(img image.Image) bool {
	if o, ok := img.(interface{ Opaque() bool }); ok {
		return o.Opaque()
	}
	return true
}
