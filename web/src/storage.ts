/**
 * The browser's local storage, for what this browser keeps for its user: drafts, the layout and a dismissed prompt.
 * Storage can be unavailable, such as in a private window or when the browser blocks it. Then a read finds nothing
 * and a write does nothing. A write also does nothing when storage is full.
 */

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function stored(key: string): string | null {
  return storage()?.getItem(key) ?? null
}

export function store(key: string, value: string) {
  try {
    storage()?.setItem(key, value)
  } catch {
    // Storage is full.
  }
}

export function unstore(key: string) {
  storage()?.removeItem(key)
}

/** The stored keys that start with a prefix. */
export function storedKeys(prefix: string): string[] {
  return Object.keys(storage() ?? {}).filter((key) => key.startsWith(prefix))
}
