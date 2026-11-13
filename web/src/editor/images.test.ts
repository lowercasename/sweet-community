// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import StarterKit from '@tiptap/starter-kit'
import { convert, failedUploads } from './images'
import { SweetImage } from './extensions'

/** The line under the editor when uploads fail. It names no reason, because each image card shows its own. */
describe('failedUploads', () => {
  it('counts the images that failed', () => {
    expect(failedUploads(2, 2)).toBe('Failed to upload 2 of 2 images')
    expect(failedUploads(1, 3)).toBe('Failed to upload 1 of 3 images')
    expect(failedUploads(1, 1)).toBe('Failed to upload the image')
  })
})

describe('convert', () => {
  it('sends a GIF as it is, so that it stays animated', async () => {
    const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' })
    expect(await convert(gif)).toBe(gif)
  })
})

describe('an image brought back with undo', () => {
  /** An editor with one image that is uploading. The history step ends after the image is added. */
  function editorWithAnUpload() {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ link: false, trailingNode: false }),
        SweetImage.extend({ addNodeView: () => null }),
      ],
      content: '<p>Hi</p>',
    })
    editor.storage.image.uploads.set('k', { file: new File(['x'], 'a.png'), preview: 'blob:a' })
    editor
      .chain()
      .focus('end')
      .insertContent({ type: 'image', attrs: { src: 'blob:a', alt: '', upload: 'k', progress: 0 } })
      .run()
    editor.view.dispatch(closeHistory(editor.state.tr))
    return editor
  }
  const image = (editor: Editor) => {
    let found: PMNode | undefined
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'image') found = n
    })
    return found
  }
  const removeImage = (editor: Editor) => {
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'image') editor.view.dispatch(editor.state.tr.delete(pos, pos + n.nodeSize))
    })
  }

  it('shows its finished upload', () => {
    const editor = editorWithAnUpload()
    removeImage(editor)
    expect(image(editor)).toBeUndefined()
    editor.storage.image.uploads.get('k')!.done = { src: '/img/1', upload: null, progress: null, failed: null }
    editor.commands.undo()
    expect(image(editor)?.attrs.src).toBe('/img/1')
    editor.destroy()
  })

  it('shows the failure of its upload', () => {
    const editor = editorWithAnUpload()
    removeImage(editor)
    editor.storage.image.uploads.get('k')!.failed = ''
    editor.commands.undo()
    expect(image(editor)?.attrs.failed).toBe('')
    expect(image(editor)?.attrs.progress).toBeNull()
    editor.destroy()
  })
})

/** Pictures pasted from another site are left out. Only pictures this server stores can be in a body. */
it('keeps the text of pasted HTML and leaves out a picture from another site', () => {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ link: false, trailingNode: false }),
      SweetImage.extend({ addNodeView: () => null }),
    ],
    content: '',
  })
  editor.view.pasteHTML('<p>From a recipe site</p><img src="https://example.com/cake.jpg" alt="A cake">')
  expect(editor.getText()).toContain('From a recipe site')
  const images: PMNode[] = []
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'image') images.push(n)
  })
  expect(images).toEqual([])
  editor.destroy()
})
