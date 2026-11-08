package images

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
	"time"
)

// TestS3RoundTrip runs against a real bucket when SWEET_S3_ENDPOINT and
// SWEET_S3_BUCKET are set (make test exports .env). Otherwise it skips. It
// writes under its own prefix and removes what it wrote.
func TestS3RoundTrip(t *testing.T) {
	ep, bucket := os.Getenv("SWEET_S3_ENDPOINT"), os.Getenv("SWEET_S3_BUCKET")
	if ep == "" || bucket == "" {
		t.Skip("no S3 bucket configured (SWEET_S3_ENDPOINT, SWEET_S3_BUCKET)")
	}
	var nonce [6]byte
	rand.Read(nonce[:])
	prefix := strings.TrimSuffix(os.Getenv("SWEET_S3_PREFIX"), "/") + "/test-" + hex.EncodeToString(nonce[:])
	st, err := NewS3(S3Config{
		Endpoint:  ep,
		Bucket:    bucket,
		AccessKey: os.Getenv("SWEET_S3_ACCESS_KEY"),
		SecretKey: os.Getenv("SWEET_S3_SECRET_KEY"),
		Region:    os.Getenv("SWEET_S3_REGION"),
		Prefix:    strings.TrimPrefix(prefix, "/"),
		Insecure:  os.Getenv("SWEET_S3_INSECURE") == "1",
	})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	key := "roundtrip.gif"
	want := []byte("GIF89a\x01\x00\x01\x00\x00\x00\x00;")
	if err := st.Put(ctx, key, "image/gif", bytes.NewReader(want), int64(len(want))); err != nil {
		t.Fatalf("put: %v", err)
	}
	t.Cleanup(func() { st.Delete(context.Background(), key) })

	rc, err := st.Get(ctx, key)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	got, err := io.ReadAll(rc)
	rc.Close()
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("get bytes: %q %v", got, err)
	}

	if _, err := st.Get(ctx, "missing.gif"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get missing: want ErrNotFound, got %v", err)
	}
	if err := st.Delete(ctx, key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := st.Get(ctx, key); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: want ErrNotFound, got %v", err)
	}
	if err := st.Delete(ctx, key); err != nil {
		t.Fatalf("delete missing: want nil, got %v", err)
	}
}
