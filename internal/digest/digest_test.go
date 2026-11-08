package digest

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/mail"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// A sender that keeps what it was given.
type memo struct{ sent []mail.Message }

func (m *memo) Send(_ context.Context, msg mail.Message) error {
	m.sent = append(m.sent, msg)
	return nil
}

type fixture struct {
	t   *testing.T
	ctx context.Context
	d   *sql.DB
	q   *store.Queries
	now time.Time
}

func open(t *testing.T) *fixture {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "digest.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	ctx := context.Background()
	if err := db.Migrate(ctx, d, os.DirFS("../../migrations")); err != nil {
		t.Fatal(err)
	}
	q := store.New(d)
	if err := q.SetSetting(ctx, store.SetSettingParams{Key: "name", Value: "Thursday Group"}); err != nil {
		t.Fatal(err)
	}
	return &fixture{t: t, ctx: ctx, d: d, q: q, now: time.Date(2026, 11, 8, 9, 0, 0, 0, time.UTC)}
}

func (f *fixture) ms(d time.Duration) int64 { return f.now.Add(d).UnixMilli() }

// person makes a verified member who joined and was last seen at the given times ago.
func (f *fixture) person(name string, joinedAgo, seenAgo time.Duration, verified bool) string {
	f.t.Helper()
	id := uuid.NewString()
	if err := f.q.CreateUserWithEmail(f.ctx, store.CreateUserWithEmailParams{ID: id, Username: name, PasswordHash: sql.NullString{String: "x", Valid: true}, Email: sql.NullString{String: name + "@example.test", Valid: true}, CreatedAt: f.ms(-joinedAgo)}); err != nil {
		f.t.Fatal(err)
	}
	if verified {
		if err := f.q.SetUserEmailVerified(f.ctx, store.SetUserEmailVerifiedParams{Email: sql.NullString{String: name + "@example.test", Valid: true}, VerifiedAt: sql.NullInt64{Int64: f.ms(-joinedAgo), Valid: true}, ID: id}); err != nil {
			f.t.Fatal(err)
		}
	}
	if err := f.q.CreateMembership(f.ctx, store.CreateMembershipParams{GroupID: perm.Root, UserID: id, Role: perm.Member, JoinedAt: f.ms(-joinedAgo)}); err != nil {
		f.t.Fatal(err)
	}
	if err := f.q.CreateSession(f.ctx, store.CreateSessionParams{ID: uuid.NewString(), UserID: id, CreatedAt: f.ms(-joinedAgo), LastSeenAt: f.ms(-seenAgo), ExpiresAt: f.ms(180 * 24 * time.Hour)}); err != nil {
		f.t.Fatal(err)
	}
	return id
}

func (f *fixture) post(author string, ago time.Duration, topic string) string {
	f.t.Helper()
	id := uuid.NewString()
	tid := sql.NullString{}
	if topic != "" {
		tid = sql.NullString{String: topic, Valid: true}
	}
	if err := f.q.CreatePost(f.ctx, store.CreatePostParams{ID: id, GroupID: perm.Root, AuthorID: author, TopicID: tid, BodyHtml: "<p>x</p>", BodyText: "x", CreatedAt: f.ms(-ago)}); err != nil {
		f.t.Fatal(err)
	}
	return id
}

func (f *fixture) topic(name string) string {
	f.t.Helper()
	id := uuid.NewString()
	if err := f.q.CreateTopic(f.ctx, store.CreateTopicParams{ID: id, Name: name, CreatedAt: f.ms(-30 * 24 * time.Hour)}); err != nil {
		f.t.Fatal(err)
	}
	return id
}

