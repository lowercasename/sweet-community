package version

import (
	"regexp"
	"testing"
)

func TestOfNamesTheBinary(t *testing.T) {
	v := Of()
	if !regexp.MustCompile(`^[0-9a-f]{12}$`).MatchString(v) {
		t.Fatalf("version %q is not twelve hex characters", v)
	}
	if Of() != v {
		t.Fatal("the version changed between two calls")
	}
}

// The release is the git tag the binary was built from, set at build time
// (architecture.md, Updates). A binary built without one, such as go run
// during development, reports "dev".
func TestReleaseIsDevWithoutABuildSetting(t *testing.T) {
	if got := Release(); got != "dev" {
		t.Fatalf("release without a build setting: %q", got)
	}
}
