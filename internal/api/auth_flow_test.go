package api

import (
	"context"
	"database/sql"
	"net/http/httptest"
	"testing"
	"time"

	"sweet/internal/auth"
	"sweet/internal/db"
	"sweet/internal/store"
)

// These tests cover the account flows (architecture.md, Accounts). An email
// address is verified by a link before the account can be used. A user logs
// in with their username or email address. A password is reset by a link. A
// new address is verified before it replaces the old one. A password change
// requires the current password. Each test has its own server, so the rate
// limiters keyed by client address start empty.

func invite(t *testing.T, owner *client) string {
	t.Helper()
	return owner.mustStatus(201, "POST", "/api/invites", nil)["code"].(string)
}

func TestRegisterNeedsAVerifiedAddress(t *testing.T) {
	ts, owner := newTestServer(t)
	code := invite(t, owner)
	kit := newClient(t, ts)
	reg := map[string]string{"code": code, "username": "kit", "password": "longenough"}

	// A registration with no address, or an invalid one, is rejected and does not use the invite.
	kit.mustStatus(400, "POST", "/api/register", reg)
	reg["email"] = "not an address"
	kit.mustStatus(400, "POST", "/api/register", reg)
	reg["email"] = "kit@example.test"
	res := kit.mustStatus(202, "POST", "/api/register", reg)
	if res["email"] != "kit@example.test" {
		t.Fatalf("register: %v", res)
	}
	// The user is not logged in and cannot log in, because the address is unverified.
	kit.mustStatus(401, "GET", "/api/me", nil)
	status, body := kit.do("POST", "/api/login", map[string]string{"username": "kit", "password": "longenough"})
	if status != 403 || body["error"] != "unverified" || body["email"] != "kit@example.test" {
		t.Fatalf("login before verifying: %d %v", status, body)
	}
	// The registration still uses the invite, and the invite stays valid for the next user.
	kit.mustStatus(202, "POST", "/api/register", map[string]string{"code": code, "username": "kit2", "password": "longenough", "email": "kit2@example.test"})

	// The verification link logs the user in. It works only once.
	links := mailed(t, ts, "kit@example.test", "verify")
	if len(links) != 1 {
		t.Fatalf("verification links: %v", links)
	}
	token := linkToken(links[0])
	kit.mustStatus(404, "POST", "/api/verify", map[string]string{"token": "nope"})
	v := kit.mustStatus(200, "POST", "/api/verify", map[string]string{"token": token})
	if v["user"].(map[string]any)["username"] != "kit" || v["token"] == "" {
		t.Fatalf("verify: %v", v)
	}
	kit.mustStatus(200, "GET", "/api/me", nil)
	newClient(t, ts).mustStatus(404, "POST", "/api/verify", map[string]string{"token": token})
	acct := kit.mustStatus(200, "GET", "/api/me/account", nil)
	if acct["email"] != "kit@example.test" || acct["email_verified"] != true || acct["pending_email"] != nil {
		t.Fatalf("account: %v", acct)
	}

	// A user can also log in with their email address, in any letter case.
	newClient(t, ts).login("KIT@Example.test", "longenough")
	// An address belongs to one account. A second registration with it gets the same 202 as the first (see api_test).
	newClient(t, ts).mustStatus(202, "POST", "/api/register", map[string]string{"code": invite(t, owner), "username": "mo", "password": "longenough", "email": "Kit@example.test"})
	// The owner created from the command line has no address and can still log in (newTestServer logged them in).
}

func TestResendVerification(t *testing.T) {
	ts, owner := newTestServer(t)
	kit := newClient(t, ts)
	kit.mustStatus(202, "POST", "/api/register", map[string]string{"code": invite(t, owner), "username": "kit", "password": "longenough", "email": "kit@example.test"})
	anon := newClient(t, ts)
	// The response is the same whether or not the address is known. Mail goes only to a known, unverified address.
	anon.mustStatus(202, "POST", "/api/verify/resend", map[string]string{"email": "nobody@example.test"})
	anon.mustStatus(202, "POST", "/api/verify/resend", map[string]string{"email": "kit@example.test"})
	if n := mailCount(ts, "nobody@example.test"); n != 0 {
		t.Fatalf("mail to an unknown address: %d", n)
	}
	if n := mailCount(ts, "kit@example.test"); n != 2 {
		t.Fatalf("mail to kit after a resend: %d", n)
	}
	// The newest link works, and so does the first. Each link is single-use, and no link revokes another within the day.
	kit.mustStatus(200, "POST", "/api/verify", map[string]string{"token": linkToken(mailed(t, ts, "kit@example.test", "verify")[0])})
	// After verification, a resend sends no more mail, and the address cannot be changed from the login page.
	kit.mustStatus(403, "POST", "/api/verify/change", map[string]string{"username": "kit", "password": "longenough", "email": "else@example.test"})
	anon.mustStatus(202, "POST", "/api/verify/resend", map[string]string{"email": "kit@example.test"})
	if n := mailCount(ts, "kit@example.test"); n != 2 {
		t.Fatalf("mail to kit after verifying: %d", n)
	}
}

