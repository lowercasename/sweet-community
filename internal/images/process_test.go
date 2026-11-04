package images

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"strings"
	"testing"
)

func gifOf(frames int) []byte {
	g := &gif.GIF{}
	for i := 0; i < frames; i++ {
		p := image.NewPaletted(image.Rect(0, 0, 8, 8), color.Palette{color.Black, color.White})
		for x := 0; x < 8; x++ {
			p.SetColorIndex(x, i%8, 1)
		}
		g.Image = append(g.Image, p)
		g.Delay = append(g.Delay, 10)
	}
	var buf bytes.Buffer
	gif.EncodeAll(&buf, g)
	return buf.Bytes()
}

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
	// Animated GIFs pass through untouched; static ones are re-encoded.
	anim := gifOf(3)
	p, err = Process(bytes.NewReader(anim))
	if err != nil || p.ContentType != "image/gif" || !bytes.Equal(p.Data, anim) || p.Width != 8 {
		t.Fatalf("animated gif: %+v %v", p.ContentType, err)
	}
	p, err = Process(bytes.NewReader(gifOf(1)))
	if err != nil || p.ContentType == "image/gif" {
		t.Fatalf("static gif should be re-encoded: %+v %v", p.ContentType, err)
	}
	// Not an image, whatever it claims to be.
	if _, err := Process(strings.NewReader("<svg xmlns='http://www.w3.org/2000/svg'></svg>")); err != ErrNotImage {
		t.Fatalf("svg: %v", err)
	}
	if _, err := Process(strings.NewReader("hello")); err != ErrNotImage {
		t.Fatalf("text: %v", err)
	}
}
