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

- The failing test comes first. Go tests for handlers, rules and sweeps; Vitest with happy-dom and Testing Library for pure functions and component state. No browser-driven or visual suite (declined). Bugs found afterwards are the failure this exists to prevent.
- A change is verified on every surface it touches: phone width as well as desktop; every place a changed piece of data is shown. Name those surfaces before starting.
- One place for each thing: rules in `internal/perm`, server data in the TanStack Query cache, body sanitising in bluemonday, styling in `web/src/ui`. If a second copy of something is appearing, that is the bug.
- Keep it simple. Prefer a library over handwritten code when a well-known one does the job; flag such cases. Buttons are primary, secondary or ghost. Tailwind classes only inside `web/src/ui`; everything else composes primitives (`pnpm check:atomic`).
- Prettier: two spaces, single quotes, no semicolons (`.prettierrc`). Go is gofmt.

## Never edit the tree Raphael is running

Raphael's `pnpm dev` serves the main working tree with hot reload, so a file written there lands in his open tab the moment it is saved, half-finished. Twice on 2026-11-04 and 05 that produced ghost layouts (a members page over a still-visible group view; a duplicated settings card) that did not exist in any commit. All work happens in a git worktree (the EnterWorktree tool) and reaches the main tree only as a commit that has passed the checks below. If the worktree is unavailable, say so and ask before writing into the main tree.

## Checks before a commit

```
go vet ./... && go test ./...
cd web && pnpm typecheck && pnpm check:atomic && pnpm test
```

## Data to keep out of outputs

Never print or commit `data/sweet.db` (Raphael's own database) or any dump containing emails or password hashes.
