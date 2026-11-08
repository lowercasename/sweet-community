package mail

import (
	"fmt"
	"html"
	"strings"
)

// Content is the structure of every email Sweet sends (architecture.md,
// Email). It has the sender's community name, a heading, a few short lines,
// at most one link, and a note. One renderer produces both the plain text and
// the HTML of a message, so every email has the same layout and is quick to
// read on a phone.
type Content struct {
	// Community is the community's name, or "Sweet" when no name is set.
	Community string
	Heading   string
	Lines     []string
	// Action is the one link in the message, with its label and URL. It is optional.
	Action *Action
	// Note is small print after the action. It says how long a link works and
	// what to do if the recipient did not request the email.
	Note string
}

type Action struct {
	Label string
	URL   string
}

// Text renders the plain-text body. It is readable in any mail client, and the
// tests and the development mail directory read links from it.
func (c Content) Text() string {
	var b strings.Builder
	b.WriteString(c.Heading)
	b.WriteString("\n\n")
	for _, l := range c.Lines {
		b.WriteString(l)
		b.WriteString("\n")
	}
	if c.Action != nil {
		fmt.Fprintf(&b, "\n%s:\n%s\n", c.Action.Label, c.Action.URL)
	}
	if c.Note != "" {
		b.WriteString("\n")
		b.WriteString(c.Note)
		b.WriteString("\n")
	}
	fmt.Fprintf(&b, "\n%s, made with Sweet\n", c.Community)
	return b.String()
}

// HTML renders the same message as a single column that fits any screen. It
// uses the system font, no images, and one link in Sweet's red. Styles are
// inline, because mail clients strip stylesheets.
func (c Content) HTML() string {
	esc := html.EscapeString
	var b strings.Builder
	b.WriteString(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>`)
	b.WriteString(esc(c.Heading))
	b.WriteString(`</title></head><body style="margin:0;padding:0;background:#ffffff;color:#1a1717;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Ubuntu,sans-serif;font-size:16px;line-height:1.5">`)
	b.WriteString(`<div style="max-width:560px;margin:0 auto;padding:24px 20px">`)
	fmt.Fprintf(&b, `<p style="margin:0 0 16px;font-size:14px;color:#7a7a7a">%s</p>`, esc(c.Community))
	fmt.Fprintf(&b, `<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;font-weight:700">%s</h1>`, esc(c.Heading))
	for _, l := range c.Lines {
		fmt.Fprintf(&b, `<p style="margin:0 0 12px">%s</p>`, esc(l))
	}
	if c.Action != nil {
		fmt.Fprintf(&b, `<p style="margin:20px 0"><a href="%s" style="color:#ce1717;font-weight:700;text-decoration:underline">%s</a></p>`, esc(c.Action.URL), esc(c.Action.Label))
	}
	if c.Note != "" {
		fmt.Fprintf(&b, `<p style="margin:0 0 12px;font-size:14px;color:#7a7a7a">%s</p>`, esc(c.Note))
	}
	fmt.Fprintf(&b, `<p style="margin:24px 0 0;font-size:13px;color:#7a7a7a">%s, made with Sweet</p>`, esc(c.Community))
	b.WriteString(`</div></body></html>`)
	return b.String()
}

// Message builds a message to one address from the content.
func (c Content) Message(to, subject string) Message {
	return Message{To: to, Subject: subject, Text: c.Text(), HTML: c.HTML()}
}
