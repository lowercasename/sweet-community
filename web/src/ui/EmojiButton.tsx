import { lazy, Suspense, useCallback, useState } from 'react'
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
import type { EmojiClickData } from 'emoji-picker-react'
import { buttonClass } from './Button'
import { Icon } from './Icon'
import { useTooltip } from './Tooltip'

// The picker's code and emoji data are loaded the first time a picker opens, so the app's first load does not
// include them.
const Picker = lazy(() => import('emoji-picker-react'))

const WIDTH = 340
const HEIGHT = 380

// The library's own names for the skin tones are its constants, such as MEDIUM_LIGHT, which screen readers would read
// out. These follow the Unicode names.
const LABELS = {
  searchLabel: 'Search emoji',
  skinToneNeutral: 'Default skin tone',
  skinToneLight: 'Light skin tone',
  skinToneMediumLight: 'Medium-light skin tone',
  skinToneMedium: 'Medium skin tone',
  skinToneMediumDark: 'Medium-dark skin tone',
  skinToneDark: 'Dark skin tone',
}

interface EmojiButtonProps {
  /** Called with the chosen emoji as text. */
  onPick: (emoji: string) => void
  /**
   * For a reaction: the emoji the picker offers first, in one row, with + for the full picker. The button is then Add
   * reaction, and the picker is placed against it. Without it, the picker is a composer's, placed against the form.
   */
  reactions?: string[]
  /** The 26px size, for a control in an item's action bar. */
  compact?: boolean
  disabled?: boolean
  /** Called when the picker opens or closes. */
  onOpenChange?: (open: boolean) => void
}

/**
 * A ghost icon button that opens an emoji picker (emoji-picker-react). The
 * picker shows the device's own emoji, so it loads no images from another
 * site. Its colours are Sweet's tokens (the .emoji-picker rule in
 * global.css), so it follows light and dark mode. The button shows the pressed
 * colour while the picker is open. Floating UI places the picker against the
 * form that holds the button, such as a composer, so that it never covers the
 * text being written. It opens above the form, or below it when there is no
 * room above. The picker is portalled to the body so that no pane clips it.
 * Escape closes it and returns focus to the button. Choosing an emoji closes
 * it and calls onPick, which puts the cursor back where the emoji went.
 */
export function EmojiButton({ onPick, reactions, compact = false, disabled, onOpenChange }: EmojiButtonProps) {
  const reaction = reactions !== undefined
  const [open, setOpenState] = useState(false)
  const setOpen = (next: boolean) => {
    setOpenState(next)
    onOpenChange?.(next)
  }
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next, _event, reason) => {
      setOpen(next)
      // Escape returns focus to the button. A pick has already put focus in the editor, and a click elsewhere
      // leaves focus where the click was, so the focus manager does not return focus by itself.
      if (!next && reason === 'escape-key') (refs.domReference.current as HTMLElement | null)?.focus()
    },
    placement: reaction ? 'top-end' : 'top-start',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])
  const name = reaction ? 'Add reaction' : 'Add emoji'
  const tip = useTooltip(name, !open)
  // The ref callback must keep its identity between renders. A new one each render is detached and attached again,
  // and each attach updates Floating UI's state, which renders again without end.
  const placeAgainst = useCallback(
    (el: HTMLButtonElement | null) => refs.setPositionReference((reaction ? null : el?.closest('form')) ?? el),
    [refs, reaction],
  )
  const ref = useMergeRefs([refs.setReference, tip.ref, placeAgainst])
  const dark = document.documentElement.dataset.theme === 'dark'

  const pick = (data: EmojiClickData) => {
    onPick(data.emoji)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={`${buttonClass('ghost', true, false, compact)} aria-expanded:bg-blush aria-expanded:text-sweet`}
        aria-label={name}
        disabled={disabled}
        {...getReferenceProps(tip.props())}
      >
        <Icon name={reaction ? 'smile-plus' : 'smile'} />
      </button>
      {tip.tooltip}
      {open && (
        <FloatingPortal>
          {/* The picker focuses its own search box when it has loaded. */}
          <FloatingFocusManager context={context} modal={false} initialFocus={-1} returnFocus={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              className="z-50"
              aria-label="Emoji"
              {...getFloatingProps()}
            >
              <Suspense
                fallback={
                  <div
                    className="flex items-center justify-center rounded-card border border-line bg-card text-sm text-mute"
                    style={{ width: WIDTH, height: HEIGHT }}
                  >
                    Loading…
                  </div>
                }
              >
                <Picker
                  className="emoji-picker"
                  width={WIDTH}
                  height={HEIGHT}
                  colorScheme={dark ? 'dark' : 'light'}
                  previewConfig={{ showPreview: false }}
                  labels={LABELS}
                  reactionsDefaultOpen={reaction}
                  reactions={reactions}
                  onReactionClick={pick}
                  onEmojiClick={pick}
                />
              </Suspense>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
