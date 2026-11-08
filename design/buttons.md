# Buttons

A design for every button in Sweet, written 8 November 2026 from an inventory of all of them: about 130 uses of `Button`, plus the nav items, tab bar, rail, list rows, menu triggers, pills and dialog actions. The inventory found thirty inconsistencies. They are listed at the end with the rule that resolves each one. Nothing in this document is built yet. Once agreed, the rules go into `architecture.md` and the changes are made one surface per commit.

## The problem

There are three variants, but no rule says what each one is for, so each surface chose differently.

- Save is primary in the post editor and in room settings, and secondary on the account card and the topics card.
- Message is a ghost button in the People list, secondary in the person card, and secondary on a profile.
- Destructive actions are styled four ways: Delete room is a ghost with a bin icon, Remove my account is secondary with a cross icon, Leave room is secondary with a door icon, Revoke is a ghost with no icon.
- Every primary submit button is disabled until the form is valid, and a disabled primary is grey. So the main action on most screens first appears as a grey block. In room settings, the grey Save sits to the left of a ghost Delete room, which makes Delete room look like the active control.
- Twenty busy-state labels are written by hand ("Saving…", "Sending…", "Opening…"). Three dialogs have none.
- Icons have several meanings each. `people` is used for the People page, a room's members, View profile, and the way out of an empty state.

## The system

Four variants. Each variant answers one question: what does pressing this button do?

| Variant | Use | Rest | Hover | Pressed (toggles only) | Disabled |
|---|---|---|---|---|---|
| **primary** | The main action of the surface. At most one visible at a time. | Pink fill, white text, medium weight | Red (sweet) fill | Not used as a toggle | Pink fill at 45% opacity, white text. Still recognisable as the main action. Never grey. |
| **secondary** | An action that changes something or starts a flow, but is not the surface's main action. | 1px border in the line colour, ink text, card background | Pink border, red text | Not used as a toggle | Grey (mute) text, border unchanged |
| **ghost** | A quiet action next to content, a toggle, a menu trigger, or Cancel. | No border, grey text | Field background, ink text | Blush background, red text. A text toggle shows its state at rest (Subscribed) and its action on hover (Unsubscribe). | Line-coloured text |
| **danger** | An action that removes something and cannot simply be undone: a post, a room, a member, an account, all sessions. Always has an icon. Always confirmed when the loss is real. | Ghost shape, red text and icon | Blush background | Not used as a toggle | Line-coloured text |

One height, 32px, as now. Pills change from 34px to 32px so a pill and a button on one row align. Icon sizes: 18px in a button, 20px in the nav, 22px in the tab bar. These three are documented so no fourth size is added.

Busy state is a `busy` prop, not a label change. `busy` disables the button and shows a small spinner in place of the icon, or before the text if there is no icon. The label does not change: "Save" stays "Save" while saving. This removes nineteen hand-written "…" labels and fixes the three dialogs without one.

The confirm button in a confirm dialog is **danger as a filled button**: red (sweet) fill, white text, the same verb as the control that opened the dialog (Delete, Remove, Leave, Revoke, Make owner). Cancel is a ghost. Today every confirm button is pink primary, so confirming a deletion looks the same as posting.

Navigation is a link, not a button. A control that only moves to another page is a `Link` in text, or a ghost button with an arrow when it stands alone. Exception: an empty state whose only purpose is to send the user somewhere else may use a secondary button, because a single link looks lost.

### Placement

A row of actions reads left to right from least to most consequential. The primary is always at the right end.

```
[danger]                                  [ghost Cancel] [primary Save]
```

- A form's footer is `Row justify="end"` with the primary last. Not left-aligned. (New room, New message, the invite card and room settings are left-aligned today.)
- A destructive action goes at the far left of the same row, never next to the primary. In room settings: Delete room at the left, Save at the right.
- A card with only secondary buttons (Sign out, Sign out everywhere) orders them by scope: this device first, then everywhere.
- A list row's actions are at its right: the one common action in the open (Message), the rest in the three-dot menu. The menu is always visible on a list row, for touch devices, and appears on hover on a content block (post, comment, message), as now.
- A dialog: Cancel, then the confirm button, right-aligned, 12px gap.

