package api

import (
	"bytes"
	"context"
	"fmt"
	"image"
	"image/png"
	"math/rand"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"runtime"
	"runtime/metrics"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"sweet/internal/db"
	"sweet/internal/images"
)

// heapPeak runs fn and returns the most heap that live objects held while it ran, sampled every 200 µs.
func heapPeak(fn func()) uint64 {
	runtime.GC()
	var peak atomic.Uint64
	stop := make(chan struct{})
	done := make(chan struct{})
	go func() {
		defer close(done)
		s := []metrics.Sample{{Name: "/memory/classes/heap/objects:bytes"}}
		for {
			select {
			case <-stop:
				return
			default:
			}
			metrics.Read(s)
			if v := s[0].Value.Uint64(); v > peak.Load() {
				peak.Store(v)
			}
			time.Sleep(200 * time.Microsecond)
		}
	}()
	fn()
	close(stop)
	<-done
	return peak.Load()
}

// Link preview pictures count against the same memory budget as uploads. Thirty previews at once, each with a
// 3.5 MB picture, once took 265 MB, more than a small container has.
func TestPreviewPicturesStayWithinTheUploadBudget(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 1100, 1100))
	r := rand.New(rand.NewSource(1))
	for i := range img.Pix {
		img.Pix[i] = uint8(r.Intn(256))
		if i%4 == 3 {
			img.Pix[i] = 255
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	pic := buf.Bytes()
	site := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/pic.png" {
			w.Header().Set("Content-Type", "image/png")
			w.Write(pic)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, `<html><head><title>t</title><meta property="og:image" content="/pic.png?%s"></head></html>`, r.URL.RawQuery)
	}))
	defer site.Close()
	_, owner, srv := newTestServerWith(t)
	srv.PreviewClient = site.Client()
	peak := heapPeak(func() {
		var wg sync.WaitGroup
		for i := range 30 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				owner.do("GET", "/api/previews?url="+url.QueryEscape(fmt.Sprintf("%s/page?n=%d", site.URL, i)), nil)
			}()
		}
		wg.Wait()
	})
	if peak > 110<<20 {
		t.Fatalf("thirty previews at once held %d MB", peak>>20)
	}
}

// slowStore takes its time to delete a file, as a bucket may.
type slowStore struct{ images.Store }

func (s slowStore) Delete(ctx context.Context, key string) error {
	select {
	case <-time.After(2 * time.Second):
	case <-ctx.Done():
	}
	return s.Store.Delete(ctx, key)
}

// The sweep deletes stored files without holding the database's write lock, so a slow bucket does not hold up
// messages. A message sent while the sweep waited on the bucket once failed after five seconds.
func TestTheSweepDoesNotHoldUpWritesWhileItDeletesFiles(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	if status, _ := owner.upload(testPNG(40, 40)); status != 201 {
		t.Fatalf("upload: %d", status)
	}
	done := make(chan struct{})
	go func() {
		images.Sweep(context.Background(), srv.DB, slowStore{srv.Images}, db.Now()+1)
		close(done)
	}()
	time.Sleep(300 * time.Millisecond)
	start := time.Now()
	status, _ := owner.do("POST", rootPath+"/messages", map[string]string{"body_html": "<p>hello</p>"})
	if status != 201 || time.Since(start) > time.Second {
		t.Fatalf("a message during the sweep: %d after %v", status, time.Since(start))
	}
	<-done
}

// An upload that sends its body too slowly is stopped, so it cannot hold the upload memory budget. Other uploads
// then go ahead.
func TestASlowUploadIsStopped(t *testing.T) {
	ts, owner, _ := newTestServerWith(t)
	was := uploadReadTime
	uploadReadTime = 300 * time.Millisecond
	t.Cleanup(func() { uploadReadTime = was })
	u, _ := url.Parse(ts.URL)
	// Two uploads claim the whole budget, and their bodies never come.
	for range 2 {
		conn, err := net.Dial("tcp", u.Host)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
		fmt.Fprintf(conn, "POST /api/images HTTP/1.1\r\nHost: %s\r\nCookie: %s\r\nContent-Type: multipart/form-data; boundary=b\r\nContent-Length: %d\r\n\r\n--b\r\n",
			u.Host, owner.cookieHeader(), uploadBytes/2)
	}
	time.Sleep(100 * time.Millisecond)
	start := time.Now()
	if status, img := owner.upload(testPNG(40, 40)); status != 201 {
		t.Fatalf("an upload behind a stalled one: %d %v", status, img)
	}
	if time.Since(start) > 5*time.Second {
		t.Fatalf("the upload waited %v", time.Since(start))
	}
}

