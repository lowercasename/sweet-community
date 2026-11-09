// Package auth holds the security-sensitive helpers for password hashing,
// session tokens and username rules. Nothing in it touches HTTP or the database.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"golang.org/x/crypto/argon2"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUsernameInvalid  = errors.New("Usernames are 2 to 32 letters, digits or underscores")
	ErrUsernameReserved = errors.New("That username is reserved")
	ErrPasswordShort    = errors.New("Passwords are at least 8 characters")
	ErrEmailInvalid     = errors.New("That does not look like an email address")
)

var usernameRe = regexp.MustCompile(`^[A-Za-z0-9_]{2,32}$`)

// reserved lists usernames that cannot be registered. They are route names,
// role names and words that would be ambiguous in a mention.
var reserved = map[string]bool{
	"admin": true, "administrator": true, "owner": true, "root": true, "system": true,
	"sweet": true, "api": true, "me": true, "everyone": true, "all": true, "here": true,
	"support": true, "help": true, "null": true, "undefined": true, "anonymous": true,
}

// ValidateUsername checks the username against the pattern and the reserved list.
func ValidateUsername(u string) error {
	if !usernameRe.MatchString(u) {
		return ErrUsernameInvalid
	}
	// A removed account is renamed to removed-<id> (api.removedName).
	if reserved[strings.ToLower(u)] || strings.HasPrefix(strings.ToLower(u), "removed-") {
		return ErrUsernameReserved
	}
	return nil
}

// ValidatePassword checks the minimum length. It is the only password rule.
func ValidatePassword(p string) error {
	if len(p) < 8 {
		return ErrPasswordShort
	}
	return nil
}

// Argon2id parameters at the OWASP minimums: 19 MiB
// of memory, two passes, one lane. The hash is stored in PHC form, so the
// parameters are stored with it.
const (
	argonMemory  = 19 * 1024
	argonTime    = 2
	argonThreads = 1
	argonKeyLen  = 32
)

func HashPassword(p string) (string, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := argon2.IDKey([]byte(p), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

// CheckPassword compares a password with an Argon2id hash, or with a bcrypt
// hash created before Argon2id was adopted (the owner's first password). The
// comparison is constant time for each hash kind.
func CheckPassword(hash, p string) bool {
	if strings.HasPrefix(hash, "$2a$") || strings.HasPrefix(hash, "$2b$") {
		return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
	}
	var m, t uint32
	var par uint8
	parts := strings.Split(hash, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false
	}
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &m, &t, &par); err != nil {
		return false
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false
	}
	got := argon2.IDKey([]byte(p), salt, t, m, par, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1
}

// DummyHash is the hash checked when no account matches the username, so a
// wrong username takes the same time as a wrong password.
var DummyHash, _ = HashPassword("nothing to see")

// ValidateEmail checks the format of an email address. It requires one @ with
// text on both sides, a dot in the domain part, and no whitespace.
func ValidateEmail(e string) error {
	e = strings.TrimSpace(e)
	at := strings.LastIndex(e, "@")
	if at < 1 || at == len(e)-1 || strings.ContainsAny(e, " \t\n") || !strings.Contains(e[at:], ".") || len(e) > 254 {
		return ErrEmailInvalid
	}
	return nil
}

// NewToken returns a random URL-safe token and the hash under which it is
// stored. The client holds the token. The database holds only the hash.
func NewToken() (token, hash string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, HashToken(token), nil
}

// NewCode returns a shorter random token for invite links.
func NewCode() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Equal is a constant-time string comparison.
func Equal(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
