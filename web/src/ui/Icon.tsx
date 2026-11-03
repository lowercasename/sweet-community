import {
  MessagesSquare,
  Newspaper,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  type LucideIcon,
} from 'lucide-react'

export type IconName =
  | 'posts'
  | 'chat'
  | 'panel-left'
  | 'panel-left-close'
  | 'panel-left-open'
  | 'panel-right'
  | 'panel-right-close'
  | 'panel-right-open'

const ICONS: Record<IconName, LucideIcon> = {
  posts: Newspaper,
  chat: MessagesSquare,
  'panel-left': PanelLeft,
  'panel-left-close': PanelLeftClose,
  'panel-left-open': PanelLeftOpen,
  'panel-right': PanelRight,
  'panel-right-close': PanelRightClose,
  'panel-right-open': PanelRightOpen,
}

interface IconProps {
  name: IconName
  size?: 16 | 18 | 20
}

/** A Lucide icon in the current text colour. Decorative; the control around it carries the label. */
export function Icon({ name, size = 18 }: IconProps) {
  const Glyph = ICONS[name]
  return <Glyph size={size} strokeWidth={1.75} aria-hidden="true" focusable="false" />
}
