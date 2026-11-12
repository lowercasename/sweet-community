import { Field, Input } from '../ui'

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
      <Field
        label="Username"
        hint="Shown next to your posts and messages. You can use letters, numbers, and underscores."
      >
        <Input name="username" value={username} onChange={onUsername} autoComplete="username" autoFocus required />
      </Field>
      <Field
        label="Email address"
        hint="Sweet signs you in by email, so there is no password to remember. You can add one in Settings later."
      >
        <Input type="email" name="email" value={email} onChange={onEmail} autoComplete="email" required />
      </Field>
    </>
  )
}
