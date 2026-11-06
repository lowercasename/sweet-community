// Package version names the running binary. There is one version of Sweet in
// one place, the binary itself, so its name is a hash of its own bytes: two
// builds of the same source share it, any other build differs, and nothing
// has to be stamped in at build time.
package version

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"sync"
)

// Of returns the twelve-hex-character name of the running executable, or
// "dev" when it cannot be read.
var Of = sync.OnceValue(func() string {
	exe, err := os.Executable()
	if err != nil {
		return "dev"
	}
	f, err := os.Open(exe)
	if err != nil {
		return "dev"
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "dev"
	}
	return hex.EncodeToString(h.Sum(nil))[:12]
})
