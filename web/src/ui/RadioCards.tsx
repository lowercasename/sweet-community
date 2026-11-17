import { useId } from 'react'
import { Icon, type IconName } from './Icon'

interface RadioCardsProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; description: string; icon: IconName }[]
  disabled?: boolean
  onChange: (value: T) => void
}

/** A choice with every option and its explanation visible. */
export function RadioCards<T extends string>({ label, value, options, disabled, onChange }: RadioCardsProps<T>) {
  const name = useId()
  return (
    <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-2 text-sm font-medium text-mute">{label}</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border bg-card p-3 transition-colors hover:border-sweet has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sweet ${value === option.value ? 'border-sweet' : 'border-line'} ${disabled ? 'cursor-default opacity-60' : ''}`}
          >
            <input
              className="mt-1 shrink-0 accent-sweet"
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-label={option.label}
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-2 font-medium text-ink">
                <Icon name={option.icon} size={16} />
                {option.label}
              </span>
              <span className="text-sm text-mute [overflow-wrap:anywhere]">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
