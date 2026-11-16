import { useState } from 'react'
import { Avatar } from './Avatar'
import { Icon } from './Icon'
import { Input } from './Input'

interface PersonOption {
  id: string
  name: string
  picture?: string | null
}

interface PeoplePickerProps {
  people: PersonOption[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

/** A searchable checkbox list with removable selections above it. */
export function PeoplePicker({ people, value, onChange, disabled }: PeoplePickerProps) {
  const [search, setSearch] = useState('')
  const selected = people.filter((person) => value.includes(person.id))
  const matches = people.filter((person) => person.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  const remove = (id: string) => onChange(value.filter((selectedID) => selectedID !== id))
  return (
    <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0 disabled:opacity-60">
      <legend className="mb-2 text-sm font-medium text-mute">
        Members{selected.length > 0 && ` · ${selected.length} selected`}
      </legend>
      <div className="overflow-hidden rounded-md border border-line bg-card">
        {selected.length > 0 && (
          <div
            role="group"
            aria-label="Selected people"
            className="flex max-h-28 flex-wrap gap-2 overflow-y-auto border-b border-line p-3"
          >
            {selected.map((person) => (
              <button
                key={person.id}
                type="button"
                aria-label={`Remove ${person.name}`}
                onClick={() => remove(person.id)}
                className="inline-flex min-h-8 max-w-full cursor-pointer items-center gap-2 rounded-full border border-line px-2 py-1 text-sm text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-sweet disabled:cursor-default"
              >
                <Avatar name={person.name} picture={person.picture} size="xs" decorative />
                <span className="truncate" title={person.name}>
                  {person.name}
                </span>
                <Icon name="remove" size={14} />
              </button>
            ))}
          </div>
        )}
        <div
          className="p-3"
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
          }}
        >
          <Input label="Search people" placeholder="Search people" value={search} onChange={setSearch} />
        </div>
        <div
          role="group"
          aria-label="Available people"
          className="max-h-40 overflow-y-auto overscroll-contain px-1 pb-1 sm:max-h-48"
        >
          {matches.map((person) => (
            <label
              key={person.id}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded px-3 py-2 text-ink hover:bg-ink/5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-sweet"
            >
              <Avatar name={person.name} picture={person.picture} size="sm" decorative />
              <span className="min-w-0 flex-1 truncate" title={person.name}>
                {person.name}
              </span>
              <input
                type="checkbox"
                aria-label={person.name}
                checked={value.includes(person.id)}
                onChange={(event) => (event.target.checked ? onChange([...value, person.id]) : remove(person.id))}
                className="h-4 w-4 shrink-0 accent-sweet"
              />
            </label>
          ))}
          {matches.length === 0 && (
            <p className="px-3 py-2 text-sm text-mute">
              {people.length === 0 ? 'No other members yet.' : 'No people found.'}
            </p>
          )}
        </div>
      </div>
    </fieldset>
  )
}
