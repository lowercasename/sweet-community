/** Marks the end of content whose visibility advances a discussion's read position. */
export function ReadPoint({ at }: { at: number }) {
  return <span aria-hidden="true" data-read-at={at} className="-mt-px block h-px w-px" />
}
