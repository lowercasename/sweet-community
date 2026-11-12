package main

import "testing"

// Images go under <folder>/images in the bucket, or under images without a folder. Communities that share a bucket
// already keep their images there, so this path must not change.
func TestS3PrefixFromFolder(t *testing.T) {
	for folder, want := range map[string]string{"": "images", "sweet": "sweet/images", "sweet/": "sweet/images"} {
		if got := s3Prefix(folder); got != want {
			t.Errorf("s3Prefix(%q) = %q, want %q", folder, got, want)
		}
	}
}
