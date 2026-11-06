package api

import (
	"database/sql"
	"errors"
	"net/http"

	"sweet/internal/events"
	"sweet/internal/sanitize"
	"sweet/internal/store"
)

// NotifyMention is a notification's kind for being mentioned.
const NotifyMention = "mention"

// mentionEvents writes a mention notification for each person a body
// mentions who is in the group and is not the author (nor already told of
// this write another way: `skip`), and returns their events
// (architecture.md, Posts: extraction; Notifications). A mention of someone
// outside the group is just text: they could not see it anyway.
func mentionEvents(r *http.Request, qtx *store.Queries, body, author, groupID string, postID *string, now int64, skip string) ([]events.Entry, error) {
	var out []events.Entry
	for _, uid := range sanitize.Mentions(body) {
		if uid == author || uid == skip {
			continue
		}
		if _, err := qtx.GetMembership(r.Context(), store.GetMembershipParams{GroupID: groupID, UserID: uid}); errors.Is(err, sql.ErrNoRows) {
			continue
		} else if err != nil {
			return nil, err
		}
		told, err := notify(r, qtx, NotifyMention, uid, author, groupID, postID, now)
		if err != nil {
			return nil, err
		}
		if told != nil {
			out = append(out, *told)
		}
	}
	return out, nil
}
