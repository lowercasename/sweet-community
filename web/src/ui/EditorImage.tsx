import { NodeViewWrapper, useEditorState, type Editor, type NodeViewProps } from '@tiptap/react'
import { ImageCard } from './ImageCard'
import { GALLERY_MAX } from '../content/galleries'

interface Run {
  /** The number of images in this gallery, including this one. 1 means a single image. */
  count: number
  first: boolean
  last: boolean
}

const ALONE: Run = { count: 1, first: true, last: true }

/**
 * Returns where this image sits in its run of adjacent images, as the post
 * will render them. A run longer than GALLERY_MAX is split into several galleries.
 */
function runAt(doc: Editor['state']['doc'], pos: number | undefined): Run {
  if (pos === undefined) return ALONE
  const $pos = doc.resolve(pos)
  const parent = $pos.parent
  const index = $pos.index()
  let start = index
  while (start > 0 && parent.child(start - 1).type.name === 'image') start--
  let end = index
  while (end + 1 < parent.childCount && parent.child(end + 1).type.name === 'image') end++
  const offset = index - start
  const chunkStart = start + offset - (offset % GALLERY_MAX)
  const chunkEnd = Math.min(end, chunkStart + GALLERY_MAX - 1)
  return { count: chunkEnd - chunkStart + 1, first: index === chunkStart, last: index === chunkEnd }
}

/**
 * An image node in the editor, rendered as an ImageCard. Adjacent cards join
 * into one block because the post will render them as a gallery. The grip
 * drags the card to any position between blocks, into or out of a gallery.
 */
export function EditorImage({ editor, node, getPos, selected, updateAttributes, deleteNode }: NodeViewProps) {
  const run = useEditorState({ editor, selector: ({ editor }) => runAt(editor.state.doc, getPos()) }) ?? ALONE
  const corners = run.first && run.last ? 'all' : run.first ? 'top' : run.last ? 'bottom' : 'none'

  // Enter in the alt text field moves the cursor back into the document, just after this image.
  const leave = () => {
    const pos = getPos()
    if (pos !== undefined)
      editor
        .chain()
        .focus(pos + node.nodeSize)
        .run()
  }

  return (
    <NodeViewWrapper className={`${run.first ? '' : '-mt-px'} ${run.last ? 'mb-[0.6em]' : ''}`}>
      {run.first && run.count > 1 && (
        <span className="mb-1 block text-sm text-mute">Gallery of {run.count} images</span>
      )}
      <ImageCard
        src={node.attrs.src as string}
        alt={(node.attrs.alt as string | null) ?? ''}
        onAltChange={(alt) => updateAttributes({ alt })}
        onAltEnter={leave}
        onRemove={deleteNode}
        grip
        corners={corners}
        selected={selected}
        upload={
          node.attrs.upload
            ? {
                progress: node.attrs.progress as number | null,
                failed: node.attrs.failed as string | null,
                onRetry: () => editor.commands.retryUpload(node.attrs.upload as string),
              }
            : undefined
        }
      />
    </NodeViewWrapper>
  )
}
