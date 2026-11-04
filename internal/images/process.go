package images

import (
	"bytes"
	"errors"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"

	_ "image/gif" // decode only

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // decode only; Go cannot encode WebP
)

const (
	// MaxUpload is the most bytes accepted on the wire.
	MaxUpload = 20 << 20
	// MaxSide is the longest edge after processing.
	MaxSide = 2000
	// maxPixels guards against decompression bombs before decoding.
	maxPixels   = 40_000_000
	jpegQuality = 85
)

var (
	ErrNotImage = errors.New("that is not a JPEG, PNG, WebP or GIF")
	ErrTooLarge = errors.New("that image is too large")
)

// Processed is a stored image: bytes, their type, and the size they were stored at.
type Processed struct {
	Data        []byte
	ContentType string // image/jpeg or image/png
	Ext         string // jpg or png
	Width       int
	Height      int
}

// Process validates by content (not by name), caps the dimensions, strips
// metadata by re-encoding, and returns JPEG for opaque images and PNG for
// ones with transparency. Animated GIFs keep their first frame only.
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