func TestDigestGoesToTheAwayWithSomethingToTell(t *testing.T) {
	f := open(t)
	day := 24 * time.Hour
	practice := f.topic("Practice")
	kit := f.person("kit", 30*day, 8*day, true)  // away for eight days
	mo := f.person("mo", 30*day, 1*day, true)    // here yesterday
	jo := f.person("jo", 30*day, 9*day, false)   // never verified
	ade := f.person("ade", 30*day, 10*day, true) // away, but turned it off
	if err := f.q.SetUserSetting(f.ctx, store.SetUserSettingParams{UserID: ade, Key: "digest", Value: "off"}); err != nil {
		t.Fatal(err)
	}
	// Kit read the feed nine days ago. Since then: two posts by mo (one in Practice), one by kit (not counted),
	// a reply by mo on kit's post, and sam joined.
	if err := f.q.SetMarker(f.ctx, store.SetMarkerParams{UserID: kit, Stream: "feed:" + perm.Root, ReadAt: f.ms(-9 * day)}); err != nil {
		t.Fatal(err)
	}
	f.post(mo, 5*day, practice)
	f.post(mo, 4*day, "")
	mine := f.post(kit, 20*day, "")
	if err := f.q.CreateComment(f.ctx, store.CreateCommentParams{ID: uuid.NewString(), PostID: mine, AuthorID: mo, BodyHtml: "<p>r</p>", BodyText: "r", CreatedAt: f.ms(-3 * day)}); err != nil {
		t.Fatal(err)
	}
	f.person("sam", 2*day, 2*day, true)
	_ = jo
	// Two conversations with words kit has not read, and one kit has: two count. A room's chat does not.
	talk := f.conversation(mo, kit)
	f.message(talk, mo, 4*day)
	f.message(talk, mo, 3*day)
	f.message(f.conversation(ade, kit), ade, 2*day)
	seen := f.conversation(jo, kit)
	f.message(seen, jo, 6*day)
	if err := f.q.SetMarker(f.ctx, store.SetMarkerParams{UserID: kit, Stream: "chat:" + seen, ReadAt: f.ms(-5 * day)}); err != nil {
		t.Fatal(err)
	}
	f.message(perm.Root, mo, 2*day)

	out := &memo{}
	n, err := Run(f.ctx, f.d, out, "https://sweet.test", f.now)
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 || len(out.sent) != 1 {
		t.Fatalf("sent %d: %+v", n, out.sent)
	}
	m := out.sent[0]
	if m.To != "kit@example.test" || m.Subject != "What you missed in Thursday Group" {
		t.Fatalf("to %s subject %q", m.To, m.Subject)
	}
	for _, want := range []string{
		"Since you were last at Thursday Group",
		"2 new posts: 1 in Practice, 1 without a topic.",
		"1 reply to your posts.",
		"sam joined.",
		"2 conversations with new messages.",
		"Open Thursday Group:\nhttps://sweet.test",
		"turn it off in Settings",
	} {
		if !strings.Contains(m.Text, want) {
			t.Errorf("digest lacks %q:\n%s", want, m.Text)
		}
	}
	if strings.Contains(m.Text, "<p>") || strings.Contains(m.Text, "x\n") {
		t.Error("the digest carries counts, never content")
	}
	if m.HTML == "" {
		t.Error("the digest is the same message in HTML too")
	}
	// A second run the same week sends nothing more.
	if n, _ := Run(f.ctx, f.d, out, "https://sweet.test", f.now.Add(time.Hour)); n != 0 || len(out.sent) != 1 {
		t.Fatalf("sent again: %d", n)
	}
	// A week later: kit, still away, has nothing new since the last digest and hears nothing. Mo, away nine
	// days by now, hears of what happened since they read the feed.
	if n, _ := Run(f.ctx, f.d, out, "https://sweet.test", f.now.Add(8*day)); n != 1 || out.sent[len(out.sent)-1].To != "mo@example.test" {
		t.Fatalf("second week: sent %d, last to %s", n, out.sent[len(out.sent)-1].To)
	}
	// Something new after that: kit hears again, and so does sam, who joined and then stayed away.
	f.post(mo, -(8*day + time.Hour), "")
	n, _ = Run(f.ctx, f.d, out, "https://sweet.test", f.now.Add(8*day+2*time.Hour))
	var to []string
	for _, m := range out.sent[len(out.sent)-n:] {
		to = append(to, m.To)
	}
	if n != 2 || strings.Join(to, " ") != "kit@example.test sam@example.test" {
		t.Fatalf("week two: sent %d to %v", n, to)
	}
}

func TestWordsForNumbersAndNames(t *testing.T) {
	names := map[string]string{"t1": "Practice", "t2": "Reading"}
	rows := []store.CountPostsSinceByTopicRow{
		{TopicID: sql.NullString{}, N: 4},
		{TopicID: sql.NullString{String: "t1", Valid: true}, N: 5},
		{TopicID: sql.NullString{String: "t2", Valid: true}, N: 3},
	}
	if got := postsLine(rows, names); got != "12 new posts: 5 in Practice, 3 in Reading, 4 without a topic." {
		t.Errorf("posts line: %q", got)
	}
	if got := postsLine([]store.CountPostsSinceByTopicRow{{N: 1}}, names); got != "1 new post." {
		t.Errorf("one post: %q", got)
	}
	if got := postsLine(nil, names); got != "" {
		t.Errorf("no posts: %q", got)
	}
	for _, c := range []struct {
		in   []string
		want string
	}{
		{[]string{"mira"}, "mira"},
		{[]string{"mira", "tomas"}, "mira and tomas"},
		{[]string{"mira", "tomas", "ade"}, "mira, tomas and ade"},
		{[]string{"mira", "tomas", "ade", "sam", "jo"}, "mira, tomas and 3 others"},
	} {
		if got := joinNames(c.in); got != c.want {
			t.Errorf("joinNames(%v) = %q", c.in, got)
		}
	}
}

// conversation is the two people's conversation, as the API makes it.
func (f *fixture) conversation(a, b string) string {
	f.t.Helper()
	id := uuid.NewString()
	at := f.ms(-20 * 24 * time.Hour)
	if err := f.q.CreateGroup(f.ctx, store.CreateGroupParams{ID: id, Kind: perm.KindDM, Name: "", Mode: perm.ModeChat, CreatedAt: at, PeopleKey: sql.NullString{String: a + ":" + b, Valid: true}}); err != nil {
		f.t.Fatal(err)
	}
	for _, uid := range []string{a, b} {
		if err := f.q.CreateMembership(f.ctx, store.CreateMembershipParams{GroupID: id, UserID: uid, Role: perm.Member, JoinedAt: at}); err != nil {
			f.t.Fatal(err)
		}
	}
	return id
}

func (f *fixture) message(group, author string, ago time.Duration) {
	f.t.Helper()
	if err := f.q.CreateMessage(f.ctx, store.CreateMessageParams{ID: uuid.NewString(), GroupID: group, AuthorID: author, BodyHtml: "<p>m</p>", BodyText: "m", CreatedAt: f.ms(-ago)}); err != nil {
		f.t.Fatal(err)
	}
}
