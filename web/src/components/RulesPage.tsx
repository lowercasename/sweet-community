import { useRules } from '../data/hooks'
import { Card, Measure, Pane, ScrollArea, Text } from '../ui'
import { Body } from './Body'

/** The community's rules, opened from the Rules button on Home, or from the menu on a phone. */
export function RulesPage() {
  const rules = useRules()
  return (
    <Pane>
      <ScrollArea>
        <Measure>
          <Card>
            {rules ? <Body html={rules} /> : <Text variant="secondary">This community has no rules yet.</Text>}
          </Card>
        </Measure>
      </ScrollArea>
    </Pane>
  )
}
