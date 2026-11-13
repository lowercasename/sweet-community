package api

import (
	"context"
	"database/sql"
	"sort"

	"sweet/internal/perm"
	"sweet/internal/store"
)

// This file holds the builders, which are the only way a resource becomes its
// wire shape. Each builder takes the store's row for that resource and nothing
// else, so a response or an event cannot be assembled by hand with a field
// missing. That is how a group once lacked its flags, a DM its members, and a
// membership its joined time. A handler writes, re-reads the row inside the
// same transaction, and passes the row to the builder. A list handler
// converts its list rows to the same row type, which the compiler checks
// field by field. Personalising for a viewer (can flags, role) is done by
// forViewer when the response is built, never here.

// nullStr converts a sql.NullString to the wire's nullable string.
func nullStr(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	s := v.String
	return &s
}

func wireUser(id, username string, pictureID sql.NullString) User {
	return User{ID: id, Username: username, Picture: pictureURL(pictureID)}
}

func wirePost(row store.GetPostRow) Post {
	return Post{
		ID:           row.ID,
		GroupID:      row.GroupID,
		TopicID:      nullStr(row.TopicID),
		Author:       wireUser(row.AuthorID, row.AuthorUsername, row.AuthorPictureID),
		BodyHTML:     row.BodyHtml,
		BodyText:     row.BodyText,
		CreatedAt:    row.CreatedAt,
		EditedAt:     nullInt(row.EditedAt),
		CommentCount: row.CommentCount,
		Reactions:    reactionsOf(row.Reactions),
	}
}

func wireComment(row store.GetCommentRow) Comment {
	return Comment{
		ID:           row.ID,
		PostID:       row.PostID,
		GroupID:      row.GroupID,
		PostAuthorID: row.PostAuthorID,
		Author:       wireUser(row.AuthorID, row.AuthorUsername, row.AuthorPictureID),
		BodyHTML:     row.BodyHtml,
		BodyText:     row.BodyText,
		CreatedAt:    row.CreatedAt,
		EditedAt:     nullInt(row.EditedAt),
		Reactions:    reactionsOf(row.Reactions),
	}
}

func wireMessage(row store.GetMessageRow) Message {
	m := Message{
		ID:        row.ID,
		GroupID:   row.GroupID,
		Author:    wireUser(row.AuthorID, row.AuthorUsername, row.AuthorPictureID),
		BodyHTML:  row.BodyHtml,
		BodyText:  row.BodyText,
		CreatedAt: row.CreatedAt,
		Kind:      row.Kind,
		Reactions: reactionsOf(row.Reactions),
	}
	if row.SubjectID.Valid {
		u := wireUser(row.SubjectID.String, row.SubjectUsername.String, row.SubjectPictureID)
		m.Subject = &u
	}
	if row.ReplyTo.Valid {
		rt := &ReplyTo{ID: row.ReplyTo.String}
		if row.ReplyDeletedAt.Valid || !row.ReplyAuthorID.Valid {
			rt.Deleted = true
		} else {
			u := wireUser(row.ReplyAuthorID.String, row.ReplyAuthorUsername.String, row.ReplyAuthorPictureID)
			rt.Author = &u
			rt.Text = excerpt(row.ReplyText.String, 200)
		}
		m.ReplyTo = rt
	}
	return m
}

// excerpt returns the first n characters of s, cut at a character boundary.
func excerpt(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n])
}

func wireNotification(row store.GetNotificationRow) Notification {
	var actor *User
	if row.Kind != NotifyReport {
		u := wireUser(row.ActorID, row.ActorUsername, row.ActorPictureID)
		actor = &u
	}
	var pid *string
	if row.PostID.Valid {
		p := row.PostID.String
		pid = &p
	}
	return Notification{
		Scope: row.Scope, ActivityCount: row.ActivityCount, Updates: row.Updates, GroupKind: row.GroupKind,
		ID:         row.ID,
		UserID:     row.UserID,
		Kind:       row.Kind,
		Actor:      actor,
		GroupID:    row.GroupID,
		PostID:     pid,
		TopicID:    nullStr(row.TopicID),
		MessageID:  nullStr(row.MessageID),
		ReportKind: nullStr(row.ReportKind),
		CreatedAt:  row.CreatedAt,
		ReadAt:     nullInt(row.ReadAt),
	}
}

func wireMarker(row store.ListMarkersRow) Marker {
	return Marker{UserID: row.UserID, Stream: row.Stream, ReadAt: row.ReadAt, Unread: row.Unread}
}

func wireProfile(row store.GetProfileByUsernameRow) Profile {
	return Profile{User: wireUser(row.ID, row.Username, row.PictureID), Role: row.Role, JoinedAt: row.JoinedAt, BioHTML: row.BioHtml}
}

func wireMembership(groupID string, row store.GetMemberRow) Membership {
	return Membership{GroupID: groupID, User: wireUser(row.ID, row.Username, row.PictureID), Role: row.Role, JoinedAt: row.JoinedAt, HiddenAt: nullInt(row.HiddenAt)}
}

