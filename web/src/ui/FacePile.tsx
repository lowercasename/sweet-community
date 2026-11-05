import donut from '../assets/donut.svg'

interface Face {
  name: string
  picture?: string | null
}

interface FacePileProps {
  /** The conversation's other people, in the order their names are written. */
  people: Face[]
}

const FACE = 'absolute top-0 h-5 w-5 rounded-full border border-card object-cover select-none'

/**
 * A conversation's mark, in the slot a room's tile takes: one other person
 * is their face; two are two small faces overlapped; three or more are one
 * face and a count of the rest. Decorative; the label beside it names them.
 * Nobody else (a conversation of one) is the donut.
 */
export function FacePile({ people }: FacePileProps) {
  const [first, second] = people
  if (!first || people.length === 1) {
    return (
      <img
        aria-hidden="true"
        className="h-6 w-6 flex-none rounded-full object-cover select-none"
        src={first?.picture || donut}
        alt=""
        draggable={false}
      />
    )
  }
  return (
    <span aria-hidden="true" className="relative h-6 w-8 flex-none">
      <img className={`${FACE} left-0`} src={first.picture || donut} alt="" draggable={false} />
      {people.length === 2 ? (
        <img className={`${FACE} left-3`} src={second.picture || donut} alt="" draggable={false} />
      ) : (
        <span
          className={`${FACE} left-3 flex items-center justify-center bg-field text-[10px] leading-none font-bold text-ink`}
        >
          +{people.length - 1}
        </span>
      )}
    </span>
  )
}