Gaps: 8px between buttons that belong together (Cancel and Save, Copy and Revoke), 16px between groups. There are four different gaps today.

### Labels

A button label is a verb, plus an object when the verb alone would be ambiguous on that page. One verb per kind of action:

| Action | Verb | Today |
|---|---|---|
| Making a new thing | **Create** room, invite link, topic | Create, Add, Start |
| Putting an existing thing in | **Add** someone, images | Add |
| Beginning a conversation | **Message** | Start, Message |
| Keeping an edit | **Save** | Save, Set the password |
| Publishing | **Post**, **Send**, **Reply** | Same |
| Deleting content | **Delete** | Delete |
| Removing a person or a picture | **Remove** | Remove, Back to the donut |
| Leaving a room or a session | **Leave room**, **Sign out**, **Sign out everywhere** | Leave room, Sign out here |
| Sending an email again | **Send a new link** | Send it again, Send a new link, Send a link, Send the link there |
| Copying | **Copy**, then **Copied** for two seconds | Same |
| Continuing | **Next**, or the destination's name | Same |

Sentence case. No full stop. No ellipsis in a label. A toggle's label at rest names the state when on (Subscribed, Weekly digest on, Notifying this device) and the action when off (Subscribe, Send me a weekly digest, Notify this device). On hover, the on state shows its action (Unsubscribe, Turn off, Stop). The three existing toggles do this with three different wordings. The rule uses the shortest.

### Icons

A button has an icon only in three cases: the icon is the whole button (toolbar, menu trigger, Back), the icon distinguishes two neighbouring buttons (Sign out with a door, Sign out everywhere with devices), or the button is a danger. A primary button never has an icon. One icon per meaning:

| Icon | Meaning | Not used for |
|---|---|---|
| `trash` | Delete content: post, comment, message, room, topic | People |
| `remove` | Remove: a member, a picture, an attached image, my account | Content |
| `logout` | Sign out, Leave room | |
| `devices` | All devices | |
| `people` | The People page and a room's members | View profile, empty states |
| `user` (new) | One person: View profile | |
| `chat` | Message someone | |
| `pencil` | Edit | |
| `plus` | Create, in a section's title row | |
| `back` | Back, in a bar | |
| `more` | A menu | |

## Every button, after the change

Grouped by surface. Only buttons that change are listed. The rest already follow the rules.

**Auth pages.** Submit buttons stay primary and right-aligned, but a disabled primary stays pink instead of grey. "Set the password" becomes "Save". On the check-your-email screen, "Send it again" becomes "Send a new link" (secondary), "Use a different address" stays ghost, and "Back to sign in" becomes a link under the card, matching the other auth pages. On the Welcome page, "Create invite link" becomes primary once the community is named, matching the People page.

**Sidebar, tab bar, rail.** No visual change. NavItem, TabBar, Rail and ListRow currently repeat the ghost hover and current colours in their own classes. They change to use the ghost tokens, so a change to ghost applies to them too. The nav's New room and New message stay icon-only ghosts.

**Bars.** Back stays an icon-only ghost. "Members and settings" stays a ghost with the `people` icon. The Posts and Chat segments on the phone stay pressed ghosts.

**Feed header.** The topic pill changes to 32px. Subscribe stays a ghost toggle. It is the model for the other toggles.

**Editors.** The toolbar stays icon-only ghosts with pressed states. Cancel is a ghost, then Post, Send, Reply or Save as primary, 8px gap, right-aligned. Busy state uses the `busy` prop. The topic pill in the edit form stays after the toolbar.

**Post, comment, message.** The menu trigger is unchanged. Delete in a menu becomes a danger item (red text and bin icon). Edit stays plain. "Show comments" stays an icon-only ghost with a count.

