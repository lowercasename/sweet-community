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
  /** Allow choosing several files at once. */
  multiple?: boolean
  onPick: (files: File[]) => void
  children?: ReactNode
}

/** A button that opens the file chooser; the input itself stays hidden. */
export function FilePicker({
  accept,
  variant = 'ghost',
  icon,
  label,
  disabled,
  multiple,
  onPick,
  children,
}: FilePickerProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (files.length > 0) onPick(files)
        }}
      />
      <Button variant={variant} icon={icon} label={label} disabled={disabled} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  )
}
