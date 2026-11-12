import { Field, Input } from '../ui'

interface UsernameFieldProps {
  label: string
  value: string
  onChange: (username: string) => void
  autoFocus?: boolean
}

/** The username field with the rules for a username, for a new account and for a rename on Settings. */
export function UsernameField({ label, value, onChange, autoFocus = false }: UsernameFieldProps) {
  return (
    <Field label={label} hint="Shown next to your posts and messages. You can use letters, numbers, and underscores.">
      <Input name="username" value={value} onChange={onChange} autoComplete="username" autoFocus={autoFocus} required />
    </Field>
  )
}

interface AccountFieldsProps {
  username: string
  onUsername: (username: string) => void
  email: string
  onEmail: (email: string) => void
}

/** The username and email address fields of a new account, on the setup page and the join page. */
export function AccountFields({ username, onUsername, email, onEmail }: AccountFieldsProps) {
  return (
    <>
      <UsernameField label="Username" value={username} onChange={onUsername} autoFocus />
      <Field
        label="Email address"
        hint="Sweet signs you in by email, so there is no password to remember. You can add one in Settings later."
      >
        <Input type="email" name="email" value={email} onChange={onEmail} autoComplete="email" required />
      </Field>
    </>
  )
}
