# Sweet: design

This document records what Sweet does and why. The code shows how each part is built. Features that are designed but not built are marked as planned.

## What Sweet is

Sweet is a social network for one small community. Each installation, called an instance, serves exactly one community. Its Home page has a feed of posts and a live chat. Members also talk in open rooms, private rooms and two-person conversations. Rooms organise posts by subject. The owner and moderators look after the community, and members report content to them. Sweet is self-hostable, and one person can host many communities on one server.

Old Sweet was the first version of the product. It stored post bodies in four formats. It let the client supply data that the server should derive. It kept copies of some things, and the copies could disagree. Many decisions below exist to prevent these faults. The general rule is that each thing has one place in the system.

### Words in the interface

- An instance is called a community.
- A group is called a room. The code keeps the word group, because Home and conversations are also groups.
- A private chat between two people is called a conversation.

Copy is written for a person who has never used Sweet. It explains Sweet's terms where the user first meets them and never describes how the software works. It uses no semicolons. Server error messages are capitalised sentences, because the client shows them unchanged.

An error never shows a status code or a page from a proxy. The client shows the server's own message when there is one. Otherwise it shows a general message, or a message that the connection failed.

## Stack

- The server is written in Go. The database is SQLite, with no ORM. Typed Go code is generated from the SQL queries.
- The web app is written in React. It is also the phone app.
- The deliverable is one small, portable binary with the web app and the migrations embedded in it.
- The distribution is a Docker Compose stack that adds Caddy for HTTPS and Litestream for backups. Compose only packages the binary.
- Each community runs its own copy of the binary with its own SQLite database. Each instance is one process, so it needs no message broker.
- A single instance uses stock Caddy, because one domain needs no DNS challenge.
- When a bucket is configured, a new host with the configuration and an empty disk restores the database and starts as that instance.

The README is the install guide, written for someone who has never seen the code.

## Licence

The server and the web app are licensed AGPL-3.0-or-later. The AGPL stops a competitor from running a closed, changed hosted version. There is no contributor licence agreement (CLA), and contributions use a DCO sign-off. The project can therefore never be relicensed as source-available. This cost was accepted, because the project's audience reads that guarantee as a sign of a credible project.

Home's feed ends with the release number, an About link to Sweet's website and a Source code link, because the app has no page footer. When the feed is shorter than its pane, the line sits at the bottom of the pane. The Source code link points to the public repository by default and is configurable. It meets the AGPL's duty to offer the source to users. Someone who runs a changed version points it at their own repository.

The API client is meant to move to the MIT licence, so that other clients can exist. It stays under the AGPL for now.

## The community and Home

The community is itself a group, called the root group. Every user joins it at registration and leaves it only by leaving the community. Home shows community posts and posts from open rooms. Its chat belongs to the community. Every post and message belongs to exactly one group. A room post shown on Home still belongs to its room and retains that room’s permissions. Private room posts never appear on Home, including for their members. (Raphael, 2026-11-16. Open-room posts preserve shared context without combining chats.)

Home shows every member's posts. There is no following of people, because a feed of followed people shows each person only part of a small community. If an open instance ever needs following, it will be a separate view and never Home.

The community's name and description are public, because the sign-in and join pages show them.

### Feature flags

Feature flags are planned. The owner will turn posts, chat, images, embeds and alt text on or off, in rooms too. Alt text will be off, optional or required. The server will refuse a disabled feature, and the web app will hide it. One product can then serve a friend group, an interest community and a chat-first group.

## Groups

### Rooms

A room has posts, chat or both under one shared header. The owner chooses the mode when creating the room and can change it later. New rooms default to posts only. Chat is an explicit choice. Open and private rooms offer the same choices. Selecting a room shows its enabled panes. The header names the room. Disabling a pane prevents new posts or messages in it but preserves existing content. Enabling it again shows that content. A person can also collapse either pane for themselves. (Raphael, 2026-11-17. Restoring room modes lets a community organise posts without creating a separate chat for every subject.)

