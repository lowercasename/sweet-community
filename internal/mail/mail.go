// Package mail sends the few emails Sweet sends (architecture.md, Email):
// plain SMTP from config, or, with no SMTP configured, a file per message in
// a directory, which is what development and the tests read.
package mail

import (
	"context"
	"fmt"
	"net/smtp"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"
)

// Message is one email to one recipient: plain text always, and the same
// message as HTML when it came through the template (template.go).
type Message struct {
	To      string
	Subject string
	Text    string
	HTML    string
}

// Sender delivers a message.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// SMTP sends through one server with PLAIN auth (STARTTLS when the server offers it).
type SMTP struct {
	Host, Port, User, Password, From string
}

func (s SMTP) Send(_ context.Context, m Message) error {
	body := smtpBody(s.From, m)
	var a smtp.Auth
	if s.User != "" {
		a = smtp.PlainAuth("", s.User, s.Password, s.Host)
	}
	return smtp.SendMail(s.Host+":"+s.Port, a, s.From, []string{m.To}, body)
}

// smtpBody is the wire form of a message: headers and the text, or, with
// HTML, a multipart/alternative body with the text part first.
func smtpBody(from string, m Message) []byte {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\n", from, m.To, m.Subject)
	if m.HTML == "" {
		fmt.Fprintf(&b, "Content-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n", m.Text)
		return []byte(b.String())
	}
	boundary := fmt.Sprintf("sweet-%d-%d", time.Now().UnixNano(), seq.Add(1))
	fmt.Fprintf(&b, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", boundary)
	fmt.Fprintf(&b, "--%s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n", boundary, m.Text)
	fmt.Fprintf(&b, "--%s\r\nContent-Type: text/html; charset=utf-8\r\n\r\n%s\r\n", boundary, m.HTML)
	fmt.Fprintf(&b, "--%s--\r\n", boundary)
	return []byte(b.String())
}

// Dir writes each message to a file in a directory: `<unix ms>-<n>-<to>.txt`,
// the headers then a blank line then the text, and the HTML beside it when
// there is some. For development and tests.
type Dir struct {
	Path string
}

// seq keeps two messages in one millisecond from sharing a name.
var seq atomic.Int64

func (d Dir) Send(_ context.Context, m Message) error {
	if err := os.MkdirAll(d.Path, 0o755); err != nil {
		return err
	}
	stem := fmt.Sprintf("%d-%03d-%s", time.Now().UnixMilli(), seq.Add(1)%1000, strings.NewReplacer("@", "_at_", "/", "_").Replace(m.To))
	body := fmt.Sprintf("To: %s\nSubject: %s\n\n%s\n", m.To, m.Subject, m.Text)
	if err := os.WriteFile(filepath.Join(d.Path, stem+".txt"), []byte(body), 0o644); err != nil {
		return err
	}
	if m.HTML != "" {
		// The HTML beside it, to open in a browser while working on the template.
		return os.WriteFile(filepath.Join(d.Path, stem+".html"), []byte(m.HTML), 0o644)
	}
	return nil
}

// FromEnv is the sender the environment names: SMTP when SWEET_SMTP_HOST is
// set, else a Dir at the given path.
func FromEnv(dir string) Sender {
	if host := os.Getenv("SWEET_SMTP_HOST"); host != "" {
		port := os.Getenv("SWEET_SMTP_PORT")
		if port == "" {
			port = "587"
		}
		return SMTP{Host: host, Port: port, User: os.Getenv("SWEET_SMTP_USER"), Password: os.Getenv("SWEET_SMTP_PASSWORD"), From: os.Getenv("SWEET_MAIL_FROM")}
	}
	return Dir{Path: dir}
}
