import { beforeEach, describe, expect, it, vi } from 'vitest'

const http = vi.hoisted(() => ({ get: vi.fn() }))
const prefs = vi.hoisted(() => {
  const values = new Map<string, string>()
  return {
    values,
    get: vi.fn(async ({ key }: { key: string }) => ({ value: values.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => void values.set(key, value)),
    remove: vi.fn(async ({ key }: { key: string }) => void values.delete(key)),
  }
})
const cookies = vi.hoisted(() => ({ clearCookies: vi.fn(async () => undefined) }))
vi.mock('@capacitor/core', () => ({ CapacitorHttp: http, CapacitorCookies: cookies }))
vi.mock('@capacitor/preferences', () => ({ Preferences: prefs }))

import {
  addCommunity,
  findCommunity,
  lastCommunity,
  loadCommunities,
  removeCommunity,
  setLastCommunity,
  toAddress,
} from './communities'

beforeEach(() => {
  prefs.values.clear()
  vi.clearAllMocks()
})

describe('toAddress', () => {
  it('turns what a person types into the address of the site, over https', () => {
    expect(toAddress('sweet.example.org')).toBe('https://sweet.example.org')
    expect(toAddress('  Sweet.Example.org/p/123  ')).toBe('https://sweet.example.org')
    expect(toAddress('https://sweet.example.org/')).toBe('https://sweet.example.org')
    expect(toAddress('http://sweet.example.org')).toBe('https://sweet.example.org')
  })

  it('keeps plain http for a server on this computer, for development', () => {
    expect(toAddress('http://localhost:5173')).toBe('http://localhost:5173')
    expect(toAddress('http://10.0.2.2:8080')).toBe('http://10.0.2.2:8080')
  })

  it('refuses what is not an address', () => {
    expect(toAddress('')).toBeNull()
    expect(toAddress('friends')).toBeNull()
    expect(toAddress('ftp://sweet.example.org')).toBeNull()
    expect(toAddress('not an address.org')).toBeNull()
  })
})

describe('findCommunity', () => {
  it('reads the community name from the public settings', async () => {
    http.get.mockResolvedValue({ status: 200, data: { name: 'Book club', description: '', owner_set: true } })
    await expect(findCommunity('https://sweet.example.org')).resolves.toEqual({
      url: 'https://sweet.example.org',
      name: 'Book club',
    })
    expect(http.get).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://sweet.example.org/api/settings' }))
  })

  it('says when the address answers but is not a Sweet community', async () => {
    http.get.mockResolvedValue({ status: 200, data: '<html>' })
    await expect(findCommunity('https://example.org')).rejects.toThrow('There is no Sweet community at example.org.')
    http.get.mockResolvedValue({ status: 404, data: {} })
    await expect(findCommunity('https://example.org')).rejects.toThrow('There is no Sweet community at example.org.')
  })

  it('says when the address cannot be reached', async () => {
    http.get.mockRejectedValue(new Error('offline'))
    await expect(findCommunity('https://sweet.example.org')).rejects.toThrow(
      'Could not reach sweet.example.org. Check the address and your connection.',
    )
  })
})

describe('the list on this device', () => {
  it('starts empty, keeps communities in the order they were added, and names an added one again', async () => {
    expect(await loadCommunities()).toEqual([])
    await addCommunity({ url: 'https://a.example.org', name: 'A' })
    await addCommunity({ url: 'https://b.example.org', name: 'B' })
    await addCommunity({ url: 'https://a.example.org', name: 'A renamed' })
    expect(await loadCommunities()).toEqual([
      { url: 'https://a.example.org', name: 'A renamed' },
      { url: 'https://b.example.org', name: 'B' },
    ])
  })

  it('removing a community signs this device out of it and forgets it as the last one opened', async () => {
    await addCommunity({ url: 'https://a.example.org', name: 'A' })
    await addCommunity({ url: 'https://b.example.org', name: 'B' })
    await setLastCommunity('https://a.example.org')
    await removeCommunity('https://a.example.org')
    expect(await loadCommunities()).toEqual([{ url: 'https://b.example.org', name: 'B' }])
    expect(cookies.clearCookies).toHaveBeenCalledWith({ url: 'https://a.example.org' })
    expect(await lastCommunity()).toBeNull()
  })

  it('reads a damaged list as empty', async () => {
    prefs.values.set('sweet.communities', 'not json')
    expect(await loadCommunities()).toEqual([])
  })
})
