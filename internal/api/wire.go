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
	}
}

func wireMessage(row store.GetMessageRow) Message {
	return Message{
		ID:        row.ID,
		GroupID:   row.GroupID,
		Author:    wireUser(row.AuthorID, row.AuthorUsername, row.AuthorPictureID),
		BodyHTML:  row.BodyHtml,
		BodyText:  row.BodyText,
		CreatedAt: row.CreatedAt,
	}
}

func wireNotification(row store.GetNotificationRow) Notification {
	var pid *string
	if row.PostID.Valid {
		p := row.PostID.String
		pid = &p
	}
	return Notification{
		ID:        row.ID,
		UserID:    row.UserID,
		Kind:      row.Kind,
		Actor:     wireUser(row.ActorID, row.ActorUsername, row.ActorPictureID),
		GroupID:   row.GroupID,
		PostID:    pid,
		TopicID:   nullStr(row.TopicID),
		CreatedAt: row.CreatedAt,
		ReadAt:    nullInt(row.ReadAt),
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
