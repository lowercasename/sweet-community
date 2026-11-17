package api

import (
	"strings"
	"testing"
)

func TestRoomDescriptions(t *testing.T) {
	ts, owner := newTestServer(t)
	writer, _ := registerMember(t, ts, owner, "writer")
	reader, _ := registerMember(t, ts, owner, "reader")
	description := "Discuss <plants> & gardens."
	room := writer.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Garden", "visibility": "open", "description": "  " + description + "  "})
	gid := room["id"].(string)
	path := "/api/groups/" + gid
	if room["description"] != description {
		t.Fatalf("description: %v", room["description"])
	}
	if myGroups(reader)[gid]["description"] != description {
		t.Fatal("room list lost description")
	}
	reader.mustStatus(403, "PUT", path, map[string]string{"description": "Changed"})
	owner.mustStatus(403, "PUT", path, map[string]string{"description": "Changed"})
	writer.mustStatus(200, "PUT", path, map[string]string{"name": "Gardening"})
	if writer.mustStatus(200, "GET", path, nil)["description"] != description {
		t.Fatal("renaming erased description")
	}
	long := strings.Repeat("é", 140)
	writer.mustStatus(200, "PUT", path, map[string]string{"description": long})
	writer.mustStatus(400, "PUT", path, map[string]string{"description": long + "é"})
	writer.mustStatus(400, "POST", "/api/groups", map[string]string{"name": "Too long", "description": long + "é"})
	if writer.mustStatus(200, "GET", path, nil)["description"] != long {
		t.Fatal("invalid edit changed description")
	}
	writer.mustStatus(200, "PUT", path, map[string]string{"description": ""})
	if writer.mustStatus(200, "GET", path, nil)["description"] != "" {
		t.Fatal("description could not be cleared")
	}
	private := writer.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Private", "visibility": "private", "description": "Private plans"})
	privateID := private["id"].(string)
	reader.mustStatus(404, "GET", "/api/groups/"+privateID, nil)
	if myGroups(reader)[privateID] != nil {
		t.Fatal("private description leaked through room list")
	}
	for _, e := range reader.readEvents(100) {
		if e["kind"] == "group" && e["payload"].(map[string]any)["id"] == privateID {
			t.Fatal("private description leaked through events")
		}
	}
	noDescription := writer.mustStatus(201, "POST", "/api/groups", map[string]string{"name": "Empty"})
	if noDescription["description"] != "" {
		t.Fatal("new rooms must default to an empty description")
	}
}
