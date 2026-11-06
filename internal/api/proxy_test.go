package api

import "testing"

// Behind the compose stack's Caddy every request arrives from one address,
// so the sign-in limiter must key on the address the proxy reports, or one
// member's typos lock the whole community out. Only when told to trust it:
// anyone can send the header.
func TestTrustedProxyAddressKeysTheLimiter(t *testing.T) {
	ts, _, srv := newTestServerWith(t)
	srv.TrustProxy = true
	c := newClient(t, ts)
	wrong := func(from string) int {
		status, _ := c.do("POST", "/api/login", map[string]string{"username": "raphael", "password": "not the password"},
			"X-Forwarded-For", from+", 10.0.0.2")
		return status
	}
	for i := 0; i < 5; i++ {
		if s := wrong("203.0.113.1"); s != 401 {
			t.Fatalf("attempt %d: %d", i+1, s)
		}
	}
	if s := wrong("203.0.113.1"); s != 429 {
		t.Fatalf("sixth attempt from the same address: %d, want 429", s)
	}
	if s := wrong("203.0.113.2"); s != 401 {
		t.Fatalf("an attempt from another address: %d; it shares the first address's budget", s)
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