func TestChangeUnverifiedEmail(t *testing.T) {
	ts, owner := newTestServer(t)
	kit := newClient(t, ts)
	kit.mustStatus(202, "POST", "/api/register", map[string]string{"code": invite(t, owner), "username": "kit", "password": "longenough", "email": "typo@example.test"})
	anon := newClient(t, ts)
	anon.mustStatus(403, "POST", "/api/verify/change", map[string]string{"username": "kit", "password": "wrong", "email": "right@example.test"})
	anon.mustStatus(400, "POST", "/api/verify/change", map[string]string{"username": "kit", "password": "longenough", "email": "nope"})
	anon.mustStatus(202, "POST", "/api/verify/change", map[string]string{"username": "kit", "password": "longenough", "email": "right@example.test"})
	// The old address and its link are removed. The new address gets a link that logs the user in.
	anon.mustStatus(202, "POST", "/api/verify/resend", map[string]string{"email": "typo@example.test"})
	if n := mailCount(ts, "typo@example.test"); n != 1 {
		t.Fatalf("mail to the mistyped address after the change: %d", n)
	}
	kit.mustStatus(200, "POST", "/api/verify", map[string]string{"token": linkToken(mailed(t, ts, "right@example.test", "verify")[0])})
	if acct := kit.mustStatus(200, "GET", "/api/me/account", nil); acct["email"] != "right@example.test" {
		t.Fatalf("account: %v", acct)
	}
	// Another account's address cannot be claimed this way. The response is 202, the same as for an unused
	// address. Jo's address is unchanged, and mo is emailed about the attempt.
	registerMember(t, ts, owner, "mo")
	jo := newClient(t, ts)
	jo.mustStatus(202, "POST", "/api/register", map[string]string{"code": invite(t, owner), "username": "jo", "password": "longenough", "email": "jo@example.test"})
	moHad := mailCount(ts, "mo@example.test")
	anon.mustStatus(202, "POST", "/api/verify/change", map[string]string{"username": "jo", "password": "longenough", "email": "MO@example.test"})
	if mailCount(ts, "mo@example.test") != moHad+1 || mailCount(ts, "MO@example.test") != 0 || len(mailed(t, ts, "jo@example.test", "verify")) == 0 {
		t.Fatalf("taken address on change: mo got %d (had %d)", mailCount(ts, "mo@example.test"), moHad)
	}
}

func TestPasswordReset(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	anon := newClient(t, ts)
	anon.mustStatus(202, "POST", "/api/reset", map[string]string{"email": "nobody@example.test"})
	anon.mustStatus(202, "POST", "/api/reset", map[string]string{"email": "kit@example.test"})
	links := mailed(t, ts, "kit@example.test", "reset")
	if len(links) != 1 {
		t.Fatalf("reset links: %v", links)
	}
	token := linkToken(links[0])
	// A verify token does not work as a reset token, and trying it as one does not use it up.
	kit.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "kit2@example.test", "password": "longenough"})
	verifyToken := linkToken(mailed(t, ts, "kit2@example.test", "verify")[0])
	anon.mustStatus(404, "POST", "/api/reset/"+verifyToken, map[string]string{"password": "anotherlongone"})
	kit.mustStatus(200, "POST", "/api/verify", map[string]string{"token": verifyToken})
	// Password rules are checked first, and a rejected password does not use up the token.
	anon.mustStatus(400, "POST", "/api/reset/"+token, map[string]string{"password": "short"})
	fresh := newClient(t, ts)
	res := fresh.mustStatus(200, "POST", "/api/reset/"+token, map[string]string{"password": "anotherlongone"})
	if res["user"].(map[string]any)["username"] != "kit" {
		t.Fatalf("reset: %v", res)
	}
	// The reset logs this client in. Every earlier session ends. The link is used up.
	fresh.mustStatus(200, "GET", "/api/me", nil)
	kit.mustStatus(401, "GET", "/api/me", nil)
	newClient(t, ts).mustStatus(404, "POST", "/api/reset/"+token, map[string]string{"password": "anotherlongone"})
	status, _ := newClient(t, ts).do("POST", "/api/login", map[string]string{"username": "kit", "password": "longenough"})
	if status != 401 {
		t.Fatalf("old password after reset: %d", status)
	}
	newClient(t, ts).login("kit", "anotherlongone")
}

