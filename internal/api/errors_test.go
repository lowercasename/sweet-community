package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// A 500 response sends a fixed sentence, and the internal error is only
// logged. Before 2026-11-08 the
// response carried the error text, such as a SQLite or S3 message.
func TestServerErrorsSendAFixedSentence(t *testing.T) {
	for _, c := range []struct {
		status int
		msg    string
		want   string
	}{
		{http.StatusInternalServerError, "sql: database table is locked: users", ServerErrorMessage},
		{http.StatusNotFound, "No such post", "No such post"},
		{http.StatusNotImplemented, "Image storage is not configured", "Image storage is not configured"},
	} {
		rec := httptest.NewRecorder()
		writeErr(rec, c.status, c.msg)
		var body map[string]string
		json.Unmarshal(rec.Body.Bytes(), &body)
		if rec.Code != c.status || body["error"] != c.want {
			t.Errorf("writeErr(%d, %q): %d %q", c.status, c.msg, rec.Code, body["error"])
		}
	}
}