- Every community member can discover, read and participate in open rooms without asking to join. New community members gain access to existing open rooms.
- Sidebar shortcuts are personal. Adding or removing one changes neither access, Home, roles nor notifications. Browse Rooms lists all open rooms and the private rooms the viewer belongs to. A star in the room header adds or removes its shortcut. The star is filled when added. (Raphael, 2026-11-16. Add to sidebar names the action clearly.)
- Creating a room adds its shortcut for its creator. A private invitation adds the shortcut for the invited person. New open rooms are not automatically added for everyone. Existing shortcuts are preserved during the upgrade.
- A private room is invisible to non-members. Its name, members and content are available only to invited members. Rooms that existed before open and private visibility choices were introduced migrate as open. Rooms created afterward keep their chosen visibility. (Raphael, 2026-11-17.)
- Visibility is chosen when the room is created and cannot be changed later. (Codex, 2026-11-16. This prevents a settings change from exposing private history.)
- The community's owner and moderators have ordinary member access in open rooms. They receive no extra room moderation permissions. They see private rooms only when invited. A report shows eligible staff one reported item.
- Any member may create a room, unless the owner limits this to staff. The creator owns the room.
- A room may have a plain-text description of up to 140 characters. Its owner can edit or clear it. The description appears in Browse Rooms and room details, and is visible only to people who can see the room. Browse Rooms searches names and descriptions. Existing rooms start without descriptions. (Raphael requested descriptions, 2026-11-16. Codex chose the limit and placement to keep them short and useful when choosing a room.)
- Every room member can see the room's people grouped into Owner, Moderators and Members. Role changes move people between those sections. Actions still follow the existing role permissions. (Raphael, 2026-11-16. The groups make it clear who runs the room.)
- The new room form starts with Open selected. Choosing Private shows a searchable list of community members. Selected people appear above the list and join when the room is created. The creator is always included. (Raphael, 2026-11-16. People should be able to choose a private room's members during creation.)
- A private room has the same lock beside its name in the sidebar, header and post labels. The header stays on one line. Room settings do not repeat the privacy explanation. (Raphael, 2026-11-16. Competing privacy labels and a second header line added clutter.)
- The lock shows a Private room tooltip everywhere it appears. Hovering it does not show the room-name tooltip at the same time. (Raphael, 2026-11-16. The two tooltips overlapped.)
- A post shown outside its room has a header naming and linking to the room. Opening its comments does not change the current chat. Entering the room changes both columns.
- Everyone belongs to open rooms while they belong to the community. They cannot leave an open room or remove another community member from it. Room chat alert settings are available when chat is enabled.
- Private room members can leave or be removed. A private room is deleted when its last member leaves.

**A room always has one owner.** The owner may hand ownership to a member and become a moderator. An owner leaves only after handing over. If the owner's account is removed, ownership passes to the longest-serving moderator, or else to the longest-serving member. It never passes to the staff member who removed the owner. The community's owner cannot leave and cannot be removed.

### Conversations

A conversation is a group of exactly two people. A group of more people is a room.

- There is one conversation per pair. Nobody can be added.
- A conversation has chat only, no name and no roles.
- Either person can hide it from their own list, and the other is not told. New messages still arrive.
- Moderators cannot read conversations. A report shows them only the reported message.

A room continues to exist when its members change. A conversation is defined by its two people, so its members never change. It is stored as a second kind of group, so it gets chat, events and the visibility rules without a second code path.

### Roles

The roles are owner, moderator and member. A role belongs to a membership, so it applies in one group only. The community's staff are the root group's owner and moderators. The community's owner is a plain member of a room they were added to.

## Categorising posts

Rooms are the only way to categorise posts. Topics and topic subscriptions are no longer available. Existing posts stay where their authors posted them. Removing topics does not move or rewrite content. Hashtags remain plain text. (Raphael, 2026-11-16. Rooms and topics overlapped and were difficult to distinguish.)

## Posts and editor

A post is long-form text with inline images. Comments are a flat list, oldest first. A reply to one comment quotes it. A long thread opens at its newest comments, with Load earlier comments above them, as a chat does.

- Home's post editor offers Home and open rooms with posts enabled. Choosing a destination keeps Home and its community chat open. Private posting starts inside the private room. A draft keeps its destination across reloads. Changing the destination keeps its text. A successful post clears the draft and resets the next Home draft to the community. An unavailable destination requires another choice before posting. (Codex, 2026-11-16, implementing Raphael's chosen composer design.)
- The community destination is labelled Home and uses the navigation's house icon. Rooms keep their images or initials. (Raphael, 2026-11-16. Community looked like an extra room that appeared nowhere else.)
- Authors may move a post between Home and open rooms with posts enabled while editing it. Existing posts remain editable if their room becomes chat only. Existing replies stay with the post. Private posts cannot move, and private rooms cannot be destinations. The post keeps its address, creation time and discussion preferences. (Raphael, 2026-11-16. The destination should be editable without exposing private discussions.)
- Home's post editor has a room selector above the text. The selector strip and the room label on published posts have a faint shaded background. (Raphael, 2026-11-16. This makes the destination visible before posting.)
- The author edits a post or comment as a whole, and the post is marked as edited. There is no version history.
- The owner and moderators of a group can pin and unpin its posts. Pinned posts appear first in that group's feed, newest first, with a small pin label. An open-room pin does not move the post to the top of Home. Moving a post to another group clears its pin. Pinning changes neither visibility nor notifications. (Raphael, 2026-11-17. Important posts need to stay at the top of their own posts view.)
- The pin label sits in the post's shaded header. In the room's own feed it says only “Pinned”. Elsewhere it includes the room name. The icon and text are vertically centred. (Raphael, 2026-11-17. The header separates pin status from the author and avoids repeating the current room.)
- Deleting a post deletes its comments and empties their text, because the author asked for the post to go.
- Every post has its own address, which notifications link to.
- Each editor keeps its unsent text in the browser, so a reload or a closed tab does not lose it. This covers new posts, comments and messages, and edits of posts, comments and messages. Sending, saving an edit or cancelling an edit deletes the draft. Safari will clear saved drafts after seven days without a visit unless the app is installed, and this is accepted.
- A draft belongs to the signed-in user. Signing out, by any means, deletes every draft in the browser, so a shared computer keeps none. A draft not changed for 30 days is deleted. A message's attached images, an image still uploading and the message being replied to are not kept. Raphael left these details to Claude (2026-11-10), and they are open to change.
- The @ list offers only the members of the current group.
- Chat places its tools toggle, text field and Send button in one bottom-aligned row. The field grows upward. The toggle opens formatting and attachments above the row. Reply previews and attached images also appear above it. All editors share their editing behaviour and controls. (Raphael, 2026-11-16. Controls below the field were difficult to reach with the phone keyboard open.)
- Links are added and edited in a small panel from the editor's Link button or Cmd+K, in place of the browser's prompt box. Like the emoji picker, the panel never covers the text being written. An address without https:// gets it.
- On a device with a mouse or trackpad, every composer has an emoji picker. Phones have none, because their keyboards have emoji. The picker shows the device's own emoji, so it loads nothing from another site.

### Body format

The editor is TipTap. **The body is the HTML that TipTap produces.** The server sanitises it and stores it once. Every kind of body uses this one format.

- HTML was chosen over ProseMirror JSON after two debates. The schema causes lock-in, not the storage format. HTML renders in any browser and imports into any editor. JSON means nothing without the exact editor extensions. The question should be reopened only for collaborative editing.
- One bluemonday policy checks every body. The policy is the schema. Nothing is trusted before the policy, and everything after it is trusted.
- Bios, the rules and the welcome message use the same policy without images and preview cards. They hold text, bold and italic, links, mentions and emoji. Images in them were never shown to other members.
- The server derives mentions and search text from the sanitised body. The client never sends them, because derived data that the client controls can disagree with the body.
- Saving an unchanged body returns the same bytes. Editor upgrades are deliberate, and a test checks that the bytes stay the same.

### How a post is drawn

Raphael chose the layout from three drawings (2026-11-06). An open thread sits on a warm grey panel inside the card, with a white reply box. The panel shows where the post ends, and the white box shows where to type. A post's menu shows only on hover or focus on a device with a pointer, and always on a touch screen, because users cannot discover a long press. A chat message's and a comment's actions are in a small toolbar that floats over the item's top right corner. It holds Add reaction, Reply for a message, and a menu with the rest. It opens on hover or keyboard focus on a device with a pointer, and on a tap on a touch screen, so a chat on a phone shows no column of icons. A tap on a link or an image opens it, so on a touch screen pressing and holding a link or an image opens the toolbar instead. On a touch screen the toolbar's buttons are large enough for a finger, and the toolbar normally sits above the item. It moves below when there is no room above, and stays inside the visible pane even when an item is taller than the pane. The toolbar is plain icons in a small bubble, after Discord's.

