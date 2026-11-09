package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"

	"sweet/internal/db"
	"sweet/internal/events"
	"sweet/internal/perm"
	"sweet/internal/store"
)

// The kinds of item a member can report.
const (
	ReportPost    = "post"
	ReportComment = "comment"
	ReportMessage = "message"
)

// Outcomes of closing the reports of an item.
const (
	outcomeDeleted   = "deleted"
	outcomeDismissed = "dismissed"
)

// maxReasonRunes is the longest reason a reporter can give.
const maxReasonRunes = 500

func reportKind(kind string) bool {
	return kind == ReportPost || kind == ReportComment || kind == ReportMessage
}

// reported is what a report needs from a live item: its group, its post for a post or a comment, its author and its
// body. It returns sql.ErrNoRows for an item that is deleted, is in a deleted group, or is a joined or added line.
type reported struct {
	GroupID  string
	PostID   sql.NullString
	AuthorID string
	BodyHTML string
}

func reportedItem(ctx context.Context, qtx *store.Queries, kind, id string) (reported, error) {
	switch kind {
	case ReportPost:
		o, err := qtx.GetPostOwners(ctx, id)
		if err != nil {
			return reported{}, err
		}
		row, err := qtx.GetPost(ctx, id)
		return reported{GroupID: o.GroupID, PostID: sql.NullString{String: id, Valid: true}, AuthorID: o.AuthorID, BodyHTML: row.BodyHtml}, err
	case ReportComment:
		o, err := qtx.GetCommentOwners(ctx, id)
		if err != nil {
			return reported{}, err
		}
		row, err := qtx.GetComment(ctx, id)
		return reported{GroupID: o.GroupID, PostID: sql.NullString{String: o.PostID, Valid: true}, AuthorID: o.AuthorID, BodyHTML: row.BodyHtml}, err
	default:
		o, err := qtx.GetMessageOwners(ctx, id)
		if err != nil {
			return reported{}, err
		}
		if o.Kind != MessageKind {
			return reported{}, sql.ErrNoRows
		}
		row, err := qtx.GetMessage(ctx, id)
		return reported{GroupID: o.GroupID, AuthorID: o.AuthorID, BodyHTML: row.BodyHtml}, err
	}
}

