// Package perm answers "may this person do that to this thing". Every
// handler asks here and nowhere else, so the rules live in one table-tested
// place. The frontend mirrors nothing: the server's answer travels as `can`
// flags on each resource.
//
// Roles belong to memberships, not people (architecture.md, Groups). An
// Actor is therefore a person together with their role in the one group at
// hand; the same functions serve the root group and every other group.
package perm

const (
	Owner     = "owner"
	Moderator = "moderator"
	Member    = "member"
)

// Group kinds.
const (
	KindRoot  = "root"
	KindGroup = "group"
	KindDM    = "dm"
)

// Root is the instance's own group, which everyone belongs to. The one id
// that is not a UUIDv7, fixed by the migration that created it.
const Root = "00000000-0000-7000-8000-000000000000"

// Actor is whoever is asking, with their role in the group the thing is
// in. An empty Role means they are not a member of that group.
type Actor struct {
	ID   string
	Role string
}

func (a Actor) member() bool { return a.Role != "" }
func (a Actor) staff() bool  { return a.Role == Owner || a.Role == Moderator }

// CanSee is the visibility rule (architecture.md, Visibility rules):
// membership of the thing's group, nothing else. Staff have no extra sight.
func CanSee(a Actor) bool { return a.member() }

// Post is what the rules need to know about a post.
type Post struct{ AuthorID string }

// Comment is what the rules need to know about a comment: whose it is, and whose post it is on.
type Comment struct{ AuthorID, PostAuthorID string }

// Message is what the rules need to know about a chat message.
type Message struct{ AuthorID string }

// Group is what the rules need to know about a group.
type Group struct{ Kind string }

// EditPost: the author, nobody else. Staff delete rather than rewrite.
func EditPost(a Actor, p Post) bool { return a.member() && a.ID == p.AuthorID }

// DeletePost: the author, or the group's staff.
func DeletePost(a Actor, p Post) bool { return a.member() && (a.ID == p.AuthorID || a.staff()) }

// EditComment: the author, nobody else.
func EditComment(a Actor, c Comment) bool { return a.member() && a.ID == c.AuthorID }

// DeleteComment: the author; the post's author, for anything on their post; or the group's staff.
func DeleteComment(a Actor, c Comment) bool {
	return a.member() && (a.ID == c.AuthorID || a.ID == c.PostAuthorID || a.staff())
}

// DeleteMessage: the author, or the group's staff. Nobody edits a sent message.
func DeleteMessage(a Actor, m Message) bool { return a.member() && (a.ID == m.AuthorID || a.staff()) }

// Post and Send: any member writes in a group they are in.
func Write(a Actor) bool { return a.member() }

// CreateGroup: any member of the root group. (A per-instance flag restricting it to staff comes with instance settings.)
func CreateGroup(root Actor) bool { return root.member() }

// AddMembers and RemoveMembers: the group's staff. In the root group, adding is an invite link.
func AddMembers(a Actor) bool    { return a.staff() }
func RemoveMembers(a Actor) bool { return a.staff() }

// SetRole: the group's owner makes anyone else a member or a moderator. The
// owner's own role never changes this way (transfer is a separate action, later).
func SetRole(a, target Actor, role string) bool {
	if a.Role != Owner || target.Role == Owner || target.ID == a.ID {
		return false
	}
	return role == Member || role == Moderator
}

// Rename and DeleteGroup: the owner; the root group is neither renamed nor deleted.
func Rename(a Actor, g Group) bool      { return a.Role == Owner && g.Kind != KindRoot }
func DeleteGroup(a Actor, g Group) bool { return a.Role == Owner && g.Kind != KindRoot }

// Leave: any member but the owner, of any group but the root.
func Leave(a Actor, g Group) bool { return a.member() && a.Role != Owner && g.Kind != KindRoot }
