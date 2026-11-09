package api

import (
	"database/sql"
	"errors"
	"net/http"

	"sweet/internal/events"
	"sweet/internal/sanitize"
	"sweet/internal/store"
)

// NotifyMention is the notification kind for a mention.
const NotifyMention = "mention"

// mentionEvents writes a mention notification for each user the body
// mentions who is a member of the group, is not the author, and is not
// `skip`, which is a user already notified of this write another way. It
// returns the notification events. A mention of a user outside the group is left as text,
// because that user could not see the body anyway.
func mentionEvents(r *http.Request, qtx *store.Queries, body, author, groupID string, postID, messageID *string, now int64, skip string) ([]events.Entry, error) {
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
		told, err := notifyAbout(r, qtx, NotifyMention, uid, author, groupID, postID, nil, messageID, now)
		if err != nil {
			return nil, err
		}
		if told != nil {
			out = append(out, *told)
		}
	}
	return out, nil
}