## Chat

A message uses part of the same schema and passes the same policy. Chat history is kept forever.

- A reply quotes the original and stays in the flat list. Threads were rejected, because they would make a chat into a second feed.
- The author or the group's staff may delete a message. Only the author can edit it, with no time limit, while they still belong to the group. The shared editor opens inline with Save and Cancel. An edit updates live without changing the message's position, reactions or notifications. There is no version history. (Raphael, 2026-11-17. Authors need to correct their messages.)
- A reply keeps the text it quoted even if the original message is edited. Deleting the original clears its quoted text from replies.
- The chat shows a line when someone joins the community or is added to a room. A line is stored as a message, so it keeps its order. Notifying a whole room of each addition was rejected, because a room of twenty would get twenty notifications.
- Consecutive messages from one person share a name and picture when the gap between messages is at most fifteen minutes. A different speaker, a membership notice or a new calendar day starts a new group. This keeps short pauses from repeating the same header.
- Calendar days are separated by quiet date dividers with text between thin lines. These are distinct from membership notices. A message group shows its first message’s time beside the author, without a time on every message.
- There is no offline posting. When the device is offline, the bar at the top of the view shows an Offline badge and sending is disabled. Connecting and reconnecting show nothing. A failed send keeps its text.

## Reactions

A member reacts to a post, a comment or a chat message with an emoji. Each emoji shows under the item with the number of people who chose it. A reaction answers without adding a comment or a message.

- Any emoji can be a reaction. The picker opens as a row of six emoji, with a button that opens the full picker. The row starts with the emoji the member reacts with most, and common emoji fill the rest. The server counts these. Opening the picker refreshes the row, so it includes reactions made on other devices. A post has Add reaction in the row with its comments button, after its reactions. A comment and a message have it in their toolbar.
- A member may add several different emoji to one item. Each emoji is a toggle, so choosing it again removes it.
- An item holds at most 20 different emoji. A plain limit keeps an item's reactions to a short row.
- Hovering an emoji lists the people who chose it, and so does pressing and holding it on a touch screen. Their names are the current names, because a reaction refers to the user's id.
- A reaction notifies nobody. This keeps the first version simple, and a notification can be added later.
- Reactions follow the visibility of their item. Deleting an item deletes its reactions, and removing a user deletes theirs. Saved events containing their reactions are removed too, including snapshots taken before a reaction was withdrawn. Chat lines take no reactions.
- Touch screens get the reaction picker too, although they have no picker in composers. A reaction needs a picker, because there is no text field to type an emoji into.

## Images

- Storage has two drivers. A local directory is the default, so a first install needs no bucket. An S3-compatible bucket is used when configured.
- An image's address is a path on the instance, so storage can move without changing posts.
- The server accepts JPEG, PNG, WebP and GIF, detected from the content. HEIC is not decoded, because Go would need C libraries. The upload control asks for JPEG first, so iPhones convert HEIC photos.
- Only posts, comments and chat messages show images in their text.
- The browser converts every image before uploading it, whatever its size, except a GIF, which may be animated. It draws the image upright, in standard colour, at no more than the server's largest size. A photo becomes a JPEG. Any other image becomes a PNG, which keeps transparency. Images are converted one at a time, so a phone does not decode every photo at once. An animated WebP or PNG becomes a still image.
- The server still checks every upload, turns it upright and strips its metadata, animated GIFs included, because a client can send anything. A transparent image is stored as PNG. A JPEG stays a JPEG. Any other opaque image is stored as whichever of PNG and JPEG is smaller, so a screenshot keeps sharp text. Go cannot encode WebP.
- The server refuses an image of more than 4 million pixels, the area of a 2000 by 2000 image, read from its header before any pixel is decoded. Decoding takes memory in proportion to the pixels, and a small file can have many: a 454 KB JPEG once took 642 MB. The browser never sends a larger image, and a link preview's larger picture is not kept. The worst file of that area takes about 130 MB to decode, so a community needs 256 MB of memory. The server processes one image at a time and fetches one preview picture at a time. An upload is kept on disk while it arrives, so a slow or large upload holds no memory. The server sets its memory limit from its container's.
- An image shows in the editor as soon as it is chosen, and its card shows its upload. If the upload fails, the card shows the failure and Try again in place of the alt text field, and a line under the editor counts the failed images. A post or message cannot be sent until every upload has finished.
- An upload fails when nothing has been sent for 30 seconds, or no answer comes a minute after the last byte. A lost connection would otherwise block the post.
- An image is served only to its uploader or to someone who can see content that shows it. No image leaves the app, so there are no signed URLs.
- The server records which images each post, comment and message shows when it is saved. An image's id written as text gives no access. Before, any body that contained the id counted, so a member could make a private room's image visible to the whole community by posting its id.
- A post, comment or message may show only images its writer uploaded or can already see. Any other image, including one deleted while a draft was open, is refused with a message to remove it.
- A profile picture or a room picture must be an image that the person setting it uploaded. Every signed-in user can see a profile picture, so any other image would let a member show an image from a private room or a conversation to the whole community.
- If a room picture cannot load, its initial is shown. If a profile picture cannot load, the default profile picture is shown. (Codex, 2026-11-16. Failed pictures must not leave blank tiles or broken images.)
- An image that nothing uses is deleted once it is a day old. The picture of a deleted room counts as unused. The cleanup never stops at a failure, and tries the image again on its next run.
- Single images keep their proportions and have a height limit equal to the maximum post width. A square image can fill the post’s content width. Smaller images are not enlarged. Chat images and galleries are at most 360px wide and fit narrower columns. (Raphael, 2026-11-16. The previous height limit left large square photos narrower than the post.)
- Adjacent images are shown as a gallery. The stored HTML stays a plain run of images.
- Clicking an image in a post, comment or message opens it alone, full screen, with nothing else. Escape, the close button, a click beside it or pulling down on a phone closes it.
- Images load only when they come near the screen. Each image is stored at one size.

