package api

import (
	"net/http"
	"strconv"
	"strings"
)

// Hit is one search result (architecture.md, Search): what kind of thing,
// where it is, who said it and when, and an excerpt of its text with the
// matches marked. The excerpt is plain text; the client draws the marks.
type Hit struct {
	Kind      string  `json:"kind"`
	ID        string  `json:"id"`
	GroupID   string  `json:"group_id"`
	PostID    *string `json:"post_id"`
	Author    User    `json:"author"`
	CreatedAt int64   `json:"created_at"`
	// Excerpt is a window of the text; a match is wrapped in \x01 and \x02.
	Excerpt string `json:"excerpt"`
}

// The marks around a match in an excerpt, for the client to find.
const (
	MarkStart = "\x01"
	MarkEnd   = "\x02"
)

// ftsQuery turns what was typed into an FTS5 query that cannot be a syntax
// error: each word quoted (quotes inside doubled), all words required.
func ftsQuery(q string) string {
	var terms []string
	for _, w := range strings.Fields(q) {
		terms = append(terms, `"`+strings.ReplaceAll(w, `"`, `""`)+`"`)
	}
	return strings.Join(terms, " ")
}

// search is `GET /api/search?q=`: the posts, comments and messages whose
// text matches, from the groups the searcher is present in, best match
// first, up to fifty. The index is a virtual table sqlc does not read, so
// this one query is written by hand.
func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	q := ftsQuery(r.URL.Query().Get("q"))
	if q == "" {
		writeErr(w, http.StatusBadRequest, "say what to look for")
		return
	}
	limit := 50
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v < limit {
		limit = v
	}
	me, _ := userFrom(r.Context())
	rows, err := s.DB.QueryContext(r.Context(), `
		SELECT s.kind, s.id, s.group_id, s.post_id, s.created_at, u.id, u.username, u.picture_id,
		       snippet(search, 0, ?, ?, '…', 14)
		FROM search s
		JOIN users u ON u.id = s.author_id
		JOIN memberships m ON m.group_id = s.group_id AND m.user_id = ? AND m.hidden_at IS NULL
		JOIN groups g ON g.id = s.group_id AND g.deleted_at IS NULL
		WHERE search MATCH ?
		ORDER BY rank
		LIMIT ?`, MarkStart, MarkEnd, me.ID, q, limit)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	defer rows.Close()
	hits := make([]Hit, 0)
	for rows.Next() {
		var h Hit
		var postID, pictureID *string
		var pic string
		var created int64
		if err := rows.Scan(&h.Kind, &h.ID, &h.GroupID, &postID, &created, &h.Author.ID, &h.Author.Username, &pictureID, &h.Excerpt); err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		h.PostID = postID
		h.CreatedAt = created
		if pictureID != nil {
			pic = "/img/" + *pictureID
			h.Author.Picture = &pic
		}
		hits = append(hits, h)
	}
	if err := rows.Err(); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hits": hits})
}
