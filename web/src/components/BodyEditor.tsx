import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEditor, useEditorState, type Extensions } from '@tiptap/react'
import { DEFAULT_PLACEHOLDER, withPlaceholder } from '../editor/extensions'
import { mentionSuggestionKey, withMentions } from '../editor/mentions'
import { useMembers } from '../data/hooks'
import type { Topic } from '../api'
import { Alert, Button, EditorSurface, Form, ImageCard, Row, Stack } from '../ui'
import { failedUploads, failureReason, imageFiles, imagesHtml, insertImages, shrink } from '../editor/images'
import { uploadImage, type UploadedImage } from '../api'
import { EditorToolbar } from './EditorToolbar'
import { embedLinks } from '../editor/embed'
import { TopicMenu } from './TopicMenu'

/**
 * An image attached to a chat message: its local copy, shown at once, and its upload. `progress` is the fraction
 * sent while it uploads, `failed` the reason its upload failed ('' when there is none to give), and `uploaded` the
 * stored image once the upload has finished.
 */
interface Attachment {
  key: string
  file: Blob
  preview: string
  width: number
  height: number
  alt: string
  progress: number | null
  failed: string | null
  uploaded?: UploadedImage
}

interface BodyEditorProps {
  /**
   * The group this text is written in. The @ suggestion list offers this
   * group's members only.
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
   * The topic control in the post edit form, for posts on the community's feed. It is a
   * pill after the toolbar, with the formatting controls and apart from Cancel and Save. The composer for new posts
   * does not pass it. Nothing is shown while no topics exist.
   */
  topic?: { topics: Topic[]; value: string | null; onChange: (topicId: string | null) => void }
  /** Shown above the editor, such as the message being replied to. */
  head?: ReactNode
  /** Called on Escape in a new message, such as to cancel a reply. An edit's Escape calls onCancel instead. */
  onEscape?: () => void
  /** When this value changes to a new non-empty value, the editor takes focus, such as when Reply is clicked. */
  focus?: string
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
  head,
  onEscape,
  focus,
}: BodyEditorProps) {
  const editing = initialHtml !== undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attached, setAttached] = useState<Attachment[]>([])

  // TipTap creates the keydown handler once, so the handler reads the latest callbacks through refs.
  const submitRef = useRef<() => void>(() => {})
  // The link panel. Mod+K opens it from the editor, whose keydown handler is created once, so it is reached by a ref.
  const [linkOpen, setLinkOpen] = useState(false)
  const openLinkRef = useRef(() => setLinkOpen(true))
  const cancelRef = useRef<(() => void) | undefined>(onCancel ?? onEscape)
  cancelRef.current = onCancel ?? onEscape

  // The users the @ list can suggest. These are the group's members, read from the query cache when the list opens.
  const { members } = useMembers(groupId)
  const peopleRef = useRef(members)
  peopleRef.current = members
  // TipTap reads its extensions once, when the editor is created. The placeholder reads the latest prop through a
  // ref, and the effect below redraws it when the prop changes, for example when Home's composer changes topic.
  const placeholderRef = useRef(placeholder)
  placeholderRef.current = placeholder
  const editor = useEditor({
    extensions: withMentions(
      withPlaceholder(extensions, () => placeholderRef.current ?? DEFAULT_PLACEHOLDER),
      () => peopleRef.current.map((m) => m.user),
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
          openLinkRef.current()
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
  useEffect(() => {
    if (focus) editor?.commands.focus('end')
  }, [focus, editor])
  // An empty transaction makes the editor draw its decorations again, which reads the new placeholder.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr)
  }, [placeholder, editor])

  // An image shows at once, from a local copy, and uploads. Its card shows the upload, and its error if it fails.
  const addImagesRef = useRef<(files: File[]) => void>(() => {})
  addImagesRef.current = (files: File[]) => {
    if (!editor) return
    setError(null)
    if (images === 'inline') {
      void insertImages(editor, files)
      return
    }
    void Promise.all(files.map(shrink)).then((shrunk) => {
      const added = shrunk.map((s) => ({
        ...s,
        key: crypto.randomUUID(),
        preview: URL.createObjectURL(s.file),
        alt: '',
        progress: 0,
        failed: null,
      }))
      setAttached((prev) => [...prev, ...added])
      for (const a of added) uploadAttachment(a.key, a.file)
    })
  }

  const update = (key: string, change: Partial<Attachment>) =>
    setAttached((prev) => prev.map((a) => (a.key === key ? { ...a, ...change } : a)))
  const uploadAttachment = (key: string, file: Blob) => {
    update(key, { progress: 0, failed: null })
    uploadImage(file, (progress) => update(key, { progress }))
      .then((uploaded) => update(key, { uploaded, progress: null }))
      .catch((e: unknown) => update(key, { progress: null, failed: failureReason(e) }))
  }
  const remove = (key: string) =>
    setAttached((prev) => {
      const gone = prev.find((a) => a.key === key)
      if (gone) URL.revokeObjectURL(gone.preview)
      return prev.filter((a) => a.key !== key)
    })

  // The images in the post or comment, those still uploading, and those whose upload failed.
  const inline = useEditorState({
    editor,
    selector: ({ editor }) => {
      const counts = { total: 0, uploading: 0, failed: 0 }
      editor?.state.doc.descendants((node) => {
        if (node.type.name !== 'image') return
        counts.total++
        if (node.attrs.failed != null) counts.failed++
        else if (node.attrs.upload) counts.uploading++
      })
      return counts
    },
  }) ?? { total: 0, uploading: 0, failed: 0 }
  const total = inline.total + attached.length
  const failed = inline.failed + attached.filter((a) => a.failed != null).length
  const uploading = inline.uploading + attached.filter((a) => a.failed == null && !a.uploaded).length

  const isEmpty = useEditorState({ editor, selector: ({ editor }) => (editor ? editor.isEmpty : true) })
  const ready = uploading === 0 && failed === 0
  const canSubmit = allowEmpty
    ? !busy && !disabled && ready
    : !!editor && (!isEmpty || attached.length > 0) && !disabled && !busy && ready

  const submit = async () => {
    if (!editor || !canSubmit) return
    // A link on its own line becomes a card: in chat every such line, in a post or a comment the last one, which the
    // author saved without pressing Enter after it.
    embedLinks(editor, enterSubmits ? 'all' : 'last')
    setBusy(true)
    setError(null)
    try {
      const sent = attached.flatMap((a) => (a.uploaded ? [{ ...a.uploaded, alt: a.alt }] : []))
      await onSubmit(imagesHtml(sent) + (isEmpty ? '' : editor.getHTML()))
      if (!editing) {
        editor.commands.clearContent(true)
        for (const a of attached) URL.revokeObjectURL(a.preview)
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
        {head}
        {attached.length > 0 && (
          <Stack gap={0}>
            {attached.map((a, i) => (
              <ImageCard
                key={a.key}
                src={a.uploaded?.url ?? a.preview}
                alt={a.alt}
                onAltChange={(alt) => update(a.key, { alt })}
                onAltEnter={() => editor?.commands.focus()}
                onRemove={() => remove(a.key)}
                corners={
                  attached.length === 1 ? 'all' : i === 0 ? 'top' : i === attached.length - 1 ? 'bottom' : 'none'
                }
                upload={
                  a.uploaded
                    ? undefined
                    : { progress: a.progress, failed: a.failed, onRetry: () => uploadAttachment(a.key, a.file) }
                }
              />
            ))}
          </Stack>
        )}
        <EditorSurface editor={editor} size={size} />
        <Row justify="between" align="center">
          <Row gap={2} align="center" wrap="never">
            <Row shrink={false}>
              <EditorToolbar
                editor={editor}
                onImage={(files) => addImagesRef.current(files)}
                linkOpen={linkOpen}
                onLinkOpenChange={setLinkOpen}
              />
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
        {failed > 0 && <Alert tone="error">{failedUploads(failed, total)}</Alert>}
        {error && <Alert tone="error">{error}</Alert>}
      </Stack>
    </Form>
  )
}
