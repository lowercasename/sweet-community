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

### Feature flags (per instance)

An instance settings table. Each feature is on or off, set by the owner during onboarding and changeable later: long-form posts, chat, images, embeds, topics, alt text (off / optional / required). The API refuses disabled features; the frontend reads settings at boot and hides them. This is how one product covers a friend group, an interest community and a chat-first group.

### Realtime

SSE for the read side, plain POSTs to the API for sends. Plain HTTP, so cookie auth and proxies just work (Caddy detects `text/event-stream` and flushes immediately; no config). One stream per client, carrying every event type (chat, posts, replies, notifications, version). Not Socket.io; reconsider WebSockets only if we want presence or typing indicators.

Every event carries an `id:` line holding the event log's integer sequence, so the browser's own `Last-Event-ID` reconnect is served straight from SQLite; `?since=<seq>` is the same query on the manual path. No in-memory replay buffer: SQLite is the buffer.

**Two event kinds per resource, no more.** `post`, `comment`, `message` and `user` each carry the whole resource and mean "this is its current state": create and edit are the same event. `post_delete`, `comment_delete`, `message_delete` carry the ids (the comment's includes its post's). Nothing else. The client cache therefore has exactly one upsert and one delete per resource, and a new feature adds a resource, not a kind. (Reversed from an earlier `post_edit` / `comment_edit`, which were accreting.)

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

Drafts autosave to the browser's local storage, not the server. Known limit: Safari wipes all site storage after 7 days without a visit for sites not installed to the home screen; installed PWAs are safe. Accepted.

### Chat

Chat messages use a subset of the same TipTap schema (paragraph, text, link, mention, hashtag, emoji) with a minimal TipTap composer, through the same bluemonday policy, so there is one body format and one extraction path across the product.

Replies: a `reply_to` column on messages, rendered as a quoted snippet above the reply, flat in the room (the WhatsApp/Telegram shape). No Slack-style threads; they would turn the room into a second feed.

Layout: one page and no header. A collapsible nav column on the left (wordmark, Home, Search, Notifications, People, Settings, account, expand control), then posts and chat, each scrolling on its own, with a draggable divider between them (default 2:3, clamped 1:3 to 3:2). Dragging a pane past the edge folds it into a thin vertical rail that reopens it. Width and open panes persist per browser. Below 800px the nav column goes, one pane shows, and a bottom tab bar carries Posts, Chat, Search, Alerts and a Menu item (People, Settings, account) in that order. One SSE connection per page. Both panes stay mounted whatever is showing: a closed pane is hidden, not unmounted, so a half-written post or message survives closing its pane or visiting Settings. (Reversed from "a closed pane refetches when reopened", which threw drafts away.)

### Embeds and link previews

An `embed` node that stores only the URL. The server fetches metadata (oEmbed where the provider has it, OpenGraph otherwise), stores title, description and a thumbnail copied into our S3, and renders a click-to-play placeholder: the YouTube/Vimeo iframe loads only when clicked, so third-party trackers stay off the page by default. An allow-list of providers get a player; everything else gets a link card. A bare URL on its own line becomes an embed automatically. The same fetcher does link previews.

SSRF: the fetcher uses a safe-by-default HTTP client library (e.g. `doyensec/safeurl`) rather than our own checks. It handles private and link-local ranges including cloud metadata, IPv6, DNS rebinding and redirects. One import. Cap response size and total time. This client is never reused for the S3 endpoint, which a self-hoster may legitimately run on a LAN.

### Images

Uploads go through one storage interface with two drivers: a local directory, the default, which is what development and a self-hoster without a bucket use; and S3-compatible storage (Cloudflare R2 for hosted instances), chosen when the endpoint and bucket are in config. Images are large and R2 space is cheap, so hosted instances always use R2. (Reversed from "S3 only, local later": a local default costs forty lines and removes a bucket from the first run.)

