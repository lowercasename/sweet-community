import {
  ArrowLeft,
  Bell,
  BellOff,
  BellRing,
  Bold,
  Check,
  ChevronDown,
  Tag,
  ChevronsLeft,
  GripVertical,
  ChevronsRight,
  EllipsisVertical,
  House,
  Image as ImageIcon,
  Italic,
  Link,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessagesSquare,
  Newspaper,
  Pencil,
  Plus,
  Reply,
  Search,
  Settings,
  TabletSmartphone,
  Trash2,
  User,
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
  | 'bell-ring'
  | 'bell-off'
  | 'people'
  | 'settings'
  | 'expand'
  | 'collapse'
  | 'posts'
  | 'chat'
  | 'menu'
  | 'logout'
  | 'mail'
  | 'comment'
  | 'image'
  | 'pencil'
  | 'devices'
  | 'grip'
  | 'remove'
  | 'more'
  | 'trash'
  | 'plus'
  | 'back'
  | 'tag'
  | 'chevron'
  | 'check'
  | 'user'
  | 'spinner'
  | 'reply'

const ICONS: Record<IconName, LucideIcon> = {
  bold: Bold,
  italic: Italic,
  link: Link,
  home: House,
  search: Search,
  bell: Bell,
  'bell-ring': BellRing,
  'bell-off': BellOff,
  people: Users,
  settings: Settings,
  expand: ChevronsRight,
  collapse: ChevronsLeft,
  posts: Newspaper,
  chat: MessagesSquare,
  menu: Menu,
  logout: LogOut,
  mail: Mail,
  comment: MessageCircle,
  image: ImageIcon,
  pencil: Pencil,
  devices: TabletSmartphone,
  grip: GripVertical,
  remove: X,
  more: EllipsisVertical,
  trash: Trash2,
  plus: Plus,
  back: ArrowLeft,
  tag: Tag,
  chevron: ChevronDown,
  check: Check,
  user: User,
  spinner: LoaderCircle,
  reply: Reply,
}

interface IconProps {
  name: IconName
  size?: 14 | 16 | 18 | 20 | 22
}

/** A Lucide icon in the current text colour. Decorative. The control around it carries the label. */
export function Icon({ name, size = 18 }: IconProps) {
  const Glyph = ICONS[name]
  return <Glyph size={size} strokeWidth={2} aria-hidden="true" focusable="false" />
}
