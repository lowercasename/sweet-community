package perm

import "testing"

// One row per (who, what) pair. Every actor's role is their role in the
// group the thing is in; "outsider" is not a member of it at all.
func TestRules(t *testing.T) {
	owner := Actor{ID: "owner", Role: Owner}
	mod := Actor{ID: "mod", Role: Moderator}
	kit := Actor{ID: "kit", Role: Member}
	mo := Actor{ID: "mo", Role: Member}
	jo := Actor{ID: "jo", Role: Member}
	outsider := Actor{ID: "out"}

	kitsPost := Post{AuthorID: "kit"}
	mosComment := Comment{AuthorID: "mo", PostAuthorID: "kit"} // mo commenting on kit's post
	mosMessage := Message{AuthorID: "mo"}
	root := Group{Kind: KindRoot}
	club := Group{Kind: KindGroup}

	cases := []struct {
		name string
		got  bool
		want bool
	}{
		{"member sees", CanSee(kit), true},
		{"outsider sees nothing", CanSee(outsider), false},
		{"outsider writes nothing", Write(outsider), false},
		{"member writes", Write(kit), true},

		{"author edits own post", EditPost(kit, kitsPost), true},
		{"member edits another's post", EditPost(mo, kitsPost), false},
		{"owner edits another's post", EditPost(owner, kitsPost), false},
		{"moderator edits another's post", EditPost(mod, kitsPost), false},
		{"outsider edits a post of theirs elsewhere", EditPost(Actor{ID: "kit"}, kitsPost), false},

		{"author deletes own post", DeletePost(kit, kitsPost), true},
		{"member deletes another's post", DeletePost(mo, kitsPost), false},
		{"owner deletes any post", DeletePost(owner, kitsPost), true},
		{"moderator deletes any post", DeletePost(mod, kitsPost), true},
		{"outsider deletes nothing", DeletePost(outsider, kitsPost), false},

		{"author edits own comment", EditComment(mo, mosComment), true},
		{"post author edits a comment on their post", EditComment(kit, mosComment), false},
		{"owner edits a comment", EditComment(owner, mosComment), false},

		{"author deletes own comment", DeleteComment(mo, mosComment), true},
		{"post author deletes a comment on their post", DeleteComment(kit, mosComment), true},
		{"bystander deletes a comment", DeleteComment(jo, mosComment), false},
		{"owner deletes any comment", DeleteComment(owner, mosComment), true},
		{"moderator deletes any comment", DeleteComment(mod, mosComment), true},

		{"author deletes own message", DeleteMessage(mo, mosMessage), true},
		{"member deletes another's message", DeleteMessage(jo, mosMessage), false},
		{"owner deletes any message", DeleteMessage(owner, mosMessage), true},
		{"moderator deletes any message", DeleteMessage(mod, mosMessage), true},

		{"root member creates a group", CreateGroup(kit), true},
		{"non-member creates nothing", CreateGroup(outsider), false},

		{"owner adds members", AddMembers(owner), true},
		{"moderator adds members", AddMembers(mod), true},
		{"member adds members", AddMembers(kit), false},
		{"moderator removes members", RemoveMembers(mod), true},
		{"member removes members", RemoveMembers(kit), false},

		{"owner makes a member moderator", SetRole(owner, kit, Moderator), true},
		{"owner makes a moderator member", SetRole(owner, mod, Member), true},
		{"owner makes someone owner", SetRole(owner, kit, Owner), false},
		{"owner changes own role", SetRole(owner, owner, Member), false},
		{"moderator sets a role", SetRole(mod, kit, Moderator), false},

		{"owner renames a group", Rename(owner, club), true},
		{"moderator renames a group", Rename(mod, club), false},
		{"owner renames the root", Rename(owner, root), false},
		{"owner deletes a group", DeleteGroup(owner, club), true},
		{"owner deletes the root", DeleteGroup(owner, root), false},

		{"member leaves a group", Leave(kit, club), true},
		{"moderator leaves a group", Leave(mod, club), true},
		{"owner leaves a group", Leave(owner, club), false},
		{"member leaves the root", Leave(kit, root), false},
	}
	for _, c := range cases {
		if c.got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, c.got, c.want)
		}
	}
}