// A writer may keep an image in their own post when the post is what lets them see it. The edit once failed after
// the image's uploader deleted their own post.
func TestAnAuthorCanEditAPostThatShowsAnImageOnlyItShows(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, _ := registerMember(t, ts, owner, "mo")
	status, img := kit.upload(testPNG(40, 40))
	if status != 201 {
		t.Fatalf("upload: %d", status)
	}
	kits := kit.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": imgTag(img)})
	mos := mo.mustStatus(201, "POST", rootPath+"/posts", map[string]string{"body_html": "<p>this</p>" + imgTag(img)})
	kit.mustStatus(200, "DELETE", "/api/posts/"+kits["id"].(string), nil)
	got := mo.mustStatus(200, "PUT", "/api/posts/"+mos["id"].(string), map[string]string{"body_html": "<p>this one</p>" + imgTag(img)})
	if !strings.Contains(got["body_html"].(string), img["url"].(string)) {
		t.Fatalf("the edit lost the image: %v", got["body_html"])
	}
}

// cookieHeader is the Cookie header of the client's session, for a request written by hand.
func (c *client) cookieHeader() string {
	u, _ := url.Parse(c.base)
	var parts []string
	for _, ck := range c.http.Jar.Cookies(u) {
		parts = append(parts, ck.Name+"="+ck.Value)
	}
	return strings.Join(parts, "; ")
}

// An upload that waits for room in the upload budget gets its whole read time once it has room. Its time once
// started before the wait, and an upload that waited longer failed.
func TestAnUploadThatWaitsForRoomGetsItsWholeReadTime(t *testing.T) {
	_, owner, _ := newTestServerWith(t)
	was := uploadReadTime
	uploadReadTime = 300 * time.Millisecond
	t.Cleanup(func() { uploadReadTime = was })
	if err := uploads.Acquire(context.Background(), uploadBytes); err != nil {
		t.Fatal(err)
	}
	go func() {
		time.Sleep(time.Second)
		uploads.Release(uploadBytes)
	}()
	// The body is larger than the server's read buffer, so it is read from the connection after the wait.
	img := image.NewNRGBA(image.Rect(0, 0, 300, 300))
	rand.New(rand.NewSource(1)).Read(img.Pix)
	for i := 3; i < len(img.Pix); i += 4 {
		img.Pix[i] = 255
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	if status, body := owner.upload(buf.Bytes()); status != 201 {
		t.Fatalf("an upload that waited: %d %v", status, body)
	}
}

// An image whose client has gone by the time it is stored still gets its row, so its file is not left without one.
func TestAnImageIsKeptWhenItsClientHasGone(t *testing.T) {
	_, _, srv := newTestServerWith(t)
	owner, err := srv.q().GetUserByUsername(context.Background(), "raphael")
	if err != nil {
		t.Fatal(err)
	}
	p, err := images.Process(testPNG(10, 10))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	img, err := srv.storeImage(ctx, p, owner.ID)
	if err != nil {
		t.Fatalf("storing after the client went: %v", err)
	}
	if _, err := srv.q().GetImage(context.Background(), img.ID); err != nil {
		t.Fatalf("the image has no row: %v", err)
	}
}

// panicky fetches pages normally and panics when it fetches a picture.
type panicky struct{ next http.RoundTripper }

func (p panicky) RoundTrip(r *http.Request) (*http.Response, error) {
	if strings.HasSuffix(r.URL.Path, ".png") {
		panic("the picture could not be read")
	}
	return p.next.RoundTrip(r)
}

// A preview's share of the upload budget is given back even when fetching its picture fails unexpectedly.
func TestAPreviewGivesBackItsShareOfTheBudget(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	site, _ := previewSite(t)
	srv.PreviewClient = &http.Client{Transport: panicky{site.Client().Transport}}
	// The panic ends the request without an answer.
	if res, err := owner.http.Get(owner.base + "/api/previews?url=" + url.QueryEscape(site.URL+"/open-day")); err == nil {
		res.Body.Close()
	}
	if !uploads.TryAcquire(uploadBytes) {
		t.Fatal("part of the upload budget is still held")
	}
	uploads.Release(uploadBytes)
}
