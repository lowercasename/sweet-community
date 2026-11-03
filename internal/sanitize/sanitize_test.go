package sanitize

import (
	"strings"
	"testing"
)

func TestBody(t *testing.T) {
	cases := []struct {
		name     string
		in       string
		want     []string // substrings that must be present
		wantNot  []string // substrings that must be absent
	}{
		{
			name:    "strips scripts, handlers, classes, styles",
			in:      `<h2 class="x" onclick="alert(1)" style="color:red">Hi</h2><script>alert(2)</script>`,
			want:    []string{"<h2>Hi</h2>"},
			wantNot: []string{"script", "onclick", "class", "style"},
		},
		{
			name:    "drops javascript: hrefs, keeps https and mailto, forces rel",
			in:      `<a href="javascript:alert(1)" target="_blank">bad</a><a href="https://sweet.sh">ok</a><a href="mailto:a@b.c">m</a>`,
			want:    []string{`<a href="https://sweet.sh" rel="noreferrer">ok</a>`, `<a href="mailto:a@b.c" rel="noreferrer">m</a>`},
			wantNot: []string{"javascript", "target"},
		},
		{
			name:    "mentions keep a valid uuid, lose an invalid one",
			in:      `<span data-type="mention" data-mention-id="019a4c5e-0000-7000-8000-000000000001">@kit</span><span data-mention-id="nope">x</span>`,
			want:    []string{`data-mention-id="019a4c5e-0000-7000-8000-000000000001"`},
			wantNot: []string{"nope"},
		},
		{
			name:    "images only from /img/<id>",
			in:      `<img src="https://evil/x.png"><img src="/img/019a4c5e-0000-7000-8000-000000000002" alt="cat" width="300" style="x">`,
			want:    []string{`<img src="/img/019a4c5e-0000-7000-8000-000000000002" alt="cat" width="300">`},
			wantNot: []string{"evil", "style"},
		},
		{
			name:    "no iframes",
			in:      `<p>a</p><iframe src="https://youtube.com/embed/x"></iframe>`,
			want:    []string{"<p>a</p>"},
			wantNot: []string{"iframe"},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := Body(c.in)
			for _, w := range c.want {
				if !strings.Contains(got, w) {
					t.Errorf("want %q in %q", w, got)
				}
			}
			for _, w := range c.wantNot {
				if strings.Contains(got, w) {
					t.Errorf("did not want %q in %q", w, got)
				}
			}
		})
	}
}

func TestTextAndEmpty(t *testing.T) {
	if got := Text(`<h2>Hi <strong>there</strong></h2><p>Second &amp; third</p>`); got != "Hi there Second & third" {
		t.Errorf("Text = %q", got)
	}
	if !IsEmpty(Body(`<p>   </p><p></p>`)) {
		t.Error("whitespace-only body should be empty")
	}
	if IsEmpty(Body(`<p><img src="/img/019a4c5e-0000-7000-8000-000000000002" alt=""></p>`)) {
		t.Error("image-only body should not be empty")
	}
}
