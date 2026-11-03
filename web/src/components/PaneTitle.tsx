import { Bar, Button, Heading, Row } from '../ui'

interface PaneTitleProps {
  title: string
  /** When set, a Close control is shown (only while both panes are open). */
  onClose?: () => void
}

export function PaneTitle({ title, onClose }: PaneTitleProps) {
  return (
    <Bar edge="bottom">
      <Row justify="between" align="baseline">
        <Heading level={2}>{title}</Heading>
        {onClose && (
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
        )}
      </Row>
    </Bar>
  )
}