A storage quota per instance is planned.

### Embeds

A link on its own line becomes a preview card, as in WhatsApp and Signal. The card shows the page's picture, title and description, taken from the page's OpenGraph tags, and the page's domain. The domain is shown instead of a name the page gives itself, so a card shows where its link really goes. Clicking it opens the page in a new tab. The card's shape follows old Sweet's link preview, which Raphael chose: a picture on the left, then the title, a short description and the domain, at a fixed height. The picture area is 1.91 times as wide as it is tall, the shape of the pictures most pages give, so those are not cropped. Old Sweet's was square.

- Previews appear in posts, comments and chat, not in bios, the rules or the welcome message. There is no button for them.
- In a post or a comment, pressing Enter after a link on its own line turns it into a card. A link on the last line is turned into a card when the post is saved, without the author seeing it happen. The editor shows "Embedded link" above a card, with "Turn back into regular link", and a link turned back stays a link when the post is saved again.
- In chat, a link on its own line becomes a card when the message is sent. An author editing the message can turn the card back into a regular link.
- A page that gives no title, or cannot be fetched, stays a plain link.
- The server fetches the page and keeps a copy of its picture, so readers' browsers never contact the other site. The fetcher refuses internal addresses. A preview is fetched once for each address and kept while a post, comment or message shows it as a card. The server records which cards each body shows when it is saved.
- Every member can see a preview's picture, because it comes from a public page.
- The card data is the server's, not the body's. The body holds only the link and a mark that it is a card, so a client cannot invent a preview.
- Videos get the same card for now. A player that loads only when clicked was planned, and Raphael deferred it (2026-11-10).

## Accounts

An account has a username and an email address. A password is optional, and the usual way to sign in is by email.

- Signing in emails a link and a six-digit code. Either one works.
- The code works only in the browser that asked for it. Otherwise a person could request a code for someone else's address and guess it.
- The link opens a page where a button completes the sign-in, because email scanners open links.
- The code exists because an iPhone's home-screen app does not share cookies with Safari.
- There are no reset pages. A user who forgets a password signs in by email.
- Changing a password needs no current password, because email can always sign in. Each change ends the other sessions and emails a notice.
- A new email address is confirmed by a link sent to it (2026-11-08). The old address gets a notice.
- Confirming a new address invalidates all outstanding sign-in links and codes for the account. Existing sessions stay signed in. Confirmation and invalidation succeed together. Changing back to an earlier address must not make its old links usable again.
- A user changes their username on Settings, as often as they like. Content refers to the user's id, so the name beside posts, comments and messages, and the name in a mention, show the new name. Text copies made when content is saved, such as a chat reply's quote and search results, keep the name as it was written.
- The old name is free for anyone at once. Links using that name stop finding the account and lead to another person if they take the name. An open profile page follows the original account to its new address. It never switches to a different account. Holding old names back was rejected, because a community is small and joins by invitation, and staff can deal with impersonation.
- The server never reveals whether an address has an account. It emails the account's owner about the attempt instead.

Sessions are stored in the database and last 180 days, extended while used. The web app holds the session in an httpOnly cookie. The server also accepts the session id in a header, for a future store app. Sign out everywhere ends every session. It replaces a list of sessions, because the real cases are a lost phone and a compromised account.

### Profiles

A profile shows a user's picture, name, role and bio. Every profile is visible to every user. It lists the user's posts from the groups the viewer belongs to, and no chat messages. A name beside content opens a preview card.

The account row in the nav opens the user's own profile, and Settings is reached from there. The place to change a picture is then the place where it is shown.

### Joining

Registration is by invitation only, so no bot protection is needed. An approval mode is planned.

- An invite link works for anyone for seven days. A group of people joins together, and one link per person would not bring them.
- The join page shows the rules, and its button reads Agree and join.
- No session exists until the first sign-in email is used, because otherwise verification would be optional.
- Only the browser or app that created an account may correct its email address before verification. This permission lasts 15 minutes from registration. Requesting another sign-in email does not grant or extend it. A verification link still works in another browser. This prevents someone from claiming a pending account by requesting a sign-in email.

## New-instance lifecycle

1. **Provision.** A hosting tool outside the binary creates and starts the instance.
2. **Setup.** When there is no owner, the binary prints a one-time setup link. Its page creates the owner's account without a password, because a password is always the secondary way in. The owner's address counts as verified without an email, because the holder of the link controls the server and email may not be set up.
3. **Onboarding.** The welcome page asks for the name, the purpose and who may create rooms. It then offers an invite link.

Setup and onboarding are in the binary, so self-hosters get the same flow as hosted communities.

### The welcome dialog and the tour

A welcome dialog opens on a user's first visit to Home. It shows the welcome message under the owner's name and offers a tour. The server records that the user was welcomed, so other devices do not show it again.

The tour is a series of cards that point at parts of the page. Each card appears only where its subject applies to the user. The owner's tour ends with writing the welcome message. The tour uses React Joyride, because it lets the cards use Sweet's own components. Driver.js was rejected, because it draws its own card.

## Visibility rules

A signed-in user who has not been removed sees content if they belong to its group. Staff get no extra access to groups. An eligible staff member can see the copy kept with a report without joining its group. This gives no access to other content in that group.

- A non-member gets "not found" for anything in a group, never "forbidden".
- The event stream follows the same rule, including for deletion events (2026-11-08).
- The rules and the welcome message need a session. The join page shows the rules to someone with an invite.
- The release number is shown only to signed-in users, so scanners cannot read it.

One function decides visibility. List queries apply the same rule in SQL, and a test checks that both agree for every kind of viewer and thing. No query may bypass the rule for speed until a test proves that it gives the same answer.

## Permissions

One package on the server holds every rule about who may do what. Each rule takes the actor's role in the object's group.

Room and staff actions use the current permissions when the change is saved. The permission check and the change happen in one transaction. A request that started earlier keeps no permission after membership is removed or a role changes. The server reads the request body before opening the transaction, so a slow request does not block other writes.

