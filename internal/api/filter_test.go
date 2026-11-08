package api

import (
	"encoding/json"
	"testing"

	"sweet/internal/events"
)

// A delete event for a post, comment or message reaches only the members of
// its group (architecture.md, Realtime). Before 2026-11-08 it reached every
// user, which showed when people were active in rooms and conversations the
// viewer is not in.
func TestDeleteEventsReachOnlyTheGroupsMembers(t *testing.T) {
	viewer := User{ID: "viewer"}
	roles := map[string]string{"mine": "member"}
	st := Settings{}
	for _, kind := range []string{"post_delete", "comment_delete", "message_delete"} {
		for group, want := range map[string]bool{"mine": true, "elsewhere": false} {
			raw, _ := json.Marshal(map[string]string{"id": "x", "post_id": "p", "group_id": group})
			if _, sent := filterEvent(viewer, roles, &st, events.Event{Seq: 1, Kind: kind, Payload: raw}); sent != want {
				t.Errorf("%s in %s: sent %v, want %v", kind, group, sent, want)
			}
		}
	}
}
