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

// newFreshServer is a server as a new instance starts: no owner, a setup link.
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
	srv := &Server{DB: d, Hub: events.NewHub(d), Images: imgs, Mail: mail.Dir{Path: filepath.Join(t.TempDir(), "mail")}, BaseURL: "http://sweet.test"}
	mux := http.NewServeMux()
	srv.Routes(mux)
	ts := httptest.NewServer(Protect(mux))
	t.Cleanup(ts.Close)
	return ts, link
}

// The lifecycle (architecture.md, New-instance lifecycle): the setup link
// makes the owner, verified by holding it; the community is unnamed until
// the owner names it, which everyone can read, signed in or not.
func TestSetupLinkMakesTheOwner(t *testing.T) {
	ts, link := newFreshServer(t)
	if !strings.HasPrefix(link, "http://sweet.test/setup/") {
		t.Fatalf("setup link: %s", link)
	}
	token := link[strings.LastIndex(link, "/")+1:]
	anon := newClient(t, ts)
	// Signed out, anyone can read that there is no owner yet and no name.
	if st := anon.mustStatus(200, "GET", "/api/settings", nil); st["owner_set"] != false || st["name"] != "" {
		t.Fatalf("settings before setup: %v", st)
	}
	anon.mustStatus(404, "POST", "/api/setup", map[string]string{"token": "nope", "username": "raphael", "email": "r@example.test", "password": "correct horse"})
	anon.mustStatus(400, "POST", "/api/setup", map[string]string{"token": token, "username": "raphael", "email": "nope", "password": "correct horse"})
	anon.mustStatus(400, "POST", "/api/setup", map[string]string{"token": token, "username": "raphael", "email": "r@example.test", "password": "short"})
	owner := newClient(t, ts)
	res := owner.mustStatus(201, "POST", "/api/setup", map[string]string{"token": token, "username": "raphael", "email": "r@example.test", "password": "correct horse"})
	if res["user"].(map[string]any)["username"] != "raphael" {
		t.Fatalf("setup: %v", res)
	}
	// Signed in, the owner of the root group, with a verified address; the link is spent.
	owner.mustStatus(200, "GET", "/api/me", nil)
	if acct := owner.mustStatus(200, "GET", "/api/me/account", nil); acct["email"] != "r@example.test" || acct["email_verified"] != true {
		t.Fatalf("owner's account: %v", acct)
	}
	if !groupCan(myGroups(owner)[rootID(owner)], "manage_instance") {
		t.Fatal("the person from the setup link is not the owner")
	}
	newClient(t, ts).mustStatus(404, "POST", "/api/setup", map[string]string{"token": token, "username": "other", "email": "o@example.test", "password": "correct horse"})
	if st := anon.mustStatus(200, "GET", "/api/settings", nil); st["owner_set"] != true {
		t.Fatalf("settings after setup: %v", st)
	}
	// Onboarding: the name, which everyone then reads.
	owner.mustStatus(400, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": "  "})
	owner.mustStatus(400, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": strings.Repeat("x", 61)})
	st := owner.mustStatus(200, "PUT", "/api/settings", map[string]string{"group_creation": "anyone", "name": " Knitting Circle ", "description": "Wool and gossip."})
	if st["name"] != "Knitting Circle" || st["description"] != "Wool and gossip." || st["owner_set"] != true {
		t.Fatalf("named: %v", st)
	}
	if st := anon.mustStatus(200, "GET", "/api/settings", nil); st["name"] != "Knitting Circle" {
		t.Fatalf("signed out, the name: %v", st)
	}
	newClient(t, ts).login("r@example.test", "correct horse")
}

func rootID(c *client) string {
	for id, g := range myGroups(c) {
		if g["kind"] == "root" {
			return id
		}
	}
	return ""
}

// A scripted owner (the -owner-password path) needs no setup link.
func TestScriptedOwnerNeedsNoSetup(t *testing.T) {
	_, _, srv := newTestServerWith(t)
	if needs, err := NeedsSetup(context.Background(), srv.DB); err != nil || needs {
		t.Fatalf("needs setup with a scripted owner: %v %v", needs, err)
	}
}

// Each arrival through an invite link is a notification to the owner, and to nobody else.
func TestOwnerHearsOfEachArrival(t *testing.T) {
	ts, owner := newTestServer(t)
	_, kitID := registerMember(t, ts, owner, "kit")
	kit, _ := registerMember(t, ts, owner, "mo")
	got := owner.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any)
	if len(got) != 2 {
		t.Fatalf("owner's notifications after two joins: %v", got)
	}
	newest := got[0].(map[string]any)
	if newest["kind"] != NotifyJoined || newest["actor"].(map[string]any)["username"] != "mo" || newest["post_id"] != nil {
		t.Fatalf("joined notification: %v", newest)
	}
	if n := len(kit.mustStatus(200, "GET", "/api/notifications", nil)["notifications"].([]any)); n != 0 {
		t.Fatalf("a member hears of arrivals: %d", n)
	}
	_ = kitID
}
