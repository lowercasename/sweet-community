# Sweet: design

This document records what Sweet does and why. Each decision names who made it and when, where that is known. The code shows how each part is built. Features that are designed but not built are marked as planned.

## What Sweet is

Sweet is a social network for one small community. Each installation, called an instance, serves exactly one community. Its Home page has a feed of posts and a live chat. Members also talk in private rooms and in two-person conversations. Topics sort Home's posts by subject. The owner and moderators look after the community, and members report content to them. Sweet is self-hostable, and one person can host many communities on one server.

Old Sweet was the first version of the product. It stored post bodies in four formats. It let the client supply data that the server should derive. It kept copies of some things, and the copies could disagree. Many decisions below exist to prevent these faults. The general rule is that each thing has one place in the system.

### Words in the interface

- An instance is called a community (Raphael, 2026-11-06).
- A group is called a room (Raphael, 2026-11-05). The code keeps the word group, because Home and conversations are also groups.
- A private chat between two people is called a conversation (Raphael, 2026-11-08).
- Following a topic is called subscribing.

Copy is written for a person who has never used Sweet (Raphael, 2026-11-07). It explains Sweet's terms where the user first meets them and never describes how the software works. It uses no semicolons. Server error messages are capitalised sentences, because the client shows them unchanged.

## Stack

- The server is written in Go. The database is SQLite, with no ORM. Typed Go code is generated from the SQL queries.
- The web app is written in React. It is also the phone app.
- The deliverable is one small, portable binary with the web app and the migrations embedded in it.
- The distribution is a Docker Compose stack that adds Caddy for HTTPS and Litestream for backups. Compose only packages the binary.
- Each community runs its own copy of the binary with its own SQLite database. Each instance is one process, so it needs no message broker.
- A single instance uses stock Caddy, because one domain needs no DNS challenge (Raphael, 2026-11-06).
- When a bucket is configured, a new host with the configuration and an empty disk restores the database and starts as that instance.

The README is the install guide, written for someone who has never seen the code.

## Licence

The server and the web app are licensed AGPL-3.0-or-later (Raphael, 2026-11-09). The AGPL stops a competitor from running a closed, changed hosted version. There is no contributor licence agreement (CLA), and contributions use a DCO sign-off. The project can therefore never be relicensed as source-available. This cost was accepted, because the project's audience reads that guarantee as a sign of a credible project.

Home's feed ends with the release number, an About link to Sweet's website and a Source code link, because the app has no page footer (Raphael, 2026-11-10). When the feed is shorter than its pane, the line sits at the bottom of the pane. The Source code link points to the public repository by default and is configurable. It meets the AGPL's duty to offer the source to users. Someone who runs a changed version points it at their own repository.

The API client is meant to move to the MIT licence, so that other clients can exist. It stays under the AGPL for now (Raphael, 2026-11-09).

## The community and Home

The community is itself a group, called the root group. Every user joins it at registration and leaves it only by leaving the community. Home shows its feed and chat. Everyone sees everything on Home because everyone is a member. No rule treats Home as a special case. Every post and message belongs to exactly one group.

Home shows every member's posts. There is no following of people, because a feed of followed people shows each person only part of a small community. If an open instance ever needs following, it will be a separate view and never Home.

The community's name and description are public, because the sign-in and join pages show them.

### Feature flags

Feature flags are planned. The owner will turn posts, chat, images, embeds and alt text on or off, in rooms too. Alt text will be off, optional or required. The server will refuse a disabled feature, and the web app will hide it. One product can then serve a friend group, an interest community and a chat-first group. Topics need no flag, because they are off while none exist.

## Groups

### Rooms

A room has a feed and a chat like Home, drawn with the same panes. The design serves three needs. They are a moderation room for staff, a small invite-only room for a private subject, and a private conversation with one person. A room that people find and ask to join, such as a support group, is an experiment and not an assumption of the design.

- A room is private and invisible. Its name, members and content exist only for its members. There is no list of rooms and no way to ask to join.
- A room that wants members is announced in a public post. A "listed" setting that showed a room's name to everyone was dropped, because a public post does the same (2026-11-04).
- The community's owner and moderators see only the rooms they belong to. A member's report shows them one item.
- Any member may create a room, unless the owner limits this to staff. The creator owns the room.
- A room's one setting is its mode, which is posts, chat or both.
- A post shown outside its room has a header that names the room.
- A room is deleted when its last member leaves.

