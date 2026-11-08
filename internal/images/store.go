// Package images stores uploaded images and converts each upload into a
// size-limited JPEG or PNG. Storage is a small interface with two drivers. The
// local directory driver is for development, tests and self-hosters with disk.
// The S3 driver works with any S3-compatible bucket, and production uses R2
// because images are large and R2 storage is cheap.
package images

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

var ErrNotFound = errors.New("Image not found")

// Store holds image bytes. Keys have the form "<id>.<ext>".
type Store interface {
	Put(ctx context.Context, key, contentType string, r io.Reader, size int64) error
	Get(ctx context.Context, key string) (io.ReadCloser, error)
	// Delete removes a stored file. A missing key is not an error.
	Delete(ctx context.Context, key string) error
}

// Local stores files in one directory.
type Local struct{ dir string }

func NewLocal(dir string) (*Local, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &Local{dir: dir}, nil
}

func (l *Local) path(key string) (string, error) {
	if key == "" || strings.ContainsAny(key, `/\`) || strings.Contains(key, "..") {
		return "", ErrNotFound
	}
	return filepath.Join(l.dir, key), nil
}

func (l *Local) Put(_ context.Context, key, _ string, r io.Reader, _ int64) error {
	p, err := l.path(key)
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, r); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, p)
}

func (l *Local) Get(_ context.Context, key string) (io.ReadCloser, error) {
	p, err := l.path(key)
	if err != nil {
		return nil, err
	}
	f, err := os.Open(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return f, err
}

func (l *Local) Delete(_ context.Context, key string) error {
	p, err := l.path(key)
	if err != nil {
		return err
	}
	if err := os.Remove(p); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// S3Config is read from the environment by main. When Endpoint and Bucket are
// both set, the S3 driver is used. Region "auto" is correct for R2.
type S3Config struct {
	Endpoint, Bucket, AccessKey, SecretKey, Region, Prefix string
	Insecure                                               bool // use plain HTTP, for local S3-compatible servers
}

// S3 is any S3-compatible bucket.
type S3 struct {
	client *minio.Client
	bucket string
	prefix string
}

func NewS3(c S3Config) (*S3, error) {
	if c.Region == "" {
		c.Region = "auto"
	}
	client, err := minio.New(c.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""),
		Secure: !c.Insecure,
		Region: c.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("s3: %w", err)
	}
	return &S3{client: client, bucket: c.Bucket, prefix: strings.Trim(c.Prefix, "/")}, nil
}

func (s *S3) key(key string) string {
	if s.prefix == "" {
		return key
	}
	return s.prefix + "/" + key
}

func (s *S3) Put(ctx context.Context, key, contentType string, r io.Reader, size int64) error {
	_, err := s.client.PutObject(ctx, s.bucket, s.key(key), r, size, minio.PutObjectOptions{ContentType: contentType})
	return err
}

func (s *S3) Get(ctx context.Context, key string) (io.ReadCloser, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, s.key(key), minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	// GetObject does not fetch until the object is read. Stat makes a missing
	// key return an error here rather than during the read.
	if _, err := obj.Stat(); err != nil {
		obj.Close()
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return obj, nil
}

func (s *S3) Delete(ctx context.Context, key string) error {
	return s.client.RemoveObject(ctx, s.bucket, s.key(key), minio.RemoveObjectOptions{})
}
