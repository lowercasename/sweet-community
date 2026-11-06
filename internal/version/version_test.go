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
