package api

import (
	"fmt"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"sweet/internal/db"
)

// These tests cover the account flows. A password
// is optional. A user signs in with an email that holds a link and a
// six-digit code. The code works only in the browser that asked for it. The
// link opens a page whose button uses it, in any browser. Joining sends the
// first sign-in email, and using it verifies the address. A changed address
// is confirmed by a link that signs nobody in. Each test has its own server,
// so the rate limiters keyed by client address start empty. The endpoints
// that send mail allow five calls at once from one address.

func invite(t *testing.T, owner *client) string {
	t.Helper()
	return owner.mustStatus(201, "POST", "/api/invites", nil)["code"].(string)
}

var codeLine = regexp.MustCompile(`Code: (\d{6})`)

// signinMail returns the link token and the code in the newest email to an address.
func signinMail(t *testing.T, ts *httptest.Server, to string) (token, code string) {
	t.Helper()
	links := mailed(t, ts, to, "signin")
	m := codeLine.FindStringSubmatch(newestMail(t, ts, to))
	if len(links) != 1 || m == nil {
		t.Fatalf("sign-in mail to %s: links %v, code %v", to, links, m)
	}
	return linkToken(links[0]), m[1]
}

// otherCode is a code that differs from the given one.
func otherCode(code string) string {
	n, _ := strconv.Atoi(code)
	return fmt.Sprintf("%06d", (n+1)%1000000)
}

// signIn signs a new client in with the code from a sign-in email.
func signIn(t *testing.T, ts *httptest.Server, login, email string) *client {
	t.Helper()
	c := newClient(t, ts)
	c.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": login})
	_, code := signinMail(t, ts, email)
	c.mustStatus(200, "POST", "/api/signin/code", map[string]string{"code": code})
	return c
}

func TestJoinWithoutAPassword(t *testing.T) {
	ts, owner := newTestServer(t)
	code := invite(t, owner)
	kit := newClient(t, ts)
	reg := map[string]string{"code": code, "username": "kit"}

	// A registration with no address, or an invalid one, is rejected and does not use the invite.
	kit.mustStatus(400, "POST", "/api/register", reg)
	reg["email"] = "not an address"
	kit.mustStatus(400, "POST", "/api/register", reg)
	reg["email"] = "kit@example.test"
	if res := kit.mustStatus(202, "POST", "/api/register", reg); res["email"] != "kit@example.test" {
		t.Fatalf("register: %v", res)
	}
	kit.mustStatus(401, "GET", "/api/me", nil)
	// The account has no password, so password sign-in answers as for a wrong password.
	newClient(t, ts).mustStatus(401, "POST", "/api/login", map[string]string{"username": "kit", "password": "anything at all"})

	// The first sign-in email holds a code that works only in the browser that joined.
	_, c := signinMail(t, ts, "kit@example.test")
	newClient(t, ts).mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": c})
	v := kit.mustStatus(200, "POST", "/api/signin/code", map[string]string{"code": c})
	if v["user"].(map[string]any)["username"] != "kit" || v["token"] == "" {
		t.Fatalf("sign-in by code: %v", v)
	}
	kit.mustStatus(200, "GET", "/api/me", nil)
	acct := kit.mustStatus(200, "GET", "/api/me/account", nil)
	if acct["email"] != "kit@example.test" || acct["email_verified"] != true || acct["has_password"] != false {
		t.Fatalf("account after the first sign-in: %v", acct)
	}
	// The code works once.
	kit.mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": c})

	// A user can sign in with their email address in any letter case.
	signIn(t, ts, "KIT@Example.test", "kit@example.test")
	// An address belongs to one account. A second registration with it gets the same 202 as the first (see api_test).
	newClient(t, ts).mustStatus(202, "POST", "/api/register", map[string]string{"code": invite(t, owner), "username": "mo", "email": "Kit@example.test"})
}

func TestSignInByLink(t *testing.T) {
	ts, owner := newTestServer(t)
	registerMember(t, ts, owner, "kit")
	// A login that matches no account gets the same 202, and no email is sent.
	anon := newClient(t, ts)
	anon.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "nobody"})
	anon.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "nobody@example.test"})
	if n := mailCount(ts, "nobody@example.test"); n != 0 {
		t.Fatalf("mail to an unknown address: %d", n)
	}

	// The link works in any browser, once. Using it also uses the code.
	asker := newClient(t, ts)
	asker.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "kit"})
	token, code := signinMail(t, ts, "kit@example.test")
	other := newClient(t, ts)
	newClient(t, ts).mustStatus(404, "POST", "/api/signin/link", map[string]string{"token": "nope"})
	if res := other.mustStatus(200, "POST", "/api/signin/link", map[string]string{"token": token}); res["user"].(map[string]any)["username"] != "kit" || res["token"] == "" {
		t.Fatalf("sign-in by link: %v", res)
	}
	other.mustStatus(200, "GET", "/api/me", nil)
	newClient(t, ts).mustStatus(404, "POST", "/api/signin/link", map[string]string{"token": token})
	asker.mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": code})
}

