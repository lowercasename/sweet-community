import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useMergeRefs,
  useRole,
} from '@floating-ui/react'
import { Button, buttonClass } from './Button'
import { Icon } from './Icon'
import { Input } from './Input'
import { useTooltip } from './Tooltip'

interface LinkPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The cursor is in a link. The button shows as pressed, and the panel edits that link. */
  active: boolean
  /** The address of the link being edited, or empty. */
  url: string
  onSave: (url: string) => void
  onRemove: () => void
}

/**
 * The editor toolbar's Link button and the panel it opens, in place of the browser's prompt box. The panel is placed
 * against the form that holds the button, such as a composer, so that it never covers the text or the link being
 * edited: above the form, or below it when there is no room, on phones as on computers. The form does not use the
 * browser's address check, so an address without https:// can be saved. It has the address, then Remove link when
 * the cursor is in a link, Cancel and the primary. Enter saves and Escape closes. The panel is portalled to the body,
 * so its form stops its submit event from reaching the editor's own form in the component tree.
 */
export function LinkPopover({ open, onOpenChange, active, url, onSave, onRemove }: LinkPopoverProps) {
  const [value, setValue] = useState(url)
  useEffect(() => {
    if (open) setValue(url)
  }, [open, url])
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: 'top-start',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])
  const tip = useTooltip('Link', !open)
  // A stable ref callback, as in EmojiButton: a new one on every render would update Floating UI's state without end.
  const placeAgainst = useCallback(
    (el: HTMLButtonElement | null) => refs.setPositionReference(el?.closest('form') ?? el),
    [refs],
  )
  const ref = useMergeRefs([refs.setReference, tip.ref, placeAgainst])

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (value.trim()) onSave(value.trim())
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${buttonClass('ghost', true)} aria-expanded:bg-blush aria-expanded:text-sweet`}
        aria-label="Link"
        aria-pressed={active}
        {...getReferenceProps(tip.props())}
      >
        <Icon name="link" />
      </button>
      {tip.tooltip}
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false} returnFocus={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-card p-3"
              aria-label={active ? 'Edit link' : 'Add link'}
              {...getFloatingProps()}
            >
              <form onSubmit={save} noValidate className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                  Link address
                  <Input type="url" value={value} onChange={setValue} placeholder="https://" autoFocus />
                </label>
                <div className="flex items-center gap-2">
                  {active && (
                    <Button variant="ghost" onClick={onRemove}>
                      Remove link
                    </Button>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={!value.trim()}>
                      {active ? 'Save link' : 'Add link'}
                    </Button>
                  </span>
                </div>
              </form>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
