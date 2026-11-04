# Sweet v2 — web

Frontend proof of concept. Vite + React 18 + TypeScript, TipTap for the editor, Tailwind v4 for styling. No component framework.

The look is old Sweet's colour scheme on its dotted paper, nothing else: Ubuntu, The Best Red `#ce1717` and pinks lightened from it, white hairline cards, sky-blue links that turn red on hover. The tokens live in `src/global.css` under `@theme`; the font is bundled via fontsource so an instance never calls Google. Icons are Lucide, wrapped by `ui/Icon`.

Buttons have three variants and no others: `primary` (filled pink), `secondary` (outlined), `ghost` (bare; also the toggle style with `pressed`).

There is no header. A collapsible nav column on the left (`components/Sidebar`: the S mark, Home, Search, Notifications, People, Settings, the account, and an expand control at the bottom; only Home is live) and then posts and chat either side of a draggable divider (`ui/Split`): drag to resize, drag a pane past the edge and it folds into a vertical rail (`ui/Rail`) that reopens it; the divider is keyboard-operable (arrows, Home/End) and double-click resets. Below 800px the nav column goes and a bottom tab bar (`ui/TabBar`) carries Posts, Chat, Search, Alerts and Menu. Width, open panes and nav expansion persist per browser.

## Commands

```
pnpm install
pnpm dev            # http://localhost:5173, proxies /api and /healthz to http://localhost:8080
pnpm build          # tsc --noEmit && vite build → ../internal/web/dist (embedded by the Go binary)
pnpm typecheck      # tsc --noEmit
pnpm check:atomic   # fails if raw HTML tags appear outside src/ui/
pnpm test           # editor HTML round-trip test (vitest + happy-dom)
```

Run the backend from the repo root (`make dev-backend`) alongside `pnpm dev`. The dev proxy passes `/api/events` through unbuffered so SSE works via `EventSource('/api/events')` on the same origin.

## Component rule

Everything is a component, down to the smallest bit of HTML.

- `src/components/BodyEditor.tsx` is the one editor: posts, chat and comments differ only in schema (`src/editor/extensions.ts`), size and submit key. A quote-reply is `editor/quote.ts` appending a blockquote.
- `src/ui/` — primitives. Each wraps one HTML element or one layout concern and is the **only** place that element appears: `Box`, `Stack`, `Row`, `Text`, `Heading`, `Link`, `Button`, `Time`, `Hairline`, `Form`, `HtmlContent`, `EditorSurface`, `Icon`, `Shell`, `NavBar`, `NavItem`, `NavAccount`, `Wordmark`, `Avatar`, `Split`, `Panes`, `Pane`, `Rail`, `TabBar`, `Card`, `Bar`, `ScrollArea`, `Measure`. Tailwind classes appear only here; `pnpm check:atomic` fails on a `className` or `style` prop anywhere in `components/` or `pages/`. The two non-utility rule sets (`.content` for rendered bodies, `.editor` for TipTap) are in `src/global.css`.
- `src/components/` — composites built only from `src/ui/` primitives and other components: `Header`, `ConnectionStatus`, `Post`, `PostList`, `Composer`.
- `src/pages/` — `Feed`.
- `HtmlContent` is the one component allowed to use `dangerouslySetInnerHTML`. It renders HTML the server has already sanitised (bluemonday). Never pass it client-generated HTML.
- `pnpm check:atomic` greps `src/components` and `src/pages` for raw tags (`<div`, `<span`, `<p`, `<a`, `<button`, `<h1-6`, `<form`, `<input`, `<time`, `<hr`, `<ul`, `<ol`, `<li`, …) and for `dangerouslySetInnerHTML` outside `src/ui/HtmlContent.tsx`, and fails on any hit.

## Editor

`src/editor/extensions.ts` is the single schema definition used by the `Composer` and by `src/editor/roundtrip.test.ts`: StarterKit (paragraph, h2/h3, bold, italic, strike, bullet/ordered lists, blockquote, hard break, undo/redo) plus `@tiptap/extension-link`. Underline, code, code block, horizontal rule and StarterKit's bundled Link and TrailingNode are disabled. The round-trip test asserts `setContent(html)` → `getHTML()` returns the fixture unchanged, with fixtures written exactly as TipTap serialises today, so a TipTap upgrade that changes serialisation fails the test.

Shortcuts only, no toolbar: Bold ⌘B, Italic ⌘I, Link ⌘K (prompts for a URL), Post ⌘Enter.

## API contract (as implemented in `src/api.ts` and `src/hooks/useEventStream.ts`)

Same origin, JSON, timestamps are Unix milliseconds UTC, ids are UUID strings.

- `GET /healthz` → `200 ok` (used as a liveness ping every 30 s while the tab is visible).
- `GET /api/me` → `{ id, username }`.
- `GET /api/posts?before=<created_at ms>&limit=<n>` → `{ posts: Post[], next_before: number | null }`, newest first.
  `Post = { id, author: { id, username }, body_html, body_text, created_at }`.
- `POST /api/posts` body `{ body_html }` → `201 Post`; `400 { error }` if empty after sanitisation. The error text is shown under the composer.
- `GET /api/events` → SSE. Each event: `id: <seq>`, `event: post`, `data: <Post JSON>`. Heartbeat comment `: hb` every 15 s. Honours `?since=<seq>` (and `Last-Event-ID`) by replaying from the database before going live.

## Realtime (`useEventStream`)

- Opens `EventSource('/api/events?since=<lastSeq>')`, omitting the param while `lastSeq` is 0. `lastSeq` is taken from each event's `lastEventId`.
- Status: `connecting | live | reconnecting | offline`. `ConnectionStatus` shows nothing while live.
- `EventSource` cannot see heartbeat comments, so liveness is checked by `GET /healthz` every 30 s while the document is visible; a failed ping sets `offline`, a successful ping while `offline` reopens the stream.
- On `visibilitychange` (to visible), `pageshow` and `online` the stream is closed and reopened regardless of `readyState` (iOS kills background sockets silently). On `offline` the status is set to `offline` and the stream closed.
- If the browser gives up reconnecting (`readyState === CLOSED`), the hook reopens itself after 3 s.
- Nothing is lost across reconnects because the server replays from `?since`. The feed dedupes posts by `id`.
- No offline posting: the submit button is disabled while offline or while the editor is empty.
