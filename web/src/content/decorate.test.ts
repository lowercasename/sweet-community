// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { decorate } from './decorate'

const mention = (id: string, name: string) => `<span data-type="mention" data-mention-id="${id}">@${name}</span>`

describe('decorate', () => {
  it('links a mention to the user by their current name, and keeps the stored name for an unknown id', () => {
    const html = `<p>hi ${mention('u1', 'kit')} and ${mention('u2', 'old')}</p>`
    expect(decorate(html, { names: new Map([['u1', 'kitten']]) })).toBe(
      '<p>hi <a href="/u/kitten" data-mention-id="u1">@kitten</a> and <a href="/u/old" data-mention-id="u2">@old</a></p>',
    )
  })

  it('returns a body without mentions unchanged', () => {
    expect(decorate('<p>nothing here #tag</p>')).toBe('<p>nothing here #tag</p>')
  })
})
