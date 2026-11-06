# Sweet v2 architecture plan/notes

## Stack

Backend: Golang. Frontend: React with Tailwind and Lucide, in old Sweet's colours on its dotted paper. Database: SQLite (no ORM; sqlc for typed queries, run as a Go tool dependency; every query is a named statement in `internal/store/queries`, and handlers never hold SQL strings). The unit is a single Go binary with the React build and migrations embedded: small and portable, what a Debian package wraps, what a self-hoster who hates Docker can run on its own. The distribution artefact is a very simple Docker compose stack around it: the binary, Caddy (a custom build including the Cloudflare DNS module, see Domains), Litestream.

Go was kept over TypeScript end to end (see record). Post bodies are TipTap's HTML, sanitised by bluemonday (see Posts and editor).

## Licence

AGPL-3.0-or-later for the server and the React app. No CLA; contributions under a DCO sign-off. The API client and shared types live in their own directory under MIT so alternative clients can exist. The binary ships a "Source code" footer link by default (configurable, like Mastodon's `source_url`), which satisfies the obligation to offer the frontend's source to the people it is served to; a self-hoster who modifies the software points the link at their fork.

The trade accepted knowingly: without a CLA the project can never be relicensed to source-available. That is the credibility signal this audience wants.

## Shape of an instance

Each instance is one social community with one feed and one chat room.

**Topics** are views on the feed, not sub-groups with their own membership. Each post has exactly one topic, chosen from a short list the moderators curate, with a default so nobody has to choose. A topic is *where* a post goes: you can open a topic to see only its posts, and subscribe to it so new posts reach you through notifications and the digest. Subscription changes what reaches you, not who can see what.

**Tags** are many per post, freeform, typed as `#hashtags` in the body. A tag is *what* a post is about. Tag pages and tag search, no subscription, no curation. (Sweet data: 312 tags were used, and the rituals people remember, #hellosweet, #WhatILikeToRead, #DailyRPGQuest, were all hashtags nobody set up.) Technically a `hashtag` node in the TipTap schema, extracted by the walker into a tags table, like mentions.

Comments on posts are a flat list, not threaded. Replies to a specific comment are a quote-reply, as in chat.

Both live chat and long-form blog-like posts, with inline image uploads and embeds.

### Groups

**To people, a group is a room** (Raphael, 2026-11-05): the nav's Rooms section, New room, Room settings, Leave room, `/r/<id>` and `/rooms/new`; a DM is a conversation. "Room" says what the thing is, a place with a chat in it, where "group" said a set of people. The code, the tables, the API (`/api/groups`) and this document keep `group` as the term for the object, since the root group and a DM are groups too and are never called rooms; the word is changed where a person reads it. (Renaming the identifiers across the schema, the API and both codebases is a separate mechanical job, not done.)

A group is a membership-scoped space with the same shape as the instance: a feed and a chat room, drawn with the same panes and editors. **The instance itself is the root group**, which everyone joins on registration and nobody leaves, so "everyone sees everything by default" is root membership and no query special-cases it. Every post and chat message belongs to exactly one group; comments belong to their post's.

Groups are **private and invisible**: a group, its name, its members and its content exist only for its members. There is no listing and no "ask to join"; people get in by being added. A group that wants to be found is announced by its staff in a public post, and people ask to join in a DM. (Considered and dropped, 2026-11-04: a "listed" setting that shows a group's name to the whole community while keeping its content and members private. Sweet's data is against the shape it would produce, see below, and findability is had for free by posting about the group.) The owner and moderators see only the groups they are members of. A private space is private from the owner too; moderation of one happens when a member reports something, which brings staff in explicitly. This is said on the rules page.

A group has **one setting, its mode**: posts, chat, or both, chosen on creation and changeable by the owner. A DM is chat only, fixed. The root group's mode is the instance's posts and chat feature flags; there is no second mechanism.

**Ownership never lapses.** A group has exactly one owner while it has any members. Ownership moves in two ways only. The owner hands it to another member explicitly, becoming a moderator, and may leave only after doing so. If the owner's membership ends any other way (their account removed from the instance, or deleted), ownership passes by seniority: the longest-serving moderator, else the longest-serving member. Moderators leaving changes nothing. When the last member leaves, the group is deleted. No vote and no takeover: a moderator becomes owner only by the owner's own act, or by being next in line when the owner is gone from the instance entirely, which only root staff can cause and which hands the group to its own longest-serving member, never to the remover. The root group's owner cannot leave and nobody can remove them; if that account is lost, the binary's `-owner` flag appoints one.

Being added to a group puts it in your nav at once, and a new DM on your Messages page (a `membership` event); being added to a room is also a notification to the one added (see Notifications).

**Groups are fractal, one level deep.** A role is a property of a membership, not of a person: every group has one owner and any number of moderators, and the rest are members. The instance's owner and moderators are the root group's owner and moderators; there is no other kind of role. In any group, the owner and moderators delete anything in it and edit nothing of others', the owner and moderators add and remove members (in a DM, any of its people add), the owner alone sets roles and hands over ownership, the owner alone renames the group, sets its mode, or deletes it. A person's role in one group says nothing about another: the instance owner is a plain member of a clubhouse they were added to. Every rule in `perm` takes the actor's role in the thing's group.

Anyone may create a group, unless the instance's first setting, `group_creation` (anyone, or staff), says only the root group's staff may; the creator is its owner. The setting lives in a `settings` table of key and value, edited by the root owner, and shows up as `create_groups` in the root group's `can` flags, so the client learns it the same way it learns everything else. Members may leave any group but the root. No pending-invite state, no requests.

A room may have a **picture** (Raphael, 2026-11-06): an uploaded image, set by the owner from Room settings (`PUT /api/groups/{gid}/picture`, the same `perm.Rename` call as naming it; a conversation has none, since it is its other person), carried on the group and its event, visible to the room's members as a post's images are, kept by the image sweep, and drawn in the tile's place wherever the room is marked. **A post away from its room is headed by the room**, as old Sweet headed a community's post on the home timeline: a strip above the author line with the room's tile or picture and "Posted in <room>", under a hairline. It shows on a person's page and on a post's own page, where posts from different rooms meet; inside the room there is none, since the room is the page. A **DM** is a group of kind `dm`: no name, exactly two members, shown to each by the other's name, created from a person's name ("Message") or from New message and reused if the two already have one. **A conversation is two people** (Raphael, 2026-11-06, on a walk): for more people, make a room. The pair rule is one check on the server (`members` of one other person, or 400) and the data model stays as it was, since a conversation rides on the room's tables and gets chat, markers, events, visibility and hiding without a second path; a pair table would have given messages, markers and the stream filter a second parent. What it removed was a day's worth of edge: the many-person To list, the face pile's count, a conversation's own People page with its stepped-out people, "New conversation with these people and others", and the question of what a set of three becomes when one of them leaves. A conversation has no members page (`/r/<id>/members` sends you back to it): its bar names the other person and holds a three-dot menu with Hide conversation, and no people button. Conversations of three or more from the afternoon before were closed by migration 012. Same tables, same rules, same panes, with the posts pane closed by default. **A conversation is its people; each person's presence is their own** (Raphael, 2026-11-05, evening). Its people are its identity: the set it was opened for, fixed, one conversation per set (`groups.people_key`, the sorted ids, unique among live conversations). Opening the conversation with a person, from New message or from their card, finds the one that exists or makes it, inside one transaction, so two openings cannot make two. Nobody is added to a conversation (`perm.AddMembers` is false for one): a word with someone else is their own conversation, or a room. Presence is a membership's `hidden_at`: null while the conversation is on the person's list, set while they have hidden it. Hiding it (Hide conversation, in the bar's menu, either of its people) takes it off their list and drops what the client holds of it (the reply to Hide is that membership, so their own page lists it under Hidden at once), and is nobody else's business: the others are not told, on the page or on the stream, exactly as archiving a chat tells nobody. The name does not change, because the people did not. Anything said while it is hidden is said in their conversation, and they see it on opening it again, from All messages (Hidden, at the foot) or from a person's card or New message. Nothing is deleted: a conversation everyone has hidden waits. (The first wording, "Leave" and "stepped out", shown to the others, confused the one person who saw it, the same evening: "Leave" promised a removal that cannot happen, and telling the others explained the gap to the wrong people.) Rooms are untouched: leaving a room removes the row, and the last one out deletes it. The test that separates the two: does the thing outlive a change in its people? A clubhouse does, so it is a room; a private word does not, so it is a conversation. (This replaced, the same evening, "a DM grows by its own people": growth in place made a conversation a nameless room, {ABC} minus C was indistinguishable from the pair {AB}, sets recurred as new rooms, and two rooms could hold the same three people. Considered on the way and not taken: rooms only, which loses the address for people and makes a pair's owner hand over to leave; conversations only, which cannot hold a clubhouse.) In the nav it sits in its own Messages section after the rooms, the latest five, drawn as a room is but marked by its people's faces (see Layout). Because a DM is named by its people, every reply and event that carries a group is built in one place on the server (`wireGroup`, or the creation path), so a DM always arrives with its members; a reply without them once showed "Just you" until the next refetch (2026-11-05).

Three needs drove this: a moderation room where staff talk and share screenshots; a small invite-only clubhouse inside a larger house for a subject its members want to keep among themselves; and a private word with one person.

What the Sweet data says about this, from the dump (53 communities, 3,038 posts, March 2019 to October 2021): communities carried 18% of all posts. They had a visibility setting (39 public, 14 private) and a join type (43 open, 10 by approval), with membership requests, bans, mutes, rules and vote-based moderation. By activity in the final six months of the data, 4 of 39 public communities were alive and 0 of 14 private ones; 0 of 10 approval-join communities, whose median membership was 2. The largest private community, of 42 members, posted 22 times and went quiet within five months. So the data does not say "private groups work where public ones did not"; private and approval-join communities did worse. What the data cannot say is whether a group whose content has no other place to go (a moderation room, a DM) behaves like a community that is competing with the feed for ordinary posts; those are functional spaces, used when needed, and "quiet" is not "dead" for them. That distinction is an opinion. The design therefore starts from the functional cases and treats a findable support group as the experiment, not the premise.

The instance's feature flags (posts, chat, images) apply inside groups too.

### Feature flags (per instance)

An instance settings table. Each feature is on or off, set by the owner during onboarding and changeable later: long-form posts, chat, images, embeds, topics, alt text (off / optional / required). The API refuses disabled features; the frontend reads settings at boot and hides them. This is how one product covers a friend group, an interest community and a chat-first group.

### Realtime

SSE for the read side, plain POSTs to the API for sends. Plain HTTP, so cookie auth and proxies just work (Caddy detects `text/event-stream` and flushes immediately; no config). One stream per client, carrying every event type (chat, posts, replies, notifications, version). Not Socket.io; reconsider WebSockets only if we want presence or typing indicators.

Every event carries an `id:` line holding the event log's integer sequence, so the browser's own `Last-Event-ID` reconnect is served straight from SQLite; `?since=<seq>` is the same query on the manual path, and an explicit `since=0` replays from the start, the replay ending with a `: caught up` comment line (browsers ignore comments; the Go tests read up to it); a client that names no sequence has just loaded the page from the API and gets only what happens next. No in-memory replay buffer: SQLite is the buffer.

**One builder per resource, and a write re-reads its row.** A resource takes its wire shape in exactly one function (`internal/api/wire.go`: `wirePost`, `wireComment`, `wireMessage`, `wireMembership`, `wireGroup`, `wireUser`), from the store's row for that resource and nothing else. A handler that writes then reads the row back inside the same transaction and hands it to the builder; the reply and the event are that, never a struct a handler assembled from what it had in hand. List handlers convert their list rows to the single-row type, which the compiler checks field for field. Personalising for a viewer (`can`, `role`) happens once, on the way out, in `forViewer`. The property is tested as a property: for every write, the reply and the viewer's event deep-equal a fresh fetch (`TestRepliesAndEventsMatchTheRow`). This closed a class of three bugs in two days, each a hand-built payload with a field left out (a group without its flags, a DM without its people, a membership without its joined time); the convention had been "events carry the whole thing" with nothing enforcing it.

**Two event kinds per resource, no more.** `post`, `comment`, `message`, `user`, `group` and `membership` each carry the whole resource and mean "this is its current state": create and edit are the same event. `post_delete`, `comment_delete`, `message_delete`, `group_delete`, `membership_delete` carry the ids (the comment's includes its post's; a membership's are the group and the user). `notification_delete` carries `{user_id, before}`: every notification of that person up to that time, an exact set, so one event rather than a row each. `marker` has one kind only, since a marker is upserted, forward only, never deleted. Nothing else. The client cache therefore has exactly one upsert and one delete per resource, and a new feature adds a resource, not a kind. (Reversed from an earlier `post_edit` / `comment_edit`, which were accreting.)

**The stream is per viewer.** The log holds every event once. Each connection runs each event through `CanSee` for its viewer before writing it, and adds the viewer's `can` flags; an event for a group the viewer is not in is never sent. Being added to a group arrives as a `membership` event, on which the client fetches that group; being removed arrives as `membership_delete`, on which the client drops it.

Reconnects are common on mobile (the test is a UK train), and iOS kills background SSE sockets silently: on iOS 18 the `error` event does not fire and `readyState` stays OPEN while the socket is dead, so the browser's auto-reconnect never triggers. Therefore:

- the server sends a `:` heartbeat comment every 15 s; the client treats 30–45 s of silence as a dead connection. The heartbeat write also lets the server detect dead clients and free their goroutines, and keeps the stream alive through Cloudflare's 125 s read timeout if the domain is ever proxied;
- on `visibilitychange`, `pageshow` and `online` the client closes and recreates the EventSource and resyncs, regardless of `readyState`;
- the client tracks the last event sequence it has seen per stream and resyncs on every reconnect;
- **no offline posting.** The client knows it is offline (no heartbeat for 30 s, or `navigator.onLine` false), shows an offline banner and disables send. A send that fails anyway keeps the text in the composer with a retry button. No queue, no client-generated ids.

Idle SSE connections cost a goroutine and tens of KB each; 500 is nothing. HTTP/1.1's six-connections-per-host limit is irrelevant behind Caddy (HTTP/2), but a self-hoster fronting the binary with an HTTP/1.1 proxy or plain HTTP shares six slots between the stream and proxied images; one line in the self-host docs.

### Posts and editor

TipTap, with a small schema (paragraph, heading, text, bold, italic, link, mention, hashtag, image, embed, lists). **The body is HTML**, TipTap's own output (`editor.getHTML()`), sanitised on the server and stored once. One body format, ever. TipTap loads HTML back into the editor natively; it is the library's default content format.

**HTML only, no JSON column (relitigated, confirmed).** What locks you in is the schema, not the format, and HTML degrades better: ProseMirror JSON is meaningless without the exact extension set and attribute names, while HTML renders in any browser and imports into any editor if TipTap is ever replaced. Sweet's own database had four body formats from three editor changes; the HTML column is the one that still renders. Storing JSON alongside would be a second, unvalidatable source of truth that drifts from the sanitised HTML. Reconsider only if collaborative editing (Yjs) is ever wanted. Guard against TipTap upgrades changing serialisation with a round-trip fixture test in the frontend (`setContent(html)` → `getHTML()` equals input, normalised); pin TipTap versions and upgrade deliberately.

Edits: the client loads `body_html` into the editor with `setContent`, the user edits, and `getHTML()` goes back through the same sanitiser. The whole body is the unit of edit (`PUT /api/posts/{id}`, author only, sets `edited_at`); no diffs, no versions. Live clients get a `post` event carrying the full post and replace it in place. The sanitiser accepts TipTap's link attributes (`target="_blank" rel="noopener noreferrer nofollow"`) verbatim, so stored HTML is byte-identical to editor output and an edit cycle is a fixed point; a Go test (`TestFixedPoint`) and the frontend round-trip test share their fixtures.

**bluemonday is the gate.** Every body (post, comment, chat message) passes through one bluemonday policy before storage. The policy *is* the schema: the allowed tags and attributes, `href` limited to http/https/mailto, `rel="noopener noreferrer"` forced on links, no `class`/`style`/`target`/event attributes, `data-mention-id` on `span` matching a UUID pattern, `data-image-id` on `img` matching a UUID pattern, `src` on `img` limited to our own `/img/<id>` path, `data-embed-url` http(s) only. Nothing the client sends is trusted before the policy; everything after it is. Hard caps on body size.

**Extraction** uses Go's standard HTML parser (`x/net/html`) over the sanitised body: mention ids (notifications), hashtags (tags table), and plain text via bluemonday's `StripTagsPolicy` (search index, digest if ever needed). A loop over a tree, not a schema walker.

**Rendering on the client** is the sanitised HTML inserted as-is. Safe because bluemonday ran; this is the one place `dangerouslySetInnerHTML` is allowed, and it is wrapped in a single component.

Images are `<img data-image-id="…" src="/img/<id>" alt width height>`. No gallery markup: adjacent images render as a gallery. The `src` is a server path, not a storage URL, so storage can move without touching posts. Upload on insert; an hourly sweep (`images.Sweep`) deletes images older than a day that no live post, comment, message or profile picture references, which covers abandoned drafts, images removed while editing, and the pictures of deleted posts.

Mentions are `<span data-mention-id="uuid">@name</span>`; the server rewrites the visible name to the current username at serve time (or the client does from the id), so renames break nothing. Mentions work in posts, comments and chat.

**How a post is drawn** (Raphael chose it from three drawings, 2026-11-06): the author line, the body 8px under it, then the comments button (with room beside it for what comes later) 16px under the body, and, when the thread is open, the thread 16px under that on its own ground: a light warm grey panel (`--color-ground`, lighter than a field and with no edge of its own: Raphael, "friendlier") inside the card holding the comments, oldest first with a hairline between each, a size smaller than the post (15px against 16, the name too) with a 20px face, 12px of ground all round, and the reply box at the panel's foot, the one white thing in it, saying whom it answers ("Reply to kit…"). One shape says where the post stops, and the eye finds the place to type. The two drawings not taken: old Sweet's grey box per comment under its author (which the panel keeps the spirit of with less chrome), and a blush rule down the margin with the count as a sentence. The three-dot menu on a post, a comment or a message is out of sight until its block is hovered or holds focus, where there is a pointer to hover with (`Menu reveal`, by level: a post's menu shows while its card is hovered and no comment in it is, a comment's while its own article is, a message's while its own row is; the first cut keyed on the nearest hovered block and lit every comment's menu from the post's card, 2026-11-06); a touch screen shows them always, since a long press is undiscoverable and the dot is small. The reason is noise: a room of messages or a thread of comments is a column of identical dots otherwise.

**A post has an address** (Raphael, 2026-11-06): `/p/<id>`, served by `GET /api/posts/{id}` with the same 404-to-outsiders rule as everything else. The page is the post with its thread open, under a bar that says "Post by <name>" and leads back to the room the post is in, which stays mounted behind it as a members page's room does. A post's time in the feed is the link to its page, a real anchor that wouter routes (so it can be copied or opened in a new tab; `Link` in `web/src/ui` knows the difference between a path in the app and the world outside). The page holds its own query for the post, seeded from a loaded feed so it draws at once, and `applyEvent` writes every change that reaches the feed (an edit, a comment counted, an author's new picture, a deletion) into that query too, so the two never disagree. Notifications land here; there is no other way to point at a post.

Drafts autosave to the browser's local storage, not the server. Known limit: Safari wipes all site storage after 7 days without a visit for sites not installed to the home screen; installed PWAs are safe. Accepted.

### Chat

Chat messages use a subset of the same TipTap schema (paragraph, text, link, mention, hashtag, emoji) with a minimal TipTap composer, through the same bluemonday policy, so there is one body format and one extraction path across the product.

Replies: a `reply_to` column on messages, rendered as a quoted snippet above the reply, flat in the room (the WhatsApp/Telegram shape). No Slack-style threads; they would turn the room into a second feed.

A message is the same kind of content as a post or comment, with the same ownership: its author may delete it, and so may the owner or a moderator (`perm.DeleteMessage`); nobody edits a sent message. Deletion is soft and arrives as a `message_delete` event. A message's menu floats at the top right of the message's own block, the first message of a run included, never on the author's line above the run, and stays there however tall the body or however much it wraps (`MessageBlock`: the body keeps room on the right, the menu is absolute); a hovered message takes a blush (Raphael, 2026-11-06, correcting the day before's "on the author line for the first message", which was his own mistake). A menu never makes a block taller, so a run keeps its 4px rhythm. Before that, for a day: the menu beside the line, in a flex row that shrank the body before the menu moved, a wide picture having once pushed its own menu underneath itself (2026-11-05, a Playwright check on the boxes).

Layout: one page, under a bar. A collapsible nav column on the left, then posts and chat, each scrolling on its own, with a draggable divider between them (default 2:3, clamped 1:3 to 3:2). Dragging a pane past the edge folds it into a thin vertical rail that reopens it. A pane scrolls from its top edge to its bottom edge: its margin is inside the scroll, on the content, not on the pane (Raphael, 2026-11-06). Width and open panes persist per browser. Below 800px the nav column goes, one pane shows, and a bottom tab bar carries Home, Search, Notifications and a Menu item in that order; the menu page holds what the nav column holds, with the account at the top and Sign out at the bottom.

**A bar across the top of every view, on the phone and the desktop alike** (Raphael, 2026-11-06, reversing "no header"): it names the view (Home, the room, Messages, Settings, Post by so-and-so), leads back when the view sits under something (a room's members, a post), and holds the view's controls, which never wrap: the title gives way first, cut to one line. On the phone the choice between a place's Posts and Chat lives in this bar, as icons, since those are views *on* the place, not places; the tab bar below holds places and tools only. The reason: on a phone with Posts and Chat in the tab bar, a room's chat was indistinguishable from Home's, and the tabs read as more places in the app rather than as two faces of the one you had just opened from the menu. Pages keep no title of their own; the bar is the one place a view is named. One exception: the phone's menu, which is not a place and takes the whole screen, flush, under no bar (Raphael, 2026-11-06). A notice (the stream's state above an editor, a failure in a form or a list) is an `Alert`, one shape in three tones (notice, warning, error) with its own ground, so it is always told from the content it sits beside (Raphael, 2026-11-06); running text never carries a notice. On the phone the bar's controls are icons (the names stay for assistive tech and the tooltip), because a long room name and three labelled controls did not fit.

**The nav column holds three kinds of thing, in three blocks** (decided 2026-11-05, from five drawn options). *Places* first: Home, which is the root group, then a titled Rooms section listing the named groups I am in, with the New room control in the section's title row (so it reads as "add one of these", never as a page) and shown only when the root group's `create_groups` flag says so. A group is drawn with a square tile carrying its initial, never a feature icon: line icons mean features, tiles and faces mean places and people. A section's items are smaller than the items outside it and sit with no gap, so they read as a stack under their title rather than as more pages (Raphael, 2026-11-05). Then, after a rule, the *tools* that reach across every place: Search, Notifications (with a dot while anything is unread, never a count; and Messages, until that afternoon moved it into the places block, below). Then, after a rule, *the house and me*: People, and the account row, which is my own page (Settings is behind it, see Accounts). Collapsed, the rules stay, the section title goes and its control becomes an icon row at the end of the block, and the tiles read as a cluster between the two blocks of line icons. On a short window the places and tools scroll between the wordmark and the foot, which stay put, so the account and Collapse are always in reach and the column never outgrows the window (Raphael, 2026-11-06, after the foot spilled below a short window). A name hidden behind a mark or an icon (a collapsed item, an icon button, a menu's trigger) shows in a tooltip on hover or keyboard focus, drawn by Floating UI (`useTooltip`), never the browser's title, which is slow and unstyled (Raphael, 2026-11-05).

**Conversations are in the nav, five at a time** (Raphael, 2026-11-05, reversing the morning's call). A DM is a room without a name, locked to chat, so it is drawn as the rooms are: a titled Messages section after Rooms, in the places block, listing the five conversations with the latest word (the server sends every group's `last_message_at`, the time of its newest live message; a `message` event moves one up), the open one too if it is older, and All messages at its foot, which opens `/messages`, the full list in the same order. Each is named by its other person and marked by their face in the slot a room's tile takes (the pile of faces for several people went with the pair rule, see Groups). A conversation opens at `/r/<id>` under its bar like any room, and its item is current. The section is always there, with New message in its title row as New room is in the Rooms section's: a page at `/messages/new` that takes one person and opens the conversation with them, the existing one or a new one. A conversation also starts from a person's name, on the People page or on a hover card. The unread count on a conversation came with the markers (see Notifications). The morning's objection was to an unbounded list of transient conversations beside the rooms, and to Slack's cure of hiding them by a heuristic nobody can predict; a stated cap is neither. Rooms are not capped and sit in alphabetical order, case aside, since they are places and few (the dump: 53 communities in two and a half years). Drawn and not built the same afternoon: a messenger inside Messages, a column of conversations beside the open one, which would have given a chat-only room a second way of being drawn, the drift the rest of this document guards against. Before that, for a few hours: one Messages item with every conversation behind it, which hid them all one click away.

**Every page is a URL**, routed by wouter (two kilobytes, hooks, no data layer of its own; TanStack Query owns data). `/` is the root group; `/r/<id>` a group's view (a DM's too) and `/r/<id>/members` its members page, both under the group's bar, which carries the group's name, a way to its members from the view, and a way back to the view from any page under it; `/p/<id>` a post's page; `/u/<name>` a person's page; `/notifications`; `/rooms/new`; `/messages` and `/messages/new`; `/people`; `/settings`; `/menu` on phones; `/u/<name>` when profiles arrive; `/join/<code>` as now. Which page is showing is the URL and nothing else, so the back button works, a reload keeps your place, and a group, a person or a post can be linked to. An unknown path shows the root group. (Before this, the page was React state in three pieces that had to agree, which is how a members page once rendered with the group's view still visible under it.) One SSE connection per page. Both panes stay mounted whatever is showing: a closed pane is hidden, not unmounted, so a half-written post or message survives closing its pane or visiting Settings. (Reversed from "a closed pane refetches when reopened", which threw drafts away.)

**A person's name opens a card** (Raphael, 2026-11-05). Wherever a name is written beside content or in a list (a post, a comment, a message, the People and Members lists; not a room's bar, which is a title) it and the picture beside it are one control that opens a small card about the person: on hover after a beat, on keyboard focus, or on a tap, since phones have no hover. What staff may do to a person on a list (make a moderator, make a member, make the owner, remove) sits behind a three-dot menu on their row, on the People and Members pages alike and at every width (Raphael, 2026-11-06: three labelled buttons a row were tidier as one menu); Message, which anyone may do, stays in the open on the People page. The card is the page's preview, with View profile and Message buttons (a linked name was first, and read as styling: Raphael, 2026-11-06): their picture, their name, their standing here (runs this place, moderator) and when they joined, and a Message button that opens the conversation with them, absent from my own card. `HoverCard` (Floating UI) draws it, portalled to the body so no pane clips it and no heading holds it, with the pointer free to travel into it; `PersonName` fills it from the users cache, so a new picture or name shows on the card at once. A row that is itself a control, a conversation on the Messages page, keeps its names as text, since a control cannot hold another. The card flips above its name when the name's own scroll pane has no room below (the pane is named as the boundary, since a portalled card has no clipping ancestor to tell it; before that it opened over the chat's editor, 2026-11-06).

### Embeds and link previews

An `embed` node that stores only the URL. The server fetches metadata (oEmbed where the provider has it, OpenGraph otherwise), stores title, description and a thumbnail copied into our S3, and renders a click-to-play placeholder: the YouTube/Vimeo iframe loads only when clicked, so third-party trackers stay off the page by default. An allow-list of providers get a player; everything else gets a link card. A bare URL on its own line becomes an embed automatically. The same fetcher does link previews.

SSRF: the fetcher uses a safe-by-default HTTP client library (e.g. `doyensec/safeurl`) rather than our own checks. It handles private and link-local ranges including cloud metadata, IPv6, DNS rebinding and redirects. One import. Cap response size and total time. This client is never reused for the S3 endpoint, which a self-hoster may legitimately run on a LAN.

### Images

Uploads go through one storage interface with two drivers: a local directory, the default, which is what development and a self-hoster without a bucket use; and S3-compatible storage (Cloudflare R2 for hosted instances), chosen when the endpoint and bucket are in config. Images are large and R2 space is cheap, so hosted instances always use R2. (Reversed from "S3 only, local later": a local default costs forty lines and removes a bucket from the first run.)

Open: isolation between hosted instances in R2. Today the guard is each instance's own `images` table (the only way to an object is `/img/<id>` looked up there, and the sweep deletes only its own keys); the bucket credential itself can read every prefix. R2 scopes tokens to buckets, not prefixes, so a shared bucket cannot be enforced by the credential; one bucket and one token per instance can, and the Operations section already assumes a bucket per instance for Litestream. Decide before the second hosted instance.

Accepted input formats: JPEG, PNG, WebP, GIF, detected by magic bytes server-side, not by extension or declared type. Anything else is rejected with a clear message. Generated sizes are output as JPEG or PNG only (Go's `x/image/webp` decodes but does not encode); GIFs pass through untouched.

No HEIC decoding. The file input uses `accept="image/jpeg,image/png,image/webp,image/gif"` with JPEG first and never `image/*`: WebKit transcodes a chosen HEIC to the *first* listed type, and `image/*` anywhere in the list hands us HEIC. Android does not transcode; the magic-byte check catches it with the clear message.

Server-side on upload: apply EXIF orientation, strip metadata, generate sizes. Display pictures use the same pipeline with fixed square sizes.

Images are protected per instance: served through the Go backend at `/img/<id>` with a session check and `CanSee`: the viewer uploaded it, or can see a live post, comment or message that references it. A screenshot in a private group is served only to that group's members. No images outside the web app (the digest carries no content), so no signed URLs.

Images in the editor are cards: the picture small on the left, the alt text field taking the rest, a grip to drag the card between blocks, an X to remove it. No prompt on insert. Adjacent cards join into one block labelled "Gallery of N images", because the post renders a run of adjacent images as a grid: 2 across; 2 then 1; 2 and 2; 2, 2, 1; 4 then 2; 4, 2, 1; 4 and 4. Eight is the most in one gallery; a longer run splits. The gallery exists only at render time (`wrapGalleries` in the frontend): stored HTML is a plain run of `<img>`. Chat has no inline images: pictures attach above the text field as the same cards and are sent as a block of `<img>` before the text. Whether alt text is required is a feature flag.

A post's three-dot menu (Floating UI) holds Edit and Delete as the post's `can` flags allow (see Permissions); comments carry the same menu. Delete asks first, in the browser's own dialog element. Deletion is soft (`deleted_at`): the post leaves every list, its comments go with it because they are only reachable through it, its images go with the next sweep, and a `post_delete` event carrying the id tells open pages to drop it.

Per-image and per-post size caps; a per-instance storage quota enforced at upload (also a pricing lever).

## Data model notes

- Ids: UUIDv7 on every row. The reason is a future merge of two instances' data: an insert rather than a renumbering of every reference, including those inside post bodies.
- Event ordering: the event log has an integer sequence column assigned inside the write transaction, which is therefore commit-ordered. SSE `id:` and `?since=` use it. UUIDs are not used as cursors (generation order is not commit order with a connection pool).
- Every write transaction starts `BEGIN IMMEDIATE`. A deferred transaction that reads then writes can fail with `SQLITE_BUSY_SNAPSHOT`, which `busy_timeout` cannot help with. Consider one connection for writes and a separate read pool.
- Pagination by cursor, never offset, for feed, chat and search.
- Groups: `groups(id, kind, name, mode, created_at, deleted_at)` and `memberships(group_id, user_id, role, joined_at)` with role owner, moderator or member. `posts.group_id` and `messages.group_id` are NOT NULL and reference `groups`; the migration that adds groups creates the root group with a fixed id (`perm.Root`, the one UUID in the system that is not a v7), backfills every post and message onto it, turns each user's old `users.role` into their root membership, and drops `users.role`. Non-members of a group get 404 from every path under it, never 403: to them it does not exist. Comments reach their group through their post. A user has no role of their own, only memberships. A group's `last_message_at` is not a column: it is computed on the way out (the newest live message's time), so it cannot drift. A conversation's `people_key` is its set, the sorted ids, unique among live conversations; a membership's `hidden_at` is presence, set only in a conversation, never in a room, and sent to that person only.
- Soft delete: `deleted_at` on posts, comments, messages and groups. Deleting a post takes its comments with it: no tombstone, no orphaned thread (see Simplified). Deleting a group hides everything in it.
- Edit tracking: `edited_at` flag only; no version history.
- Unread markers: `read_markers(user_id, stream, read_at)`, one row per user per stream (`chat:<group id>`, `feed:<group id>`; a notification is read on its own row), updated from the client (with a debounce for chat). Lives in the DB so it follows people across devices and feeds the digest. The marker is a time, not the event sequence this note first named (2026-11-06): what is counted against it, messages and notifications, is paged and ordered by `created_at` and carries no sequence, and a time compares with a row without a join to the log. Forward only, held to now.
- Chat history kept forever, paginated.
- Time: UTC only, ever. Stored and served as Unix milliseconds or RFC 3339 with `Z`. The server never knows a time zone exists; the browser renders relative times and local dates.
- FTS5 indexes a stored plain-text column (bluemonday `StripTagsPolicy` over the body), never the HTML, kept in sync by insert/update/delete triggers (the documented external-content pattern); triggers don't backfill, so a `rebuild` runs after migrations that touch it.

## Mobile

No dedicated mobile app. NEVER multiple codebases. The React app is a PWA; that is the mobile app at launch. Web push on iOS works only for PWAs installed to the home screen, so an install prompt is part of the first version.

Later: Capacitor wraps the same React build for iOS and Android app-store presence and adds native push. Not part of the first version. (Bubblewrap ruled out: Android-only.)

The shell will **not** share the web app's cookie session. Its iOS origin is `capacitor://localhost`, so every API call is cross-site: `SameSite=Lax` cookies are never sent, iOS 14+ blocks third-party cookies in WKWebView by default, and the `WKAppBoundDomains` workaround caps at ten domains, which is incompatible with a "which Sweet?" multi-instance app. The shell will send the session id in an `Authorization: Bearer` header instead. The session store is therefore transport-agnostic from day one: the same opaque session id arrives as a cookie *or* a header. A header change later, not a redesign. Not JWTs: "log out everywhere" needs a server-side lookup anyway, so a self-describing token buys nothing and adds signing keys and refresh semantics. SSE from the shell is a separate question for then.

## Accounts

**Profiles** (built 2026-11-06): a person's page at `/u/<name>`, with their picture, name, standing (runs this place, moderator) and joining, a bio of a few lines in the comment editor that they alone edit (`PUT /api/me/bio`; the same bluemonday policy, stored as HTML with its text beside it; a `profile` event carries the whole profile to everyone, since every profile is visible to everyone on the instance), a Message button on anyone else's, and their posts newest first (`GET /api/users/{name}/posts`), only from the rooms the viewer is in, each saying which room it was said in; no chat, since that is a conversation. A removed account has no page. The hover card is the page's preview, its name a link to the page. **The account row at the foot of the nav is me**, and opens my own page; Settings is reached from there (Raphael, 2026-11-06: the row was inert, and "where do I change my picture" has one answer now, where the picture is). The bar's title on a profile is the name; on Settings it leads back to my page. No following in the first version: on old Sweet following was real and mutual (2,086 follow edges among the 212 people who posted, 72% returned, the median poster following 6 of 211), but a following feed shows each person a small slice of a small community, the opposite of what a house of thirty wants from Home; Home is everyone, and following, if an open instance ever needs it, is a view behind a flag, never Home. The 3,636 raw follow edges include 1,092 to one account, from 851 people who followed nothing else: an automatic follow on signup, not a social fact.


Login/registration: email/username/password with email verification. No identity enumeration. Password reset. Argon2id (OWASP minimums: m=19 MiB, t=2, p=1 or equivalent); verification and reset tokens expire and are single-use.

Uniqueness is per instance (each has its own database): username and email unique within an instance, compared case-insensitively, usernames Unicode-normalised. Usernames live under `/u/<name>`, so the reserved list is a handful (`admin`, `sweet`, `moderator`), not every route. Username changes allowed (mentions and authorship are by id). Email changes take effect only after the new address is verified.

If the verification email doesn't arrive, the user gets a "didn't get it? resend, or change the address" screen. No bounce tracking.

Sessions, not JWTs: server-side sessions stored in the instance's SQLite, 180 days with rolling expiry (refreshed at most once a day; the stored id is the SHA-256 of the token the client holds). On the web, an httpOnly `SameSite=Lax` cookie set by HTTP (Safari's 7-day cap applies only to script-set cookies). CSRF: SameSite plus an Origin check on every state-changing request. The same session id can be presented as a bearer token (see Mobile).

Revocation is a "log out everywhere" button: users have it for themselves, moderators have it for any user, and the orchestrator can call it through the instance admin API.

Rate limits per user on posting, uploading, login attempts and password resets.

### Registration modes (per-instance setting)

- Invite-only
- Approval

No open registration, so no bot protection needed. Approval is open in practice.

Approval needs a moderator UI: a queue of pending applicants with when they applied and their answer to an instance-set question ("how did you find us?" / "who do you know here?"); approve or decline, with an email to the applicant either way; a notification to moderators when someone applies.

The approval answer can double as the newcomer's first post, or at least be shown to members as "X has just joined", so there's something for a first reply to land on.

Rules are shown at signup and acceptance is required.

## Instance admin API

Every instance exposes a small admin API, authenticated by a per-instance token. It powers the instance's own admin screens, and the orchestrator is one client of it, not a special path. The orchestrator never reaches into an instance's database, so hosted and self-hosted instances are the same software.

## New-instance lifecycle

Three stages with a clean boundary between the orchestrator and the instance:

1. **Provision** (orchestrator): name, subdomain, owner email → create the instance, start it, mint a one-time setup link. In v0 Raph runs `sweet create` and emails the link by hand; later a web form does it and the email is automatic. Payment slots in before this stage later.
2. **Setup** (inside the instance): the link opens the first-run page; the owner sets a password and verifies email. Secrets (session key, admin token, signing key for URLs) are generated on first run, not shipped in config.
3. **Onboarding** (inside the instance): name, description, rules, registration mode, feature flags, topics, then "invite your first people". Ends on the empty feed with a first-post prompt.

Stages 2 and 3 live in the binary, so self-hosters get the same onboarding and the orchestrator stays dumb.

### Domains

v0: `theirgroup.sweet.community`, one wildcard certificate via Caddy's DNS challenge. The Cloudflare DNS module is not in stock Caddy: the compose stack ships a Caddy image built with xcaddy, and upgrades must preserve it. Custom domains later with on-demand TLS, which requires an `ask` endpoint answering "is this domain ours?"; the orchestrator provides it.

## Data export

Supported from the off as a fundamental piece of the API design: both per-user (for personal export) and per-instance (to migrate to a new instance). The export format is the import format. Build import first; it's what tests the export.

The two exports are different shapes. Per-instance is the SQLite file plus media, schema-versioned; import runs SQL migrations forward. Per-user is a versioned JSON document (bodies as the stored HTML) plus media, with its own small forward-migration path.

## Orchestrator

Version one is a CLI on the hosting server: `sweet create <name>` writes a config, starts the binary, adds the Caddy route; plus stop, start, read-only, upgrade, destroy. A web UI for the superadmin comes when there are more instances than fit in memory. Billing later. Kept dumb and outside the instance boundary (see admin API).

## Config

One TOML file per instance with env-var overrides. Secrets generated on first run. Migrations are embedded, forward-only, and run on start; a `VACUUM INTO` copy is taken first so a bad migration is recoverable. That copy is the upgrade backup; `sweet upgrade` does not take a second one.

## Updates

- **Hosted:** `sweet upgrade <name|all>`: stop, swap the binary, start (migrations run, after their `VACUUM INTO` copy), check `/healthz`; on failure restore the copy and the old binary. Upgrade our own instance first, then everyone. Instances are pinned to versions, so a bad release stops at one.
- **Self-hosted:** replace the binary and restart, or apt via the Debian package. The binary refuses to start against a database newer than itself.
- **Clients:** the frontend is embedded, so API and UI can't drift except in already-open tabs. The SSE stream sends a `version` event on connect; a tab that loaded a different version reloads.

## Backups

Litestream runs beside the binary, tails the SQLite WAL and streams every change to the instance's S3 bucket. Restore granularity: recent minutes exact, older points at roughly five-minute boundaries (L0 files are compacted away after the default 5 m retention); replication is async, so a crash loses about the last second. Operating rules that go in the self-host docs: the app sets `PRAGMA busy_timeout` and `synchronous=NORMAL`; Litestream owns checkpointing (`wal_autocheckpoint=0` in the app); the database must be on local disk on the same host, never a network filesystem or a Docker Desktop volume; one Litestream per replica path; R2 works via the generic S3 endpoint with an R2-scoped API token.

For self-hosters Litestream is optional; the fallback is a nightly `VACUUM INTO` copy uploaded to S3 by a goroutine in the binary, which needs no setup. Media is already in S3, so the database is the whole backup problem.

## Email

Plain SMTP in the code; host, port, credentials and from-address in config. Hosted instances use Mailgun's SMTP endpoint; self-hosters plug in anything. Not the Mailgun API.

## Search

Search is very important. SQLite FTS5 over posts, comments and chat messages, scoped to what the searcher is allowed to see (through the visibility function). Index over the walker's plain-text column, maintained by triggers so it can't drift. Chat is searchable.

## Notifications

One in-app notification table that every channel reads from.

**A notification is one thing done to one person** (built 2026-11-06). A row in `notifications` for its person, written in the same transaction as the thing by the handler that writes it, never by the client, and never about one's own doing. Two kinds so far: `comment`, someone commented on your post (to the post's author), and `added`, someone added you to a room (to the one added). Mentions join when mentions exist. Not a notification: a new message in a conversation or a new post in a room; those are *unread*, below. The row carries who did it, where (`group_id`) and, for a comment, the post; the client puts the words to it ("mo commented on your post", "raphael added you to Knitting", or "to a room" once I am no longer in it) and the destination (the post's page, the room). `GET /api/notifications` is mine, newest first, paged like the feed. A `notification` event, one kind, no delete, filtered to its person alone.

**A notification is read by opening it** (Raphael, 2026-11-06, reversing the morning's "looking at the page is reading"): `read_at` on the row, set by `PUT /api/notifications/{id}/read`, which the page calls as it opens the thing; the reply and the event are the row, read, so every device agrees. The page alone reads nothing: its New section holds the unopened ones and keeps the bell's dot lit, Earlier the opened ones, and Clear (`DELETE /api/notifications`) deletes the opened ones for good, never an unopened one; one `notification_delete` event names the set, `{user_id, before}`, the only delete event without an id, since the set (opened, up to then) is exact. The bell's dot is the count of unopened rows, carried as the notifications stream's `unread` on `GET /api/markers` for the client's one source of unread; that stream takes no marker.

**Read markers are for chat and feeds.** `read_markers(user_id, stream, read_at)`: how far along a stream a person has read, one row per person per stream, forward only (`PUT /api/markers/{stream}` holds `read_at` to now and keeps the later of the two, so a stale tab cannot unread what another has read), told back as a `marker` event to that person alone so every device agrees. The streams are `chat:<group id>` and `feed:<group id>`; a group I am not in does not exist to me. (For a few hours the notifications stream had a marker too, and looking at the page moved it; that read everything at a glance, which is not what reading is.)

**The bell shows a dot, never a count** (Raphael, 2026-11-06). The nav's Notifications item and the phone's tab carry a dot on the icon while anything on the notifications stream is newer than my marker, and "unread" in their name; the number would be a thing to clear, and a dot is a thing to glance at. The page at `/notifications` is behind both.

Still to come, in this order:

- A weekly email digest for anyone who hasn't visited: counts and metadata only (how many posts, in which topics, who joined, how many replies to you, counted from their markers) and a link. No post content, no images. Build the digest before push; it's what brings quiet people back.
- Web push for mentions and replies to your posts (iOS: installed PWAs only).
- Per-user configurable, with "off" one click away.

## Admin tools at launch

Roles: owner, moderator, member, as memberships of the root group (see Groups: the same three roles exist in every group). One owner: the person who runs this place. The owner sets anyone to member or moderator from the People page; a moderator can delete anything and edit nothing of others', exactly as the owner can, and can create and revoke invites (invites add people to the root group), but cannot change roles. Handing over ownership is an explicit action of the owner's, on the root group as on any other; the former owner becomes a moderator. A role change is a `membership` event carrying the whole membership, joined time included (a reply that dropped it once read "joined 1 Jan 1970"), so every open page's controls follow it.

**Removing someone** (built 2026-11-06, as specified above): staff remove those below them from People, a moderator the members and the owner the moderators too, and anyone removes themselves from Settings; nobody removes the owner, who hands over first (`perm.RemoveFromInstance`; the people list carries `can.remove` per viewer, so the page decides nothing). Always anonymise, never delete: the account's row stays so their content keeps its author id, and the name becomes `removed-<the id's random tail>`, a prefix nobody can register, with the password and picture gone. Their sessions end; a page of theirs that is open hears its own root `membership_delete` and signs itself out. Each room they owned passes by seniority, the longest-serving moderator else the longest-serving member, as a `membership` event, or closes if they were alone; their conversations keep their place in the set, hidden, so the name reads removed. The `user` event goes out first and the client renames their words in every loaded feed, thread and room, so the anonymising shows at once, on the people list or off it.

Minimum shipped:

- Invite link creation and revocation
- The approval queue
- Remove a member; their content is anonymised
- Delete any post, comment or message
- A pinned instance-wide announcement
- A view of recent signups
- Log out everywhere, for any user
- Unanswered posts: posts with no reply yet, oldest first. (Sweet data: a reply within a week was the clearest difference between people who stayed and people who left.)
- Instance settings: name, description, welcome message, rules, feature flags, topics, registration mode, source-code link

Nothing fancier until a real instance asks.

## Instance lifecycle (ending)

When a group stops paying or asks to close: 30 days read-only with a banner, during which the instance export is available to the owner and personal exports to everyone; then the instance stops; database and media kept for a further 60 days, then deleted. Stated on the pricing page.

Read-only mode is also a switch on self-hosted instances, since "we're winding down" happens regardless of hosting. The 30/60 numbers are provisional; the shape is the decision.

## Visibility rules

One Go function, `CanSee(viewer, thing)`, that every query path goes through. A table-driven test file covers each viewer state (anonymous, member, moderator, author, removed) against each thing type (post, comment, chat message, image, group, topic). No feed query bypasses it for performance until a test proves the bypass gives the same answer. Non-negotiable: this is the promise the product makes.

The rule itself is membership, nothing else: a signed-in, not-removed viewer sees a thing if they are a member of the group it is in. Staff have no extra sight. Lists are scoped in SQL by a join on `memberships` for the viewer, and single-thing reads go through `CanSee` in `internal/perm`, with a test that the two agree.

## Permissions

The write side of the same promise, in the same shape. One package, `internal/perm`, holds every rule about who may do what to what (`EditPost`, `DeletePost`, `EditComment`, `DeleteComment`, `DeleteMessage`, the group and membership actions, and `CanSee`). The rules are plain functions over an actor (id, and their role in the thing's group) and the thing's ownership facts, with one table-driven test, one row per (who, what) pair. Every write handler fetches the thing's owners and the actor's membership, asks perm, and answers 403 if the answer is no; no query carries an author clause of its own. Because roles live on memberships, the same functions serve the root group and every other group.

The frontend holds no permission logic. Every post, comment and message the API serves carries `can: {edit, delete}`, and every group carries `can: {add_members, remove_members, set_roles, rename, delete, leave}`, computed by perm for the requesting user on the way out. Menus and buttons show what the flags say. There is nothing to keep aligned because there is only one implementation; a membership change arrives as a `membership` event and the client refetches what it holds for that group. (Considered and rejected: mirroring the rules in TypeScript with a shared test table. Two implementations of a rule are a rule that will drift, which is how Sweet got four body formats.)

## Client data

One cache, TanStack Query, holds every piece of server data the client has: me, users, posts, comments, messages, invites. Components render from it and keep no server data in their own state. The event stream is the cache's write path: each event is one upsert or one delete into the cache, and a reconnect invalidates everything, which is the only refetch the app ever needs while the stream is up. People are normalised: posts, comments and messages render their author from the users query by id, not from the author snapshot they arrived with, so a changed picture, name or role shows everywhere at once. Pagination is cursor pages inside the cache (infinite queries), never component state. Feeds, rooms and member lists are cached per group; people and the list of my groups are instance-wide. Being removed from a group drops it and everything cached under it; a change to my own role in a group refetches that group's content, since every `can` flag in it has moved.

## Testing and operations

- The failing test comes first, for every behaviour change. Go tests for handlers, rules and sweeps; Vitest with happy-dom and Testing Library for pure functions and component state; Playwright for flows through the real browser against the real binary. Bugs found after the fact are the thing this rule exists to prevent.
- Playwright (`web/e2e`, `make e2e`) runs the product's flows end to end: sign in and join, posts and comments, chat, images, layout and drafts, groups and DMs, roles, routing, at desktop and phone width, against the built binary on a fresh database, and the same flows against the Vite dev server, because dev mode (React StrictMode, hot reload) is where Raphael looks. It exists for the bugs that live between pieces that each pass their own tests: a class the DOM tests cannot see rendered, an ordering between a stream event and a reply, a page rendered twice. (Reversed 2026-11-05 from "no browser suite", after two such bugs in two days.)
- A change is verified on every surface it touches, not only the one it was made for: a layout change at phone width too; a data-shape change everywhere that data is shown. Tests live in the repo; nothing that only ran once on a laptop counts.
- The S3 image driver has a round-trip test (`TestS3RoundTrip`) that runs against the configured bucket when `.env` names one (`make test` exports it) and skips otherwise. It writes under its own prefix and cleans up. Verified against R2 on 2026-11-04.
- API-level tests against a temp-file SQLite per test (`t.TempDir()`) with the production pragmas (WAL, busy_timeout). Not `:memory:`: it is per-connection, so a pool sees N empty databases, and it cannot run WAL, so the write-contention paths are never exercised.
- `/healthz`, structured logs, an optional error-reporting hook. Nothing more.

## Legal

Hosted: we are the data processor for every instance; one privacy policy and one set of terms cover all of them, written before the first paying group. An age minimum. The session cookie is essential, so no cookie banner.

Self-hosted: the host is the controller and we are a software vendor holding no data. The binary ships a configurable privacy-policy page and rules page with template text.

## Record of what was cut or trimmed

Kept so the reasoning isn't lost when one of these comes back up.

### Cut from the first version

| Cut | What it was | Why | When to revisit |
|---|---|---|---|
| Open registration + Turnstile | A third registration mode, open to anyone, with Cloudflare bot protection | Approval is open in practice; removes a Cloudflare dependency from self-hosted installs and the only bot-protection code in the product | If an instance needs frictionless signup and the approval queue is a bottleneck |
| Native app / Capacitor | Wrapping the React build for the app stores, with native push | Its own account setup, store reviews, a "which Sweet?" screen, and a token auth mode; nothing in v1 depends on it. PWA with web push covers mobile | When store presence or iOS push for non-installed users matters |
| Orchestrator web UI and self-serve instance creation | A superadmin web app, and a public form that creates an instance | A CLI does the same job while instances are few; v0 is "email Raph". The provision/setup/onboarding boundary is designed so the form is one automated step later | When there are more instances than fit in memory, or when payment arrives |
| Bounce tracking | Marking addresses as bouncing after provider webhooks report failures | Needs provider webhooks and vendor coupling. A "didn't get it? resend or change address" screen gives the user what they need | If silent delivery failures show up in support |
| Custom domains | `sweet.theirgroup.org` via on-demand TLS | One wildcard cert for `*.sweet.community` covers v0; on-demand TLS needs an `ask` endpoint from the orchestrator | When a group asks |
| Presence / typing indicators | "Who's online" and "X is typing" in chat | Would push realtime towards WebSockets; SSE is simpler and sufficient without them | If chat feels dead without them |
| Sub-communities | Topics as places with their own membership, public or private, open or by approval, as Sweet had | Sweet data: 82% of posts went to the main feed, 118 of 203 posters never posted in a community, 49 of 53 communities were quiet in the data's final six months, private and approval-join ones all of them. Topics stay as views on one feed. Private groups (see Groups) are built for functional needs, with the data's warning recorded against them | Probably never |
| Post version history | Keeping every edit | An `edited_at` flag is enough | If moderation needs it |
| Server-side drafts | Drafts saved to the instance | Browser local storage does the job with no API; Safari's 7-day storage wipe for non-installed sites is accepted | If people lose drafts and mind |
| Server-side rendering of ProseMirror JSON | Go renders ProseMirror JSON to HTML | A Go renderer drifts from the TipTap schema (a published account of trying it ended with a Node sidecar). Superseded: the body is HTML, so nothing is rendered server-side | Never |
| Offline send queue | Posts and messages queued in IndexedDB while offline and retried | No Background Sync on Safari/Firefox, client-generated ids, dedupe logic, for a case where showing "you're offline" is what the user actually wants | If a community asks |
| Slack-style chat threads | Threads under chat messages | Would turn the room into a second feed; quote-replies cover it | If the room gets too busy to follow |
| Threaded comments on posts | Nested comment trees | Flat list plus quote-reply, same as chat | If it's missed |
| Instance merge / cross-instance import | Importing one community's posts into another | Not a v0 feature; UUIDv7 keeps it tractable (no renumbering) | One day, with the Oversweet identity question |
| WebP output | Generating resized WebP | Go's `x/image/webp` decodes only; encoding needs cgo | If bandwidth matters |

### Simplified

| Was | Now | Why |
|---|---|---|
| Gallery node in the TipTap schema containing image nodes | Image nodes only; adjacent images render as a gallery | Same result, one fewer node type, no nesting rules |
| Server-side HEIC decoding | Accept JPEG/PNG/WebP/GIF by magic bytes, reject the rest with a clear message | HEIC in Go needs cgo and libheif; WebKit transcodes to the first `accept` type when JPEG is listed first and `image/*` is absent |
| In-memory SSE replay buffer | Browser `Last-Event-ID` and `?since=<seq>` both served from SQLite, plus heartbeat and forced reconnect on visibility/online | SQLite already holds everything; a buffer duplicates it. iOS kills sockets silently, so the client can't trust `readyState` |
| Member removal with a keep / anonymise / delete choice | Anonymise, always | Fewer branches in the code and in the moderator's head |
| Deleted post leaves a tombstone so its comments survive | The post and its comments go together | The author asked for it gone, and a stub that says "deleted" with other people's replies under it is the awkward middle. The cost, commenters losing their words, is small in a group of people who know each other, and the rows stay (soft delete) if a case ever needs them |
| Session list UI, revoke one at a time | "Log out everywhere" button | Covers the real use (lost phone, suspected compromise) with one control |
| JWTs | Server-side sessions in SQLite, 180 days rolling, presented as a cookie on the web or a bearer token elsewhere | Simpler, revocable, no refresh-token dance |
| WebSockets / Socket.io | SSE + plain POSTs | Plain HTTP, proxies and cookies just work, browser reconnects by itself. Socket.io is a Node-centric protocol layer solving a 2012 problem |
| Bubblewrap | Capacitor (later) | Bubblewrap is Android-only |
| Mailgun API | Plain SMTP, Mailgun as config | Self-hosters can use any provider; no vendor in the code |
| Docker compose as the architecture | Single Go binary; compose as the distribution artefact around it | The binary is the unit a self-hoster installs and a Debian package wraps |
| Redis | In-process pub/sub | One process per instance removes the reason for a broker |
| Dedicated mobile app or cross-platform React | PWA, same codebase | React Native is a second UI codebase in practice |
| Embeds as live iframes | Click-to-play placeholder with a locally stored thumbnail | Keeps third-party trackers off a private instance's pages by default |
| Time zones anywhere in the system | UTC only; the browser renders | The horrible haunted words |
| Separate plain-text chat format | Chat messages are a subset of the TipTap schema | One body format and one walker for mentions and search across posts and chat |
| Reserved usernames covering every route | `/u/<name>` paths and a handful of reserved words | Usernames aren't top-level paths, so routes can't collide |
| Three backups per upgrade (CLI copy, migration copy, Litestream) | The migration's `VACUUM INTO` is the upgrade backup | The other copies were redundant |

### Considered and rejected

| Option | Why it was tempting | Why not |
|---|---|---|
| TypeScript end to end (Bun, Hono, Zod, `generateHTML` on the server) | One language; the editor's own extensions render on the server, zero schema drift; shared Zod schemas | Loses the small portable binary; 50–80 MB idle per instance vs 10–20; npm churn is where Sweet's jank came from. Kept as the fallback if the Go walker proves painful |
| Go plus a Node TipTap sidecar | Server-side HTML with the real TipTap renderer | Two runtimes and a second codebase to keep in step with the editor |
| Client sends plain text + mention list alongside the JSON | Avoids the recursive walker | Search and notifications would be derived from something the client controls; the body would exist in two versions that can disagree |
| ProseMirror JSON as the canonical body with a Go allow-list walker | "Never trust client HTML"; structured bodies | Built on the false premise that Go had no good sanitiser. The walker needed value validation for every attribute, a fixture-sync harness, a React node renderer and a separate email renderer. bluemonday replaces all of it with one policy |
| JWTs (raised twice) | A header-borne token for the native shell | A header solves the transport; the token format is irrelevant. Revocation needs a server lookup anyway, so JWTs add signing and refresh for nothing |
| Hand-written SSRF checks | Control over the fetcher | A safe-URL library does it in one import |
| Markdown as the canonical format (goldmark) | Go-native rendering with no sanitiser needed | Mentions by id, image ids, embeds and alt text have no Markdown syntax; you invent one and lose fidelity on the editor round trip |
| Third-party Go ProseMirror ports | Save writing the walker | Individual projects, not an ecosystem; a dependency to read before trusting, for sixty lines of code |
| Cookie sessions shared with the Capacitor shell | One auth path | `capacitor://localhost` makes every call cross-site; iOS blocks third-party cookies in WKWebView; `WKAppBoundDomains` caps at ten domains |
| UUIDv7 alone as the SSE cursor, no sequence | One fewer column | Generation order is not commit order with a connection pool; a client can skip an event. Integer sequence reinstated |
| Signed URLs for images in email | Thumbnails in the digest | The digest carries counts and metadata only, so no images leave the web app |
| GPL-3.0 | Copyleft without AGPL's corporate friction | No protection against a hosted competitor at all |
| MIT / Apache-2.0 for the server | Frictionless adoption | Anyone can run a closed, modified hosted version and never share back |
| Source-available (BSL, SSPL, FSL) | Strongest hosted-competitor protection | Not open source; blocked by Debian/Fedora; the thing communities fork away from |
| A CLA alongside AGPL | Preserves the option to relicense | Reads as a dual-licensing lever; alienates the contributors this audience is made of |

### Reversed

| Decision | First call | Final call | Why |
|---|---|---|---|
| Image storage | S3 only from day one; local driver cut | Local directory is the default driver, S3/R2 when configured | Development and a bucket-less self-hoster need somewhere to put files; the interface was already there and the local driver is forty lines |
| Closed panes | A closed pane unmounts and refetches when reopened | Both panes stay mounted; a closed one is hidden | Unmounting threw away whatever was being typed |
| Event kinds | One kind per action (`post`, `post_edit`, `post_delete`, …) | Two per resource: the whole thing, or its deletion | Kinds were accreting; the cache code grew a case per kind |
| Permissions on the client | Rules repeated in the frontend by hand | Server computes `can` flags; the client has no rules | Two copies of a rule drift; the server's answer is the only one that matters |
| DMs | Cut: the room covers it, three requests in two and a half years | A DM is a private group of kind `dm` | Once private groups exist for the moderation room and clubhouses, a DM is the same object with two members and no name; cutting it would be a special case, not a saving |
| Wire payloads | Each handler builds the reply and the event from what it has in hand | One builder per resource from the store's row; a write re-reads its row; a property test holds reply, event and fetch equal | Three payloads in two days each lacked a field; a convention with no enforcement is not a rule |
| DM membership | Fixed at creation; then, for an afternoon, grows by any of its people and shrinks by leaving | Its people are fixed and are its identity, one conversation per set; presence is per person: hiding, which nobody else sees | Growth in place made a conversation a nameless room: sets recurred as new rooms and two could hold the same people. People and presence are two things |
| How many in a conversation | Two or more; for an afternoon, any set of people, one conversation per set | Exactly two; more is a room | The set model carried a day of edge cases (joining a set, leaving it, a conversation's own People page) for a thing nobody asked for; two people is what "a private word" means (Raphael, 2026-11-06) |
| DMs in the nav | Every group I am in, DMs included, listed in the nav column; then, for a few hours, DMs behind one Messages item | Rooms in a titled section, uncapped and stable; conversations in a second titled section, the five with the latest word and the open one, All messages at its foot | DMs are transient and bunch up, so the list is capped by a stated rule, not hidden by a heuristic (Slack). A DM is a nameless chat room and is drawn like one, so there is no second surface to drift; a messenger layout was drawn and dropped the same day for that reason |
| Private spaces inside an instance | None: everyone sees everything | Private, invisible groups with a feed and a chat, the instance as the root group | A moderation room, a sensitive-topic clubhouse and a private word with one person all need content that cannot be on the feed. The Sweet data is not on this side: its 14 private communities all went quiet, and its 10 approval-join ones had a median of 2 members. The bet is that functional spaces behave differently from communities competing with the feed; it is recorded as a bet |
| Backups | Nightly `VACUUM INTO` from inside the binary, no Litestream | Litestream for hosted instances; `VACUUM INTO` as the no-setup fallback for self-hosters | Small tooling cost, high payoff from near-continuous restore |
| Body format | TipTap JSON canonical, server never touches HTML, Go walker validates and extracts | TipTap HTML canonical, bluemonday sanitises, `x/net/html` extracts | The JSON design rested on "Go has no good sanitiser", which was false. HTML + bluemonday is one policy instead of a walker, a fixture harness and two renderers |
| Event cursor | Integer sequence → monotonic UUIDv7 → integer sequence | Integer sequence on the event log | Removing it was an invented simplification; commit order is what matters |

### Corrections from the adversarial review (Nov 2026)

Claims in earlier drafts that were wrong, and what replaced them:

- "Go has no good HTML sanitiser": false; bluemonday is maintained. This reversed the body-format decision (see Reversed).
- "The same cookie works in a Capacitor shell": false; see Mobile. Session store made token-agnostic.
- "Monotonic UUIDv7 makes the id a safe SSE cursor": generation order is not commit order; integer sequence reinstated.
- "Point-in-time restore" from Litestream: roughly five-minute granularity beyond recent minutes; see Backups.
- "iOS converts HEIC to JPEG when the input accepts JPEG": only when JPEG is the *first* type and `image/*` is absent; Android doesn't transcode at all.
- "Private IP range check prevents SSRF": insufficient alone; replaced by a safe-URL library.
- "In-memory SQLite for tests": per-connection and WAL-less; temp files instead.
- "busy_timeout handles write contention": not for read-then-write deferred transactions; `BEGIN IMMEDIATE` everywhere.
- Image proxy with session check contradicted email thumbnails; resolved by a content-free digest.
- The allow-list walker was described as checking names; it would have had to check values (href schemes, ids, bounds). Superseded by bluemonday's policy, which does exactly that.
- Caddy's Cloudflare DNS module is a custom build, not stock.