**A room always has one owner.** The owner may hand ownership to a member and become a moderator. An owner leaves only after handing over. If the owner's account is removed, ownership passes to the longest-serving moderator, or else to the longest-serving member. It never passes to the staff member who removed the owner. The community's owner cannot leave and cannot be removed.

### Conversations

A conversation is a group of exactly two people (Raphael, 2026-11-06). A group of more people is a room.

- There is one conversation per pair. Nobody can be added.
- A conversation has chat only, no name and no roles.
- Either person can hide it from their own list, and the other is not told. New messages still arrive.
- Moderators cannot read conversations. A report shows them only the reported message.

A room continues to exist when its members change. A conversation is defined by its two people, so its members never change. It is stored as a second kind of group, so it gets chat, events and the visibility rules without a second code path.

### Roles

The roles are owner, moderator and member. A role belongs to a membership, so it applies in one group only. The community's staff are the root group's owner and moderators. The community's owner is a plain member of a room they were added to.

## Topics

A topic is an optional label that filters Home's feed. It is not a separate place to post, because choosing a place before writing discourages people from posting.

- A post has at most one topic, and most have none (Raphael, 2026-11-07). Rooms have no topics.
- The owner and moderators manage topics on the Community page. Topics are listed alphabetically, so there is no order to maintain.
- Topics are off while none exist. While the list is empty, the owner and moderators see a control that explains topics (Raphael, 2026-11-08).
- A new post gets the feed's current topic. The composer has no topic control, because two controls for one choice were confusing (Raphael, 2026-11-08).
- Staff may move any post to another topic, because that is moderation and not editing (Raphael, 2026-11-07).
- Subscribing to a topic sends its new posts as notifications and in the digest. It never changes who can see a post.
- The selected topic is part of the page's address, so the view can be shared.

A topic has one shape everywhere, a pill with the tag icon, in two sizes. The small pill is a label on a post. It opens the topic and never edits it. The larger pill is a control at the top of the feed. It is not in the top bar, because on a desktop the bar also spans the chat. Topics are not in the nav, because the nav lists places. Starter topics were rejected, because they would choose a community's subjects for it.

### Tags

Hashtags are on hold. Raphael asked on 2026-11-06 whether tags are the same as topics, and that must be settled first.

## Posts and editor

A post is long-form text with inline images. Comments are a flat list, oldest first. A reply to one comment quotes it.

- The author edits a post or comment as a whole, and the post is marked as edited. There is no version history.
- Deleting a post deletes its comments, because the author asked for the post to go.
- Every post has its own address, which notifications link to.
- Drafts are kept in the browser. Safari clears them after seven days without a visit unless the app is installed, and this is accepted.
- The @ list offers only the members of the current group (Raphael, 2026-11-08).
- Links are added and edited in a small panel from the editor's Link button or Cmd+K, in place of the browser's prompt box (Raphael, 2026-11-10). Like the emoji picker, the panel never covers the text being written. An address without https:// gets it.
- On a device with a mouse or trackpad, every composer has an emoji picker. Phones have none, because their keyboards have emoji (Raphael, 2026-11-10). The picker shows the device's own emoji, so it loads nothing from another site.

### Body format

The editor is TipTap. **The body is the HTML that TipTap produces.** The server sanitises it and stores it once. Every kind of body uses this one format.

- HTML was chosen over ProseMirror JSON after two debates. The schema causes lock-in, not the storage format. HTML renders in any browser and imports into any editor. JSON means nothing without the exact editor extensions. The question should be reopened only for collaborative editing.
- One bluemonday policy checks every body. The policy is the schema. Nothing is trusted before the policy, and everything after it is trusted.
- The server derives mentions and search text from the sanitised body. The client never sends them, because derived data that the client controls can disagree with the body.
- Saving an unchanged body returns the same bytes. Editor upgrades are deliberate, and a test checks that the bytes stay the same.

### How a post is drawn

Raphael chose the layout from three drawings (2026-11-06). An open thread sits on a warm grey panel inside the card, with a white reply box. The panel shows where the post ends, and the white box shows where to type. On a device with a pointer, a block's menu shows only on hover or focus, so a chat does not show a column of dots. Touch screens always show menus, because users cannot discover a long press.

