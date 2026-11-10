import { NodeViewWrapper } from '@tiptap/react'
import { LinkPreview, type LinkPreviewData } from './LinkPreview'

interface EditorEmbedProps {
  url: string
  preview?: LinkPreviewData
  /** Shown in the card while there is no preview, such as "Getting a preview…". */
  note?: string
  selected: boolean
  /** Turns the card back into a plain link. */
  onUnembed: () => void
}

/**
 * A link preview card in the editor. A line above it names it and offers to turn it back into a regular link,
 * because the card was made without a button and the author may not want it.
 */
export function EditorEmbed({ url, preview, note, selected, onUnembed }: EditorEmbedProps) {
  return (
    <NodeViewWrapper className="mb-[0.6em]">
      <span
        contentEditable={false}
        className="mb-1 flex flex-wrap items-center gap-x-1 text-[13px] leading-[18px] text-mute"
      >
        <span>Embedded link</span>
        <span aria-hidden>·</span>
        <button
          type="button"
          className="cursor-pointer appearance-none border-0 bg-transparent p-0 font-[inherit] text-sky underline-offset-2 hover:text-sweet hover:underline"
          onClick={onUnembed}
        >
          Turn back into regular link
        </button>
      </span>
      <LinkPreview url={url} preview={preview} note={note} inert selected={selected} />
    </NodeViewWrapper>
  )
}
