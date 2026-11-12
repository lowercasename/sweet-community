// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { postExtensions } from './extensions'
import { withMentions } from './mentions'

/** A stored mention keeps the name it was written with. The editor shows and saves the user's current name. */
describe('mentions in the editor', () => {
  it('shows and saves the current name of a renamed user', () => {
    const editor = new Editor({
      extensions: withMentions(
        postExtensions,
        () => [],
        () => new Map([['k1', { id: 'k1', username: 'kat', picture: null }]]),
      ),
      content: '<p><span data-type="mention" data-mention-id="k1">@kit</span></p>',
    })
    expect(editor.getHTML()).toBe('<p><span data-type="mention" data-mention-id="k1">@kat</span></p>')
    editor.destroy()
  })
})