## Chat

A message uses part of the same schema and passes the same policy. Chat history is kept forever.

- A reply quotes the original and stays in the flat list. Threads were rejected, because they would make a chat into a second feed.
- The author or the group's staff may delete a message. Nobody can edit a sent message.
- The chat shows a line when someone joins the community or is added to a room (Raphael, 2026-11-08). A line is stored as a message, so it keeps its order. Notifying a whole room of each addition was rejected, because a room of twenty would get twenty notifications.
- There is no offline posting. When the device is offline, the bar at the top of the view shows an Offline badge and sending is disabled. Connecting and reconnecting show nothing (Raphael, 2026-11-09). A failed send keeps its text.

## Images

- Storage has two drivers. A local directory is the default, so a first install needs no bucket. An S3-compatible bucket is used when configured.
- An image's address is a path on the instance, so storage can move without changing posts.
- The server accepts JPEG, PNG, WebP and GIF, detected from the content. HEIC is not decoded, because Go would need C libraries. The upload control asks for JPEG first, so iPhones convert HEIC photos.
- Uploads are turned upright and stripped of metadata. Smaller sizes are JPEG or PNG, because Go cannot encode WebP.
- An image is served only to its uploader or to someone who can see content that uses it. No image leaves the app, so there are no signed URLs.
- A profile picture or a room picture must be an image that the person setting it uploaded (Raphael, 2026-11-10). Every signed-in user can see a profile picture, so any other image would let a member show an image from a private room or a conversation to the whole community.
- Images that nothing has used for a day are deleted.
- Adjacent images are shown as a gallery. The stored HTML stays a plain run of images.

A storage quota per instance is planned.

### Embeds

A link on its own line becomes a preview card, as in WhatsApp and Signal (Raphael, 2026-11-10). The card shows the page's picture, title and description, taken from the page's OpenGraph tags, and the page's domain. The domain is shown instead of a name the page gives itself, so a card shows where its link really goes (Raphael, 2026-11-10). Clicking it opens the page in a new tab. The card's shape follows old Sweet's link preview, which Raphael chose: a picture on the left, then the title, a short description and the domain, at a fixed height.

- Previews appear in posts, comments and chat. There is no button for them.
- In a post or a comment, pressing Enter after a link on its own line turns it into a card. A link on the last line is turned into a card when the post is saved, without the author seeing it happen. The editor shows "Embedded link" above a card, with "Turn back into regular link", and a link turned back stays a link when the post is saved again.
- In chat, a link on its own line becomes a card when the message is sent. A sent message cannot be edited, so the card stays.
- A page that gives no title, or cannot be fetched, stays a plain link.
- The server fetches the page and keeps a copy of its picture, so readers' browsers never contact the other site. The fetcher refuses internal addresses. A preview is fetched once for each address and kept.
- The card data is the server's, not the body's. The body holds only the link and a mark that it is a card, so a client cannot invent a preview.
- Videos get the same card for now. A player that loads only when clicked was planned, and was deferred by Raphael (2026-11-10).

## Accounts

An account has a username and an email address. A password is optional, and the usual way to sign in is by email (Raphael, 2026-11-08).

- Signing in emails a link and a six-digit code. Either one works.
- The code works only in the browser that asked for it. Otherwise a person could request a code for someone else's address and guess it.
- The link opens a page where a button completes the sign-in, because email scanners open links.
- The code exists because an iPhone's home-screen app does not share cookies with Safari.
- There are no reset pages. A user who forgets a password signs in by email.
- Changing a password needs no current password, because email can always sign in. Each change ends the other sessions and emails a notice.
- A new email address is confirmed by a link sent to it (2026-11-08). The old address gets a notice.
- A username can change, because content refers to the user's id.
- The server never reveals whether an address has an account. It emails the account's owner about the attempt instead.

Sessions are stored in the database and last 180 days, extended while used. The web app holds the session in an httpOnly cookie. The server also accepts the session id in a header, for a future store app. Sign out everywhere ends every session. It replaces a list of sessions, because the real cases are a lost phone and a compromised account.

### Profiles

