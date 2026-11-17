import { useState } from 'react'
import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { Icon, type IconName } from './Icon'
import { Tile } from './Tile'

interface Destination {
  id: string
  name: string
  picture: string | null
  icon?: IconName
}

function DestinationMark({ destination }: { destination: Destination }) {
  return destination.icon ? (
    <span className="inline-flex size-6 shrink-0 items-center justify-center">
      <Icon name={destination.icon} />
    </span>
  ) : (
    <Tile name={destination.name} picture={destination.picture} />
  )
}

export function DestinationPicker({
  value,
  choices,
  disabled,
  onChange,
}: {
  value: string
  choices: Destination[]
  disabled: boolean
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const selected = choices.find((c) => c.id === value)
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-start',
    middleware: [offset(6), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])
  const matches = choices.filter((c) => c.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return (
    <>
      <button
        ref={refs.setReference}
        type="button"
        disabled={disabled}
        aria-label={selected ? `Post in ${selected.name}` : 'Choose a room'}
        className="flex min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-[4px] text-sm text-mute hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pink disabled:cursor-default disabled:opacity-50"
        {...getReferenceProps()}
      >
        {selected && <DestinationMark destination={selected} />}
        <span className="min-w-0 truncate">
          {selected ? (
            <>
              Post in <span className="font-medium text-ink">{selected.name}</span>
            </>
          ) : (
            'Choose a room'
          )}
        </span>
        <span className="flex-none">
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={floatingStyles}
              aria-label="Choose posting destination"
              className="z-50 flex w-80 max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-card border border-line bg-card shadow-md"
              {...getFloatingProps()}
            >
              <div className="p-2">
                <input
                  aria-label="Search rooms"
                  placeholder="Search rooms"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-[4px] border border-input px-3 py-2 text-ink focus:border-pink focus:outline-none"
                />
              </div>
              <div className="max-h-60 overflow-y-auto p-1">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-label={c.name}
                    aria-pressed={c.id === value}
                    onClick={() => {
                      onChange(c.id)
                      setOpen(false)
                      setSearch('')
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 py-2 text-left text-sm text-ink hover:bg-field focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pink aria-pressed:bg-blush"
                  >
                    <DestinationMark destination={c} />
                    <span className="min-w-0 flex-1 break-words">{c.name}</span>
                    {c.id === value && (
                      <span className="flex-none">
                        <Icon name="check" size={16} />
                      </span>
                    )}
                  </button>
                ))}
                {matches.length === 0 && <p className="m-0 px-2 py-3 text-sm text-mute">No rooms found.</p>}
              </div>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  )
}
