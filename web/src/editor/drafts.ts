import { store, stored, storedKeys, unstore } from '../storage'

/**
 * Unsent text kept in this browser, so a reload or a closed tab does not lose it. Each editor has its own key, such
 * as `post:<group id>`. Each draft is stored under the signed-in user's id, so another account in the same browser
 * does not get it. Each draft is its own storage entry, so two tabs that write different drafts do not overwrite each
 * other.
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
    const saved = JSON.parse(stored(name) ?? 'null') as Saved | null
    return saved && typeof saved.html === 'string' && typeof saved.at === 'number' ? saved : null
  } catch {
    return null
  }
}

/**
 * Sends each change of a draft to the other editors in this tab that show the same draft. A post's thread can be open
 * on Home and on the post's own page at once.
 */
const changes = new EventTarget()

function changed(name: string, html: string | null, from: object | undefined) {
  changes.dispatchEvent(new CustomEvent(name, { detail: { html, from } }))
}

export function loadDraft(user: string, key: string): string | null {
  return read(entry(user, key))?.html ?? null
}

/** Saves a draft. `from` is the editor that saved it, which does not receive its own change. */
export function saveDraft(user: string, key: string, html: string, from?: object) {
  store(entry(user, key), JSON.stringify({ html, at: Date.now() }))
  changed(entry(user, key), html, from)
}

export function clearDraft(user: string, key: string, from?: object) {
  unstore(entry(user, key))
  changed(entry(user, key), null, from)
}

/**
 * Calls `onChange` when another editor in this tab saves or clears the same draft. `self` is the editor that
 * watches. Returns a function that stops watching.
 */
export function watchDraft(user: string, key: string, self: object, onChange: (html: string | null) => void) {
  const name = entry(user, key)
  const listener = (e: Event) => {
    const { html, from } = (e as CustomEvent<{ html: string | null; from?: object }>).detail
    if (from !== self) onChange(html)
  }
  changes.addEventListener(name, listener)
  return () => changes.removeEventListener(name, listener)
}

/** Deletes every draft in this browser, of every user. App calls it when the signed-in user query returns no user. */
export function clearDrafts() {
  for (const name of storedKeys(PREFIX)) unstore(name)
}

/** Deletes the drafts that have not been saved for KEEP_FOR, and any stored value that is not a draft. */
export function pruneDrafts() {
  const now = Date.now()
  for (const name of storedKeys(PREFIX)) {
    const saved = read(name)
    if (!saved || now - saved.at >= KEEP_FOR) unstore(name)
  }
}
