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
