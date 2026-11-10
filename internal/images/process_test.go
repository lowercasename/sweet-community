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
	p, err := Process(pngOf(10, 10, color.NRGBA{200, 30, 30, 255}))
	if err != nil || p.ContentType != "image/png" || p.Width != 10 {
		t.Fatalf("flat opaque: %s %v", p.ContentType, err)
	}
	p, err = Process(noisyPNG(200, 150))
	if err != nil || p.ContentType != "image/jpeg" || p.Width != 200 {
		t.Fatalf("photo-like opaque: %s %v", p.ContentType, err)
	}
	p, err = Process(pngOf(10, 10, color.NRGBA{200, 30, 30, 120}))
	if err != nil || p.ContentType != "image/png" {
		t.Fatalf("transparent: %+v %v", p, err)
	}
	// The longer side is capped at MaxSide and the aspect ratio is kept.
	p, err = Process(pngOf(3000, 150, color.NRGBA{0, 0, 0, 255}))
	if err != nil || p.Width != MaxSide || p.Height != 100 {
		t.Fatalf("resize: %+v %v", p, err)
	}
	// An animated GIF is stored unchanged. A static GIF is re-encoded.
	anim := gifOf(3)
	p, err = Process(anim)
	if err != nil || p.ContentType != "image/gif" || !bytes.Equal(p.Data, anim) || p.Width != 8 {
		t.Fatalf("animated gif: %+v %v", p.ContentType, err)
	}
	p, err = Process(gifOf(1))
	if err != nil || p.ContentType == "image/gif" {
		t.Fatalf("static gif should be re-encoded: %+v %v", p.ContentType, err)
	}
	// Input that is not an image is rejected regardless of what it claims to be.
	if _, err := Process([]byte("<svg xmlns='http://www.w3.org/2000/svg'></svg>")); err != ErrNotImage {
		t.Fatalf("svg: %v", err)
	}
	if _, err := Process([]byte("hello")); err != ErrNotImage {
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
	if _, err := Process(bombGIF(30)); err != ErrTooLarge {
		t.Fatalf("a GIF of thirty 2000 by 2000 frames: %v", err)
	}
	frames, area, _, err := scanGIF(gifOf(3), true)
	if err != nil || frames != 3 || area != 3*8*8 {
		t.Fatalf("scanGIF of a three-frame 8 by 8 GIF: %d %d %v", frames, area, err)
	}
	if _, _, _, err := scanGIF([]byte("GIF89a\x01"), true); err == nil {
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
	got := allocated(func() { p, err = Process(data) })
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
	p, err := Process(withOrientation(halves(40, 20), 6))
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

// testdata reads a file from the testdata folder.
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

// An image larger than 2000 by 2000 pixels is refused from its header, before any pixel is decoded. Decoding takes
// memory in proportion to the pixels, and a small file can have many: a 454 KB JPEG once took 642 MB. The app never
// sends a larger image. The test file is a 76 KB progressive JPEG of 4032 by 3024, written by cjpeg.
func TestProcessRefusesAnImageOverTheLimitBeforeDecoding(t *testing.T) {
	data := testdata(t, "progressive-420-4032x3024.jpg")
	var err error
	got := allocated(func() { _, err = Process(data) })
	if err != ErrTooLarge {
		t.Fatalf("got %v, want ErrTooLarge", err)
	}
	if got > 1<<20 {
		t.Fatalf("allocated %d KB, so it was decoded", got>>10)
	}
}

// withMetadata inserts a comment block and an XMP block before a GIF's first frame, as an editing program may.
func withMetadata(data []byte) []byte {
	i := 13
	if data[10]&0x80 != 0 {
		i += 3 << ((data[10] & 7) + 1)
	}
	comment := append([]byte{0x21, 0xfe, 17}, "camera serial 123"...)
	comment = append(comment, 0)
	xmp := append([]byte{0x21, 0xff, 11}, "XMP DataXMP"...)
	xmp = append(xmp, 20)
	xmp = append(xmp, "<x:xmpmeta>secret</x"...)
	xmp = append(xmp, 0)
	out := append([]byte{}, data[:i]...)
	out = append(out, comment...)
	out = append(out, xmp...)
	return append(out, data[i:]...)
}

// An animated GIF is stored without re-encoding, so its metadata blocks are removed from it directly. The frames, their
// timing and the loop count stay.
func TestProcessStripsMetadataFromAnAnimatedGIF(t *testing.T) {
	data := withMetadata(gifOf(3))
	if !bytes.Contains(data, []byte("camera serial")) {
		t.Fatal("the test file has no comment")
	}
	p, err := Process(data)
	if err != nil || p.ContentType != "image/gif" {
		t.Fatalf("%s %v", p.ContentType, err)
	}
	for _, s := range []string{"camera serial", "xmpmeta", "XMP DataXMP"} {
		if bytes.Contains(p.Data, []byte(s)) {
			t.Errorf("the stored GIF still has %q", s)
		}
	}
	g, err := gif.DecodeAll(bytes.NewReader(p.Data))
	if err != nil || len(g.Image) != 3 || g.Delay[0] != 10 {
		t.Fatalf("the stored GIF: %v, %d frames", err, len(g.Image))
	}
	if !bytes.Contains(p.Data, []byte("NETSCAPE2.0")) {
		t.Error("the loop count was removed")
	}
}

// Any input either is refused or gives a clean GIF with the same frames and no metadata blocks.
func FuzzScanGIF(f *testing.F) {
	f.Add(gifOf(3))
	f.Add(withMetadata(gifOf(2)))
	f.Add(bombGIF(2))
	f.Add([]byte("GIF89a\x01"))
	f.Fuzz(func(t *testing.T, data []byte) {
		frames, area, clean, err := scanGIF(data, true)
		if err != nil {
			return
		}
		again, area2, clean2, err := scanGIF(clean, true)
		if err != nil || again != frames || area2 != area {
			t.Fatalf("the clean copy scans differently: %d %d %v, want %d %d", again, area2, err, frames, area)
		}
		if !bytes.Equal(clean, clean2) {
			t.Fatal("cleaning a clean GIF changed it")
		}
	})
}