A profile shows a user's picture, name, role and bio. Every profile is visible to every user. It lists the user's posts from the groups the viewer belongs to, and no chat messages. A name beside content opens a preview card (Raphael, 2026-11-05).

The account row in the nav opens the user's own profile, and Settings is reached from there (Raphael, 2026-11-06). The place to change a picture is then the place where it is shown.

### Joining

Registration is by invitation only, so no bot protection is needed. An approval mode is planned.

- An invite link works for anyone for seven days (Raphael, 2026-11-06). A group of people joins together, and one link per person would not bring them.
- The join page shows the rules, and its button reads Agree and join.
- No session exists until the first sign-in email is used, because otherwise verification would be optional.

## New-instance lifecycle

1. **Provision.** A hosting tool outside the binary creates and starts the instance.
2. **Setup.** When there is no owner, the binary prints a one-time setup link. Its page creates the owner's account without a password, because a password is always the secondary way in (Raphael, 2026-11-09). The owner's address counts as verified without an email, because the holder of the link controls the server and email may not be set up (Raphael, 2026-11-06).
3. **Onboarding.** The welcome page asks for the name, the purpose and who may create rooms. It then offers an invite link.

Setup and onboarding are in the binary, so self-hosters get the same flow as hosted communities.

### The welcome dialog and the tour

A welcome dialog opens on a user's first visit to Home (Raphael, 2026-11-09). It shows the welcome message under the owner's name and offers a tour. The server records that the user was welcomed, so other devices do not show it again.

The tour is a series of cards that point at parts of the page. Each card appears only where its subject applies to the user. The owner's tour ends with writing the welcome message. The tour uses React Joyride, because it lets the cards use Sweet's own components (Raphael, 2026-11-09). Driver.js was rejected, because it draws its own card.

## Visibility rules

The rule is membership and nothing else. A signed-in user who has not been removed sees a thing if they belong to its group. Staff see nothing extra. This is the promise the product makes.

- A non-member gets "not found" for anything in a group, never "forbidden".
- The event stream follows the same rule, including for deletion events (2026-11-08).
- The rules and the welcome message need a session. The join page shows the rules to someone with an invite.
- The release number is shown only to signed-in users, so scanners cannot read it.

One function decides visibility. List queries apply the same rule in SQL, and a test checks that both agree for every kind of viewer and thing. No query may bypass the rule for speed until a test proves that it gives the same answer.

## Permissions

One package on the server holds every rule about who may do what. Each rule takes the actor's role in the object's group.

- An author edits their own posts and comments and deletes their own content. A post's author may also delete comments on it.
- A group's owner and moderators delete anything in it and edit nothing that others wrote, except a post's topic. They add and remove members.
- Only a group's owner sets roles, hands over ownership, renames the group, sets its mode, or deletes it.
- Only the community's owner changes the community's name and who may create rooms. The owner and moderators manage invites, topics, rules, the welcome message and reports.
- Staff remove users below their own role. Any user may remove themselves. Nobody can remove the owner.

**The web app holds no permission rules.** Everything the server sends carries flags that say what the viewer may do. Copying the rules into TypeScript was rejected, because two copies of a rule come to disagree.

## Removing a user

Raphael decided on 2026-11-08 that "a deleted user's posts should actually just go". A removed user's posts, comments and messages are deleted, and their text is cleared.

- The account row stays under a "removed-" name, so records that name it stay valid.
- Their password, picture, bio, sessions and push subscriptions are deleted.
- Rooms they owned pass to new owners by seniority.
- Open reports about their content are closed.

Removal has no options. A choice to keep, anonymise or delete the content was dropped, because one rule gives moderators less to weigh.

## Reports

Any member can report another person's post, comment or message (Raphael, 2026-11-08).

- The dialog says that the author will not learn who reported.
- The server keeps a copy of the item, so moderators can judge it after an edit or a deletion.
- The owner and moderators get a notification, which is also pushed.
- The Reports card is first on the Community page, because reports wait for action. Members cannot see reports.
- Open never appears for a conversation, because a conversation belongs to its two people. Delete works anywhere.
- Dismissing or deleting closes the item's reports for every moderator.

Three details were decided while building and remain open to change. They are one entry per item, closing a report for every moderator, and the card's first place.

## Notifications

