# Buttons and patterns

Drawn at real size on the canvas https://claude.ai/artifact/YXR9jNVjYSQFY8abMpVfPi. It has six artboards: variants and states, patterns, phone width, surfaces before and after, labels and icons, and colour schemes.

Written 8 November 2026 from an inventory of every button in the app (about 130 uses of `Button`, plus nav items, the tab bar, the rail, list rows, menu triggers, pills and dialog actions). Revised the same day after Raphael's review. Nothing here is built yet. Once agreed, the rules go into `architecture.md` and the changes are made one surface per commit.

## The problem

There are three variants, but no rule says what each one is for, so each surface chose differently. Save is primary in the post editor and in room settings, and secondary on the account and topics cards. Message is a ghost button in the People list and secondary in the person card. Destructive actions are styled four ways. Every primary submit button is disabled until its form is valid, and a disabled primary is grey, so the main action on most screens first appears as a grey block. In room settings, the grey Save sits to the left of a ghost Delete room, which makes Delete room look like the active control. Twenty busy labels are written by hand. Icons have several meanings each.

The same lack of rules applies to layout. Destructive actions sit in form footers, inside lists, or under a paragraph next to a harmless action. A user cannot learn where to look.

## Variants

| Variant | Use | Rest | Hover | Pressed (toggles only) | Disabled |
|---|---|---|---|---|---|
| **primary** | The main action of a surface. At most one visible at a time. | Primary fill, white text, medium weight | Darker fill | Not used as a toggle | Primary fill at 45% opacity, white text. Never grey. |
| **secondary** | Any other action that changes something or starts a flow. | 1px border in the line colour, ink text, card background | Pink border, red text | Not used as a toggle | Grey text, border unchanged |
| **ghost** | A quiet action, a toggle, a menu trigger, or Cancel. | No border, grey text | Field background, ink text | Blush background, red text. A text toggle shows its state at rest (Subscribed) and its action on hover (Unsubscribe). | Line-coloured text |
| **danger** | Removes something that cannot simply be undone: a post, a room, a member, an account, every session. | Like secondary, with a blush-line border and red text and icon, on a card background. Always has an icon. | Red border, blush background | Not used as a toggle | Line-coloured text and border |

A confirm dialog's confirm button is **danger as a filled button**: red fill, white text, the same words as the control that opened the dialog. Cancel is a ghost.