func TestSignInByCode(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	registerMember(t, ts, owner, "kit")
	asker := newClient(t, ts)

	// Five wrong codes void the token, so the right code no longer works.
	asker.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "kit@example.test"})
	_, code := signinMail(t, ts, "kit@example.test")
	for i := 0; i < 5; i++ {
		asker.mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": otherCode(code)})
	}
	asker.mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": code})

	// An expired token works neither by code nor by link.
	asker.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "kit"})
	token, code := signinMail(t, ts, "kit@example.test")
	if _, err := srv.DB.Exec("UPDATE email_tokens SET expires_at = ? WHERE kind = 'signin'", db.Now()-1); err != nil {
		t.Fatal(err)
	}
	asker.mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": code})
	newClient(t, ts).mustStatus(404, "POST", "/api/signin/link", map[string]string{"token": token})

	// A code may be typed with a space in the middle.
	asker.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "kit"})
	_, code = signinMail(t, ts, "kit@example.test")
	asker.mustStatus(200, "POST", "/api/signin/code", map[string]string{"code": code[:3] + " " + code[3:]})
}

// A user can enter at most ten wrong codes in a day across all their tokens.
// After that a code is refused even when it is right, and only the link works.
func TestWrongCodesAreCappedPerDay(t *testing.T) {
	ts, owner := newTestServer(t)
	registerMember(t, ts, owner, "kit")
	for round := 0; round < 2; round++ {
		asker := newClient(t, ts)
		asker.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "kit"})
		_, code := signinMail(t, ts, "kit@example.test")
		for i := 0; i < 5; i++ {
			asker.mustStatus(400, "POST", "/api/signin/code", map[string]string{"code": otherCode(code)})
		}
	}
	asker := newClient(t, ts)
	asker.mustStatus(202, "POST", "/api/signin/email", map[string]string{"login": "kit"})
	token, code := signinMail(t, ts, "kit@example.test")
	asker.mustStatus(429, "POST", "/api/signin/code", map[string]string{"code": code})
	newClient(t, ts).mustStatus(200, "POST", "/api/signin/link", map[string]string{"token": token})
}

func TestChangeAddressAfterJoining(t *testing.T) {
	ts, owner := newTestServer(t)
	kit := newClient(t, ts)
	kit.mustStatus(202, "POST", "/api/register", map[string]string{"code": invite(t, owner), "username": "kit", "email": "typo@example.test"})
	// Only the browser that joined can change the address.
	newClient(t, ts).mustStatus(403, "POST", "/api/signin/address", map[string]string{"email": "right@example.test"})
	kit.mustStatus(400, "POST", "/api/signin/address", map[string]string{"email": "nope"})
	kit.mustStatus(202, "POST", "/api/signin/address", map[string]string{"email": "right@example.test"})
	// The mistyped address's link no longer works. The new address's code works in this browser.
	typoToken, _ := signinMail(t, ts, "typo@example.test")
	newClient(t, ts).mustStatus(404, "POST", "/api/signin/link", map[string]string{"token": typoToken})
	_, code := signinMail(t, ts, "right@example.test")
	kit.mustStatus(200, "POST", "/api/signin/code", map[string]string{"code": code})
	if acct := kit.mustStatus(200, "GET", "/api/me/account", nil); acct["email"] != "right@example.test" || acct["email_verified"] != true {
		t.Fatalf("account: %v", acct)
	}
	// Once the address is verified, it is changed only from Settings.
	kit.mustStatus(403, "POST", "/api/signin/address", map[string]string{"email": "other@example.test"})

	// Another account's address cannot be claimed this way. The answer is the same 202, jo's address is
	// unchanged, and mo is emailed about the attempt.
	registerMember(t, ts, owner, "mo")
	jo := newClient(t, ts)
	jo.mustStatus(202, "POST", "/api/register", map[string]string{"code": invite(t, owner), "username": "jo", "email": "jo@example.test"})
	moHad := mailCount(ts, "mo@example.test")
	jo.mustStatus(202, "POST", "/api/signin/address", map[string]string{"email": "MO@example.test"})
	if mailCount(ts, "mo@example.test") != moHad+1 || mailCount(ts, "MO@example.test") != 0 {
		t.Fatalf("taken address on change: mo got %d (had %d)", mailCount(ts, "mo@example.test"), moHad)
	}
	joToken, _ := signinMail(t, ts, "jo@example.test")
	newClient(t, ts).mustStatus(200, "POST", "/api/signin/link", map[string]string{"token": joToken})
}