- An author edits their own posts, comments and messages and deletes their own content. A post's author may also delete comments on it.
- A group's owner and moderators may delete content in it. They cannot edit another author's content. They add and remove private room members.
- Only a group's owner sets roles, hands over ownership, renames the group, chooses its mode or deletes it. Two-person conversations always have chat only.
- Only the community's owner changes the community's name and who may create rooms. The owner and moderators manage invites, rules, the welcome message and reports.
- Staff remove users below their own role. Any user may remove themselves. Nobody can remove the owner.

**The web app holds no permission rules.** Everything the server sends carries flags that say what the viewer may do. Copying the rules into TypeScript was rejected, because two copies of a rule come to disagree.

## Removing a user

Raphael decided on 2026-11-08 that "a deleted user's posts should actually just go". A removed user's posts, comments and messages are deleted, and their text is cleared.

- The account row stays under a "removed-" name, so records that name it stay valid.
- Their password, picture, bio, sessions and push subscriptions are deleted.
- Their current and pending email addresses, verification date and last digest date are erased. This also applies to accounts already removed. Keeping references to an account does not require its email details. A new account may use either address with an invitation.
- Rooms they owned pass to new owners by seniority.
- Open reports about their content are closed.

Removal has no options. A choice to keep, anonymise or delete the content was dropped, because one rule gives moderators less to weigh.

## Reports

Any member can report another person's post, comment or message.

- The dialog says that the author will not learn who reported.
- Reporter identities are hidden from all staff in Sweet. Staff judge the content and the reasons without receiving the reporter's identity. The server keeps the account reference to prevent duplicate reports. This does not hide identities from someone with database access or prevent a report's text or context from identifying its writer.
- The reported author receives no report details or notifications and cannot resolve the report, even if they are staff. If no other staff member can act, the report stays pending until another moderator is appointed.
- The server keeps a copy of the item, so moderators can judge it after an edit or a deletion. Closing the report empties the copy.
- Eligible staff get a notification, which is also pushed. Neither identifies the reporter.
- The Reports card is first on the Community page, because reports wait for action. Members cannot see reports.
- Open never appears for a conversation, because a conversation belongs to its two people. Delete works anywhere.
- Dismissing or deleting closes the item's reports for every moderator.

Three details were decided while building and remain open to change. They are one entry per item, closing a report for every moderator, and the card's first place.

## Notifications

Unread dots show where unread content exists. The Notifications page records activity relevant to the user. Device notifications alert the user outside Sweet. These have separate controls, but device delivery uses the same notification records.

- Posting or commenting follows that discussion. Anyone who can see a post may follow it or mute it. Muting stops notifications about that post, including mentions. Commenting again does not undo an explicit mute.
- Room chat and private conversation messages create notifications. Each chat or post discussion has one entry, read or unread. Further activity updates that entry, makes it unread, moves it to the top and can send another device alert. The entry counts the updates since it was last read.
- A user is also notified of a mention or being added to a private room. Previous topic notifications still open their original posts. The owner and moderators receive new-member notifications. Eligible staff receive report notifications without the reporter's identity.
- Nobody receives notifications of their own actions. One action never notifies the same person twice. A mention takes precedence over a reply or an ordinary message or comment. An explicit post mute or room alert setting of Off also suppresses mentions.
- Reading a discussion marks its notifications read through the content reached. Opening one notification marks that version read. Viewing the Notifications page marks nothing read.
- Mark all read keeps notification history. Clear all removes read and unread notifications. Neither action marks the underlying content read.
- Read positions and notification preferences are stored on the server and follow the user across devices. Read positions only move forward.
- Reading open-room posts on Home clears their room feed indicators through the same time. Reading them in their room also clears them from Home’s unread indicator. Chat read positions remain separate. (Codex, 2026-11-16. Reading the same posts in two views should not be required.)
- Indicators are dots rather than counts.
- A post's comments button shows a dot while the comments are closed and other users have commented since the user last read them. A post has a read position once the user has written it or opened its comments. A post the user has neither written nor opened shows no dot, so posts the user skipped never show one. Muting a discussion stops notifications but keeps its unread-comment dot. (Raphael, 2026-11-16. Dots should show unread activity independently of notification choices.) Posts written before the dot existed got a read position for their author at that upgrade, so later comments on them show the dot and earlier ones do not. The dot appears only on the button. A room's feed indicator means new posts. Comments retain their own indicators because they can belong to a post far down the feed.
- Rooms show sidebar dots for unread posts or chat, even with notifications Off. Discussion comments retain their own dots. (Raphael, 2026-11-16. Dots indicate unread content independently of alert preferences.)
- Notification settings are available in Settings and below the notification list. The post’s existing menu offers one action. Follow discussion appears when not following, and Mute discussion appears when following. The community chat and each room chat have a quiet notification menu inside the chat. The menu marks the current choice. Chat has no extra heading inside its pane. Room settings also offer the same notification choice when chat is hidden. (Raphael, 2026-11-16. The shared header already identifies the location.)

**Chat notifications** offer All messages, Mentions and replies, or Off. The choice governs new entries in Notifications and eligibility for device alerts. Off suppresses chat mentions too. Changing the choice keeps existing notification history and unread content dots. Home chat defaults to All messages for everyone. New room preferences default to Mentions and replies. Existing preferences are preserved during the upgrade. (Raphael, 2026-11-16. Chat choices should govern the notification list too. Home chat should start with all notifications.)

**Device notifications** require permission on each device. Account preferences separately control device alerts for comments, mentions and replies, and private conversations. These delivery settings do not hide entries in Notifications or unread content dots.

A device alert holds the community name, the actor's username where appropriate, an action and a link. It contains no message or post text. Current access and preferences are checked before delivery. A device showing the relevant discussion suppresses alerts only for activity it has reached. Repeated alerts for one discussion replace the device's existing alert.

**The weekly digest** goes to people who have not visited for seven days (2026-11-08). It was built before push, because it brings back people who have stopped visiting. It holds only counts, with no content and no images. One click turns it off.

## Email

Sweet sends sign-in links, address confirmations, security notices and the weekly digest. Email is sent over plain SMTP, so any provider works and no vendor is named in the code. Every email uses one template with the community's name, a heading, a few lines and at most one link. Bounce tracking was rejected, because it would tie the code to a provider. The user can resend an email or correct the address instead.

## Search

Search covers the posts, comments and chat messages that the searcher can see.

