package images

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"
)

func pngOf(w, h int, c color.Color) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

func TestProcess(t *testing.T) {
	// Opaque becomes JPEG; transparent stays PNG.
	p, err := Process(bytes.NewReader(pngOf(10, 10, color.NRGBA{200, 30, 30, 255})))
	if err != nil || p.ContentType != "image/jpeg" || p.Width != 10 {
		t.Fatalf("opaque: %+v %v", p, err)
	}
	p, err = Process(bytes.NewReader(pngOf(10, 10, color.NRGBA{200, 30, 30, 120})))
	if err != nil || p.ContentType != "image/png" {
		t.Fatalf("transparent: %+v %v", p, err)
	}
	// Longest side capped, aspect kept.
	p, err = Process(bytes.NewReader(pngOf(3000, 150, color.NRGBA{0, 0, 0, 255})))
	if err != nil || p.Width != MaxSide || p.Height != 100 {
		t.Fatalf("resize: %+v %v", p, err)
	}
	// Not an image, whatever it claims to be.
	if _, err := Process(strings.NewReader("<svg xmlns='http://www.w3.org/2000/svg'></svg>")); err != ErrNotImage {
		t.Fatalf("svg: %v", err)
	}
	if _, err := Process(strings.NewReader("hello")); err != ErrNotImage {
		t.Fatalf("text: %v", err)
	}
}