Blush, used for the pressed state and the danger hover, changes from `#fffafc` to a visible tint (`#fde8e8` in today's colours). Today's blush has a contrast of 1.03:1 against white and cannot be seen.

**Size.** Every button and medium pill is 34px tall. Button text changes from 16px to 15px, the same size as pill text, with a 22px line and 5px padding above and below. Icon-only buttons change from 32px to 34px (7px padding around an 18px icon). Icons are 18px in a button, 20px in the nav and 22px in the tab bar. Raphael accepted 34px as the touch target on 8 November.

**Busy** is a `busy` prop, not a label change. It disables the button and shows a spinner in place of the icon, or before the text. The label does not change.

**Navigation** is a link, not a button, except in an empty state, where a secondary button named after the destination sends the user on.

## Patterns

Every surface is built from eight patterns, so the same kind of thing is always in the same place.

One rule for every row of buttons: left to right, from the least to the most consequential action. A destructive action never shares a row with a primary. It is an action row in the last card of the page, and it opens a confirm dialog.

1. **Form.** Fields, then a footer at the right: Cancel when the form can be abandoned, then the primary. Nothing else goes in the footer. Used for room settings, community settings, email and password, new room, new message, topics, and every sign-in page.
2. **Action rows.** Each row is one thing the user can do or turn on: a title and one sentence on the left, one button on the right. Toggles and actions use the same row. On a phone the button drops below the text and stays at the right. Used for notifications and for pattern 3.
3. **Ending things.** Destructive actions are action rows in the last card of the page, ordered from the least to the most consequential, top to bottom. The row says what will be lost. A danger button opens a confirm dialog. Used for a room's Leave room and Delete room, and on Settings for Sign out, Sign out everywhere and Remove my account.
4. **List.** The control that adds to the list sits above the rows. Each row has its subject on the left, then the one common action in the open and the rest in a three-dot menu at the right. A menu item that removes something confirms. The menu is always visible on a list row. Used for People, room members, topics and invite links.
5. **Confirm dialog.** A heading that asks the question, one sentence on the consequence, then Cancel and the confirm button at the right.
6. **Content and editor.** A post, comment or message keeps its actions in a menu at its top right, shown on hover with a pointer and always on touch screens. An editor has formatting on the left and Cancel and the submit button on the right.
7. **Controls under an object.** Buttons that act on one object sit in a row beside or under it, least to most consequential. Facts about the object go at the right end of the row. Used for the profile picture, the room picture and invite links.
8. **Empty state.** One sentence on why the place is empty, then one secondary button named after the place that fills it.

Gaps: 8px between buttons in a row, 16px between groups.

## Labels

A button label is a verb, plus an object when the verb alone would be unclear on that page. Sentence case, no full stop, no ellipsis.

| Action | Verb | Today |
|---|---|---|
| Making a new thing | **Create** room, invite link, topic | Create, Add, Start |
| Putting an existing thing in | **Add to room**, **Add images** | Add |
| Beginning a conversation | **Message** | Start, Message |
| Keeping an edit | **Save** | Save, Set the password |
| Publishing | **Post**, **Send**, **Reply** | Same |
| Deleting content | **Delete** | Delete |
| Removing a person or a picture | **Remove** | Remove, Back to the donut |
| Leaving a room or a session | **Leave room**, **Sign out**, **Sign out everywhere** | Leave room, Sign out here |
| Sending an email again | **Send a new link** | Send it again, Send a new link, Send a link, Send the link there |
| Copying | **Copy**, then **Copied** for two seconds | Same |
| Continuing | **Next**, or the destination's name | Same |

Toggles: Subscribe, Subscribed, Unsubscribe on hover. Send me a weekly digest, Weekly digest on, Turn weekly digest off on hover. Notify this device, Notifying this device, Stop notifying this device on hover (Raphael's wording, 8 November).

## Icons

A button has an icon only when the icon is the whole button, when it tells two neighbouring buttons apart, or when the button is a danger. A primary never has one. One meaning per icon:

| Icon | Meaning | Not used for |
|---|---|---|
| `trash` | Delete content: post, comment, message, room, topic | People |
| `remove` | Remove a member, a picture, an attached image, my account, an invite link | Content |
| `logout` | Sign out, Leave room | |
| `devices` | Every device | |
| `people` | The People page and a room's members | View profile, empty states |
| `user` (new) | One person: View profile | |
| `chat` | Message someone | |
| `pencil` | Edit | |
| `plus` | Create, in a nav section's title row | |
| `back` | Back, in a bar | |
| `more` | A menu | |

## Surfaces that change

- **A room's members and settings page.** Room settings is a form with Save only, at the right. Members is a list with Add to room above it. A last card holds Leave room and Delete room as danger action rows. Delete room shows only to the owner.
- **Settings.** The last card, Sign out and leave, holds three action rows: This device (Sign out, secondary), Every device (Sign out everywhere, danger, confirmed), Leave this community (Remove my account, danger, confirmed). The profile picture uses Choose a picture and Remove picture (danger).
- **People.** Create invite link is primary. Each invite row is Copy (secondary) and Revoke (danger, not confirmed, because a new link is one click away), with the expiry at the right. A person row has Message in the open and the rest in the menu. On a phone, Message drops its label and keeps its icon.
- **Sign-in pages.** Submit buttons are right-aligned primaries that stay pink when disabled. Check your email shows Use a different address, then Send a new link, then a link back to sign in.
- **Every confirm dialog** uses the filled danger button with the opening control's words, and `busy`.
- **Nav, tab bar, rail, list rows, suggestion list and menu items** use the ghost tokens for hover and current, instead of repeating them.

## Colour

Today five of the six key colour pairs fail the contrast guidelines: grey text on white (4.29:1) and on the grey field (3.94:1), white on the pink primary button (3.30:1), links (3.57:1) and input borders (1.30:1, against 3:1 needed). The canvas shows three site-wide schemes that keep the same feel and pass every pair:

- **A. Closest to today.** The same hues. The primary button uses Sweet red instead of pink. Grey text and links are darker, inputs get a visible border, blush is a visible tint. Pink stays for focus rings and hover borders.
- **B. Warm.** Everything in A, with the greys warmed towards Sweet's red-tinged ink, and more margin on every pair.
- **C. Pink kept.** The primary button stays a lighter red than the text, deepened until white text on it passes (4.59:1). Red text is one shade darker so the two stay distinct.

Raphael chooses. The chosen scheme replaces the tokens in `web/src/global.css`.

## Order of work

1. Colours: the chosen scheme in `global.css`, then screenshots of every page at both widths.
2. `Button`: add `danger` and `busy`, 15px text, disabled primary, icon-only to 34px. Vitest for `busy` and `danger`. A Playwright page that renders every variant in every state at both widths, reviewed before anything else changes.
3. Nav primitives onto the ghost tokens.
4. One commit per surface, applying the patterns, each checked at both widths.
5. Record the rules in `architecture.md` under a Buttons and patterns heading, and delete this file.
