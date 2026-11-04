// Package perm answers "may this person do that to this thing". Every write
// handler asks here and nowhere else, so the rules live in one table-tested
// place. The frontend mirrors it (web/src/perm.ts) to show the right
// controls; the server's answer is the one that counts. CanSee, the read
// side described in architecture.md, belongs here too when visibility
// rules arrive.
package perm

const (
	Owner     = "owner"
	Moderator = "moderator"
	Member    = "member"
)

// Actor is whoever is asking: a signed-in user.
type Actor struct {
	ID   string
	Role string
}

func (a Actor) staff() bool { return a.Role == Owner || a.Role == Moderator }

// Post is what the rules need to know about a post.
type Post struct{ AuthorID string }

// Comment is what the rules need to know about a comment: whose it is, and whose post it is on.
type Comment struct{ AuthorID, PostAuthorID string }

// EditPost: the author, nobody else. Staff delete rather than rewrite.
func EditPost(a Actor, p Post) bool { return a.ID == p.AuthorID }

// DeletePost: the author, or staff.
func DeletePost(a Actor, p Post) bool { return a.ID == p.AuthorID || a.staff() }

// EditComment: the author, nobody else.
func EditComment(a Actor, c Comment) bool { return a.ID == c.AuthorID }

// DeleteComment: the author; the post's author, for anything on their post; or staff.
func DeleteComment(a Actor, c Comment) bool {
	return a.ID == c.AuthorID || a.ID == c.PostAuthorID || a.staff()
}

// Message is what the rules need to know about a chat message.
type Message struct{ AuthorID string }

// DeleteMessage: the author, or staff. Nobody edits a sent message.
func DeleteMessage(a Actor, m Message) bool { return a.ID == m.AuthorID || a.staff() }

// Invite: staff create and revoke invite links.
func Invite(a Actor) bool { return a.staff() }

// ManageRoles: the owner alone assigns roles.
func ManageRoles(a Actor) bool { return a.Role == Owner }

// SetRole: the owner makes anyone else a member or a moderator. The owner's
// own role never changes this way (transfer is a separate action, later).
func SetRole(a, target Actor, role string) bool {
	if !ManageRoles(a) || target.Role == Owner || target.ID == a.ID {
		return false
	}
	return role == Member || role == Moderator
}
