// Package mail sends Sweet's emails. It sends over
// plain SMTP when SMTP is configured. Otherwise it writes one file per message
// to a directory, which development and the tests read.
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

// Message is one email to one recipient. Text is always set. HTML is set when
// the message was built by the template (template.go).
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

// SMTP sends through one server with PLAIN auth, using STARTTLS when the server offers it.
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

// smtpBody encodes a message for SMTP. Without HTML it is the headers and the
// text. With HTML it is a multipart/alternative body with the text part first.
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

// Dir writes each message to a file named `<unix ms>-<n>-<to>.txt` in a
// directory. The file holds the headers, a blank line, then the text. When the
// message has HTML, it is written to a .html file with the same stem. Dir is
// for development and tests.
type Dir struct {
	Path string
}

// seq distinguishes the file names of two messages sent in the same millisecond.
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
		// Write the HTML to a second file, which can be opened in a browser
		// while working on the template.
		return os.WriteFile(filepath.Join(d.Path, stem+".html"), []byte(m.HTML), 0o644)
	}
	return nil
}

// FromEnv returns the sender selected by the environment. It returns SMTP when
// SWEET_SMTP_HOST is set and otherwise a Dir at the given path.
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