func TestPasswordIsOptional(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	if acct := kit.mustStatus(200, "GET", "/api/me/account", nil); acct["has_password"] != false {
		t.Fatalf("a new account has a password: %v", acct)
	}
	kit.mustStatus(400, "PUT", "/api/me/password", map[string]string{"password": "short"})
	elsewhere := signIn(t, ts, "kit", "kit@example.test")

	// Setting a password needs no current password. It ends every other session and emails a notice.
	kit.mustStatus(204, "PUT", "/api/me/password", map[string]string{"password": "longenough"})
	kit.mustStatus(200, "GET", "/api/me", nil)
	elsewhere.mustStatus(401, "GET", "/api/me", nil)
	if acct := kit.mustStatus(200, "GET", "/api/me/account", nil); acct["has_password"] != true {
		t.Fatalf("account after setting a password: %v", acct)
	}
	if m := newestMail(t, ts, "kit@example.test"); !strings.Contains(m, "Your password was set") {
		t.Fatalf("notice after setting a password: %s", m)
	}
	newClient(t, ts).login("kit", "longenough")

	kit.mustStatus(204, "PUT", "/api/me/password", map[string]string{"password": "anotherlongone"})
	newClient(t, ts).login("kit", "anotherlongone")
	if m := newestMail(t, ts, "kit@example.test"); !strings.Contains(m, "Your password was changed") {
		t.Fatalf("notice after changing the password: %s", m)
	}

	// Removing the password leaves sign-in by email.
	kit.mustStatus(204, "DELETE", "/api/me/password", nil)
	newClient(t, ts).mustStatus(401, "POST", "/api/login", map[string]string{"username": "kit", "password": "anotherlongone"})
	if acct := kit.mustStatus(200, "GET", "/api/me/account", nil); acct["has_password"] != false {
		t.Fatalf("account after removing the password: %v", acct)
	}
	if m := newestMail(t, ts, "kit@example.test"); !strings.Contains(m, "Your password was removed") {
		t.Fatalf("notice after removing the password: %s", m)
	}
	// The owner made at the command line has no email address, so they cannot remove their password.
	owner.mustStatus(400, "DELETE", "/api/me/password", nil)
}

func TestChangeEmailConfirmsOnly(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	kit.mustStatus(400, "PUT", "/api/me/email", map[string]string{"email": "nope"})
	kit.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "first@example.test"})
	acct := kit.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "new@example.test"})
	if acct["email"] != "kit@example.test" || acct["pending_email"] != "new@example.test" {
		t.Fatalf("account with a pending address: %v", acct)
	}
	// A newer change deletes the older confirmation link.
	anon := newClient(t, ts)
	anon.mustStatus(404, "POST", "/api/verify", map[string]string{"token": linkToken(mailed(t, ts, "first@example.test", "verify")[0])})
	// Until the new address is confirmed, sign-in uses the old one.
	signIn(t, ts, "kit@example.test", "kit@example.test")

	// The link confirms the address from any browser and signs nobody in.
	res := anon.mustStatus(200, "POST", "/api/verify", map[string]string{"token": linkToken(mailed(t, ts, "new@example.test", "verify")[0])})
	if res["email"] != "new@example.test" || res["token"] != nil || res["user"] != nil {
		t.Fatalf("confirming an address: %v", res)
	}
	anon.mustStatus(401, "GET", "/api/me", nil)
	acct = kit.mustStatus(200, "GET", "/api/me/account", nil)
	if acct["email"] != "new@example.test" || acct["email_verified"] != true || acct["pending_email"] != nil {
		t.Fatalf("account after confirming: %v", acct)
	}
	// A notice goes to the old address.
	if m := newestMail(t, ts, "kit@example.test"); !strings.Contains(m, "new@example.test") {
		t.Fatalf("notice to the old address: %s", m)
	}
	signIn(t, ts, "new@example.test", "new@example.test")

	// An address that belongs to another account cannot be claimed, even with a link sent before that account had it.
	mo, _ := registerMember(t, ts, owner, "mo")
	mo.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "taken@example.test"})
	moLink := linkToken(mailed(t, ts, "taken@example.test", "verify")[0])
	kit.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "taken@example.test"})
	kit.mustStatus(200, "POST", "/api/verify", map[string]string{"token": linkToken(mailed(t, ts, "taken@example.test", "verify")[0])})
	mo.mustStatus(409, "POST", "/api/verify", map[string]string{"token": moLink})
}

func TestSignInPaysOnlyForWrongGuesses(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	kit.mustStatus(204, "PUT", "/api/me/password", map[string]string{"password": "longenough"})
	// Logins with the correct password are not limited.
	for i := 0; i < 8; i++ {
		newClient(t, ts).login("kit", "longenough")
	}
	// After five wrong passwords, login is blocked for every client at this address, even with the correct password.
	for i := 0; i < 5; i++ {
		newClient(t, ts).mustStatus(401, "POST", "/api/login", map[string]string{"username": "kit", "password": "wrong"})
	}
	newClient(t, ts).mustStatus(429, "POST", "/api/login", map[string]string{"username": "kit", "password": "longenough"})
}

// At most five sign-in emails are sent to a user per hour, including the one
// sent on joining. The response does not show when this limit is reached.
// The endpoint is also rate limited per client address.
func TestSignInEmailsAreRationed(t *testing.T) {
	ts, owner := newTestServer(t)
	registerMember(t, ts, owner, "kit")
	for i := 0; i < 8; i++ {
		status, _ := newClient(t, ts).do("POST", "/api/signin/email", map[string]string{"login": "kit"})
		if status != 202 && status != 429 {
			t.Fatalf("sign-in request %d: %d", i, status)
		}
	}
	if n := mailCount(ts, "kit@example.test"); n != 5 {
		t.Fatalf("sign-in mails to kit, including the one on joining: %d", n)
	}
}
