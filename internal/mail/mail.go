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

// Message is one email: plain text, one recipient.
type Message struct {
	To      string
	Subject string
	Text    string
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
	body := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n",
		s.From, m.To, m.Subject, m.Text)
	var a smtp.Auth
	if s.User != "" {
		a = smtp.PlainAuth("", s.User, s.Password, s.Host)
	}
	return smtp.SendMail(s.Host+":"+s.Port, a, s.From, []string{m.To}, []byte(body))
}

// Dir writes each message to a file in a directory: `<unix ms>-<to>.txt`,
// the headers then a blank line then the text. For development and tests.
type Dir struct {
	Path string
}

// seq keeps two messages in one millisecond from sharing a name.
var seq atomic.Int64

func (d Dir) Send(_ context.Context, m Message) error {
	if err := os.MkdirAll(d.Path, 0o755); err != nil {
		return err
	}
	name := fmt.Sprintf("%d-%03d-%s.txt", time.Now().UnixMilli(), seq.Add(1)%1000, strings.NewReplacer("@", "_at_", "/", "_").Replace(m.To))
	body := fmt.Sprintf("To: %s\nSubject: %s\n\n%s\n", m.To, m.Subject, m.Text)
	return os.WriteFile(filepath.Join(d.Path, name), []byte(body), 0o644)
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
