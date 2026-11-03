import { Bold, Italic, Link, type LucideIcon } from 'lucide-react'

export type IconName = 'bold' | 'italic' | 'link'

const ICONS: Record<IconName, LucideIcon> = {
  bold: Bold,
  italic: Italic,
  link: Link,
}

interface IconProps {
  name: IconName
  size?: 16 | 18 | 20
}

/** A Lucide icon in the current text colour. Decorative; the control around it carries the label. */
export function Icon({ name, size = 18 }: IconProps) {
  const Glyph = ICONS[name]
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" focusable="false" />
}