A notification records one action done to one person. The server writes it with the action, and nobody is notified of their own actions. Every delivery channel reads from the one list.

A user is notified of a comment on their post, a mention, being added to a room, a conversation message, a reply to their chat message, and a post in a subscribed topic. The owner and moderators are also notified of new members and reports. A mention notifies only members of the group, because only they can see it.

- New posts and messages in rooms show as unread dots. A notification for every room message would duplicate what the room already shows.
- A notification is read when the user opens it, not when they view the list (Raphael, 2026-11-06).
- The indicator is a dot, never a count, because a count invites the user to clear it (Raphael, 2026-11-06).
- A conversation message creates a notification, because notifications reach a user who is not in the app (Raphael, 2026-11-08). Each conversation has at most one unread message notification.
- One action never notifies the same person twice.

Read markers record how far a person has read each chat and feed. They are stored on the server, so they follow the person across devices. A marker only moves forward, so a stale tab cannot undo another tab's reading.

**Web push** sends mentions, comments, conversation messages, replies and reports. A push holds the community's name, one line and a link, and never any content.

**The weekly digest** goes to people who have not visited for seven days (2026-11-08). It was built before push, because it brings back people who have stopped visiting. It holds only counts, with no content and no images. One click turns it off.

## Email

Sweet sends sign-in links, address confirmations, security notices and the weekly digest. Email is sent over plain SMTP, so any provider works and no vendor is named in the code. Every email uses one template with the community's name, a heading, a few lines and at most one link (Raphael, 2026-11-07). Bounce tracking was rejected, because it would tie the code to a provider. The user can resend an email or correct the address instead.

## Search

Search covers the posts, comments and chat messages that the searcher can see.

- Database triggers keep the index in step with the content, so the two cannot disagree.
- A word matches inside longer words, so "armalade" finds "marmalade" (Raphael, 2026-11-06). Raphael accepted the larger index that this needs.
- Results are ranked by relevance, not by date. At most fifty are returned, because nobody reads more.
- The query is part of the page's address, so a search can be shared.
- The search box has no button (Raphael, 2026-11-06), because a field with a button looked like a form.

## Realtime

The server sends updates over server-sent events (SSE), and the client sends ordinary HTTP requests. Both are plain HTTP, so cookies and proxies work, and the browser reconnects on its own. Each client has one stream. WebSockets should be reconsidered only for presence or typing indicators.

- **The database is the replay buffer.** Events carry sequence numbers in commit order. A reconnecting client sends its last number, and the server replays later events from the database.
- **The log keeps only each resource's newest event, for one day** (Raphael, 2026-11-08). A full log let members replay deleted content.
- **Each resource has two kinds of event.** One carries its current state. The other announces its deletion.
- **Each resource has one builder.** A handler that writes reads the row back and passes it to the builder. A test checks that the response and the event equal a fresh fetch.
- **Phones drop connections without warning.** A heartbeat detects this. The client reconnects when the page becomes visible, and it resyncs every time.
- **A stream ends with its session** (Raphael, 2026-11-10). The stream checks the session before each event and at each heartbeat. When the session has ended, by signing out anywhere, a password change, removal or expiry, the stream tells the page and closes, and the page signs out.
- **Open tabs reload when the server's version changes.** The web app is embedded in the binary, so only tabs that were already open can run an older version.

One cache in the web app holds all server data. Events are its write path, and a reconnect refetches everything. Content refers to users by id, so a new name or picture shows everywhere at once.

## Interface

**One shape per concept.** A topic is always the same pill. A place is a tile or a picture. A feature is a line icon. A person is a profile picture. A notice is always the same alert box. Being offline is a red badge in the bar.

### Buttons

There are four kinds of button (2026-11-08).

- **Primary** is the main action. At most one shows on a surface. A disabled primary is faded red, not grey, so the main action stays recognisable.
- **Secondary** is any other action that changes something.
- **Ghost** is a quiet action, such as a toggle or Cancel.
- **Danger** removes something. It has a red border and an icon.

A toggle shows its state, and hovering shows its action (Raphael, 2026-11-07). Subscribed is the state, and Unsubscribe appears on hover. A label is a verb, with an object when needed.

### Patterns

