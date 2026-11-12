import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useEditor, useEditorState, type Editor, type Extensions } from '@tiptap/react'
import { DEFAULT_PLACEHOLDER, withPlaceholder } from '../editor/extensions'
import { mentionSuggestionKey, withMentions } from '../editor/mentions'
import { useMe, useMembers, useUsers } from '../data/hooks'
import { clearDraft, loadDraft, saveDraft, watchDraft } from '../editor/drafts'
import type { Topic } from '../api'
import { Alert, Button, EditorSurface, Form, ImageCard, Row, Stack } from '../ui'
import { convertAndUpload, failedUploads, failureReason, imageFiles, imagesHtml, insertImages } from '../editor/images'
import type { UploadedImage } from '../api'
import { EditorToolbar } from './EditorToolbar'
import { embedLinks } from '../editor/embed'
import { TopicMenu } from './TopicMenu'

/**
 * An image attached to a chat message. `file` is the chosen file, kept for Try again. `preview` is the address of its
 * local copy, shown at once. `progress` is the fraction sent. `failed` is the reason the upload failed, or '' when
 * there is none to give. `uploaded` is the stored image, once the upload has finished.
 */
interface Attachment {
  key: string
  file: File
  preview: string
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
  /**
   * The key of this editor's draft, such as `post:<group id>`. With a key, the unsent text is kept in the browser
   * (editor/drafts.ts) and the editor opens with it, in place of `initialHtml`. Sending, saving an edit or cancelling
   * an edit deletes the draft. Attached images are not kept.
   */
  draft?: string
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
  draft,
}: BodyEditorProps) {
  const editing = initialHtml !== undefined
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attached, setAttached] = useState<Attachment[]>([])
  // A bio or a community text has no image node, so it takes no images.
  const takesImages = images === 'attached' || extensions.some((e) => e.name === 'image')
  // Image files in a paste or a drop are uploaded, not inlined as data: urls. An editor that takes no images ignores
  // them, so a dropped file does not open in the tab.
  const takeImages = (data: DataTransfer | null, event: Event) => {
    const files = imageFiles(data)
    if (files.length === 0) return false
    event.preventDefault()
    if (takesImages) addImagesRef.current(files)
    return true
  }

  // TipTap creates the keydown handler once, so the handler reads the latest callbacks through refs.
  const submitRef = useRef<() => void>(() => {})
  // The link panel. Mod+K opens it from the editor, whose keydown handler is created once, so it is reached by a ref.
  const [linkOpen, setLinkOpen] = useState(false)
  const openLinkRef = useRef(() => setLinkOpen(true))

  // The draft's owner and key, read by the editor's update handler, which TipTap creates once. Each change is saved
  // at once. An editor that has not changed writes nothing.
  const { data: me } = useMe()
  const draftRef = useRef<{ user: string; key: string } | null>(null)
  draftRef.current = draft && me ? { user: me.id, key: draft } : null
  const keepDraft = (ed: Editor) => {
    const d = draftRef.current
    if (!d) return
    if (ed.isEmpty) clearDraft(d.user, d.key, ed)
    else saveDraft(d.user, d.key, ed.getHTML(), ed)
  }
  const forgetDraft = () => {
    const d = draftRef.current
    if (d) clearDraft(d.user, d.key, editor ?? undefined)
  }
  // Cancelling an edit deletes its draft.
  const cancel = onCancel
    ? () => {
        forgetDraft()
        onCancel()
      }
    : undefined

  const cancelRef = useRef<(() => void) | undefined>(cancel ?? onEscape)
  cancelRef.current = cancel ?? onEscape

  const { data: users } = useUsers()
  const usersRef = useRef(users)
  usersRef.current = users
  // Suggestions are limited to this group's members. Existing mentions use community identities.
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
      () => usersRef.current,
    ),
    content: (draftRef.current && loadDraft(draftRef.current.user, draftRef.current.key)) ?? initialHtml ?? '',
    autofocus: editing ? 'end' : false,
    onUpdate: ({ editor }) => keepDraft(editor),
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
      handlePaste: (_view, event) => takeImages(event.clipboardData, event),
      handleDrop: (_view, event) => takeImages(event.dataTransfer, event),
    },
  })
  useEffect(() => {
    if (focus) editor?.commands.focus('end')
  }, [focus, editor])
  // Another editor in this tab with the same draft, such as a post's thread on Home and on the post's page, shows
  // each change made in this one. When the draft is deleted, a new post, comment or message is empty again, and an
  // edit shows the stored text again.
  const user = me?.id
  useEffect(() => {
    if (!editor || !draft || !user) return
    return watchDraft(user, draft, editor, (html) =>
      editor.commands.setContent(html ?? initialHtml ?? '', { emitUpdate: false }),
    )
  }, [editor, draft, user, initialHtml])
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
      insertImages(editor, files)
      return
    }
    const added: Attachment[] = files.map((file) => ({
      key: crypto.randomUUID(),
      file,
      preview: URL.createObjectURL(file),
      alt: '',
      progress: 0,
      failed: null,
    }))
    setAttached((prev) => [...prev, ...added])
    for (const a of added) uploadAttachment(a)
  }

  const update = (key: string, change: Partial<Attachment>) =>
    setAttached((prev) => prev.map((a) => (a.key === key ? { ...a, ...change } : a)))
  // Each attachment's upload can be stopped, when the image is removed or the editor is unmounted.
  const stops = useRef(new Map<string, AbortController>())
  const uploadAttachment = ({ key, file }: Attachment) => {
    update(key, { progress: 0, failed: null })
    const stop = new AbortController()
    stops.current.set(key, stop)
    convertAndUpload(file, (progress) => update(key, { progress }), stop.signal)
      .then((uploaded) => {
        stops.current.delete(key)
        update(key, { uploaded, progress: null })
      })
      .catch((e: unknown) => {
        if (!stop.signal.aborted) update(key, { progress: null, failed: failureReason(e) })
      })
  }
  // The uploads stop and the local copies are freed when the editor is unmounted.
  const attachedRef = useRef(attached)
  attachedRef.current = attached
  useEffect(
    () => () => {
      for (const stop of stops.current.values()) stop.abort()
      attachedRef.current.forEach((a) => URL.revokeObjectURL(a.preview))
    },
    [],
  )
  const remove = (key: string) => {
    stops.current.get(key)?.abort()
    stops.current.delete(key)
    setAttached((prev) => {
      const gone = prev.find((a) => a.key === key)
      if (gone) URL.revokeObjectURL(gone.preview)
      return prev.filter((a) => a.key !== key)
    })
  }

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
      const sending = attached
      const sent = sending.flatMap((a) => (a.uploaded ? [{ ...a.uploaded, alt: a.alt }] : []))
      await onSubmit(imagesHtml(sent) + (isEmpty ? '' : editor.getHTML()))
      forgetDraft()
      if (!editing) {
        editor.commands.clearContent(true)
        // Images attached while the message was sending stay for the next one.
        const done = new Set(sending.map((a) => a.key))
        for (const a of sending) URL.revokeObjectURL(a.preview)
        setAttached((prev) => prev.filter((a) => !done.has(a.key)))
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
                first={i === 0}
                last={i === attached.length - 1}
                upload={
                  a.uploaded
                    ? undefined
                    : { progress: a.progress, failed: a.failed, onRetry: () => uploadAttachment(a) }
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
                onImage={takesImages ? (files) => addImagesRef.current(files) : undefined}
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
            {cancel && (
              <Button variant="ghost" disabled={busy} onClick={cancel}>
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
