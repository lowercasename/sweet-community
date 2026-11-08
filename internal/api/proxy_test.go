package api

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

// Behind a reverse proxy, every request arrives from one address. The login
// limiter must therefore key on the address the proxy reports. Otherwise one
// member's mistyped passwords block login for every user. A proxy such as
// nginx or Cloudflare adds the address it saw to the right of
// X-Forwarded-For, after whatever the client sent, so the server reads the
// entry that ProxyHops places from the right. A client cannot choose it.
func TestTrustedProxyAddressKeysTheLimiter(t *testing.T) {
	ts, _, srv := newTestServerWith(t)
	srv.ProxyHops = 1
	c := newClient(t, ts)
	attempt := 0
	wrong := func(real string) int {
		attempt++
		// Each attempt sends a different made-up address on the left. The proxy adds the real one on the right.
		forwarded := fmt.Sprintf("198.51.100.%d, %s", attempt, real)
		status, _ := c.do("POST", "/api/login", map[string]string{"username": "raphael", "password": "not the password"},
			"X-Forwarded-For", forwarded)
		return status
	}
	for i := 0; i < 5; i++ {
		if s := wrong("203.0.113.1"); s != 401 {
			t.Fatalf("attempt %d: %d", i+1, s)
		}
	}
	if s := wrong("203.0.113.1"); s != 429 {
		t.Fatalf("sixth attempt from the same address with a new made-up address: %d, want 429", s)
	}
	if s := wrong("203.0.113.2"); s != 401 {
		t.Fatalf("an attempt from another address: %d. It shares the first address's budget", s)
	}
}

// With two proxies, such as Cloudflare in front of Caddy, the client's address
// is the second entry from the right. A header with fewer entries than proxies
// came through fewer proxies, and its first entry is used.
func TestClientAddrCountsProxiesFromTheRight(t *testing.T) {
	for _, c := range []struct {
		hops      int
		forwarded string
		want      string
	}{
		{1, "203.0.113.1", "203.0.113.1"},
		{1, "198.51.100.9, 203.0.113.1", "203.0.113.1"},
		{2, "198.51.100.9, 203.0.113.1, 192.0.2.4", "203.0.113.1"},
		{2, "203.0.113.1", "203.0.113.1"},
		{1, "", "10.0.0.1:1234"},
		{0, "203.0.113.1", "10.0.0.1:1234"},
	} {
		srv := &Server{ProxyHops: c.hops}
		r := newRequest(c.forwarded)
		if got := srv.clientAddr(r); got != c.want {
			t.Errorf("hops %d, X-Forwarded-For %q: %q, want %q", c.hops, c.forwarded, got, c.want)
		}
	}
}

func TestProxyHeaderIsIgnoredUnlessTrusted(t *testing.T) {
	ts, _ := newTestServer(t)
	c := newClient(t, ts)
	for i := 0; i < 5; i++ {
		c.do("POST", "/api/login", map[string]string{"username": "raphael", "password": "not the password"},
			"X-Forwarded-For", "203.0.113.1")
	}
	status, _ := c.do("POST", "/api/login", map[string]string{"username": "raphael", "password": "not the password"},
		"X-Forwarded-For", "203.0.113.2")
	if status != 429 {
		t.Fatalf("a header nobody trusts opened a fresh budget: %d, want 429", status)
	}
}

// newRequest is a request from 10.0.0.1:1234 with the given X-Forwarded-For.
func newRequest(forwarded string) *http.Request {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.1:1234"
	if forwarded != "" {
		r.Header.Set("X-Forwarded-For", forwarded)
	}
	return r
}
