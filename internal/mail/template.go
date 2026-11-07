package mail

import (
	"fmt"
	"html"
	"strings"
)

// Content is what every email Sweet sends is made of (architecture.md,
// Email): who it is from, a heading, a few short lines, at most one link,
// and a note. One renderer turns it into the plain text and the HTML of a
// message, so every email reads the same and is quick to read on a phone.
type Content struct {
	// Community is the community's name, or "Sweet" before it has one.
	Community string
	Heading   string
	Lines     []string
	// Action is the one thing to do: a label and where it leads. Optional.
	Action *Action
	// Note is small print after the action: how long a link works, what to do if it was not you.
	Note string
}

type Action struct {
	Label string
	URL   string
}

// Text is the plain-text body: readable in any client, and what the tests
// and the development mail directory read links out of.
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

// HTML is the same message as a single column that fits any screen: system
// type, no images, one link in Sweet's red. Styles are inline, since mail
// clients strip stylesheets.
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