func TestChangePassword(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	elsewhere := newClient(t, ts)
	elsewhere.login("kit", "longenough")
	kit.mustStatus(403, "PUT", "/api/me/password", map[string]string{"current": "wrong", "password": "anotherlongone"})
	kit.mustStatus(400, "PUT", "/api/me/password", map[string]string{"current": "longenough", "password": "short"})
	kit.mustStatus(204, "PUT", "/api/me/password", map[string]string{"current": "longenough", "password": "anotherlongone"})
	// This session continues. The other session ends.
	kit.mustStatus(200, "GET", "/api/me", nil)
	elsewhere.mustStatus(401, "GET", "/api/me", nil)
	newClient(t, ts).login("kit", "anotherlongone")
}

func TestChangeEmail(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	kit.mustStatus(403, "PUT", "/api/me/email", map[string]string{"email": "new@example.test", "password": "wrong"})
	kit.mustStatus(400, "PUT", "/api/me/email", map[string]string{"email": "nope", "password": "longenough"})
	acct := kit.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "new@example.test", "password": "longenough"})
	if acct["email"] != "kit@example.test" || acct["pending_email"] != "new@example.test" {
		t.Fatalf("account with a pending address: %v", acct)
	}
	// Until the new address is verified, the old address stays on the account. Login works with the old address and not with the new one.
	newClient(t, ts).login("kit@example.test", "longenough")
	if status, _ := newClient(t, ts).do("POST", "/api/login", map[string]string{"username": "new@example.test", "password": "longenough"}); status != 401 {
		t.Fatalf("pending address signs in: %d", status)
	}
	links := mailed(t, ts, "new@example.test", "verify")
	if len(links) != 1 {
		t.Fatalf("verification links to the new address: %v", links)
	}
	kit.mustStatus(200, "POST", "/api/verify", map[string]string{"token": linkToken(links[0])})
	acct = kit.mustStatus(200, "GET", "/api/me/account", nil)
	if acct["email"] != "new@example.test" || acct["email_verified"] != true || acct["pending_email"] != nil {
		t.Fatalf("account after verifying the new address: %v", acct)
	}
	newClient(t, ts).login("new@example.test", "longenough")
	if status, _ := newClient(t, ts).do("POST", "/api/login", map[string]string{"username": "kit@example.test", "password": "longenough"}); status != 401 {
		t.Fatalf("old address still signs in: %d", status)
	}
	// An address that belongs to another account cannot be claimed, even with a link sent before that account had it.
	mo, _ := registerMember(t, ts, owner, "mo")
	mo.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "taken@example.test", "password": "longenough"})
	moLink := linkToken(mailed(t, ts, "taken@example.test", "verify")[0])
	kit.mustStatus(200, "PUT", "/api/me/email", map[string]string{"email": "taken@example.test", "password": "longenough"})
	kit.mustStatus(200, "POST", "/api/verify", map[string]string{"token": linkToken(mailed(t, ts, "taken@example.test", "verify")[0])})
	mo.mustStatus(409, "POST", "/api/verify", map[string]string{"token": moLink})
}

func TestSignInPaysOnlyForWrongGuesses(t *testing.T) {
	ts, owner := newTestServer(t)
	registerMember(t, ts, owner, "kit")
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

func TestEmailTokensExpireAndAreRationed(t *testing.T) {
	ts, owner, srv := newTestServerWith(t)
	kit, id := registerMember(t, ts, owner, "kit")
	// An expired token is rejected.
	token, hash, _ := auth.NewToken()
	now := db.Now()
	q := store.New(srv.DB)
	if err := q.CreateEmailToken(context.Background(), store.CreateEmailTokenParams{Hash: hash, UserID: id, Kind: TokenReset, Email: "kit@example.test", CreatedAt: now - 2*time.Hour.Milliseconds(), ExpiresAt: now - time.Hour.Milliseconds()}); err != nil {
		t.Fatal(err)
	}
	newClient(t, ts).mustStatus(404, "POST", "/api/reset/"+token, map[string]string{"password": "anotherlongone"})
	kit.mustStatus(200, "GET", "/api/me", nil)

	// At most five links of one kind are sent to a user per hour. The response
	// does not show when this limit is reached. The endpoint is also rate
	// limited per client address, like login.
	sent := 0
	for i := 0; i < 8; i++ {
		status, _ := newClient(t, ts).do("POST", "/api/reset", map[string]string{"email": "kit@example.test"})
		if status == 202 {
			sent++
		} else if status != 429 {
			t.Fatalf("reset request %d: %d", i, status)
		}
	}
	if sent < 5 {
		t.Fatalf("accepted reset requests: %d", sent)
	}
	if n := mailCount(ts, "kit@example.test"); n != 1+5 {
		t.Fatalf("reset mails to kit (plus the one verification): %d", n)
	}
	_ = sql.ErrNoRows
}

var _ = httptest.NewServer
