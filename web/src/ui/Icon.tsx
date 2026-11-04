import {
  Bell,
  Bold,
  ChevronsLeft,
  ChevronsRight,
  House,
  Italic,
  Link,
  LogOut,
  Menu,
  MessagesSquare,
  Newspaper,
  Pencil,
  Search,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type IconName =
  | 'bold'
  | 'italic'
  | 'link'
  | 'home'
  | 'search'
  | 'bell'
  | 'people'
  | 'settings'
  | 'expand'
  | 'collapse'
  | 'posts'
  | 'chat'
  | 'menu'
  | 'logout'
  | 'pencil'

const ICONS: Record<IconName, LucideIcon> = {
  bold: Bold,
  italic: Italic,
  link: Link,
  home: House,
  search: Search,
  bell: Bell,
  people: Users,
  settings: Settings,
  expand: ChevronsRight,
  collapse: ChevronsLeft,
  posts: Newspaper,
  chat: MessagesSquare,
  menu: Menu,
  logout: LogOut,
  pencil: Pencil,
}

interface IconProps {
  name: IconName
  size?: 16 | 18 | 20 | 22
}

/** A Lucide icon in the current text colour. Decorative; the control around it carries the label. */
export function Icon({ name, size = 18 }: IconProps) {
  const Glyph = ICONS[name]
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" focusable="false" />
}
