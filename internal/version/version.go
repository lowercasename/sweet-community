// Package version identifies the running binary. The binary is the only
// artefact with a version, so the version is a hash of the binary's own
// bytes. Two builds of the same source have the same version, any other
// build has a different one, and nothing has to be set at build time.
package version

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"sync"
)

// Of returns the first twelve hex characters of the SHA-256 hash of the
// running executable, or "dev" when the executable cannot be read.
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
