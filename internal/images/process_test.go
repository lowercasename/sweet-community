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
	// An opaque image becomes a JPEG. A transparent image stays a PNG.
	p, err := Process(bytes.NewReader(pngOf(10, 10, color.NRGBA{200, 30, 30, 255})))
	if err != nil || p.ContentType != "image/jpeg" || p.Width != 10 {
		t.Fatalf("opaque: %+v %v", p, err)
	}
	p, err = Process(bytes.NewReader(pngOf(10, 10, color.NRGBA{200, 30, 30, 120})))
	if err != nil || p.ContentType != "image/png" {
		t.Fatalf("transparent: %+v %v", p, err)
	}
	// The longer side is capped at MaxSide and the aspect ratio is kept.
	p, err = Process(bytes.NewReader(pngOf(3000, 150, color.NRGBA{0, 0, 0, 255})))
	if err != nil || p.Width != MaxSide || p.Height != 100 {
		t.Fatalf("resize: %+v %v", p, err)
	}
	// An animated GIF is stored unchanged. A static GIF is re-encoded.
	anim := gifOf(3)
	p, err = Process(bytes.NewReader(anim))
	if err != nil || p.ContentType != "image/gif" || !bytes.Equal(p.Data, anim) || p.Width != 8 {
		t.Fatalf("animated gif: %+v %v", p.ContentType, err)
	}
	p, err = Process(bytes.NewReader(gifOf(1)))
	if err != nil || p.ContentType == "image/gif" {
		t.Fatalf("static gif should be re-encoded: %+v %v", p.ContentType, err)
	}
	// Input that is not an image is rejected regardless of what it claims to be.
	if _, err := Process(strings.NewReader("<svg xmlns='http://www.w3.org/2000/svg'></svg>")); err != ErrNotImage {
		t.Fatalf("svg: %v", err)
	}
	if _, err := Process(strings.NewReader("hello")); err != ErrNotImage {
		t.Fatalf("text: %v", err)
	}
}

// bombGIF is a GIF whose frames each cover a 2000 by 2000 canvas, with almost
// no image data. A decoder would allocate four million bytes for each frame.
// Only the block structure is real, so a decoder that reads the image data
// fails, and a scanner that reads only the structure does not.
func bombGIF(frames int) []byte {
	b := []byte("GIF89a")
	b = append(b, 0xd0, 0x07, 0xd0, 0x07, 0x00, 0x00, 0x00) // 2000 by 2000, no global colour table
	for i := 0; i < frames; i++ {
		b = append(b, 0x2c, 0, 0, 0, 0, 0xd0, 0x07, 0xd0, 0x07, 0x00) // image descriptor, no local colour table
		b = append(b, 0x02, 0x01, 0x00, 0x00)                         // LZW code size, one data sub-block, terminator
	}
	return append(b, 0x3b)
}

// An animated GIF is refused when its frames add up to more than
// maxAnimationPixels, before any frame is decoded.
// Before 2026-11-08 every frame was decoded, and one small file could take
// gigabytes of memory.
func TestAnimatedGIFIsLimitedByItsFramesBeforeDecoding(t *testing.T) {
	if _, err := Process(bytes.NewReader(bombGIF(30))); err != ErrTooLarge {
		t.Fatalf("a GIF of thirty 2000 by 2000 frames: %v", err)
	}
	frames, area, err := gifFrames(gifOf(3))
	if err != nil || frames != 3 || area != 3*8*8 {
		t.Fatalf("gifFrames of a three-frame 8 by 8 GIF: %d %d %v", frames, area, err)
	}
	if _, _, err := gifFrames([]byte("GIF89a\x01")); err == nil {
		t.Fatal("a truncated GIF was accepted")
	}
}