- Database triggers keep the index in step with the content, so the two cannot disagree.
- A word matches inside longer words, so "armalade" finds "marmalade". Raphael accepted the larger index that this needs.
- Results are ranked by relevance, not by date. At most fifty are returned, because nobody reads more.
- The query is part of the page's address, so a search can be shared.
- A query is at most 200 characters, which holds a pasted sentence. A longer query would become thousands of search terms.
- The search box has no button, because a field with a button looked like a form.

## Realtime

The server sends updates over server-sent events (SSE), and the client sends ordinary HTTP requests. Both are plain HTTP, so cookies and proxies work, and the browser reconnects on its own. Each client has one stream. WebSockets should be reconsidered only for presence or typing indicators.

- **Permissions are checked before each event.** Live delivery and replay use the viewer’s current membership and role. A connection keeps no separate permission state because permissions can change while it is open. Deleting a room sends each former member their own removal notice.
- **The database is the replay buffer.** Events carry sequence numbers in commit order. A reconnecting client sends its last number, and the server replays later events from the database. Live delivery reads from the same log in sequence. Concurrent writes and slow connections do not depend on an in-memory event queue.
- **The log keeps only each resource's newest event, for one day**. A full log let members replay deleted content.
- **Each resource has two kinds of event.** One carries its current state. The other announces its deletion.
- **Each resource has one builder.** A handler that writes reads the row back and passes it to the builder. A test checks that the response and the event equal a fresh fetch.
- **Phones drop connections without warning.** A heartbeat detects this. The client reconnects when the page becomes visible, and it resyncs every time.
- **A stream ends with its session**. The stream checks the session before each event and at each heartbeat. When the session has ended, by signing out anywhere, a password change, removal or expiry, the stream tells the page and closes, and the page signs out.
- **Open tabs reload when the server's version changes.** The web app is embedded in the binary, so only tabs that were already open can run an older version.

One cache in the web app holds all server data. Events are its write path, and a reconnect refetches everything. The server supplies current names and pictures with content. When a user changes their name or picture, open views refetch in place so unfinished work survives. Closed views clear their identity data and fetch when opened. Failed or paused refreshes clear their data. Account removal clears identity data immediately. An unresolved mention shows no historical name or profile link.

Comment and unread counts come from the server. The client refreshes them when content changes. It waits for confirmation before showing an item as read. Repeated updates must not change a count.

## Interface

**One shape per concept.** A place is a tile or a picture. A feature is a line icon. A person is a profile picture. A notice is always the same alert box. Being offline is a red badge in the bar.

- Timestamps use the viewer's local timezone and clock format throughout Sweet. Today shows the time. Yesterday shows Yesterday and the time. Other days show the date and time. Posts and membership details show only the date. Hovering a date shows the full date and time. Chat puts the day in a divider and the first message’s time beside the author of each message group. Edited posts and comments show only “edited”. A message shows “Edited” only inside its three-dot menu. This keeps dates consistent without repeating them on every message.

### Buttons

There are four kinds of button (2026-11-08).

- **Primary** is the main action. At most one shows on a surface. A disabled primary is faded red, not grey, so the main action stays recognisable.
- **Secondary** is any other action that changes something.
- **Ghost** is a quiet action, such as a toggle or Cancel.
- **Danger** removes something. It has a red border and an icon.

A toggle shows its state, and hovering shows its action. Following is the state, and Unfollow appears on hover. A label is a verb, with an object when needed.

### Patterns

- Buttons in a row go from the least to the most consequential, left to right. A destructive action never shares a row with a primary.
- A form ends with Cancel and then the primary, at the right.
- Destructive actions sit in the last card of a page.
- A list row shows its common action, and its other actions are in a menu.
- Every removal asks for confirmation, except revoking an invite link, which is easy to replace.
- An empty state is one sentence and one button that fills the place.
- Text under a card's heading is small and grey.

### The shield

A grey shield marks what a person sees or can do only as an owner or moderator. Without it, a moderator could not tell their extra controls from everyone's. Raphael chose the shield over a role badge and over the role in the label. A room's own settings are not marked, because its creator knows the room is theirs. The server says when an action depends on a role.

### Colours and modes

Sweet keeps old Sweet's red on a dotted background. Every pair of colours meets the contrast guidelines. Pink is never behind text.

Sweet follows the device's light or dark setting, unless the user chooses one. The choice is kept per device, because a phone at night and a laptop by day can need different modes. Dark mode keeps the contrast rules.

## Layout

On a desktop the nav column is on the left. Posts and chat sit side by side with a draggable divider. A pane dragged past the edge collapses. A closed pane stays loaded, so unsent text is kept.

On a phone, one pane shows at a time. A tab bar at the bottom holds Home, Search, Notifications and Menu.

On a phone the space beside cards and inside them is smaller than on a desktop, so posts and comments have more width for text. Cards keep their borders and the dotted background around them, because the cards on dotted paper are Sweet's look.

**Every view has a top bar** that names it and holds its controls. On a phone the switch between posts and chat is in that bar. Posts and chat are two views of one group. When they were bottom tabs, a room's chat could not be told apart from Home's chat.

**Every page has an address**, so the back button, a reload and links all work.

### The nav

The nav has three blocks (2026-11-05).

1. **Places.** This block holds Home, Rooms and Conversations. Saved rooms are listed alphabetically. Browse Rooms remains available even with no saved rooms. Conversations lists the five with the latest messages.
2. **Tools.** This block holds Search and Notifications.
3. **The community and the user.** This block holds People, the Community page and the account row.

