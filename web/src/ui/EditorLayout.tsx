import { useId, useRef, type ReactNode } from 'react'
import { buttonClass } from './Button'
import { Icon } from './Icon'
import { Row } from './Row'
import { Stack, type Gap } from './Stack'
import { useTooltip } from './Tooltip'

interface EditorLayoutProps {
  chat: boolean
  gap: Gap
  surface: ReactNode
  tools: ReactNode
  extraControls?: ReactNode
  actions: ReactNode
  toolsOpen: boolean
  onToolsChange: (open: boolean) => void
  onFocusEditor: () => void
}

/** All editors share these slots. Chat places its actions beside the text field. */
export function EditorLayout({
  chat,
  gap,
  surface,
  tools,
  extraControls,
  actions,
  toolsOpen,
  onToolsChange,
  onFocusEditor,
}: EditorLayoutProps) {
  const id = useId()
  const toolsRef = useRef<HTMLDivElement>(null)
  const label = 'Formatting and attachments'
  const tip = useTooltip(label, chat)
  if (!chat)
    return (
      <Stack gap={gap}>
        {surface}
        <Row justify="between" align="center">
          <Row gap={2} align="center" wrap="never">
            <Row shrink={false}>{tools}</Row>
            {extraControls}
          </Row>
          <Row gap={2} align="center" wrap="never" shrink={false} push="end">
            {actions}
          </Row>
        </Row>
      </Stack>
    )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {toolsOpen && (
        <div
          id={id}
          ref={toolsRef}
          role="group"
          aria-label="Message tools"
          className="w-fit max-w-full rounded-[4px] border border-line bg-card p-1 [&_button]:min-h-11 [&_button]:min-w-11"
          onKeyDownCapture={(event) => {
            if (
              event.key === 'Escape' &&
              !event.defaultPrevented &&
              !(event.target as HTMLElement).closest('[role="dialog"]')
            ) {
              event.preventDefault()
              event.stopPropagation()
              onToolsChange(false)
              onFocusEditor()
            }
          }}
        >
          {tools}
        </div>
      )}
      <div className="flex min-w-0 items-end gap-2">
        <button
          ref={tip.ref}
          type="button"
          className={`${buttonClass('ghost', true)} size-11 shrink-0 aria-expanded:bg-blush aria-expanded:text-sweet`}
          aria-label={label}
          aria-expanded={toolsOpen}
          aria-controls={toolsOpen ? id : undefined}
          {...tip.props({
            onPointerDown: (event) => event.preventDefault(),
            onClick: (event) => {
              onToolsChange(!toolsOpen)
              if (!toolsOpen && event.detail === 0) {
                requestAnimationFrame(() => toolsRef.current?.querySelector('button')?.focus())
              }
            },
          })}
        >
          <Icon name={toolsOpen ? 'remove' : 'plus'} size={20} />
        </button>
        <div className="min-w-0 flex-1 [&_.ProseMirror]:min-h-11">{surface}</div>
        <div className="flex shrink-0 items-center gap-2 [&>button]:size-11">{actions}</div>
      </div>
      {tip.tooltip}
    </div>
  )
}
