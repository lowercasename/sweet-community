// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearDraft, clearDrafts, loadDraft, pruneDrafts, saveDraft } from './drafts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('drafts', () => {
  it('keeps a draft for one user and one editor', () => {
    saveDraft('kit', 'post:room', '<p>Half a thought</p>')
    expect(loadDraft('kit', 'post:room')).toBe('<p>Half a thought</p>')
    expect(loadDraft('kit', 'post:other')).toBeNull()
    expect(loadDraft('mo', 'post:room')).toBeNull()
    clearDraft('kit', 'post:room')
    expect(loadDraft('kit', 'post:room')).toBeNull()
  })

  it('deletes every draft, of every user, and nothing else in storage', () => {
    saveDraft('kit', 'post:room', '<p>a</p>')
    saveDraft('mo', 'message:room', '<p>b</p>')
    localStorage.setItem('sweet.layout', 'both')
    clearDrafts()
    expect(loadDraft('kit', 'post:room')).toBeNull()
    expect(loadDraft('mo', 'message:room')).toBeNull()
    expect(localStorage.getItem('sweet.layout')).toBe('both')
  })

  it('deletes drafts that have not been saved for 30 days', () => {
    const day = 24 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(0)
    saveDraft('kit', 'old', '<p>old</p>')
    vi.spyOn(Date, 'now').mockReturnValue(20 * day)
    saveDraft('kit', 'recent', '<p>recent</p>')
    vi.spyOn(Date, 'now').mockReturnValue(31 * day)
    pruneDrafts()
    expect(loadDraft('kit', 'old')).toBeNull()
    expect(loadDraft('kit', 'recent')).toBe('<p>recent</p>')
  })

  it('keeps nothing and throws nothing when storage is unavailable', () => {
    // A browser that blocks storage throws when the page reads window.localStorage.
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => saveDraft('kit', 'post:room', '<p>a</p>')).not.toThrow()
    expect(loadDraft('kit', 'post:room')).toBeNull()
    expect(() => pruneDrafts()).not.toThrow()
    expect(() => clearDrafts()).not.toThrow()
  })

  it('ignores a stored value that is not a draft', () => {
    localStorage.setItem('sweet.draft.kit.post:room', 'not json')
    expect(loadDraft('kit', 'post:room')).toBeNull()
    expect(() => pruneDrafts()).not.toThrow()
  })
})
