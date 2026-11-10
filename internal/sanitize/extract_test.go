package sanitize

import (
	"reflect"
	"testing"
)

func TestMentions(t *testing.T) {
	body := `<p>hi <span data-type="mention" data-mention-id="019a4c5e-0000-7000-8000-000000000001">@kit</span> and <span data-mention-id="019a4c5e-0000-7000-8000-000000000002">@mo</span> and <span data-mention-id="019a4c5e-0000-7000-8000-000000000001">@kit</span></p>`
	if got := Mentions(body); !reflect.DeepEqual(got, []string{"019a4c5e-0000-7000-8000-000000000001", "019a4c5e-0000-7000-8000-000000000002"}) {
		t.Fatalf("mentions: %v", got)
	}
	if got := Mentions("<p>nobody</p>"); got != nil {
		t.Fatalf("no mentions: %v", got)
	}
}

// A body's images are the src of its <img> elements, each once. An id in text or in a link is not an image.
func TestImages(t *testing.T) {
	const a, b = "0190a0b0-0000-7000-8000-00000000000a", "0190a0b0-0000-7000-8000-00000000000b"
	body := Body(`<p>` + b + ` <a href="/img/` + b + `">/img/` + b + `</a></p>` +
		`<img src="/img/` + a + `" alt="" data-image-id="` + a + `"><img src="/img/` + a + `" alt="">`)
	if got := Images(body); !reflect.DeepEqual(got, []string{a}) {
		t.Fatalf("Images: %v, want only %s", got, a)
	}
}
