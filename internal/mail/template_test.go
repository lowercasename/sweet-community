package mail

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Every email uses one short, consistent template. The text names the community, states the message and
// gives the link. The HTML is the same message in one column.
func TestContentRendersTextAndHTMLAlike(t *testing.T) {
	c := Content{
		Community: "Thursday Group",
		Heading:   "Verify your email address",
		Lines:     []string{"Open the link to verify your address and sign in."},
		Action:    &Action{Label: "Verify and sign in", URL: "https://sweet.test/verify/abc?x=1&y=2"},
		Note:      "It works once, for a day. If you did not ask for it, ignore this.",
	}
	text := c.Text()
	for _, want := range []string{
		"Verify your email address\n\n",
		"Open the link to verify your address and sign in.\n",
		"Verify and sign in:\nhttps://sweet.test/verify/abc?x=1&y=2\n",
		"It works once, for a day.",
		"Thursday Group, made with Sweet",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("text lacks %q:\n%s", want, text)
		}
	}
	h := c.HTML()
	for _, want := range []string{
		`<meta name="viewport"`,
		`max-width:560px`,
		`>Thursday Group</p>`,
		`<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700">Verify your email address</h1>`,
		`<a href="https://sweet.test/verify/abc?x=1&amp;y=2" style="color:#ce1717;font-weight:700;text-decoration:underline">Verify and sign in</a>`,
		`Thursday Group, made with Sweet</p>`,
	} {
		if !strings.Contains(h, want) {
			t.Errorf("html lacks %q:\n%s", want, h)
		}
	}
	if strings.Contains(h, "<img") || strings.Contains(h, "<style") {
		t.Error("the template carries no images and no stylesheet")
	}
	// Every field of the content is HTML-escaped in the HTML body.
	bad := Content{Community: "<b>x</b>", Heading: "<script>", Lines: []string{"a & b"}}.HTML()
	if strings.Contains(bad, "<b>x</b>") || strings.Contains(bad, "<script>") || !strings.Contains(bad, "a &amp; b") {
		t.Errorf("unescaped content: %s", bad)
	}
}

func TestMessageCarriesBothBodies(t *testing.T) {
	m := Content{Community: "Sweet", Heading: "Hi", Lines: []string{"A line."}}.Message("kit@example.test", "Hi there")
	if m.To != "kit@example.test" || m.Subject != "Hi there" || !strings.HasPrefix(m.Text, "Hi\n\nA line.") || !strings.Contains(m.HTML, "<h1") {
		t.Fatalf("message: %+v", m)
	}
	// The development directory holds the text file, which links are read
	// from, and the HTML file next to it.
	d := Dir{Path: filepath.Join(t.TempDir(), "mail")}
	if err := d.Send(context.Background(), m); err != nil {
		t.Fatal(err)
	}
	files, _ := os.ReadDir(d.Path)
	var txt, htm int
	for _, f := range files {
		switch filepath.Ext(f.Name()) {
		case ".txt":
			txt++
		case ".html":
			htm++
		}
	}
	if txt != 1 || htm != 1 {
		t.Fatalf("files: %v", files)
	}
}

// The SMTP body of a message with HTML is multipart/alternative, with the text part before the HTML part.
func TestSMTPBodyIsMultipartWhenHTMLIsThere(t *testing.T) {
	m := Message{To: "kit@example.test", Subject: "Hi", Text: "plain", HTML: "<p>rich</p>"}
	body := string(smtpBody("sweet@example.org", m))
	for _, want := range []string{
		"Content-Type: multipart/alternative; boundary=",
		"Content-Type: text/plain; charset=utf-8\r\n\r\nplain",
		"Content-Type: text/html; charset=utf-8\r\n\r\n<p>rich</p>",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("body lacks %q:\n%s", want, body)
		}
	}
	if strings.Index(body, "plain") > strings.Index(body, "<p>rich</p>") {
		t.Error("text part comes first, for clients that take the first they understand")
	}
	plain := string(smtpBody("sweet@example.org", Message{To: "a@b", Subject: "s", Text: "t"}))
	if !strings.Contains(plain, "Content-Type: text/plain; charset=utf-8\r\n\r\nt") || strings.Contains(plain, "multipart") {
		t.Errorf("a text-only message stays a plain body:\n%s", plain)
	}
}