- Buttons in a row go from the least to the most consequential, left to right. A destructive action never shares a row with a primary.
- A form ends with Cancel and then the primary, at the right.
- Destructive actions sit in the last card of a page.
- A list row shows its common action, and its other actions are in a menu.
- Every removal asks for confirmation, except revoking an invite link, which is easy to replace.
- An empty state is one sentence and one button that fills the place.
- Text under a card's heading is small and grey (Raphael, 2026-11-08).

### The shield

A grey shield marks what a person sees or can do only as an owner or moderator (Raphael, 2026-11-09). Without it, a moderator could not tell their extra controls from everyone's. Raphael chose the shield over a role badge and over the role in the label. A room's own settings are not marked, because its creator knows the room is theirs. The server says when an action depends on a role.

### Colours and modes

Sweet keeps old Sweet's red on a dotted background. Every pair of colours meets the contrast guidelines (palette chosen by Raphael, 2026-11-08). Pink is never behind text.

Sweet follows the device's light or dark setting, unless the user chooses one (Raphael, 2026-11-09). The choice is kept per device, because a phone at night and a laptop by day can need different modes. Dark mode keeps the contrast rules.

## Layout

On a desktop the nav column is on the left. Posts and chat sit side by side with a draggable divider. A pane dragged past the edge collapses. A closed pane stays loaded, so unsent text is kept.

On a phone, one pane shows at a time. A tab bar at the bottom holds Home, Search, Notifications and Menu.

**Every view has a top bar** that names it and holds its controls (Raphael, 2026-11-06). On a phone the switch between posts and chat is in that bar. Posts and chat are two views of one group. When they were bottom tabs, a room's chat could not be told apart from Home's chat.

**Every page has an address**, so the back button, a reload and links all work.

### The nav

The nav has three blocks (2026-11-05).

1. **Places.** This block holds Home, Rooms and Conversations. Rooms are listed alphabetically without a limit, because there are few. Conversations lists the five with the latest messages.
2. **Tools.** This block holds Search and Notifications.
3. **The community and the user.** This block holds People, the Community page and the account row.

Conversations accumulate, so their list has a stated limit and not a hidden rule like Slack's (Raphael, 2026-11-05). A messenger layout with a column of conversations was rejected, because it would draw chat in a second way.

## Mobile

There is no separate mobile app, and there must never be a second codebase. The web app is a progressive web app (PWA), and the PWA is the phone app.

- iPhones allow web push only for apps on the home screen. Home therefore offers installation on touch screens (Raphael, 2026-11-08).
- A store app may come later. It would wrap the same build with Capacitor. Bubblewrap was rejected, because it supports only Android.
- A store app cannot use the cookie session, because iOS blocks cross-site cookies. It will send the session id in a header instead. Sessions do not depend on how the id arrives, so this needs no redesign.

## Data

- Rows have UUIDv7 ids, so two instances could be merged without renumbering any references.
- Times are stored in UTC. The browser converts them for display.
- Lists are paged by cursor, never by offset.
- Content and groups are soft-deleted.

## Running an instance

Every setting is an environment variable, read from one file. A TOML file was rejected, because it would be a second place for the same settings. The binary provides a health check, structured logs and an optional error hook, and nothing more. A server error tells the user only that something failed (2026-11-08).

### Updates and releases

- Migrations are embedded and run forward only at start. A copy of the database made before they run is the upgrade backup.
- The binary refuses a database from a newer release.
- A release is a git tag vMAJOR.MINOR.PATCH (Raphael, 2026-11-08). A major release needs operators to act. A minor release adds behaviour or features that users will notice. A patch release changes nothing that users will notice, however large the code change (Raphael, 2026-11-10).
- Each release publishes an image tagged with its exact and major versions (Raphael, 2026-11-09). Docker has no "this version or later" pin, so the major tag moves with each release. An updater pinned to 1 then gets every 1.x release and never 2.0. Within one major version every image runs all migrations in order, so this is safe.
- An operator rolls back by pinning an earlier version.

### Backups

Litestream runs in the binary's container and supervises the binary, so the two cannot use different database files. It streams every change to a bucket.

- Restores are exact for the last few minutes and accurate to five minutes before that.
- Hourly snapshots are kept for 30 days (Raphael, 2026-11-09).
- One bucket holds the images and the database, and configuring it turns on both.
- The database must be on a local disk.

