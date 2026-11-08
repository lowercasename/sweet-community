import { useRef, useState } from 'react'
import { useEditor, useEditorState, type Extensions } from '@tiptap/react'
import { withPlaceholder } from '../editor/extensions'
import { mentionSuggestionKey, withMentions } from '../editor/mentions'
import { useMembers } from '../data/hooks'
import type { Topic } from '../api'
import { Alert, Button, EditorSurface, Form, ImageCard, Row, Stack } from '../ui'
import { imageFiles, imagesHtml, insertImages, uploadImages, type AttachedImage } from '../editor/images'
import { EditorToolbar, promptLink } from './EditorToolbar'
import { TopicMenu } from './TopicMenu'

interface BodyEditorProps {
  /**
   * The group this text is written in. The @ suggestion list offers this
   * group's members only (architecture.md, Posts).
   */
  groupId: string
  extensions: Extensions
  /** Placeholder text for the empty editor. When unset, the extension's default is used. */
  placeholder?: string
  /** `post` is a tall editor. `line` starts one line high and grows. */
  size: 'post' | 'line'
  /** When true, Enter submits, as in chat. Otherwise Enter inserts a newline and Mod+Enter submits. */
  enterSubmits?: boolean
  /**
   * With `inline`, used for posts and comments, images are nodes in the text,
   * inserted at the cursor. With `attached`, used for chat, images are stacked
   * above the text field and sent as a block before the text.
   */
  images?: 'inline' | 'attached'
  submitLabel: string
  /** True while offline. Disables submit. */
  disabled: boolean
  /** Resolves on success. Rejects with an Error, and the error's message is shown under the editor. */
  onSubmit: (bodyHtml: string) => Promise<void>
  /**
   * In edit mode, the editor starts with this stored HTML and keeps it after a
   * successful submit, because the parent replaces the editor. In create mode,
   * the editor is cleared after a successful submit.
   */
  initialHtml?: string
  /** Edit mode only. Shown as a Cancel button and also called on Escape. */
  onCancel?: () => void
  /** Allows submitting an empty body, for example a cleared bio. */
  allowEmpty?: boolean
  /**
   * The topic control in the post edit form, for posts on the community's feed (architecture.md, Topics). It is a
   * pill after the toolbar, with the formatting controls and apart from Cancel and Save. The composer for new posts
   * does not pass it. Nothing is shown while no topics exist.
   */
  topic?: { topics: Topic[]; value: string | null; onChange: (topicId: string | null) => void }
}

/**
 * The single editor component. Posts, chat and comments differ only in
 * schema, size, submit key and image placement.
 */
