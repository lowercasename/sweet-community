package images

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"math/rand"
	"os"
	"runtime"
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

// noisyPNG is an opaque PNG with random pixels, which a photo resembles more than a flat image does.
func noisyPNG(w, h int) []byte {
	img := image.NewNRGBA(image.Rect(0, 0, w, h))
	r := rand.New(rand.NewSource(1))
	for i := range img.Pix {
		img.Pix[i] = uint8(r.Intn(256))
		if i%4 == 3 {
			img.Pix[i] = 255
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
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
	// An opaque image from a lossless file is stored in whichever of PNG and JPEG is smaller. A flat image, such as a
	// screenshot, stays a PNG. A photo becomes a JPEG. A transparent image stays a PNG.
	p, err := Process(bytes.NewReader(pngOf(10, 10, color.NRGBA{200, 30, 30, 255})))
	if err != nil || p.ContentType != "image/png" || p.Width != 10 {
		t.Fatalf("flat opaque: %s %v", p.ContentType, err)
	}
	p, err = Process(bytes.NewReader(noisyPNG(200, 150)))
	if err != nil || p.ContentType != "image/jpeg" || p.Width != 200 {
		t.Fatalf("photo-like opaque: %s %v", p.ContentType, err)
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

// A phone photo is about 12 megapixels. Processing one must fit in a small container: a community runs in 128 MB.
// The resize once used a temporary buffer of 32 bytes per pixel, about 194 MB for a 12-megapixel photo, and the
// kernel killed the server. The largest JPEG the server accepts, taken upright and stored on its side, is resized and
// turned within the memory limit. The test counts every byte that Process allocates.
func TestProcessALargePhotoFitsInASmallContainer(t *testing.T) {
	img := image.NewYCbCr(image.Rect(0, 0, 2400, 1600), image.YCbCrSubsampleRatio420)
	for i := range img.Y {
		img.Y[i] = uint8(i * 7)
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatal(err)
	}
	data := withOrientation(buf.Bytes(), 6)
	var p Processed
	var err error
	got := allocated(func() { p, err = Process(bytes.NewReader(data)) })
	if err != nil {
		t.Fatal(err)
	}
	if p.Width != 1333 || p.Height != MaxSide {
		t.Fatalf("size %dx%d, want 1333x%d", p.Width, p.Height, MaxSide)
	}
	if got > 64<<20 {
		t.Fatalf("processing a 2400 by 1600 photo allocated %d MB, more than 64 MB", got>>20)
	}
}

// A 12-megapixel phone photo sent straight to the server is refused, because a JPEG of that size could be
// progressive and need about 200 MB. The app shrinks every image to 2000 pixels before uploading it.
func TestProcessRefusesAFullSizePhonePhoto(t *testing.T) {
	img := image.NewYCbCr(image.Rect(0, 0, 4032, 3024), image.YCbCrSubsampleRatio420)
	var buf bytes.Buffer
	jpeg.Encode(&buf, img, &jpeg.Options{Quality: 50})
	if _, err := Process(bytes.NewReader(buf.Bytes())); err != ErrTooLarge {
		t.Fatalf("got %v, want ErrTooLarge", err)
	}
}

// withOrientation adds an EXIF block with this orientation tag to a JPEG, as a phone camera does. The camera stores
// the pixels as the sensor read them and records how to turn them upright.
func withOrientation(data []byte, orientation byte) []byte {
	exif := []byte{
		0xFF, 0xE1, 0x00, 0x22, // APP1 marker and its length, 34 bytes
		'E', 'x', 'i', 'f', 0, 0,
		'M', 'M', 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, first IFD at offset 8
		0x00, 0x01, // one entry
		0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1 value
		0x00, 0x00, 0x00, 0x00, // no next IFD
	}
	out := append([]byte{}, data[:2]...)
	out = append(out, exif...)
	return append(out, data[2:]...)
}

// halves is a JPEG whose left half is red and right half is blue.
func halves(w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if x < w/2 {
				img.Set(x, y, color.RGBA{220, 20, 20, 255})
			} else {
				img.Set(x, y, color.RGBA{20, 20, 220, 255})
			}
		}
	}
	var buf bytes.Buffer
	jpeg.Encode(&buf, img, &jpeg.Options{Quality: 95})
	return buf.Bytes()
}

func TestProcessTurnsAPhonePhotoUpright(t *testing.T) {
	// Orientation 6: the stored pixels must be turned 90 degrees clockwise. The left half ends up at the top.
	p, err := Process(bytes.NewReader(withOrientation(halves(40, 20), 6)))
	if err != nil {
		t.Fatal(err)
	}
	if p.Width != 20 || p.Height != 40 {
		t.Fatalf("size %dx%d, want 20x40", p.Width, p.Height)
	}
	out, _, err := image.Decode(bytes.NewReader(p.Data))
	if err != nil {
		t.Fatal(err)
	}
	if b := out.Bounds(); b.Dx() != 20 || b.Dy() != 40 {
		t.Fatalf("stored image is %dx%d, want 20x40", b.Dx(), b.Dy())
	}
	red := func(x, y int) bool {
		r, _, b, _ := out.At(x, y).RGBA()
		return r>>8 > 150 && b>>8 < 100
	}
	if !red(10, 5) || red(10, 35) {
		t.Fatal("the photo was not turned upright: its red half is not at the top")
	}
	// The metadata is not kept.
	if bytes.Contains(p.Data, []byte("Exif")) {
		t.Fatal("the stored image still has its EXIF block")
	}
}

// The files in testdata are 2000 by 2000. progressive-444-2000.jpg was written by cjpeg -progressive -sample 1x1.
// progressive-cmyk-2000.jpg was converted to CMYK by sips and made progressive by jpegtran. alpha-2000.webp is a
// lossy WebP with an alpha channel, written by github.com/gen2brain/webp. They are the most expensive files of their
// formats to decode.
func testdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// allocated returns the bytes that fn allocates.
func allocated(fn func()) uint64 {
	runtime.GC()
	var before, after runtime.MemStats
	runtime.ReadMemStats(&before)
	fn()
	runtime.ReadMemStats(&after)
	return after.TotalAlloc - before.TotalAlloc
}

func png16(w, h int) []byte {
	img := image.NewNRGBA64(image.Rect(0, 0, w, h))
	for i := range img.Pix {
		img.Pix[i] = byte(i)
	}
	var buf bytes.Buffer
	(&png.Encoder{CompressionLevel: png.BestSpeed}).Encode(&buf, img)
	return buf.Bytes()
}

// A small file can need far more memory to decode than its size suggests. A 454 KB progressive JPEG once took
// 642 MB. Such a file is refused from its header, before any pixel is decoded.
func TestProcessRefusesBeforeDecodingAnImageThatWouldNeedTooMuchMemory(t *testing.T) {
	for name, data := range map[string][]byte{
		"a 2000 by 2000 progressive CMYK JPEG": testdata(t, "progressive-cmyk-2000.jpg"),
		"a 2100 by 2000 16-bit PNG":            png16(2100, 2000),
	} {
		var err error
		got := allocated(func() { _, err = Process(bytes.NewReader(data)) })
		if err != ErrTooLarge {
			t.Errorf("%s: got %v, want ErrTooLarge", name, err)
		}
		if extra := got - uint64(len(data)); extra > 1<<20 {
			t.Errorf("%s: allocated %d KB besides the file, so it was decoded", name, extra>>10)
		}
	}
}

// The most expensive file of each format that is accepted stays within the budget. The budget is checked in a
// 128 MB container separately. Here the allocations, which also count short-lived garbage, have a looser limit.
func TestProcessTheMostExpensiveAcceptedImagesStayWithinMemory(t *testing.T) {
	for name, data := range map[string][]byte{
		"a 2000 by 2000 progressive JPEG with full-resolution colour": testdata(t, "progressive-444-2000.jpg"),
		"a 2000 by 2000 16-bit PNG":                                   png16(2000, 2000),
		"a 2000 by 2000 WebP with transparency":                       testdata(t, "alpha-2000.webp"),
	} {
		var p Processed
		var err error
		got := allocated(func() { p, err = Process(bytes.NewReader(data)) })
		if err != nil || p.Width != 2000 {
			t.Errorf("%s: %v %dx%d", name, err, p.Width, p.Height)
		}
		if got > 80<<20 {
			t.Errorf("%s: allocated %d MB, more than 80 MB", name, got>>20)
		}
	}
}
