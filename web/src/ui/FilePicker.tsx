import { useRef, type ReactNode } from 'react'
import { Button } from './Button'
import type { IconName } from './Icon'

interface FilePickerProps {
  /** MIME types or extensions, as the input's accept attribute. */
  accept: string
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?: IconName
  label: string
  disabled?: boolean
  onPick: (file: File) => void
  children?: ReactNode
}

/** A button that opens the file chooser; the input itself stays hidden. */
export function FilePicker({ accept, variant = 'ghost', icon, label, disabled, onPick, children }: FilePickerProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onPick(f)
        }}
      />
      <Button variant={variant} icon={icon} label={label} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  )
}
