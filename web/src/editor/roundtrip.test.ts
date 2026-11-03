// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { extensions } from './extensions'

/**
 * Round-trip guard: setContent(html) then getHTML() must return the same
 * string. The fixtures are written exactly as TipTap serialises them today,
 * so a TipTap upgrade that changes serialisation fails this test.
 * One fixture per node and mark in the schema. Note TipTap serialises marks in
 * schema order (strong, em, s) regardless of input nesting.
 */
const fixtures: Record<string, string> = {
  paragraph: '<p>Hello, world.</p>',
  'two paragraphs': '<p>One.</p><p>Two.</p>',
  h2: '<h2>Heading two</h2><p>Body.</p>',
  h3: '<h3>Heading three</h3><p>Body.</p>',
  strong: '<p>Some <strong>bold</strong> text.</p>',
  em: '<p>Some <em>italic</em> text.</p>',
  strike: '<p>Some <s>struck</s> text.</p>',
  'link with href':
    '<p>See <a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com/path?q=1">the docs</a>.</p>',
  'bullet list': '<ul><li><p>One</p></li><li><p>Two</p></li></ul>',
  'ordered list': '<ol><li><p>First</p></li><li><p>Second</p></li></ol>',
  blockquote: '<blockquote><p>Quoted.</p></blockquote>',
  'hard break': '<p>Line one<br>Line two</p>',
  'nested marks': '<p><strong><em>both</em></strong> and <strong><s>struck bold</s></strong></p>',
  'everything': [
    '<h2>Title</h2>',
    '<p>Intro with <strong>bold</strong>, <em>italic</em>, <s>strike</s> and ',
    '<a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">a link</a>.</p>',
    '<h3>Sub</h3>',
    '<ul><li><p>Alpha</p></li><li><p>Beta<br>Gamma</p></li></ul>',
    '<ol><li><p>Un</p></li><li><p>Deux</p></li></ol>',
    '<blockquote><p>Said someone.</p></blockquote>',
  ].join(''),
}

function roundTrip(html: string): string {
  const editor = new Editor({ extensions, content: html })
  try {
    editor.commands.setContent(html)
    return editor.getHTML()
  } finally {
    editor.destroy()
  }
}

describe('editor HTML round-trip', () => {
  for (const [name, html] of Object.entries(fixtures)) {
    it(name, () => {
      expect(roundTrip(html)).toBe(html)
    })
  }
})
