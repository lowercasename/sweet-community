import { useState } from 'react'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { Button } from './Button'
import { Textarea } from './Textarea'

/** Mastodon allows 1500, Bluesky 2000, X 1000. */
export const ALT_MAX = 1500

const PLACEHOLDER = 'Describe this image for people using screen readers.'

const CHIP =
  'absolute bottom-2 left-2 cursor-pointer appearance-none rounded-[4px] border-0 px-1.5 py-0.5 ' +
  'text-xs font-medium leading-5 text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink'

/**
 * An image inside the editor. The chip in the corner follows the convention
 * Bluesky, X and Mastodon settled on: it says what is missing until a
 * description exists, then shows a quiet ALT badge that reopens the field.
 */
export function EditorImage({ node, selected, updateAttributes }: NodeViewProps) {
  const alt = (node.attrs.alt as string | null) ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const open = draft !== null

  const save = () => {
    if (draft === null) return
    updateAttributes({ alt: draft.trim() })
    setDraft(null)
  }

  return (
    <NodeViewWrapper className="my-0 mb-[0.6em]">
      <span className="relative inline-block max-w-full align-top">
        <img
          className={`m-0 ${selected ? 'outline-2 outline-offset-2 outline-pink' : ''}`}
          src={node.attrs.src as string}
          alt={alt}
          width={(node.attrs.width as number | null) ?? undefined}
          height={(node.attrs.height as number | null) ?? undefined}
          data-drag-handle
        />
        {!open && (
          <button
            type="button"
            className={`${CHIP} ${alt ? 'bg-ink/70 hover:bg-ink' : 'bg-pink hover:bg-sweet'}`}
            title={alt ? 'Edit the description' : 'Describe this image for people using screen readers'}
            onClick={() => setDraft(alt)}
          >
            {alt ? 'ALT' : 'Add alt text'}
          </button>
        )}
      </span>
      {open && (
        <span className="mt-2 flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={setDraft}
            placeholder={PLACEHOLDER}
            autoFocus
            maxLength={ALT_MAX}
            onSubmit={save}
            onCancel={() => setDraft(null)}
          />
          <span className="flex items-center gap-3">
            <Button onClick={save}>Save</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </span>
        </span>
      )}
    </NodeViewWrapper>
  )
}