export function BodyEditor({
  groupId,
  extensions,
  placeholder,
  size,
  enterSubmits = false,
  images = 'inline',
  submitLabel,
  disabled,
  onSubmit,
  initialHtml,
  onCancel,
  allowEmpty = false,
  topic,
}: BodyEditorProps) {
  const editing = initialHtml !== undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attached, setAttached] = useState<AttachedImage[]>([])

  // TipTap creates the keydown handler once, so the handler reads the latest callbacks through refs.
  const submitRef = useRef<() => void>(() => {})
  const cancelRef = useRef<(() => void) | undefined>(onCancel)
  cancelRef.current = onCancel

  // The users the @ list can suggest. These are the group's members, read from the query cache when the list opens.
  const { members } = useMembers(groupId)
  const peopleRef = useRef(members)
  peopleRef.current = members
  const editor = useEditor({
    extensions: withMentions(placeholder ? withPlaceholder(extensions, placeholder) : extensions, () =>
      peopleRef.current.map((m) => m.user),
    ),
    content: initialHtml ?? '',
    autofocus: editing ? 'end' : false,
    editorProps: {
      handleKeyDown(view, event) {
        // While an @ list is open, Enter selects from the list. The suggestion
        // plugin's keydown handler runs after this one.
        if (event.key === 'Enter' && mentionSuggestionKey.getState(view.state)?.active) return false
        const modKey = event.metaKey || event.ctrlKey
        if (event.key === 'Enter' && (enterSubmits ? !event.shiftKey : modKey)) {
          event.preventDefault()
          submitRef.current()
          return true
        }
        if (modKey && (event.key === 'k' || event.key === 'K')) {
          event.preventDefault()
          if (editor) promptLink(editor)
          return true
        }
        if (event.key === 'Escape' && cancelRef.current) {
          event.preventDefault()
          cancelRef.current()
          return true
        }
        return false
      },
      // Pasted or dropped image files are uploaded, not inlined as data: urls.
      handlePaste(_view, event) {
        const files = imageFiles(event.clipboardData)
        if (files.length === 0) return false
        event.preventDefault()
        addImagesRef.current(files)
        return true
      },
      handleDrop(_view, event) {
        const files = imageFiles(event.dataTransfer)
        if (files.length === 0) return false
        event.preventDefault()
        addImagesRef.current(files)
        return true
      },
    },
  })

  const addImagesRef = useRef<(files: File[]) => void>(() => {})
  addImagesRef.current = (files: File[]) => {
    if (!editor) return
    setError(null)
    const done =
      images === 'inline'
        ? insertImages(editor, files)
        : uploadImages(files).then(({ images, error }) => {
            setAttached((prev) => [...prev, ...images])
            if (error) throw new Error(error)
          })
    done.catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not add the images'))
  }

  const setAlt = (id: string, alt: string) => setAttached((prev) => prev.map((i) => (i.id === id ? { ...i, alt } : i)))
  const remove = (id: string) => setAttached((prev) => prev.filter((i) => i.id !== id))

  const isEmpty = useEditorState({ editor, selector: ({ editor }) => (editor ? editor.isEmpty : true) })
  const canSubmit = allowEmpty
    ? !busy && !disabled
    : !!editor && (!isEmpty || attached.length > 0) && !disabled && !busy

  const submit = async () => {
    if (!editor || !canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(imagesHtml(attached) + (isEmpty ? '' : editor.getHTML()))
      if (!editing) {
        editor.commands.clearContent(true)
        setAttached([])
        if (enterSubmits) editor.commands.focus()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not ${submitLabel.toLowerCase()}`)
    } finally {
      setBusy(false)
    }
  }
  submitRef.current = () => void submit()

  return (
    <Form onSubmit={() => void submit()}>
      <Stack gap={size === 'line' ? 1 : 2}>
        {attached.length > 0 && (
          <Stack gap={0}>
            {attached.map((img, i) => (
              <ImageCard
                key={img.id}
                src={img.url}
                alt={img.alt}
                onAltChange={(alt) => setAlt(img.id, alt)}
                onAltEnter={() => editor?.commands.focus()}
                onRemove={() => remove(img.id)}
                corners={
                  attached.length === 1 ? 'all' : i === 0 ? 'top' : i === attached.length - 1 ? 'bottom' : 'none'
                }
              />
            ))}
          </Stack>
        )}
        <EditorSurface editor={editor} size={size} />
        <Row justify="between" align="center">
          <Row gap={2} align="center" wrap="never">
            <Row shrink={false}>
              <EditorToolbar editor={editor} onImage={(files) => addImagesRef.current(files)} />
            </Row>
            {topic && topic.topics.length > 0 && (
              <TopicMenu
                topics={topic.topics}
                value={topic.value}
                onChange={topic.onChange}
                noneLabel="No topic"
                emptyLabel="Set topic"
                label="Topic"
                disabled={busy || disabled}
              />
            )}
          </Row>
          <Row gap={2} align="center" wrap="never" shrink={false} push="end">
            {onCancel && (
              <Button variant="ghost" disabled={busy} onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!canSubmit && !busy} busy={busy}>
              {submitLabel}
            </Button>
          </Row>
        </Row>
        {error && <Alert tone="error">{error}</Alert>}
      </Stack>
    </Form>
  )
}