// wireGroup builds a group from its row. A DM includes its members. Every
// group includes the time of its newest live message. It reads through q so
// that a group created in a transaction is complete before that transaction
// commits.
func wireGroup(ctx context.Context, q *store.Queries, row store.GetGroupRow) (Group, error) {
	g := Group{ID: row.ID, Kind: row.Kind, Name: row.Name, Mode: row.Mode, CreatedAt: row.CreatedAt, Picture: pictureURL(row.PictureID), LastMessageAt: lastAt(row.LastMessageAt)}
	if g.Kind != perm.KindDM {
		return g, nil
	}
	rows, err := q.ListMembers(ctx, g.ID)
	if err != nil {
		return g, err
	}
	g.Members = make([]User, 0, len(rows))
	for _, m := range rows {
		g.Members = append(g.Members, wireUser(m.ID, m.Username, m.PictureID))
	}
	sort.Slice(g.Members, func(i, j int) bool { return g.Members[i].Username < g.Members[j].Username })
	return g, nil
}

// lastAt converts the driver's MAX(created_at) value, which is an int64 or nil
// when there is no live message, to the wire's nullable time.
func lastAt(v any) *int64 {
	if n, ok := v.(int64); ok {
		return &n
	}
	return nil
}

// Report is one reported item with its open reports. Only the root group's owner and
// moderators receive it. BodyHTML is the copy kept by the item's first open report. Deleted says the item has been
// deleted since. Can.Open is personalised by forViewer.
type Report struct {
	Kind      string     `json:"kind"`
	ID        string     `json:"id"`
	GroupID   string     `json:"group_id"`
	GroupKind string     `json:"group_kind"`
	GroupName string     `json:"group_name"`
	PostID    *string    `json:"post_id"`
	Author    User       `json:"author"`
	BodyHTML  string     `json:"body_html"`
	Deleted   bool       `json:"deleted"`
	Reports   []ReportBy `json:"reports"`
	Can       ReportCan  `json:"can"`
}

// ReportBy is one member's report of an item.
type ReportBy struct {
	ID        string `json:"id"`
	Reason    string `json:"reason"`
	CreatedAt int64  `json:"created_at"`
}

// ReportClosed announces a resolved report. AuthorID excludes its author from delivery.
type ReportClosed struct {
	Kind     string `json:"kind"`
	ID       string `json:"id"`
	AuthorID string `json:"author_id"`
}

// ReportCan says whether the viewer can open the reported item where it is.
type ReportCan struct {
	Open bool `json:"open"`
}

// wireReports groups open report rows, which are oldest first, into one entry per item. The entries are ordered by
// their newest report, newest first.
func wireReports(rows []store.ListOpenReportsRow) []Report {
	var out []Report
	at := map[string]int{}
	for _, row := range rows {
		key := row.Kind + ":" + row.SubjectID
		i, ok := at[key]
		if !ok {
			i = len(out)
			at[key] = i
			out = append(out, Report{
				Kind: row.Kind, ID: row.SubjectID, GroupID: row.GroupID, GroupKind: row.GroupKind, GroupName: row.GroupName,
				PostID: nullStr(row.PostID), Author: wireUser(row.AuthorID, row.AuthorUsername, row.AuthorPictureID),
				BodyHTML: row.BodyHtml, Deleted: row.Deleted != 0,
			})
		}
		out[i].Reports = append(out[i].Reports, ReportBy{
			ID:        row.ID,
			Reason:    row.Reason,
			CreatedAt: row.CreatedAt,
		})
	}
	newest := func(r Report) int64 { return r.Reports[len(r.Reports)-1].CreatedAt }
	sort.SliceStable(out, func(i, j int) bool { return newest(out[i]) > newest(out[j]) })
	return out
}

// LinkPreview is a link's preview card: what the page gives in its OpenGraph tags, and the address of Sweet's copy
// of its picture, or nil. The card shows the page's domain, which the client reads from the address.
type LinkPreview struct {
	URL         string  `json:"url"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Image       *string `json:"image"`
}

func wireLinkPreview(row store.LinkPreview) LinkPreview {
	return LinkPreview{URL: row.Url, Title: row.Title, Description: row.Description, Image: pictureURL(row.ImageID)}
}

func wirePostNotificationPreference(userID string, row store.GetPostNotificationPreferenceRow) PostNotificationPreference {
	return PostNotificationPreference{UserID: userID, PostID: row.PostID, Following: row.Enabled != 0, Muted: row.Muted != 0}
}

func wireRoomNotificationPreference(userID string, row store.GetRoomNotificationPreferenceRow) RoomNotificationPreference {
	return RoomNotificationPreference{UserID: userID, GroupID: row.GroupID, Mode: row.Mode}
}

func wireMySettings(userID string, rows []store.ListUserSettingsRow) MySettings {
	st := MySettings{UserID: userID, Digest: DigestWeekly, PushComments: true, PushMentions: true, PushConversations: true}
	for _, row := range rows {
		switch row.Key {
		case "digest":
			st.Digest = row.Value
		case welcomedKey:
			st.Welcomed = true
		case "push_comments":
			st.PushComments = row.Value != "false"
		case "push_mentions":
			st.PushMentions = row.Value != "false"
		case "push_conversations":
			st.PushConversations = row.Value != "false"
		}
	}
	return st
}
