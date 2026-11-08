// Package digest is the weekly email for anyone who has not visited
// (architecture.md, Notifications): counts and metadata only, since where
// their feed reading stands, and a link. No post content, no images. It is
// what brings quiet people back.
package digest

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"sweet/internal/mail"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// Away is how long someone has to be gone before the digest writes, and how
// long it waits before writing again.
const Away = 7 * 24 * time.Hour

// Every runs the digest on an interval until ctx ends. Each run is cheap
// when nobody is due, so an hour is fine.
func Every(ctx context.Context, d *sql.DB, send mail.Sender, baseURL string, interval time.Duration, logf func(string, ...any)) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			n, err := Run(ctx, d, send, baseURL, time.Now())
			if err != nil {
				logf("digest: %v", err)
			} else if n > 0 {
				logf("digest: sent %d", n)
			}
		}
	}
}

// Run writes the digest to everyone due one at the given time and returns
// how many went. Someone is due when their address is verified, the digest
// is not off, no session of theirs has been seen for Away, none has gone to
// them for Away, and there is something to tell. Nothing to tell sends
// nothing and marks nothing, so the next run looks again.
func Run(ctx context.Context, d *sql.DB, send mail.Sender, baseURL string, now time.Time) (int, error) {
	q := store.New(d)
	ms := now.UnixMilli()
	cutoff := now.Add(-Away).UnixMilli()
	people, err := q.ListDigestCandidates(ctx, store.ListDigestCandidatesParams{Root: perm.Root, IdleBefore: cutoff, SentBefore: sql.NullInt64{Int64: cutoff, Valid: true}})
	if err != nil {
		return 0, err
	}
	if len(people) == 0 {
		return 0, nil
	}
	community, err := communityName(ctx, q)
	if err != nil {
		return 0, err
	}
	topics, err := q.ListTopics(ctx)
	if err != nil {
		return 0, err
	}
	names := map[string]string{}
	for _, t := range topics {
		names[t.ID] = t.Name
	}
	sent := 0
	for _, p := range people {
		c, ok, err := compose(ctx, q, p, community, baseURL, names)
		if err != nil {
			return sent, err
		}
		if !ok {
			continue
		}
		if err := send.Send(ctx, c.Message(p.Email, "What you missed in "+community)); err != nil {
			return sent, fmt.Errorf("to %s: %w", p.Username, err)
		}
		if err := q.SetDigestSentAt(ctx, store.SetDigestSentAtParams{SentAt: sql.NullInt64{Int64: ms, Valid: true}, ID: p.ID}); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}

func communityName(ctx context.Context, q *store.Queries) (string, error) {
	name, err := q.GetSetting(ctx, "name")
	if errors.Is(err, sql.ErrNoRows) || (err == nil && name == "") {
		return "Sweet", nil
	}
	return name, err
}

// compose is one person's digest, or ok false when there is nothing to tell.
func compose(ctx context.Context, q *store.Queries, p store.ListDigestCandidatesRow, community, baseURL string, topicNames map[string]string) (mail.Content, bool, error) {
	var c mail.Content
	posts, err := q.CountPostsSinceByTopic(ctx, store.CountPostsSinceByTopicParams{Root: perm.Root, UserID: p.ID, Since: p.Since})
	if err != nil {
		return c, false, err
	}
	replies, err := q.CountRepliesSince(ctx, store.CountRepliesSinceParams{UserID: p.ID, Since: p.Since})
	if err != nil {
		return c, false, err
	}
	joined, err := q.ListJoinedSince(ctx, store.ListJoinedSinceParams{Root: perm.Root, Since: p.Since, UserID: p.ID})
	if err != nil {
		return c, false, err
	}
	var lines []string
	if line := postsLine(posts, topicNames); line != "" {
		lines = append(lines, line)
	}
	if replies > 0 {
		lines = append(lines, plural(replies, "reply", "replies")+" to your posts.")
	}
	if len(joined) > 0 {
		lines = append(lines, joinNames(joined)+" joined.")
	}
	if len(lines) == 0 {
		return c, false, nil
	}
	c = mail.Content{
		Community: community,
		Heading:   "Since you were last at " + community,
		Lines:     lines,
		Action:    &mail.Action{Label: "Open " + community, URL: baseURL},
		Note:      "You get this when you have been away for a week. You can turn it off in Settings.",
	}
	return c, true, nil
}

// postsLine is "12 new posts: 5 in Practice, 3 in Reading, 4 without a topic." or "" for none.
func postsLine(rows []store.CountPostsSinceByTopicRow, topicNames map[string]string) string {
	var total, untopiced int64
	type part struct {
		name string
		n    int64
	}
	var parts []part
	for _, r := range rows {
		total += r.N
		if !r.TopicID.Valid {
			untopiced += r.N
			continue
		}
		name, ok := topicNames[r.TopicID.String]
		if !ok {
			untopiced += r.N
			continue
		}
		parts = append(parts, part{name, r.N})
	}
	if total == 0 {
		return ""
	}
	line := plural(total, "new post", "new posts")
	if len(parts) == 0 {
		return line + "."
	}
	sort.Slice(parts, func(i, j int) bool {
		if parts[i].n != parts[j].n {
			return parts[i].n > parts[j].n
		}
		return parts[i].name < parts[j].name
	})
	var bits []string
	for _, p := range parts {
		bits = append(bits, fmt.Sprintf("%d in %s", p.n, p.name))
	}
	if untopiced > 0 {
		bits = append(bits, fmt.Sprintf("%d without a topic", untopiced))
	}
	return line + ": " + strings.Join(bits, ", ") + "."
}

func plural(n int64, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return fmt.Sprintf("%d %s", n, many)
}

// joinNames is "mira", "mira and tomas", "mira, tomas and ade", or "mira, tomas and 3 others".
func joinNames(names []string) string {
	switch {
	case len(names) == 1:
		return names[0]
	case len(names) == 2:
		return names[0] + " and " + names[1]
	case len(names) == 3:
		return names[0] + ", " + names[1] + " and " + names[2]
	default:
		return fmt.Sprintf("%s, %s and %d others", names[0], names[1], len(names)-2)
	}
}