**Person card and profile.** View profile becomes a ghost with the `user` icon. Message becomes a secondary with the `chat` icon, as the card's one action. On a profile: Edit bio is secondary with `pencil`, Settings is a ghost with `settings` (navigation), Message is secondary with `chat`. In the People list, Message stays a ghost with `chat`, because every row has one.

**Settings.** Choose a picture is secondary with `image`. "Back to the donut" becomes "Remove picture", a danger. Account: both submit buttons become primary (each form is its own surface), right-aligned, pink when disabled. Notifications: the two toggles keep the Subscribe wording pattern, with "Turn off" and "Stop" as the hover text. Sign out: "Sign out" is secondary with `logout`. "Sign out everywhere" is a danger with `devices` and is confirmed, because it ends sessions the user cannot see. "Remove my account" is a danger with `remove` and is confirmed, as now.

**Community.** Save is primary, as now. Topics: "Add topic" becomes "Create topic", primary within its form, right-aligned. The edit form's Save is primary and Cancel is a ghost. Delete in the menu is a danger item.

**People.** "Create invite link" is primary, as now, with `busy`. Copy is secondary. Revoke is a danger with `remove` and is not confirmed, because a new link is one click away. The row menu: Make moderator and Make member are plain items, Remove is a danger item and is confirmed, as now.

**Room settings.** The row becomes `[Delete room, danger, trash] … [Save, primary]`, with Save at the right and pink when nothing has changed. Choose a picture is secondary. Remove picture is a danger.

**Members.** "Add" becomes "Add to room", secondary. Remove in the row menu becomes a confirmed danger item, matching the People page. "Switch ownership" becomes "Make owner", matching the menu item. "Leave room" is a danger with `logout` at the bottom of the card and is confirmed, as now. All three dialogs get `busy`.

**Other pages.** New room and New message: submit buttons right-aligned, and "Start" becomes "Message". Notifications: Clear stays a ghost with `trash`, because it only removes already-read items. Empty states keep a secondary button named after the destination, without an icon. Load more and Load earlier stay secondary.

## The thirty inconsistencies, resolved

Numbers refer to the inventory.

- 1 to 5, same action with different variants: a form's submit is primary and there is one per form. Message is secondary where it is the card's main action and ghost in a list row. Navigation is a link or a ghost.
- 6 to 8, destructive actions: the danger variant, the filled confirm button, the verb repeated in the dialog, `busy` on every dialog.
- 9, grey primaries: a disabled primary stays pink.
- 10 to 12, toggles: pressed is a ghost-only state by design. Pressed and current share one look, because both mean "this is selected". The three text toggles use one wording pattern.
- 13 and 14, pills next to buttons: pills change to 32px. Hover rules are written down for each primitive.
- 15 to 19, labels: the verb table and the `busy` prop.
- 20 to 22, icons: the icon table, `user` added, `people` narrowed to People and members.
- 23 to 26, placement: the row rule, the gap rule, menus always visible on rows and shown on hover on content.
- 27 to 30, duplicate implementations: NavItem, TabBar, Rail, ListRow, SuggestionList and Menu items use `buttonClass('ghost')` for hover and current states. FilePicker takes its variant from its caller, as now. HoverCard's trigger (a person's name, red, underlined on hover) is documented as the one text control that is not a Link.

## Order of work

1. `Button`: add `danger`, add `busy`, restyle the disabled primary, export the tokens the nav primitives need. Vitest for `busy` and `danger`. A Playwright page that renders every variant in every state at both widths and saves screenshots to `test-results`, reviewed before anything else changes.
2. Pill to 32px. Nav primitives onto the ghost tokens. Screenshots of the sidebar, tab bar, rail and feed header.
3. One commit per surface in the order above, each checked at both widths.
4. Record the rules in `architecture.md` under a Buttons heading, and delete this file.
