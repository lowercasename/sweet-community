/**
 * Unsent text kept in this browser, so a reload or a closed tab does not lose it. Each editor has its own key, such
 * as `post:<group id>`, and each draft is stored under the signed-in user's id, so another account in the same
 * browser does not get it. Each draft is its own storage entry, so two tabs writing different drafts never overwrite
 * each other. Storage can be unavailable, and then nothing is kept.
 */

const PREFIX = 'sweet.draft.'
/** A draft not saved for this long is deleted. */
const KEEP_FOR = 30 * 24 * 60 * 60 * 1000

interface Saved {
  html: string
  at: number
}

const entry = (user: string, key: string) => `${PREFIX}${user}.${key}`

function read(name: string): Saved | null {
  try {
    const saved = JSON.parse(localStorage.getItem(name) ?? 'null') as Saved | null
    return saved && typeof saved.html === 'string' && typeof saved.at === 'number' ? saved : null
  } catch {
    return null
  }
}

export function loadDraft(user: string, key: string): string | null {
  return read(entry(user, key))?.html ?? null
}

export function saveDraft(user: string, key: string, html: string) {
  try {
    localStorage.setItem(entry(user, key), JSON.stringify({ html, at: Date.now() }))
  } catch {
    // Storage is full or unavailable. The draft lasts while its page is open.
  }
}

export function clearDraft(user: string, key: string) {
  try {
    localStorage.removeItem(entry(user, key))
  } catch {
    // Storage is unavailable, so there is nothing to delete.
  }
}

/** The names of every stored draft, of every user. */
function names(): string[] {
  try {
    return Object.keys(localStorage).filter((name) => name.startsWith(PREFIX))
  } catch {
    return []
  }
}

/** Deletes every draft in this browser, of every user. The app calls it when it finds itself signed out. */
export function clearDrafts() {
  for (const name of names()) {
    try {
      localStorage.removeItem(name)
    } catch {
      return
    }
  }
}

/** Deletes the drafts that have not been saved for 30 days, and any stored value that is not a draft. */
export function pruneDrafts(now = Date.now()) {
  for (const name of names()) {
    const saved = read(name)
    if (saved && now - saved.at < KEEP_FOR) continue
    try {
      localStorage.removeItem(name)
    } catch {
      return
    }
  }
}
