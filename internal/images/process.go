package images

import (
	"bytes"
	"errors"
	"image"
	"image/gif"
	"image/png"
	"io"
	"net/http"
	"sync"

	"github.com/disintegration/imaging"
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
		frames, area, clean, err := scanGIF(data)
		if err != nil {
			return Processed{}, ErrNotImage
		}
		if frames > 1 {
			if area > maxAnimationPixels {
				return Processed{}, ErrTooLarge
			}
			// Only the first frame is decoded, to check that the file is a GIF.
			if _, err := gif.Decode(bytes.NewReader(clean)); err != nil {
				return Processed{}, ErrNotImage
			}
			return Processed{Data: clean, ContentType: "image/gif", Width: cfg.Width, Height: cfg.Height}, nil
		}
	}
	// A phone stores a photo as its sensor read it and records in EXIF how to turn it upright. imaging turns it.
	src, err := imaging.Decode(bytes.NewReader(data), imaging.AutoOrientation(true))
	if err != nil {
		return Processed{}, ErrNotImage
	}
	if b := src.Bounds(); b.Dx() > MaxSide || b.Dy() > MaxSide {
		src = imaging.Fit(src, MaxSide, MaxSide, imaging.CatmullRom)
	}
	out := Processed{Width: src.Bounds().Dx(), Height: src.Bounds().Dy()}
	if !opaque(src) {
		// A transparent image is stored as PNG, which keeps the transparency.
		out.Data, err = encode(src, imaging.PNG)
		out.ContentType = "image/png"
		return out, err
	}
	if out.Data, err = encode(src, imaging.JPEG); err != nil {
		return Processed{}, err
	}
	out.ContentType = "image/jpeg"
	// An opaque image from a lossless file, such as a screenshot, may be smaller as PNG, and PNG keeps text sharp. A
	// photo is smaller as JPEG. The smaller of the two is kept. A JPEG upload stays JPEG.
	if format != "jpeg" {
		if p, err := encode(src, imaging.PNG); err == nil && len(p) < len(out.Data) {
			out.Data, out.ContentType = p, "image/png"
		}
	}
	return out, nil
}

// encode encodes an image as JPEG or PNG.
func encode(img image.Image, format imaging.Format) ([]byte, error) {
	var buf bytes.Buffer
	err := imaging.Encode(&buf, img, format, imaging.JPEGQuality(jpegQuality), imaging.PNGCompressionLevel(png.BestCompression))
	return buf.Bytes(), err
}

func opaque(img image.Image) bool {
	if o, ok := img.(interface{ Opaque() bool }); ok {
		return o.Opaque()
	}
	return true
}

// scanGIF reads a GIF's block structure. It returns the number of frames, the sum of their areas, and a copy of the
// file without its metadata blocks. It skips the compressed image data without decompressing it, so a file whose
// frames would take gigabytes to decode costs one pass over its bytes. The copy keeps the frames, their timing and
// the loop count. It drops comments, plain text and every other application block, such as XMP. A file that ends
// without the trailer byte is accepted if it has a frame, because browsers show such files. The copy gets the
// trailer.
func scanGIF(data []byte) (frames int, area int64, clean []byte, err error) {
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
	clean = append(make([]byte, 0, len(data)), data[:i]...)
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
			return frames, area, append(clean, 0x3b), nil
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
			if label == 0xf9 || loop { // graphic control, which holds a frame's timing, or the loop count
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
			clean = append(clean, data[start:i]...)
		default:
			return 0, 0, nil, bad
		}
	}
	if frames == 0 {
		return 0, 0, nil, bad
	}
	return frames, area, append(clean, 0x3b), nil
}
