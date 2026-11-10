package api

import "testing"

// A profile picture and a room picture must be an image that the person setting it uploaded. Every signed-in user can
// see a profile picture, so otherwise a member could make an image from a private room or a conversation visible to
// the whole community, or use someone else's picture as their own. Someone else's image gets the same 404 as an image
// that does not exist, so the endpoint does not reveal which ids exist.
func TestPicturesMustBeTheSettersOwnImages(t *testing.T) {
	ts, owner := newTestServer(t)
	kit, _ := registerMember(t, ts, owner, "kit")
	mo, moID := registerMember(t, ts, owner, "mo")
	_, kitImage := kit.upload(testPNG(8, 8))
	kitID := kitImage["id"].(string)
	_, moImage := mo.upload(testPNG(8, 8))
	moImageID := moImage["id"].(string)

	kit.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": kitID})
	mo.mustStatus(404, "PUT", "/api/me/picture", map[string]any{"image_id": kitID})
	mo.mustStatus(200, "PUT", "/api/me/picture", map[string]any{"image_id": moImageID})

	room := kit.mustStatus(201, "POST", "/api/groups", map[string]any{"kind": "group", "name": "Knitting", "mode": "both"})
	gp := "/api/groups/" + room["id"].(string)
	kit.mustStatus(201, "POST", gp+"/members", map[string]string{"user_id": moID})
	kit.mustStatus(404, "PUT", gp+"/picture", map[string]any{"image_id": moImageID})
	kit.mustStatus(200, "PUT", gp+"/picture", map[string]any{"image_id": kitID})
}
