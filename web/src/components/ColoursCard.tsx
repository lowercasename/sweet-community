import { useState } from 'react'
import { setThemeChoice, themeChoice, type ThemeChoice } from '../theme'
import { ActionRow, ActionRows, Card, Heading, Select, Stack } from '../ui'

const OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'device', label: 'Match this device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/** The light or dark choice, on Settings (architecture.md, Interface). It is kept on this device only. */
export function ColoursCard() {
  const [choice, setChoice] = useState<ThemeChoice>(themeChoice)
  const change = (next: ThemeChoice) => {
    setThemeChoice(next)
    setChoice(next)
  }
  return (
    <Card>
      <Stack gap={2}>
        <Heading level={2}>Interface mode</Heading>
        <ActionRows>
          <ActionRow
            action={<Select label="Interface mode" value={choice} options={OPTIONS} onChange={(v) => change(v)} />}
          >
            Sweet uses your device&apos;s setting unless you choose light or dark here. The choice applies to this
            device only.
          </ActionRow>
        </ActionRows>
      </Stack>
    </Card>
  )
}
