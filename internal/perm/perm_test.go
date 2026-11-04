package perm

import "testing"

// One row per (who, what) pair; the frontend mirror has the same table.
func TestRules(t *testing.T) {
	owner := Actor{ID: "owner", Role: Owner}
	mod := Actor{ID: "mod", Role: Moderator}
	kit := Actor{ID: "kit", Role: Member}
	mo := Actor{ID: "mo", Role: Member}
	jo := Actor{ID: "jo", Role: Member}

	kitsPost := Post{AuthorID: "kit"}
	mosComment := Comment{AuthorID: "mo", PostAuthorID: "kit"} // mo commenting on kit's post

	cases := []struct {
		name string
		got  bool
		want bool
	}{
		{"author edits own post", EditPost(kit, kitsPost), true},
		{"member edits another's post", EditPost(mo, kitsPost), false},
		{"owner edits another's post", EditPost(owner, kitsPost), false},
		{"moderator edits another's post", EditPost(mod, kitsPost), false},

		{"author deletes own post", DeletePost(kit, kitsPost), true},
		{"member deletes another's post", DeletePost(mo, kitsPost), false},
		{"owner deletes any post", DeletePost(owner, kitsPost), true},
		{"moderator deletes any post", DeletePost(mod, kitsPost), true},

		{"author edits own comment", EditComment(mo, mosComment), true},
		{"post author edits a comment on their post", EditComment(kit, mosComment), false},
		{"owner edits a comment", EditComment(owner, mosComment), false},

		{"author deletes own comment", DeleteComment(mo, mosComment), true},
		{"post author deletes a comment on their post", DeleteComment(kit, mosComment), true},
		{"bystander deletes a comment", DeleteComment(jo, mosComment), false},
		{"owner deletes any comment", DeleteComment(owner, mosComment), true},
		{"moderator deletes any comment", DeleteComment(mod, mosComment), true},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, c.got, c.want)
		}
	}
}
