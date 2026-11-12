// Package perm decides whether a user may perform an action on a resource.
// Every handler calls this package and nothing else for that decision, so the
// rules are in one table-tested place. The frontend does not duplicate the
// rules. The server sends its decisions as `can` flags on each resource.
//
// Roles belong to memberships, not to users. An
// Actor is therefore a user together with their role in the group in question.
// The same functions serve the root group and every other group.
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

// Root is the id of the instance's own group, which every user belongs to. It
// is the only id that is not a UUIDv7. The migration that created the group
// fixed it.
const Root = "00000000-0000-7000-8000-000000000000"

// Actor is the user performing the action, with their role in the group the
// resource is in. An empty Role means the user is not a member of that group.
type Actor struct {
	ID   string
	Role string
}

func (a Actor) member() bool { return a.Role != "" }
func (a Actor) staff() bool  { return a.Role == Owner || a.Role == Moderator }

// CanSee is the visibility rule. A user
// can see a resource only when they are a member of its group. Staff have no
// extra visibility.
func CanSee(a Actor) bool { return a.member() }

// Post holds the fields of a post that the rules use.
type Post struct{ AuthorID string }

// Comment holds the fields of a comment that the rules use. They are the comment's author and the author of the post it is on.
type Comment struct{ AuthorID, PostAuthorID string }

// Message holds the fields of a chat message that the rules use.
type Message struct{ AuthorID string }

// Group holds the fields of a group that the rules use.
type Group struct{ Kind string }

// EditPost allows only the author. Staff can delete a post but not edit it.
func EditPost(a Actor, p Post) bool { return a.member() && a.ID == p.AuthorID }

// DeletePost allows the author and the group's staff.
func DeletePost(a Actor, p Post) bool { return a.member() && (a.ID == p.AuthorID || a.staff()) }

// EditComment allows only the author.
func EditComment(a Actor, c Comment) bool { return a.member() && a.ID == c.AuthorID }

// DeleteComment allows the comment's author, the author of the post it is on, and the group's staff.
func DeleteComment(a Actor, c Comment) bool {
	return a.member() && (a.ID == c.AuthorID || a.ID == c.PostAuthorID || a.staff())
}

// DeleteMessage allows the author and the group's staff. A sent message cannot be edited.
func DeleteMessage(a Actor, m Message) bool { return a.member() && (a.ID == m.AuthorID || a.staff()) }

// React allows any member of an item's group to add and remove their own reactions on it.
func React(a Actor) bool { return a.member() }

// Write allows any member of the group to post and to send messages in it.
func Write(a Actor) bool { return a.member() }

// Group modes.
const (
	ModePosts = "posts"
	ModeChat  = "chat"
	ModeBoth  = "both"
)

// Values of the instance setting group_creation, which says who may create groups.
const (
	CreationAnyone = "anyone"
	CreationStaff  = "staff"
)

// CreateGroup allows a member of the root group, or only the root group's
// staff, depending on the instance's group_creation setting.
func CreateGroup(root Actor, policy string) bool {
	if policy == CreationStaff {
		return root.staff()
	}
	return root.member()
}

// ManageInstance allows the root group's owner to edit instance settings.
func ManageInstance(root Actor) bool { return root.Role == Owner }

// ManageTopics allows the root group's staff to manage the community's list
// of topics.
func ManageTopics(root Actor) bool { return root.staff() }

// ManageRules allows the root group's owner and moderators to write the community's rules.
func ManageRules(root Actor) bool { return root.staff() }

// ManageWelcome allows the root group's owner and moderators to write the welcome message, as they write the rules.
func ManageWelcome(root Actor) bool { return root.staff() }

// Report allows any member of the group an item is in, except the item's author, to report it to the community's
// owner and moderators. Moderators may report too.
func Report(a Actor, authorID string) bool { return a.member() && a.ID != authorID }

// HandleReports allows the root group's owner and moderators to read reports and to close them by dismissing them or
// by deleting the item. Deleting works in any group, including a room or conversation the moderator is not in,
// because a member's report brings the item to the moderators.
func HandleReports(root Actor) bool { return root.staff() }

// HandleReport excludes the reported author, even when they are staff.
func HandleReport(root Actor, authorID string) bool {
	return HandleReports(root) && authorID != "" && root.ID != authorID
}

// OpenReported allows a moderator to open a reported item in place when they can see it. An item in a conversation
// is never opened, because a conversation belongs to its two people.
func OpenReported(a Actor, g Group) bool { return a.member() && g.Kind != KindDM }

// ByRole reports whether an action is allowed only because of the actor's role in the group. It is allowed, and it
// would not be allowed if the actor were a plain member. The client marks such an action with a shield.
func ByRole(a Actor, allowed func(Actor) bool) bool {
	return allowed(a) && !allowed(Actor{ID: a.ID, Role: Member})
}

// SetTopic allows the author to set the topic of their own post, and the root
// group's staff to set the topic of any post. It is the only change staff may
// make to another user's post. Setting a topic is moderation, not rewriting. The actor's role is their role in the root
// group, because only the community's feed has topics.
func SetTopic(root Actor, p Post) bool {
	return root.member() && (root.ID == p.AuthorID || root.staff())
}

// Transfer allows the owner to transfer ownership to another member of the group.
func Transfer(a, target Actor) bool { return a.Role == Owner && target.member() && target.ID != a.ID }

// AddMembers allows the group's staff. Nobody can be added to a conversation,
// because a conversation is identified by its participants, and a conversation
// with a different set of participants is a different conversation. In the
// root group, members are added by invite link.
// RemoveMembers allows the group's staff. Nobody can be removed from a
// conversation. A participant leaves it instead.
func AddMembers(a Actor, g Group) bool { return g.Kind != KindDM && a.staff() }
func RemoveMembers(a Actor) bool       { return a.staff() }

// RemoveFromInstance allows root staff to
// remove users with a lower role. A moderator can remove members. The owner
// can remove members and moderators. Any user can remove themselves. The owner
// cannot be removed and must transfer ownership first.
func RemoveFromInstance(a, target Actor) bool {
	if !target.member() || target.Role == Owner {
		return false
	}
	if a.ID == target.ID {
		return true
	}
	return a.Role == Owner || (a.Role == Moderator && target.Role == Member)
}

// Invite allows creating an invite link, which is how members are added to the root group.
func Invite(root Actor) bool { return AddMembers(root, Group{Kind: KindRoot}) }

// SetRole allows the group's owner to set any other member's role to member
// or moderator. The owner's own role cannot be changed this way. Transfer is
// a separate action, to be added later.
func SetRole(a, target Actor, role string) bool {
	if a.Role != Owner || target.Role == Owner || target.ID == a.ID {
		return false
	}
	return role == Member || role == Moderator
}

// Rename and SetMode allow the owner. The root group cannot be renamed. A DM
// cannot be renamed or changed from chat mode. DeleteGroup allows the owner,
// and the root group cannot be deleted.
func Rename(a Actor, g Group) bool      { return a.Role == Owner && g.Kind == KindGroup }
func SetMode(a Actor, g Group) bool     { return a.Role == Owner && g.Kind != KindDM }
func DeleteGroup(a Actor, g Group) bool { return a.Role == Owner && g.Kind != KindRoot }

// Leave allows any member except the owner to leave any group except the
// root. Leaving a room removes the membership. Leaving a conversation hides
// it, and opening the conversation again restores it.
func Leave(a Actor, g Group) bool { return a.member() && a.Role != Owner && g.Kind != KindRoot }