Accepted input formats: JPEG, PNG, WebP, GIF, detected by magic bytes server-side, not by extension or declared type. Anything else is rejected with a clear message. Generated sizes are output as JPEG or PNG only (Go's `x/image/webp` decodes but does not encode); GIFs pass through untouched.

No HEIC decoding. The file input uses `accept="image/jpeg,image/png,image/webp,image/gif"` with JPEG first and never `image/*`: WebKit transcodes a chosen HEIC to the *first* listed type, and `image/*` anywhere in the list hands us HEIC. Android does not transcode; the magic-byte check catches it with the clear message.

Server-side on upload: apply EXIF orientation, strip metadata, generate sizes. Display pictures use the same pipeline with fixed square sizes.

Images are protected per instance: served through the Go backend at `/img/<id>` with a session check. No images outside the web app (the digest carries no content), so no signed URLs.

Images in the editor are cards: the picture small on the left, the alt text field taking the rest, a grip to drag the card between blocks, an X to remove it. No prompt on insert. Adjacent cards join into one block labelled "Gallery of N images", because the post renders a run of adjacent images as a grid: 2 across; 2 then 1; 2 and 2; 2, 2, 1; 4 then 2; 4, 2, 1; 4 and 4. Eight is the most in one gallery; a longer run splits. The gallery exists only at render time (`wrapGalleries` in the frontend): stored HTML is a plain run of `<img>`. Chat has no inline images: pictures attach above the text field as the same cards and are sent as a block of `<img>` before the text. Whether alt text is required is a feature flag.

A post's three-dot menu (Floating UI) holds Edit and Delete as the post's `can` flags allow (see Permissions); comments carry the same menu. Delete asks first, in the browser's own dialog element. Deletion is soft (`deleted_at`): the post leaves every list, its comments go with it because they are only reachable through it, its images go with the next sweep, and a `post_delete` event carrying the id tells open pages to drop it.

Per-image and per-post size caps; a per-instance storage quota enforced at upload (also a pricing lever).

## Data model notes

- Ids: UUIDv7 on every row. The reason is a future merge of two instances' data: an insert rather than a renumbering of every reference, including those inside post bodies.
- Event ordering: the event log has an integer sequence column assigned inside the write transaction, which is therefore commit-ordered. SSE `id:` and `?since=` use it. UUIDs are not used as cursors (generation order is not commit order with a connection pool).
- Every write transaction starts `BEGIN IMMEDIATE`. A deferred transaction that reads then writes can fail with `SQLITE_BUSY_SNAPSHOT`, which `busy_timeout` cannot help with. Consider one connection for writes and a separate read pool.
- Pagination by cursor, never offset, for feed, chat and search.
- Soft delete: `deleted_at` on posts, comments and messages. Deleting a post takes its comments with it: no tombstone, no orphaned thread (see Simplified).
- Edit tracking: `edited_at` flag only; no version history.
- Unread markers: a table of `(user_id, stream, last_read_event_seq)`, one row per user per stream (chat, feed, notifications), updated from the client with a debounce. Lives in the DB so it follows people across devices and feeds the digest and the unanswered-posts view.
- Chat history kept forever, paginated.
- Time: UTC only, ever. Stored and served as Unix milliseconds or RFC 3339 with `Z`. The server never knows a time zone exists; the browser renders relative times and local dates.
- FTS5 indexes a stored plain-text column (bluemonday `StripTagsPolicy` over the body), never the HTML, kept in sync by insert/update/delete triggers (the documented external-content pattern); triggers don't backfill, so a `rebuild` runs after migrations that touch it.

## Mobile

No dedicated mobile app. NEVER multiple codebases. The React app is a PWA; that is the mobile app at launch. Web push on iOS works only for PWAs installed to the home screen, so an install prompt is part of the first version.

Later: Capacitor wraps the same React build for iOS and Android app-store presence and adds native push. Not part of the first version. (Bubblewrap ruled out: Android-only.)

The shell will **not** share the web app's cookie session. Its iOS origin is `capacitor://localhost`, so every API call is cross-site: `SameSite=Lax` cookies are never sent, iOS 14+ blocks third-party cookies in WKWebView by default, and the `WKAppBoundDomains` workaround caps at ten domains, which is incompatible with a "which Sweet?" multi-instance app. The shell will send the session id in an `Authorization: Bearer` header instead. The session store is therefore transport-agnostic from day one: the same opaque session id arrives as a cookie *or* a header. A header change later, not a redesign. Not JWTs: "log out everywhere" needs a server-side lookup anyway, so a self-describing token buys nothing and adds signing keys and refresh semantics. SSE from the shell is a separate question for then.

## Accounts

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

- Web push for mentions and replies to your posts (iOS: installed PWAs only).
- A weekly email digest for anyone who hasn't visited: counts and metadata only (how many posts, in which topics, who joined, how many replies to you, counted from their unread markers) and a link. No post content, no images. Build the digest before push; it's what brings quiet people back.
- Per-user configurable, with "off" one click away.

## Admin tools at launch

Roles: owner, moderator, member. One owner: the person who runs this place. The owner sets anyone to member or moderator from the People page; a moderator can delete anything and edit nothing of others', exactly as the owner can, but cannot change roles. Transferring ownership is a separate, explicit action, later. A role change is a `user` event, so every open page's controls follow it.

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

One Go function, `CanSee(viewer, thing)`, that every query path goes through. A table-driven test file covers each viewer state (anonymous, member, moderator, author, removed) against each thing type (post, comment, chat message, image, topic). No feed query bypasses it for performance until a test proves the bypass gives the same answer. Non-negotiable: this is the promise the product makes.

## Permissions

The write side of the same promise, in the same shape. One package, `internal/perm`, holds every rule about who may do what to what (`EditPost`, `DeletePost`, `EditComment`, `DeleteComment`, and so on as actions arrive; `CanSee` lives there too when it is built). The rules are plain functions over an actor (id, role) and the thing's ownership facts, with one table-driven test, one row per (who, what) pair. Every write handler fetches the thing's owners, asks perm, and answers 403 if the answer is no; no query carries an author clause of its own.

The frontend holds no permission logic. Every post, comment and message the API serves carries `can: {edit, delete}`, computed by perm for the requesting user on the way out, and `/api/me` carries the instance-level abilities (`invite`, `manage_roles`). Menus and buttons show what the flags say. There is nothing to keep aligned because there is only one implementation; a role change arrives as a `user` event and the client refetches what it holds. (Considered and rejected: mirroring the rules in TypeScript with a shared test table. Two implementations of a rule are a rule that will drift, which is how Sweet got four body formats.)

## Client data

One cache, TanStack Query, holds every piece of server data the client has: me, users, posts, comments, messages, invites. Components render from it and keep no server data in their own state. The event stream is the cache's write path: each event is one upsert or one delete into the cache, and a reconnect invalidates everything, which is the only refetch the app ever needs while the stream is up. People are normalised: posts, comments and messages render their author from the users query by id, not from the author snapshot they arrived with, so a changed picture, name or role shows everywhere at once. Pagination is cursor pages inside the cache (infinite queries), never component state.

## Testing and operations

- The failing test comes first, for every behaviour change. Go tests for handlers, rules and sweeps; Vitest with happy-dom and Testing Library for pure functions and component state. No browser-driven or visual suite for now (Playwright and Storybook both declined, 2026-11-04). Bugs found after the fact are the thing this rule exists to prevent.
- A change is verified on every surface it touches, not only the one it was made for: a layout change at phone width too; a data-shape change everywhere that data is shown. Tests live in the repo; nothing that only ran once on a laptop counts.
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
| DMs | Private one-to-one messages | The chat room covers it; Sweet had three mentions of wanting DMs in two and a half years and people used Twitter instead | If members ask, or if an instance has no shared outside channel |
| Native app / Capacitor | Wrapping the React build for the app stores, with native push | Its own account setup, store reviews, a "which Sweet?" screen, and a token auth mode; nothing in v1 depends on it. PWA with web push covers mobile | When store presence or iOS push for non-installed users matters |
| Orchestrator web UI and self-serve instance creation | A superadmin web app, and a public form that creates an instance | A CLI does the same job while instances are few; v0 is "email Raph". The provision/setup/onboarding boundary is designed so the form is one automated step later | When there are more instances than fit in memory, or when payment arrives |
| Bounce tracking | Marking addresses as bouncing after provider webhooks report failures | Needs provider webhooks and vendor coupling. A "didn't get it? resend or change address" screen gives the user what they need | If silent delivery failures show up in support |
| Custom domains | `sweet.theirgroup.org` via on-demand TLS | One wildcard cert for `*.sweet.community` covers v0; on-demand TLS needs an `ask` endpoint from the orchestrator | When a group asks |
| Presence / typing indicators | "Who's online" and "X is typing" in chat | Would push realtime towards WebSockets; SSE is simpler and sufficient without them | If chat feels dead without them |
| Sub-group topics | Topics as places with their own membership | Sweet data: 81% of posts went to the main feed, 118 of 203 posters never posted in a community, 47 of 53 communities died. Topics stay as views on one feed | Probably never |
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
