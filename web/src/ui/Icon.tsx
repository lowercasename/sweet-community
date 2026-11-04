import {
  Bell,
  Bold,
  ChevronsLeft,
  GripVertical,
  ChevronsRight,
  EllipsisVertical,
  House,
  Image as ImageIcon,
  Italic,
  Link,
  LogOut,
  Menu,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Pencil,
  Search,
  Settings,
  TabletSmartphone,
  Trash2,
  Users,
  X,
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
  | 'comment'
  | 'image'
  | 'pencil'
  | 'devices'
  | 'grip'
  | 'remove'
  | 'more'
  | 'trash'

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
  comment: MessageCircle,
  image: ImageIcon,
  pencil: Pencil,
  devices: TabletSmartphone,
  grip: GripVertical,
  remove: X,
  more: EllipsisVertical,
  trash: Trash2,
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
