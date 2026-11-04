// Package auth holds the small, security-sensitive helpers: password hashing,
// session tokens, username rules. Nothing here touches HTTP or the database.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const bcryptCost = 12

var (
	ErrUsernameInvalid  = errors.New("usernames are 2–32 letters, digits or underscores")
	ErrUsernameReserved = errors.New("that username is reserved")
	ErrPasswordShort    = errors.New("passwords are at least 8 characters")
)

var usernameRe = regexp.MustCompile(`^[A-Za-z0-9_]{2,32}$`)

// Reserved usernames: routes, roles and words that would confuse mentions.
var reserved = map[string]bool{
	"admin": true, "administrator": true, "owner": true, "root": true, "system": true,
	"sweet": true, "api": true, "me": true, "everyone": true, "all": true, "here": true,
	"support": true, "help": true, "null": true, "undefined": true, "anonymous": true,
}

// ValidateUsername checks the shape and the reserved list.
func ValidateUsername(u string) error {
	if !usernameRe.MatchString(u) {
		return ErrUsernameInvalid
	}
	if reserved[strings.ToLower(u)] {
		return ErrUsernameReserved
	}
	return nil
}

// ValidatePassword enforces the one rule that matters: length.
func ValidatePassword(p string) error {
	if len(p) < 8 {
		return ErrPasswordShort
	}
	return nil
}

func HashPassword(p string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(p), bcryptCost)
	return string(h), err
}

func CheckPassword(hash, p string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(p)) == nil
}

// NewToken returns a random URL-safe token and the hash under which it is
// stored. Clients hold the token; the database holds only the hash.
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
