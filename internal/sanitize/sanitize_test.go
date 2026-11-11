package sanitize

import (
	"strings"
	"testing"
)

func TestBody(t *testing.T) {
	cases := []struct {
		name    string
		in      string
		want    []string // substrings that must be present
		wantNot []string // substrings that must be absent
	}{
		{
			name:    "keeps the empty marks for a link preview card and for a link that stays plain, on their own elements only",
			in:      `<p data-embed="" data-x="1"><a href="https://plots.test/a">https://plots.test/a</a></p><p><a href="https://plots.test/b" data-plain-link="" data-embed="">b</a></p><p data-embed="yes">c</p><div data-embed="">d</div>`,
			want:    []string{`<p data-embed=""><a href="https://plots.test/a"`, `data-plain-link=""`, `<p>c</p>`},
			wantNot: []string{"data-x", `data-embed="yes"`, "<div", `data-plain-link="" data-embed`},
		},
		{
			name:    "strips scripts, handlers, classes, styles",
			in:      `<h2 class="x" onclick="alert(1)" style="color:red">Hi</h2><script>alert(2)</script>`,
			want:    []string{"<h2>Hi</h2>"},
			wantNot: []string{"script", "onclick", "class", "style"},
		},
		{
			name:    "drops javascript: hrefs; bare links get rel and, if external, target",
			in:      `<a href="javascript:alert(1)" target="_blank">bad</a><a href="https://sweet.sh">ok</a><a href="mailto:a@b.c">m</a><a href="/p/x" target="_blank">rel</a>`,
			want:    []string{`<a href="https://sweet.sh" rel="noreferrer noopener" target="_blank">ok</a>`, `<a href="mailto:a@b.c" rel="noreferrer">m</a>`, `<a href="/p/x" target="_blank" rel="noreferrer noopener">rel</a>`},
			wantNot: []string{"javascript"}, // the rejected anchor remains as an <a> without href

		},
		{
			name:    "rejects target and rel values other than TipTap's",
			in:      `<a href="https://sweet.sh" target="_top" rel="opener">x</a>`,
			want:    []string{`<a href="https://sweet.sh" rel="noreferrer noopener" target="_blank">x</a>`},
			wantNot: []string{"_top", `"opener"`},
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

// TestFixedPoint checks that HTML as TipTap serialises it passes through Body
// unchanged, so that an edit cycle (stored, then editor, then stored) is
// byte-stable. The fixtures mirror web/src/editor/roundtrip.test.ts.
func TestFixedPoint(t *testing.T) {
	fixtures := []string{
		`<p>Hello, world.</p>`,
		`<h2>Heading two</h2><p>Body.</p>`,
		`<p>Some <strong>bold</strong>, <em>italic</em> and <s>struck</s> text.</p>`,
		`<p>See <a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/path?q=1">the docs</a>.</p>`,
		`<p>Mail <a target="_blank" rel="noopener noreferrer nofollow" href="mailto:a@b.c">me</a>.</p>`,
		`<ul><li><p>One</p></li><li><p>Two</p></li></ul>`,
		`<ol><li><p>First</p></li><li><p>Second</p></li></ol>`,
		`<blockquote><p>Quoted.</p></blockquote>`,
		`<p>Line one<br>Line two</p>`,
		`<p><strong><em>both</em></strong> and <strong><s>struck bold</s></strong></p>`,
		// The HTML TipTap emits after loading a link created via the API (see roundtrip.test.ts).
		`<p><a target="_blank" rel="noreferrer noopener" href="https://sweet.sh">ok</a></p>`,
		// An uploaded image as TipTap's Image node serialises it (see editor/extensions.ts).
		`<p>look</p><img src="/img/019a4c5e-0000-7000-8000-000000000002" alt="a cat" width="800" height="600" data-image-id="019a4c5e-0000-7000-8000-000000000002">`,
	}
	for _, f := range fixtures {
		if got := Body(f); got != f {
			t.Errorf("not a fixed point:\n in: %s\nout: %s", f, got)
		}
		if got := Body(Body(f)); got != f {
			t.Errorf("not idempotent:\n in: %s\nout: %s", f, got)
		}
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

// Empty paragraphs at the start and end of a body are removed when it is
// sent. A paragraph that holds only spaces, a
// non-breaking space or line breaks counts as empty. Empty paragraphs between
// two others are kept, because the author put them there as spacing.
func TestTrimsEmptyParagraphsAtTheEdges(t *testing.T) {
	img := `<img src="/img/019a4c5e-0000-7000-8000-000000000002" alt="a cat" width="800" height="600" data-image-id="019a4c5e-0000-7000-8000-000000000002">`
	cases := []struct{ in, want string }{
		{`<p></p><p>hello</p><p></p>`, `<p>hello</p>`},
		{`<p></p><p></p><p>hello</p><p>world</p><p></p><p></p>`, `<p>hello</p><p>world</p>`},
		{`<p>hello</p><p></p><p>world</p>`, `<p>hello</p><p></p><p>world</p>`},
		{`<p> </p><p><br></p><p>hi</p><p>&nbsp;</p><p><br><br></p>`, `<p>hi</p>`},
		{`<p></p>` + img + `<p></p>`, img},
		{`<p></p><p></p>`, ``},
		{`<p>hello</p>`, `<p>hello</p>`},
	}
	for _, c := range cases {
		if got := Body(c.in); got != c.want {
			t.Errorf("Body(%q)\n got %q\nwant %q", c.in, got, c.want)
		}
	}
}

// Bios, the rules and the welcome message keep text, formatting, links, mentions and emoji. Images and the mark that
// makes a link a preview card are removed, so a link on its own line stays a link.
func TestWithoutMedia(t *testing.T) {
	const id = "0190a0b0-0000-7000-8000-000000000001"
	link := `<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">https://example.com</a>`
	in := `<p data-embed="">` + link + `</p>` +
		`<p><strong>Hi</strong> <em>there</em> <span data-type="mention" data-mention-id="` + id + `">@kit</span> 🧶</p>` +
		`<img src="/img/` + id + `" alt="a scarf" width="10" height="10" data-image-id="` + id + `">` +
		`<p><a data-plain-link="" target="_blank" rel="noopener noreferrer nofollow" href="https://example.org">https://example.org</a></p>`
	want := `<p>` + link + `</p>` +
		`<p><strong>Hi</strong> <em>there</em> <span data-type="mention" data-mention-id="` + id + `">@kit</span> 🧶</p>` +
		`<p><a target="_blank" rel="noopener noreferrer nofollow" href="https://example.org">https://example.org</a></p>`
	if got := WithoutMedia(in); got != want {
		t.Fatalf("got\n%s\nwant\n%s", got, want)
	}
	if got := WithoutMedia(want); got != want {
		t.Fatalf("not a fixed point:\n%s", got)
	}
}

// An image whose address is not an uploaded image's is removed, with its attributes. It was once kept as a broken
// <img alt="">, and a body of only that image was not empty.
func TestAnImageWithoutAnUploadedAddressIsRemoved(t *testing.T) {
	const id = "0190a0b0-0000-7000-8000-000000000001"
	for _, in := range []string{
		`<img src="blob:https://sweet.test/1" alt="" width="10" data-image-id="` + id + `">`,
		`<img src="https://example.com/a.png" alt="a cat">`,
		`<img alt="no address">`,
		`<img src="/img/` + strings.Repeat("-", 36) + `" alt="">`,
	} {
		if got := Body(`<p>hi</p>` + in); got != `<p>hi</p>` {
			t.Errorf("Body(%q) = %q", in, got)
		}
		if !IsEmpty(Body(in)) {
			t.Errorf("a body of only %q is not empty", in)
		}
	}
	kept := `<img src="/img/` + id + `" alt="" data-image-id="` + id + `">`
	if got := Body(kept); got != kept {
		t.Errorf("an uploaded image changed: %q", got)
	}
}