### Hosting many communities

Each hosted community is its own process with its own database. A hosting tool outside the binary creates and removes communities, so hosted and self-hosted communities run the same software. A planned admin API will be the tool's only access.

Several communities can share one bucket, each in its own folder (Raphael, 2026-11-09). They then share one key, so each community's server can read and change the others' images and backups. A separate bucket or key for each community keeps them apart.

Data export and custom domains are also planned. Import will be built before export, because import tests the export.

## Admin tools

The Community page holds what the staff manage (Raphael, 2026-11-06). A page about the community did not belong behind the owner's profile. Its cards are Reports, About this community, Welcome message, Rules and Topics. Each card shows only to those who may use it. The People page holds roles, removals and invite links.

An approval queue, a pinned announcement and a list of posts with no reply are planned. Nothing more elaborate will be built until a community asks for it.

## Security

These decisions came from a security audit (2026-11-08).

- A content security policy allows only the instance's own origin. The sanitiser remains the main defence.
- Wrong invite codes are rate-limited per client address, as wrong passwords already were.
- Behind proxies, the operator states how many proxies there are. The client address is read that many entries from the right, because a visitor can forge only the entries on the left.
- Images that are too large are refused before decoding.
- Push goes only to the known push services, so a member cannot make the server send requests to any host.

## Record

### Reversed

- **Body format.** TipTap JSON became sanitised HTML. The JSON design assumed that Go had no good HTML sanitiser, which was false.
- **Event kinds.** One kind per action became two per resource, because the kinds kept multiplying.
- **Payloads.** Handlers built their own responses until three payloads in two days lacked a field. One builder per resource now does it.
- **Event cursor.** A UUIDv7 cursor briefly replaced the integer sequence. The sequence came back, because the order of ids is not the commit order.
- **Client permissions.** Rules copied by hand became server flags, because only the server's copy is enforced.
- **Private spaces.** Everyone once saw everything. Private rooms now exist, because a moderation room and a private message cannot be on the main feed.
- **Direct messages.** DMs were cut, then became two-person groups, because private groups made them the same object.
- **Conversation members.** Changing sets of people became fixed pairs (Raphael, 2026-11-06). Changing sets turned conversations into rooms without names.
- **Topics.** Every post first had one topic, with a default. The default put a pill on every post, so a post now has at most one topic (Raphael, 2026-11-07).
- **Copy.** Copy that described the software became copy that explains Sweet's terms (Raphael, 2026-11-07).
- **Primary colour.** Pink with white text failed the contrast guideline, so the primary is red (Raphael, 2026-11-08).
- **Destructive actions.** They appeared in many places. They now sit in a page's last card, so people know where to look (Raphael, 2026-11-08).
- **Credit line.** Home's feed also ended with a line saying who built Sweet. It was removed, because it stood out on a feed with no posts (Raphael, 2026-11-10).
- **Connection state.** A notice above the editors showed connecting, reconnecting and offline. It moved the editors each time the connection changed and added noise. Only offline is shown now, as a badge in the bar (Raphael, 2026-11-09).

### Considered and rejected

- **TypeScript end to end.** It would lose the small, portable binary.
- **A Node sidecar for TipTap.** It needs two runtimes and a second codebase.
- **Markdown bodies.** Mentions by id, image ids and alt text have no Markdown syntax.
- **JWTs** (raised twice). Revoking a session needs a server lookup anyway.
- **WebSockets.** SSE is plain HTTP and reconnects on its own.
- **An offline send queue.** Safari and Firefox lack background sync. Showing that the device is offline serves users better.
- **Threads in chat or comments.** Quoted replies cover the need.
- **GPL-3.0, MIT or Apache-2.0.** None of them stops a closed hosted fork.
- **Source-available licences.** They are not open source, and Debian and Fedora do not package them.
- **A CLA.** Contributors read it as preparation for dual licensing.

### Deferred

- A store app waits until store presence matters.
- Self-serve community creation waits until there are more communities than one person can track.
- Presence and typing indicators wait until chat feels inactive without them.
- Post version history waits until moderation needs it.
- Sorting the feed by latest comment was deferred by Raphael (2026-11-09). It first needs decisions about own comments, deleted comments and the unread dot.
