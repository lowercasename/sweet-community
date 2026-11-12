package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/images"
	"sweet/internal/mail"
)

// newFreshServer starts a server in the state of a new instance. It has no
// owner, and the function returns a setup link.
func newFreshServer(t *testing.T) (*httptest.Server, string) {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "fresh.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.Migrate(context.Background(), d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	if needs, err := NeedsSetup(context.Background(), d); err != nil || !needs {
		t.Fatalf("a fresh instance needs setup: %v %v", needs, err)
	}
	link, err := SetupLink(context.Background(), d, "http://sweet.test")
	if err != nil {
		t.Fatal(err)
	}
	imgs, _ := images.NewLocal(filepath.Join(t.TempDir(), "images"))
	mailDir := filepath.Join(t.TempDir(), "mail")
	srv := &Server{DB: d, Hub: events.NewHub(d), Images: imgs, Mail: mail.Dir{Path: mailDir}, BaseURL: "http://sweet.test"}
	mux := http.NewServeMux()
	srv.Routes(mux)
	ts := httptest.NewServer(Protect(mux))
	t.Cleanup(ts.Close)
	// The mail helpers find the server's sent mail by its address.
	mailDirs.Store(ts.URL, mailDir)
	return ts, link
}

// The instance lifecycle. The setup
// link creates the owner, whose address counts as verified because they hold
// the link. The community has no name until the owner sets one. Every client
// can read the name, logged in or not.
func TestSetupLinkMakesTheOwner(t *testing.T) {
	ts, link := newFreshServer(t)
	if !strings.HasPrefix(link, "http://sweet.test/setup/") {
		t.Fatalf("setup link: %s", link)
	}
	token := link[strings.LastIndex(link, "/")+1:]
	anon := newClient(t, ts)
	// A logged-out client can read that there is no owner and no name yet.
	if st := anon.mustStatus(200, "GET", "/api/settings", nil); st["owner_set"] != false || st["name"] != "" {
		t.Fatalf("settings before setup: %v", st)
	}
	anon.mustStatus(404, "POST", "/api/setup", map[string]string{"token": "nope", "username": "raphael", "email": "r@example.test"})
	anon.mustStatus(400, "POST", "/api/setup", map[string]string{"token": token, "username": "raphael", "email": "nope"})
	owner := newClient(t, ts)
	res := owner.mustStatus(201, "POST", "/api/setup", map[string]string{"token": token, "username": "raphael", "email": "r@example.test"})
	if res["user"].(map[string]any)["username"] != "raphael" {
		t.Fatalf("setup: %v", res)
	}
	// The new owner is logged in, owns the root group, and has a verified address. The link is used up.
	owner.mustStatus(200, "GET", "/api/me", nil)
	if acct := owner.mustStatus(200, "GET", "/api/me/account", nil); acct["email"] != "r@example.test" || acct["email_verified"] != true {
		t.Fatalf("owner's account: %v", acct)
	}
	if !groupCan(myGroups(owner)[rootID(owner)], "manage_instance") {
		t.Fatal("the person from the setup link is not the owner")
	}
	newClient(t, ts).mustStatus(404, "POST", "/api/setup", map[string]string{"token": token, "username": "other", "email": "o@example.test"})
	if st := anon.mustStatus(200, "GET", "/api/settings", nil); st["owner_set"] != true {
		t.Fatalf("settings after setup: %v", st)
	}
	// During onboarding the owner sets the name, which every client can then read.
	owner.mustStatus(400, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": "  "})
	owner.mustStatus(400, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": strings.Repeat("x", 61)})
	st := owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": " Knitting Circle ", "description": "Wool and gossip."})
	if st["name"] != "Knitting Circle" || st["description"] != "Wool and gossip." || st["owner_set"] != true {
		t.Fatalf("named: %v", st)
	}
	if st := anon.mustStatus(200, "GET", "/api/settings", nil); st["name"] != "Knitting Circle" {
		t.Fatalf("signed out, the name: %v", st)
	}
	// The owner signs in again by email, the usual way in.
	signIn(t, ts, "r@example.test", "r@example.test")
}

func rootID(c *client) string {
	for id, g := range myGroups(c) {
		if g["kind"] == "root" {
			return id
		}
	}
	return ""
}

// Each user who joins through an invite link creates a notification for the
// owner and every moderator, and for nobody else.
func TestStaffHearOfEachArrival(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, kitID := registerMember(t, ts, owner, "kit")
	jo, _ := registerMember(t, ts, owner, "jo")
	owner.mustStatus(200, "PUT", rootPath+"/members/"+kitID, map[string]string{"role": "moderator"})
	registerMember(t, ts, owner, "mo")
	for name, c := range map[string]*client{"the owner": owner, "a moderator": kit} {
		newest := c.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any)[0].(map[string]any)
		if newest["kind"] != NotifyJoined || newest["actor"].(map[string]any)["username"] != "mo" || newest["post_id"] != nil {
			t.Fatalf("%s's joined notification: %v", name, newest)
		}
	}
	if n := len(jo.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any)); n != 0 {
		t.Fatalf("a member hears of arrivals: %d", n)
	}
}

// Setup takes no password because passwords are always the secondary way in. The owner signs in by
// email, and can add a password on Settings later. A password sent to setup is not stored.
func TestSetupWithoutAPassword(t *testing.T) {
	ts, link := newFreshServer(t)
	token := link[strings.LastIndex(link, "/")+1:]
	owner := newClient(t, ts)
	owner.mustStatus(201, "POST", "/api/setup", map[string]string{"token": token, "username": "raphael", "email": "r@example.test", "password": "correct horse"})
	if acct := owner.mustStatus(200, "GET", "/api/me/account", nil); acct["has_password"] != false || acct["email_verified"] != true {
		t.Fatalf("the owner's account after a setup without a password: %v", acct)
	}
	newClient(t, ts).mustStatus(401, "POST", "/api/login", map[string]string{"username": "raphael", "password": "correct horse"})
}

// GET /api/version names the release the binary was built from and the
// build's own identifier, which open tabs use to reload. Only a signed-in user
// can read it, so the release is not shown to anyone scanning for old versions.
func TestVersionIsForSignedInUsers(t *testing.T) {
	ts, owner := newTestServer(t)
	newClient(t, ts).mustStatus(401, "GET", "/api/version", nil)
	v := owner.mustStatus(200, "GET", "/api/version", nil)
	if v["release"] != "dev" || len(v["build"].(string)) != 12 {
		t.Fatalf("version: %v", v)
	}
}

// GET /api/version also gives the address of the source code, which the line at the bottom of Home's feed links to.
// It is the public repository unless the server names a fork.
func TestVersionGivesTheSourceAddress(t *testing.T) {
	_, owner, srv := newTestServerWith(t)
	if v := owner.mustStatus(200, "GET", "/api/version", nil); v["source_url"] != "https://github.com/lowercasename/sweet-community" {
		t.Fatalf("default source: %v", v)
	}
	srv.SourceURL = "https://code.example.test/fork"
	if v := owner.mustStatus(200, "GET", "/api/version", nil); v["source_url"] != "https://code.example.test/fork" {
		t.Fatalf("a fork's source: %v", v)
	}
}
