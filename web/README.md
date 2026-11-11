# Sweet v2 web client

React 18, TypeScript, Vite, TanStack Query for server data, wouter for routing, TipTap for the editor, Tailwind v4 for styling, Floating UI for menus and cards, Lucide for icons. No component framework. The Ubuntu font is bundled with fontsource, so the app makes no requests to Google.

`architecture.md` at the repository root records Sweet's design and the reasons for it. This file covers how the client code is organised and how to run it.

## Commands

```
pnpm install
pnpm dev            # http://localhost:5173, proxies /api, /img and /healthz to http://localhost:8080
pnpm build          # tsc --noEmit, then vite build into ../internal/web/dist (embedded by the Go binary)
pnpm typecheck      # tsc --noEmit
pnpm check:atomic   # fails if raw HTML tags, className or style appear outside src/ui/
pnpm format:check   # Prettier: two spaces, single quotes, no semicolons
pnpm test           # Vitest with happy-dom and Testing Library
pnpm e2e            # Playwright, against the built binary and the dev server (run make e2e from the root)
pnpm e2e:release    # Selected sign-in and privacy checks on desktop, phone and the dev server
```

The image workflow runs `e2e:release` before publishing. It selects existing tests marked `@release`. A failure blocks publication and saves browser traces and screenshots for seven days. Use this command locally when changing these flows. Other changes can run the tests they affect.

Run the backend from the repository root with `make dev-backend` alongside `pnpm dev`. The dev proxy passes `/api/events` through unbuffered, so the server-sent event stream works on the same origin.

## Code layout

- `src/ui/` holds the primitives. Each primitive wraps one HTML element or one layout concern, and is the only place that element appears. Tailwind classes appear only in this directory. The colour tokens are in `src/global.css` under `@theme`.
- `src/components/` and `src/pages/` are built only from primitives and other components. `pnpm check:atomic` fails on a raw HTML tag, a `className` or a `style` prop in either directory.
- `src/ui/HtmlContent.tsx` is the only component allowed to use `dangerouslySetInnerHTML`. It renders HTML that the server has already sanitised with bluemonday. Never pass it HTML built in the client.
- `src/data/` holds server data. `hooks.ts` wraps TanStack Query, `keys.ts` names the cache entries, and `apply.ts` applies each event from the stream to the cache. Server data lives only in the query cache.
- `src/editor/` holds the TipTap schemas (`extensions.ts`), image upload (`images.ts`) and mentions (`mentions.ts`). `src/components/BodyEditor.tsx` is the one editor. Posts, comments, chat and bios differ only in schema, size and submit key.
- `src/hooks/useEventStream.ts` keeps the event stream open. It reconnects with `?since=` so no event is missed, pings `/healthz` every 30 seconds while the page is visible, and reopens the stream on `visibilitychange`, `pageshow` and `online`, because iOS closes background connections without notice.
- `src/api.ts` holds the request functions and the response types. The server's wire shapes are defined in `internal/api/wire.go`.

## Buttons

There are four variants: `primary` (filled red, the main action), `secondary` (outlined), `ghost` (no border, also used for toggles with `pressed`) and `danger` (outlined in red, for removing things). The rules for when to use each, and the eight layout patterns every surface follows, are in the Interface section of `architecture.md`.
