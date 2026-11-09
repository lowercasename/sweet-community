import { useEffect } from 'react'
import { Joyride, STATUS, type EventData, type Step, type TooltipRenderProps } from 'react-joyride'
import { Button } from './Button'
import { Heading } from './Heading'
import { Text } from './Text'

/** One card of a tour. It points at the element whose `tour` prop names it, or sits in the middle of the screen. */
export interface TourCard {
  /** The `data-tour` name of the element the card points at, or null for the middle of the screen. */
  target: string | null
  placement: 'top' | 'bottom' | 'left' | 'right' | 'center'
  title: string
  /** One string per paragraph. */
  body: string[]
  /** The primary button's text: Next, or what the last card offers. */
  primary: string
  /** The text of the button that ends the tour early, or null for none. */
  skip: string | null
}

interface TourProps {
  cards: TourCard[]
  run: boolean
  /** Runs before a card shows, for example to switch to the view the card points at. */
  before?: (index: number) => void
  /** Called once when the tour ends. `finished` is true when the last card's primary button ended it. */
  onEnd: (finished: boolean) => void
}

/** Waits until the browser has drawn a frame, so an element shown by `before` exists before the card looks for it. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/**
 * A guided tour (architecture.md, New-instance lifecycle). React Joyride dims the page, cuts a spotlight around the
 * card's element, scrolls it into view and keeps the card on screen at any width. The card itself is drawn here with
 * Sweet's own heading, text and buttons.
 */
export function Tour({ cards, run, before, onEnd }: TourProps) {
  const steps: Step[] = cards.map((card, i) => ({
    target: card.target ? `[data-tour="${card.target}"]` : 'body',
    placement: card.placement,
    title: card.title,
    content: card.body.join(' '),
    data: card,
    before: async () => {
      before?.(i)
      await nextFrame()
      await nextFrame()
    },
  }))
  const onEvent = (e: EventData) => {
    if (e.type !== 'tour:end') return
    onEnd(e.status === STATUS.FINISHED)
  }
  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      onEvent={onEvent}
      tooltipComponent={TourCardView}
      options={{
        skipBeacon: true,
        overlayClickAction: false,
        // A tap on the lit element would leave the page, for example the Menu tab, and end the tour without a word.
        blockTargetInteraction: true,
        // Escape is handled by the card, which ends the tour. Joyride's own Escape moves to the next card.
        dismissKeyAction: false,
        overlayColor: 'var(--color-scrim)',
        arrowColor: 'var(--color-card)',
        spotlightRadius: 6,
        spotlightPadding: 4,
        zIndex: 60,
      }}
      floatingOptions={{ shiftOptions: { padding: 16 } }}
    />
  )
}

function TourCardView({ step, index, size, controls, tooltipProps }: TooltipRenderProps) {
  const card = step.data as TourCard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') controls.skip('button_skip')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [controls])
  return (
    <div
      {...tooltipProps}
      aria-label={card.title}
      className="flex w-[calc(100vw-2rem)] min-[800px]:w-[24rem] flex-col gap-3 rounded-card border border-line bg-card p-4 text-ink shadow-sm"
    >
      <div className="flex flex-col gap-2">
        {/* The card's number out of the total sits at the right of the heading, on the heading's first line. */}
        <div className="flex items-baseline justify-between gap-3">
          <Heading level={2}>{card.title}</Heading>
          <span className="flex-none">
            <Text as="span" variant="small">{`${index + 1} of ${size}`}</Text>
          </span>
        </div>
        {card.body.map((p) => (
          <Text key={p} variant="small">
            {p}
          </Text>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {card.skip && (
          <span className="mr-auto">
            <Button variant="ghost" onClick={() => controls.skip('button_skip')}>
              {card.skip}
            </Button>
          </span>
        )}
        {/* Back and the primary button wrap together, so the primary is never alone on a line. */}
        <span className="flex gap-2">
          {index > 0 && (
            <Button variant="secondary" onClick={() => controls.prev()}>
              Back
            </Button>
          )}
          <Button onClick={() => controls.next()}>{card.primary}</Button>
        </span>
      </div>
    </div>
  )
}