// createReport is `POST /api/reports {kind, id, reason}`. Any member who can see the item, except its author, reports
// it. The report keeps a copy of the body. The owner and each moderator except the reporter get a report
// notification, and the owner and moderators get a report event. A second report of the same item by the same user
// changes nothing. The response is 204 in both cases, so the reporter sees the same result.
func (s *Server) createReport(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Kind   string `json:"kind"`
		ID     string `json:"id"`
		Reason string `json:"reason"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, 8192)
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || !reportKind(in.Kind) {
		writeErr(w, http.StatusBadRequest, "Bad request")
		return
	}
	reason := strings.TrimSpace(in.Reason)
	if utf8.RuneCountInString(reason) > maxReasonRunes {
		writeErr(w, http.StatusBadRequest, "The reason can be at most 500 characters")
		return
	}
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		ctx := r.Context()
		item, err := reportedItem(ctx, qtx, in.Kind, in.ID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil, http.StatusNotFound, errors.New("No such " + in.Kind)
		}
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		a, err := actorIn(ctx, qtx, me, item.GroupID)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if !perm.CanSee(a) {
			return nil, nil, http.StatusNotFound, errors.New("No such " + in.Kind)
		}
		if !perm.Report(a, item.AuthorID) {
			return nil, nil, http.StatusForbidden, errors.New("You cannot report your own " + in.Kind)
		}
		id, err := uuid.NewV7()
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		n, err := qtx.CreateReport(ctx, store.CreateReportParams{
			ID: id.String(), ReporterID: me.ID, Kind: in.Kind, SubjectID: in.ID, GroupID: item.GroupID, PostID: item.PostID,
			AuthorID: item.AuthorID, BodyHtml: item.BodyHTML, Reason: reason, CreatedAt: now,
		})
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		if n == 0 {
			return nil, nil, http.StatusNoContent, nil
		}
		entries, err := notifyReport(r, qtx, id.String(), me.ID, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		entry, err := reportOf(ctx, qtx, in.Kind, in.ID)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return append(entries, events.Entry{Kind: "report", Payload: entry}), nil, http.StatusNoContent, nil
	})
}

// notifyReport writes a report notification for the owner and each moderator except the reporter.
func notifyReport(r *http.Request, qtx *store.Queries, reportID, reporter string, now int64) ([]events.Entry, error) {
	members, err := qtx.ListMembers(r.Context(), perm.Root)
	if err != nil {
		return nil, err
	}
	var told []events.Entry
	for _, m := range members {
		if !perm.HandleReports(perm.Actor{ID: m.ID, Role: m.Role}) {
			continue
		}
		e, err := insertNotification(r, qtx, store.CreateNotificationParams{
			UserID: m.ID, Kind: NotifyReport, ActorID: reporter, GroupID: perm.Root,
			ReportID: sql.NullString{String: reportID, Valid: true}, CreatedAt: now,
		})
		if err != nil {
			return nil, err
		}
		if e != nil {
			told = append(told, *e)
		}
	}
	return told, nil
}

// reportOf returns the entry for one item with open reports.
func reportOf(ctx context.Context, qtx *store.Queries, kind, id string) (*Report, error) {
	rows, err := qtx.ListOpenReports(ctx, store.ListOpenReportsParams{Kind: sql.NullString{String: kind, Valid: true}, SubjectID: id})
	if err != nil {
		return nil, err
	}
	list := wireReports(rows)
	if len(list) == 0 {
		return nil, sql.ErrNoRows
	}
	return &list[0], nil
}

// listReports is `GET /api/reports`, for the owner and moderators. It returns one entry per item with open reports,
// the item with the newest report first.
func (s *Server) listReports(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	me, _ := userFrom(ctx)
	q := s.q()
	rows, err := q.ListOpenReports(ctx, store.ListOpenReportsParams{})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	list := wireReports(rows)
	out := make([]any, 0, len(list))
	for i := range list {
		a, err := actorIn(ctx, q, me, list[i].GroupID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		out = append(out, forViewer(a, &list[i], Settings{}))
	}
	writeJSON(w, http.StatusOK, map[string]any{"reports": out})
}

// closeReport is `POST /api/reports/{kind}/{id}/dismiss` or `.../delete`, for the owner and moderators. Both close
// every open report of the item. Delete also deletes the item, in whatever group it is in. An item that has been
// deleted since it was reported is closed as deleted.
func (s *Server) closeReport(w http.ResponseWriter, r *http.Request) {
	kind, id, action := r.PathValue("kind"), r.PathValue("id"), r.PathValue("action")
	if !reportKind(kind) || (action != "dismiss" && action != "delete") {
		writeErr(w, http.StatusNotFound, "No such report")
		return
	}
	me, _ := userFrom(r.Context())
	now := db.Now()
	s.loggedMany(w, r, now, func(qtx *store.Queries) ([]events.Entry, any, int, error) {
		ctx := r.Context()
		if _, err := reportOf(ctx, qtx, kind, id); errors.Is(err, sql.ErrNoRows) {
			return nil, nil, http.StatusNotFound, errors.New("No such report")
		} else if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		var entries []events.Entry
		outcome := outcomeDismissed
		if action == "delete" {
			outcome = outcomeDeleted
			gone, err := removeReported(ctx, qtx, kind, id, now)
			if err != nil {
				return nil, nil, http.StatusInternalServerError, err
			}
			entries = gone
		}
		closed, err := closeReports(ctx, qtx, kind, id, me.ID, outcome, now)
		if err != nil {
			return nil, nil, http.StatusInternalServerError, err
		}
		return append(entries, closed...), nil, http.StatusNoContent, nil
	})
}

// removeReported deletes a reported item if it is still live, and returns its delete events.
func removeReported(ctx context.Context, qtx *store.Queries, kind, id string, now int64) ([]events.Entry, error) {
	switch kind {
	case ReportPost:
		o, err := qtx.GetPostOwners(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		} else if err != nil {
			return nil, err
		}
		return removePost(ctx, qtx, id, o.GroupID, now)
	case ReportComment:
		o, err := qtx.GetCommentOwners(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		} else if err != nil {
			return nil, err
		}
		return removeComment(ctx, qtx, id, o.PostID, o.GroupID, now)
	default:
		o, err := qtx.GetMessageOwners(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		} else if err != nil {
			return nil, err
		}
		return removeMessage(ctx, qtx, id, o.GroupID, now)
	}
}

// ReportClosed is the payload of a report_delete event. The item no longer has open reports.
type ReportClosed struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

// closeReports closes the open reports of one item. It marks their unread notifications read, and returns those
// notification events, each recipient's new unread count, and a report_delete event.
func closeReports(ctx context.Context, qtx *store.Queries, kind, id, by, outcome string, now int64) ([]events.Entry, error) {
	unread, err := qtx.ListUnreadReportNotifications(ctx, store.ListUnreadReportNotificationsParams{Kind: kind, SubjectID: id})
	if err != nil {
		return nil, err
	}
	if _, err := qtx.CloseReports(ctx, store.CloseReportsParams{
		ClosedAt: sql.NullInt64{Int64: now, Valid: true}, ClosedBy: sql.NullString{String: by, Valid: true},
		Outcome: sql.NullString{String: outcome, Valid: true}, Kind: kind, SubjectID: id,
	}); err != nil {
		return nil, err
	}
	var out []events.Entry
	var users []string
	seen := map[string]bool{}
	for _, n := range unread {
		if err := qtx.ReadNotification(ctx, store.ReadNotificationParams{ReadAt: sql.NullInt64{Int64: now, Valid: true}, ID: n.ID, UserID: n.UserID}); err != nil {
			return nil, err
		}
		row, err := qtx.GetNotification(ctx, n.ID)
		if err != nil {
			return nil, err
		}
		out = append(out, events.Entry{Kind: "notification", Payload: wireNotification(row)})
		if !seen[n.UserID] {
			seen[n.UserID] = true
			users = append(users, n.UserID)
		}
	}
	// A client that has not loaded the notifications list cannot derive the unread count from the rows alone.
	for _, uid := range users {
		bell, err := qtx.GetNotificationsMarker(ctx, uid)
		if err != nil {
			return nil, err
		}
		b := wireMarker(store.ListMarkersRow(bell))
		out = append(out, events.Entry{Kind: "marker", Payload: &b})
	}
	return append(out, events.Entry{Kind: "report_delete", Payload: ReportClosed{Kind: kind, ID: id}}), nil
}

// closeReportsAbout closes the open reports of a removed user's content and clears the copies that reports kept of
// it (Raphael, 2026-11-08: a removed user's content goes).
func closeReportsAbout(ctx context.Context, qtx *store.Queries, author, by string, now int64) ([]events.Entry, error) {
	items, err := qtx.ListOpenReportItemsByAuthor(ctx, author)
	if err != nil {
		return nil, err
	}
	var out []events.Entry
	for _, it := range items {
		closed, err := closeReports(ctx, qtx, it.Kind, it.SubjectID, by, outcomeDeleted, now)
		if err != nil {
			return nil, err
		}
		out = append(out, closed...)
	}
	return out, qtx.ClearReportCopiesByAuthor(ctx, author)
}
