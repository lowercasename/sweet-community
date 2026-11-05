# Working on Sweet v2

`architecture.md` is the source of truth. Old Sweet's mistakes were duplication and drift: four body formats, derived data the client controlled, two versions of a thing that could disagree. Every decision in that document is a guard against one of them. Work that ignores it recreates them.

## Before any work

1. Read the part of `architecture.md` the request belongs to, and say which part. If the request belongs to a system the document does not have yet, stop and frame it with Raphael before building: what the system is, what else it touches, what the rule is.
2. Conform to the document, or agree a deviation with Raphael first and reach a joint understanding of how the behaviour works. Never deviate quietly, never guess at a reading of the document on a point it does not settle.
3. Record the work in `architecture.md`: the decision, the reasoning, and reversals in the Record section. A change that is not in the document is not finished.

## Claims about old Sweet

Raphael, 2 November 2026: "Don't answer my questions or provide suggestions without at least trying to back yourself up with data, ever. The longer we talk, the more your context drifts and you start supplying thinking based on your own thinking."

Every statement about what old Sweet had, did, or what happened on it is checked against the database dump before it is made, and quoted with the number. No statement from memory, ever: memory has already produced "there were no private groups" (there were 14) and "anyone could join" (10 were by approval). The dump is `json/*.json` (communities, posts, users, relationships, tags, votes, notifications, images); ask Raphael where it lives if it is not in the scratchpad. It contains emails and password hashes: read it with `python3 -I`, print aggregates and community names only, never a user record, and never commit any of it. If the data does not answer a question, say so and give the opinion as an opinion.

## How work is done

- The failing test comes first. Go tests for handlers, rules and sweeps; Vitest with happy-dom and Testing Library for pure functions and component state; Playwright (`web/e2e`) for flows through the real browser against the real binary and against the Vite dev server. A behaviour that crosses a boundary (server to client, stream to cache, CSS to layout) gets a Playwright test, not only unit tests. Bugs found afterwards are the failure this exists to prevent.
- A change is verified on every surface it touches: phone width as well as desktop; every place a changed piece of data is shown. Name those surfaces before starting.
- One place for each thing: rules in `internal/perm`, wire shapes in `internal/api/wire.go` (a handler writes, re-reads the row, and hands it to the builder; never a hand-built payload), server data in the TanStack Query cache, body sanitising in bluemonday, styling in `web/src/ui`. If a second copy of something is appearing, that is the bug.
- Keep it simple. Prefer a library over handwritten code when a well-known one does the job; flag such cases. Buttons are primary, secondary or ghost. Tailwind classes only inside `web/src/ui`; everything else composes primitives (`pnpm check:atomic`).
- Prettier: two spaces, single quotes, no semicolons (`.prettierrc`). Go is gofmt.

## Work on main, directly

Raphael (2026-11-05): no worktrees, no branches; they are annoying. Work in the main tree on `main`. His `pnpm dev` hot-reloads that tree, so a half-finished edit can land in his open tab: keep a change's files written together in one go, run the checks before saying a thing is done, and when he reports something odd that no commit explains, reproduce it on a clean build before treating it as a bug.

## Checks before a commit

```
go vet ./... && go test ./...
cd web && pnpm typecheck && pnpm check:atomic && pnpm test
make e2e
```

## Data to keep out of outputs

Never print or commit `data/sweet.db` (Raphael's own database) or any dump containing emails or password hashes.
