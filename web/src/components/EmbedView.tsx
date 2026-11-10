import { useEffect } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { useLinkPreview } from '../data/hooks'
import { EditorEmbed } from '../ui'

/**
 * Draws a link preview card in the editor, with the server's preview of its address. A page that gives no preview
 * is turned back into a plain link at once, marked so that it is not tried again on saving.
 */
export function EmbedView({ editor, node, getPos, selected }: NodeViewProps) {
  const url = node.attrs.url as string
  const { data, isPending, isError } = useLinkPreview(url)
  const unembed = () => {
    const pos = getPos()
    if (typeof pos === 'number') editor.commands.unembed(pos)
  }
  useEffect(() => {
    if (data === null) unembed()
    // Only a change of the answer turns the card back. unembed reads the node's current position when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  const preview = data ? { title: data.title, description: data.description, image: data.image } : undefined
  const note = isPending ? 'Getting a preview…' : isError ? 'No preview right now' : undefined
  return <EditorEmbed url={url} preview={preview} note={note} selected={selected} onUnembed={unembed} />
}