Browse Rooms uses a compass icon. Its All filter has no icon. (Codex, 2026-11-16, following Raphael's review. Reusing Search and Menu icons made the actions unclear.)

Conversations accumulate, so their list has a stated limit and not a hidden rule like Slack's. A messenger layout with a column of conversations was rejected, because it would draw chat in a second way.

Navigation labels align across room tiles, profile pictures and feature icons. (Raphael, 2026-11-16. Different mark sizes had shifted the labels.)

Privacy marks align at the right of navigation rows. A truncated name is shown in full on hover or keyboard focus. (Codex, 2026-11-16, following Raphael's review. Short and long names must keep the same alignment and remain readable.)

## Mobile

There is no separate mobile app, and there must never be a second codebase. The web app is a progressive web app (PWA), and the PWA is the phone app.

- iPhones allow web push only for apps on the home screen. Home therefore offers installation on touch screens.
- A store app may come later. It would wrap the same build with Capacitor. Bubblewrap was rejected, because it supports only Android.
- A store app cannot use the cookie session, because iOS blocks cross-site cookies. It will send the session id in a header instead. Sessions do not depend on how the id arrives, so this needs no redesign.

## Data

- Rows have UUIDv7 ids, so two instances could be merged without renumbering any references.
- Times are stored in UTC. The browser converts them for display.
- Lists are paged by cursor, never by offset.
- A deleted post, comment, message or room keeps its row, and its text is emptied. The row stays so that the replies, notifications and reports that point at it stay valid. The text has no use once it is deleted.
- Deleting a room empties its name and everything in it, and deletes its memberships, read markers and notifications.
- SQLite and the search index overwrite deleted text, so it does not stay in the database file.
- Content deleted before this rule keeps its text, because old content is not changed.
- A migration never changes user content: posts, comments, messages, bios, the rules and the welcome message stay as their authors saved them.

## Running an instance

Every setting is an environment variable, read from one file. A TOML file was rejected, because it would be a second place for the same settings. The binary provides a health check, structured logs and an optional error hook, and nothing more. A server error tells the user only that something failed (2026-11-08).

### Updates and releases

- Migrations are embedded and run forward only at start. A copy of the database made before they run is the upgrade backup.
- An upgrade runs all of its migrations in one transaction. When one fails, none of them stays, so the release before still runs on the database. Before this, the migrations before the failing one stayed, the earlier release refused the database, and each restart replaced the upgrade backup with that half-upgraded state.
- The binary refuses a database from a newer release.
- A release is a git tag vMAJOR.MINOR.PATCH. A major release needs operators to act. A minor release adds behaviour or features that users will notice. A patch release fixes bugs, including security and privacy problems, or makes internal improvements. Corrective fixes may change behaviour users notice. The size of the code change does not determine the version.
- The release process runs all checks before creating a release. A failed check or a change to the checkout stops the release, so the version published is the version that passed.
- Each release publishes an image tagged with its exact and major versions. Docker has no "this version or later" pin, so the major tag moves with each release. An updater pinned to 1 then gets every 1.x release and never 2.0. Within one major version every image runs all migrations in order, so this is safe.
- An operator rolls back by pinning an earlier version. If a successful upgrade changed the database, the operator must also restore the copy made before that upgrade. Earlier releases refuse a database they do not understand.

### Backups

Litestream runs in the binary's container and supervises the binary, so the two cannot use different database files. It streams every change to a bucket.

- Restores are exact for the last few minutes and accurate to five minutes before that.
- Hourly snapshots are kept for 30 days. Deleted text stays in the backups until it is older than that, and this is accepted.
- One bucket holds the images and the database, and configuring it turns on both.
- The database must be on a local disk.
- A restore is checked before it replaces the current database. The server and replication must be stopped. A failed download or invalid backup leaves the current database unchanged. The previous database is kept separately after replacement. Recovery must not discard the remaining local data before a replacement is ready.
- Restoring the database does not recover image files already deleted from storage.

### Hosting many communities

Each hosted community is its own process with its own database. A hosting tool outside the binary creates and removes communities, so hosted and self-hosted communities run the same software. A planned admin API will be the tool's only access.

Several communities can share one bucket, each in its own folder. They then share one key, so each community's server can read and change the others' images and backups. A separate bucket or key for each community keeps them apart.

Data export and custom domains are also planned. Import will be built before export, because import tests the export.

## Admin tools

The Community page holds what the staff manage. A page about the community did not belong behind the owner's profile. Its cards are Reports, About this community, Welcome message and Rules. Each card shows only to those who may use it. The People page holds roles, removals and invite links.

An approval queue and a list of posts with no reply are planned. Nothing more elaborate will be built until a community asks for it.

## Security

These decisions came from a security audit (2026-11-08).

- A content security policy allows only the instance's own origin. The sanitiser remains the main defence.
- Wrong invite codes are rate-limited per client address, as wrong passwords already were.
- Behind proxies, the operator states how many proxies there are. The client address is read that many entries from the right, because a visitor can forge only the entries on the left.
- Images that are too large are refused before decoding.
- Push goes only to the known push services, so a member cannot make the server send requests to any host.
- One account can have at most 20 event streams open at once, one for each tab and device. A new stream beyond that ends the account's oldest stream. A phone that the system stops in the background can leave its stream open on the server for many minutes, so the oldest stream is the likeliest to be dead. A live tab whose stream ends reconnects without missing events.
- The server never lists a directory of the app's files.

## Record

- **New room default (Raphael, 2026-11-18).** New open and private rooms default to posts only instead of posts and chat. Organising posts should not create another chat unless the creator chooses one. Share in chat will offer Home first to encourage shared conversation.

- **Room modes restored (Raphael, 2026-11-17).** Room owners can choose posts only, chat only or both. This reverses the removal of room modes during the open-room change. Personal pane controls did not replace a room-wide choice. Existing content is preserved when a mode changes.

- **Chat image width (Raphael, 2026-11-16).** Chat images and galleries are limited to 360px wide. They previously used the same width as posts, which made them too large in chat. Posts and comments keep their existing image sizing.

### Reversed

- **Existing room visibility (Raphael, 2026-11-17).** Rooms that predate the open/private distinction become open during upgrade. The previous migration kept them private. Newly created private rooms and conversations remain private.

- **Message edit labels (Raphael, 2026-11-17).** The edit status appears only inside the message’s three-dot menu. The label under each edited message was too noisy.

- **Chat editing (Raphael, 2026-11-17).** Authors can now edit their sent messages to correct them. Previously sent messages could only be deleted. Existing reply quotes keep their original text, and edits do not send notifications.

- **Room shortcuts and chat notifications (Raphael, 2026-11-16).** Open rooms no longer appear automatically in everyone's sidebar. A filled star identifies a saved shortcut. Add to sidebar and Remove from sidebar affect navigation only. Chat notification choices now govern the notification list as well as device alerts. Home chat starts with All messages. Room dots continue to show unread posts and chat independently of notification choices. Muting a discussion no longer hides its unread-comment dot.

- **Room privacy labels (Raphael, 2026-11-16).** One lock beside a private room's name replaces the second header line and repeated privacy explanations. The new room form defaults to Open and lets people select private room members before creating it.

- **Rooms and topics (Raphael, 2026-11-16).** Rooms can be open to the community or private to invited members. Both have posts and chat. Home includes open-room posts and keeps community chat separate. Topics are removed because they duplicated the organisation provided by rooms. Existing rooms stay private and existing posts stay in their original location. Room modes no longer remove either capability. People may collapse either pane for themselves.

- **One notification per discussion.** A discussion now has one entry, and new activity makes it unread again. Before, it had at most one unread entry, and activity after reading created a new one. A user reading a chat as messages arrived got one entry for every message. Entries made before the change stay as they were, until the user clears them.

- **Actions on touch screens.** A tap on a chat message or a comment now opens its actions in a floating toolbar, as hover does with a pointer. Touch screens showed the menu and Reply button of every message, which cluttered the chat. A tap is not a long press, so the reason for always showing them does not apply. A post's menu still shows on touch screens.

- **Patch releases.** Patch releases may include noticeable corrections to security, privacy and other bugs. The earlier rule excluded all noticeable changes and would classify corrective fixes as new features.

- **Database recovery.** A restore no longer deletes the current database before fetching its replacement. A failed download previously removed the local recovery option. Rollback now explicitly requires the upgrade backup when the database changed.

- **Counts in the browser.** The client no longer adds or subtracts comment and unread counts locally. Repeated updates and partially loaded lists made those counts incorrect. Read requests no longer clear unread indicators before the server confirms them.

- **Identity updates in the browser.** Manual identity updates missed some copies of names and pictures. Clearing every view on each change then lost unfinished work. Open views now refetch in place after a name or picture changes. Account removal and failed refreshes still clear identity data.

- **Email details after removal.** Removed accounts no longer retain their email addresses or email metadata. Retaining them kept removed accounts identifiable and blocked new registration with the same address. Existing removed accounts are included in the cleanup.

- **Sign-in links after an address change.** Address confirmation now invalidates outstanding sign-in links and codes. Checking the current address alone allowed an old link to work again if the account changed back to that address.

- **Reporter identities.** Reports and report notifications no longer identify the reporter to staff. Reported authors cannot see or resolve reports about their content. The previous behaviour exposed reporters to staff authors despite the confidentiality promise.

- **Stream permissions.** Streams no longer keep their own copy of memberships and roles. They read current permissions before each event. A missed removal or demotion could otherwise disclose private content.

- **Address correction after joining.** Requesting a sign-in email no longer grants permission to change an unverified address. Only the browser or app that created the account has that permission for 15 minutes. A review showed that the earlier rule let an unrelated browser claim a pending account.

- **Body format.** TipTap JSON became sanitised HTML. The JSON design assumed that Go had no good HTML sanitiser, which was false.
- **Event kinds.** One kind per action became two per resource, because the kinds kept multiplying.
- **Payloads.** Handlers built their own responses until three payloads in two days lacked a field. One builder per resource now does it.
- **Event cursor.** A UUIDv7 cursor briefly replaced the integer sequence. The sequence came back, because the order of ids is not the commit order.
- **Client permissions.** Rules copied by hand became server flags, because only the server's copy is enforced.
- **Private spaces.** Everyone once saw everything. Private rooms now exist, because a moderation room and a private message cannot be on the main feed.
- **Direct messages.** DMs were cut, then became two-person groups, because private groups made them the same object.
- **Conversation members.** Changing sets of people became fixed pairs. Changing sets turned conversations into rooms without names.
- **Topics.** Every post first had one topic, with a default. The default put a pill on every post, so a post now has at most one topic.
- **Copy.** Copy that described the software became copy that explains Sweet's terms.
- **Primary colour.** Pink with white text failed the contrast guideline, so the primary is red.
- **Destructive actions.** They appeared in many places. They now sit in a page's last card, so people know where to look.
- **Credit line.** Home's feed also ended with a line saying who built Sweet. It was removed, because it stood out on a feed with no posts.
- **Deleted text.** Deleted posts, comments, messages and rooms kept their text, and no reason was recorded. Raphael asked why anything was soft-deleted. The rows are now kept only so that the rows that point at them stay valid, and the text is emptied.
- **Stream limit.** A stream beyond the limit was first refused. A review found that streams left open by phones in the background could fill the limit, and a refused tab showed nothing. A new stream now ends the oldest.
- **Connection state.** A notice above the editors showed connecting, reconnecting and offline. It moved the editors each time the connection changed and added noise. Only offline is shown now, as a badge in the bar.

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
- **browser-image-compression for converting images**. It resizes at the browser's low-quality setting. It re-compresses an image that came out larger than the original until it is smaller, and for a PNG it does so by removing colours. It was last updated in 2023. Sweet's own conversion asks the browser for high quality.
- **Estimating each image's decoding memory from its header**. It needed a cost for each format and colour layout, and was wrong in a new case at each review. A limit on pixels and a larger memory limit are simpler.
- **Smaller stored sizes for avatars and room pictures**. A community is small, so the full image is fetched once and cached.

### Deferred

- **Share in chat (Raphael, 2026-11-17).** Sharing a post will place a link in chat and add a comment linking back to that chat message. The menu will offer Home chat first, then the post’s own room chat. Only enabled chats are offered. Private posts can be shared only in their own room. Home posts have only the Home option. This lets people discuss a post in chat without copying the whole discussion into its comments.

- A store app waits until store presence matters.
- Self-serve community creation waits until there are more communities than one person can track.
- Presence and typing indicators wait until chat feels inactive without them.
- Post version history waits until moderation needs it.
- Sorting the feed by latest comment was deferred by Raphael (2026-11-09). It first needs decisions about own comments, deleted comments and the unread dot.
- **Discussion notifications.** Ordinary room messages now create grouped notifications and can alert devices. Authors and commenters follow discussions unless they mute them. Reading content clears its related unread notifications. This replaces the rule that room dots were sufficient and notifications had to be opened individually. Separate delivery controls keep these alerts optional.
