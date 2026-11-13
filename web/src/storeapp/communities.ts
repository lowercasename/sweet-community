import { CapacitorHttp } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { forgetCommunity } from './native'

/**
 * The communities the store app knows on this device. The list is kept in the app's native storage, because the
 * phone may clear a web view's localStorage. No server knows the list. Each community keeps its own account and its
 * own session cookie.
 */

export interface Community {
  /** The community's address, such as https://sweet.example.org. It identifies the community in the list. */
  url: string
  /** The community's name, as its sign-in page shows it. */
  name: string
}

const LIST = 'sweet.communities'
const LAST = 'sweet.lastCommunity'

/** Hosts that are this computer, as seen from a simulator or an emulator. Only they may use plain http. */
const LOCAL = new Set(['localhost', '127.0.0.1', '10.0.2.2'])

/**
 * Turns what a person typed into a community's address: the scheme, host and port, with no path. Https is assumed,
 * and plain http is upgraded, except on this computer for development. Returns null for something that is not an
 * address.
 */
export function toAddress(typed: string): string | null {
  let s = typed.trim()
  if (!s) return null
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!LOCAL.has(u.hostname) && !u.hostname.includes('.')) return null
  if (u.protocol === 'http:' && !LOCAL.has(u.hostname)) u.protocol = 'https:'
  return u.origin
}

/** The host of an address, for showing in the list and in messages. */
export function hostOf(url: string): string {
  return new URL(url).host
}

/**
 * Reads a community's public name, which also shows that the address is a Sweet community. The request goes through
 * the app's native HTTP, because the community is another site to the app's own page. Rejects with a sentence for the
 * person when the address cannot be reached or is not a Sweet community.
 */
export async function findCommunity(url: string): Promise<Community> {
  const host = hostOf(url)
  let res: { status: number; data: unknown }
  try {
    res = await CapacitorHttp.get({
      url: `${url}/api/settings`,
      headers: { Accept: 'application/json' },
      connectTimeout: 10_000,
      readTimeout: 10_000,
    })
  } catch {
    throw new Error(`Could not reach ${host}. Check the address and your connection.`)
  }
  const data = res.data as { name?: unknown; owner_set?: unknown } | null
  if (res.status !== 200 || typeof data !== 'object' || data === null || typeof data.name !== 'string') {
    throw new Error(`There is no Sweet community at ${host}.`)
  }
  return { url, name: data.name.trim() || host }
}

/** The communities on this device, in the order they were added. A damaged list reads as empty. */
export async function loadCommunities(): Promise<Community[]> {
  const { value } = await Preferences.get({ key: LIST })
  try {
    const list: unknown = JSON.parse(value ?? '[]')
    if (!Array.isArray(list)) return []
    return list.filter(
      (c): c is Community => typeof c?.url === 'string' && typeof c?.name === 'string' && toAddress(c.url) === c.url,
    )
  } catch {
    return []
  }
}

async function save(list: Community[]) {
  await Preferences.set({ key: LIST, value: JSON.stringify(list) })
}

/** Adds a community at the end of the list. A community already in the list keeps its place and takes the new name. */
export async function addCommunity(c: Community): Promise<Community[]> {
  const list = await loadCommunities()
  const next = list.some((x) => x.url === c.url) ? list.map((x) => (x.url === c.url ? c : x)) : [...list, c]
  await save(next)
  return next
}

/**
 * Removes a community from the list and signs this device out of it, by deleting its cookies. The account and its
 * other sessions are not changed.
 */
export async function removeCommunity(url: string): Promise<Community[]> {
  const next = (await loadCommunities()).filter((c) => c.url !== url)
  await save(next)
  if ((await lastCommunity()) === url) await setLastCommunity(null)
  await forgetCommunity(url)
  return next
}

/** The address of the community opened last, which the app opens at start. */
export async function lastCommunity(): Promise<string | null> {
  return (await Preferences.get({ key: LAST })).value
}

export async function setLastCommunity(url: string | null) {
  if (url === null) await Preferences.remove({ key: LAST })
  else await Preferences.set({ key: LAST, value: url })
}
