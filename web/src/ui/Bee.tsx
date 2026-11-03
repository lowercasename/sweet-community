/** Sweet's bee, in the current text colour. Decorative; the wordmark beside it carries the name. */
export function Bee() {
  return (
    <svg className="inline-block h-7 w-7 align-[-6px]" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {/* antennae */}
      <path d="M10 6.5 8.2 3.4M14 6.5l1.8-3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx="7.8" cy="3" r="1.2" fill="currentColor" />
      <circle cx="16.2" cy="3" r="1.2" fill="currentColor" />
      {/* wings */}
      <ellipse cx="5" cy="12" rx="3.6" ry="2.1" transform="rotate(-35 5 12)" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <ellipse cx="19" cy="12" rx="3.6" ry="2.1" transform="rotate(35 19 12)" stroke="currentColor" strokeWidth="1.6" fill="none" />
      {/* body with two pale stripes */}
      <path d="M12 5.5c3.3 0 5.5 3.2 5.5 7.4S15.3 21 12 21s-5.5-3.9-5.5-8.1S8.7 5.5 12 5.5Z" fill="currentColor" />
      <rect x="8.4" y="11" width="7.2" height="1.6" rx="0.8" fill="#fff" />
      <rect x="8.6" y="14.4" width="6.8" height="1.6" rx="0.8" fill="#fff" />
      {/* sting */}
      <path d="M12 21v1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
