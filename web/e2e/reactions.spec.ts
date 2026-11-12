import type { Page } from '@playwright/test'
import { anyView, article, expect, member, open, owner, sendMessage, test, uniq, writePost } from './helpers'

/** Chooses an emoji from the reaction picker's first row. */
async function pick(page: Page, name: string) {
  await page.getByRole('dialog', { name: 'Emoji' }).getByRole('button', { name }).click()
}

/**
 * Reactions on chat messages, posts and comments. A reaction shows to the other members at once. Each emoji names the
 * people who chose it, and choosing it again removes the viewer's reaction.
 */
test('a reaction on a message shows to other members at once, and choosing it again removes it', async ({
  browser,
}, info) => {
  const kit = await member(browser, info)
  const o = await owner(browser, info)
  await open(kit.page)
  await open(o.page)
  const text = uniq('A message to react to ')
  await sendMessage(kit.page, text)

  const message = article(o.page, text)
  await message.hover()
  await message.getByRole('button', { name: 'Add reaction' }).click()
  await pick(o.page, 'thumbs up')
  await expect(message.getByRole('button', { name: 'You reacted with 👍' })).toHaveAttribute('aria-pressed', 'true')

  // kit sees the owner's reaction at once, and adds their own by pressing it.
  const kits = article(kit.page, text)
  await kits.getByRole('button', { name: 'raphael reacted with 👍' }).click()
  await expect(kits.getByRole('button', { name: 'You and raphael reacted with 👍' })).toContainText('2')
  await expect(message.getByRole('button', { name: `You and ${kit.username} reacted with 👍` })).toBeVisible()

  // The owner chooses 👍 again from the picker, which removes the owner's reaction.
  await message.hover()
  await message.getByRole('button', { name: 'Add reaction' }).click()
  await pick(o.page, 'thumbs up')
  await expect(kits.getByRole('button', { name: 'You reacted with 👍' })).toContainText('1')
  await kit.context.close()
  await o.context.close()
})

test('a post and a comment take reactions too', async ({ browser }, info) => {
  const kit = await member(browser, info)
  await open(kit.page)
  const text = uniq('A post to react to ')
  await writePost(kit.page, text)
  const post = article(kit.page, text)
  // A post's Add reaction sits beside its comments button.
  await post.getByRole('button', { name: 'Add reaction' }).first().click()
  await pick(kit.page, 'red heart')
  await expect(post.getByRole('button', { name: 'You reacted with ❤️' })).toBeVisible()

  await post.getByRole('button', { name: 'Show comments' }).click()
  const reply = uniq('A comment ')
  await post.locator('.editor-line .ProseMirror').click()
  await kit.page.keyboard.type(reply)
  await post.getByRole('button', { name: 'Reply', exact: true }).click()
  const comment = post.getByRole('article').filter({ hasText: reply })
  await comment.hover()
  await comment.getByRole('button', { name: 'Add reaction' }).click()
  await pick(kit.page, 'folded hands')
  await expect(comment.getByRole('button', { name: 'You reacted with 🙏' })).toBeVisible()
  // The comment's reaction is the comment's, not the post's.
  await expect(post.getByRole('button', { name: 'You reacted with 🙏' })).toHaveCount(1)
  // The picker now offers kit's own emoji first, the one used last first.
  await post.getByRole('button', { name: 'Add reaction' }).first().click()
  const row = kit.page.getByRole('dialog', { name: 'Emoji' }).getByRole('button')
  await expect(row.nth(0)).toHaveAccessibleName('folded hands')
  await expect(row.nth(1)).toHaveAccessibleName('red heart')
  await expect(row.nth(2)).toHaveAccessibleName('thumbs up')
  await kit.context.close()
})

test('on a phone, a tap on a message shows its actions, and a tap elsewhere hides them @phone', async ({
  browser,
}, info) => {
  const kit = await member(browser, info)
  await open(kit.page)
  await anyView(kit.page, 'Chat').click()
  const first = uniq('First ')
  const second = uniq('Second ')
  await sendMessage(kit.page, first)
  await sendMessage(kit.page, second)
  // Both messages are in one run of kit's messages, so each is found by its own block.
  const block = (text: string) => kit.page.locator('.block-item').filter({ hasText: text })
  const message = block(first)
  const react = message.getByRole('button', { name: 'Add reaction' })
  await expect(react).toBeHidden()
  await message.getByText(first).tap()
  await expect(react).toBeVisible()
  await expect(block(second).getByRole('button', { name: 'Add reaction' })).toBeHidden()
  await react.tap()
  await pick(kit.page, 'face with tears of joy')
  await expect(message.getByRole('button', { name: 'You reacted with 😂' })).toBeVisible()
  await kit.page.getByText(second).tap()
  await expect(react).toBeHidden()
  await kit.context.close()
})
