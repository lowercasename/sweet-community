// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { chatExtensions, postExtensions } from './extensions'
import { embedLinks } from './embed'

/**
 * A link on its own line becomes a link preview card. In a post or a comment, Enter after the link converts it, and
 * the last line converts when the post is saved. In chat every such line converts when the message is sent. A card
 * can be turned back into a plain link, which is then marked so that it stays a link.
 */
const URL_A = 'https://plots.test/open-day'
const card = (url: string) =>
  `<p data-embed=""><a target="_blank" rel="noopener noreferrer nofollow" href="${url}">${url}</a></p>`
const plain = (url: string) =>
  `<p><a target="_blank" rel="noopener noreferrer nofollow" href="${url}" data-plain-link="">${url}</a></p>`

let editor: Editor | null = null
afterEach(() => {
  editor?.destroy()
  editor = null
})

function make(html: string, extensions = postExtensions) {
  editor = new Editor({ extensions, content: html })
  return editor
}

describe('link preview cards in the editor', () => {
  it('Enter at the end of a line that is only a link turns the line into a card', () => {
    const e = make(`<p>${URL_A}</p>`)
    e.commands.focus('end')
    e.commands.keyboardShortcut('Enter')
    expect(e.getHTML()).toBe(card(URL_A) + '<p></p>')
  })

  it('Enter after a link with other words on the line does nothing special', () => {
    const e = make(`<p>See ${URL_A}</p>`)
    e.commands.focus('end')
    e.commands.keyboardShortcut('Enter')
    expect(e.getHTML()).not.toContain('data-embed')
  })

  it('a link kept plain is not turned into a card again', () => {
    const e = make(plain(URL_A))
    e.commands.focus('end')
    e.commands.keyboardShortcut('Enter')
    expect(e.getHTML()).not.toContain('data-embed')
    expect(embedLinks(e, 'last')).toBe(false)
  })

  it('on saving, only a last line that is only a link becomes a card', () => {
    const e = make(`<p>Hello</p><p>${URL_A}</p>`)
    expect(embedLinks(e, 'last')).toBe(true)
    expect(e.getHTML()).toBe('<p>Hello</p>' + card(URL_A))
    const f = make(`<p>${URL_A}</p><p>Hello</p>`)
    expect(embedLinks(f, 'last')).toBe(false)
    expect(f.getHTML()).not.toContain('data-embed')
  })

  it('in chat, every line that is only a link becomes a card when the message is sent', () => {
    const b = 'https://plots.test/swap'
    const e = make(`<p>${URL_A}</p><p>and</p><p>${b}</p>`, chatExtensions)
    expect(embedLinks(e, 'all')).toBe(true)
    expect(e.getHTML()).toBe(card(URL_A) + '<p>and</p>' + card(b))
  })

  it('in chat, a link on a line of its own after a line break becomes a card, and the text before it stays', () => {
    const e = make(`<p>Who is going<br>${URL_A}</p>`, chatExtensions)
    expect(embedLinks(e, 'all')).toBe(true)
    expect(e.getHTML()).toBe('<p>Who is going</p>' + card(URL_A))
  })

  it('turning a card back gives a link that is kept plain', () => {
    const e = make(card(URL_A))
    e.commands.unembed(0)
    expect(e.getHTML()).toBe(plain(URL_A))
  })
})
