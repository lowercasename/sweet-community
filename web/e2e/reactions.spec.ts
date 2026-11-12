import type { Page } from '@playwright/test'
import { anyView, article, expect, member, open, owner, ROOT, sendMessage, test, uniq, writePost } from './helpers'

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
  await o.page.getByRole('navigation', { name: 'Main' }).hover()
  await expect(message.locator('[data-action-bar]')).toHaveCSS('opacity', '0')

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

test('choosing a reaction returns keyboard focus to its button', async ({ browser }, info) => {
  const kit = await member(browser, info)
  await open(kit.page)
  const text = uniq('Keyboard reaction ')
  await sendMessage(kit.page, text)
  const trigger = article(kit.page, text).getByRole('button', { name: 'Add reaction' })
  await trigger.focus()
  await kit.page.keyboard.press('Enter')
  const choice = kit.page.getByRole('dialog', { name: 'Emoji' }).getByRole('button', { name: 'thumbs up', exact: true })
  await choice.focus()
  await kit.page.keyboard.press('Enter')
  await expect(kit.page.getByRole('dialog', { name: 'Emoji' })).toBeHidden()
  await expect(trigger).toBeFocused()
  await kit.context.close()
})

test('removing reactions from several messages leaves no action bars open', async ({ browser }, info) => {
  const kit = await member(browser, info)
  const prefix = uniq('Remove reaction ')
  for (let i = 0; i < 3; i++) {
    const created = await kit.context.request.post(`/api/groups/${ROOT}/messages`, {
      data: { body_html: `<p>${prefix} ${i}</p>` },
    })
    expect(created.ok()).toBeTruthy()
    const { id } = await created.json()
    const reacted = await kit.context.request.put(`/api/messages/${id}/reactions`, {
      data: { emoji: '👍', reacted: true },
    })
    expect(reacted.ok()).toBeTruthy()
  }
  await open(kit.page)
  const messages = kit.page.locator('.block-item').filter({ hasText: prefix })
  await expect(messages).toHaveCount(3)
  for (const message of await messages.all()) {
    const reaction = message.getByRole('button', { name: 'You reacted with 👍' })
    await reaction.click()
    await expect(reaction).toHaveCount(0)
  }
  await kit.page.getByRole('navigation', { name: 'Main' }).hover()
  for (const bar of await messages.locator('[data-action-bar]').all()) {
    await expect(bar).toHaveCSS('opacity', '0')
  }
  await kit.context.close()
})

test('opening a reaction picker refreshes emoji used in another session', async ({ browser }, info) => {
  const kit = await member(browser, info)
  const created = await kit.context.request.post(`/api/groups/${ROOT}/messages`, {
    data: { body_html: '<p>Frequent emoji</p>' },
  })
  expect(created.ok()).toBeTruthy()
  const { id } = await created.json()
  await open(kit.page)
  const trigger = article(kit.page, 'Frequent emoji').getByRole('button', { name: 'Add reaction' })
  await trigger.focus()
  await trigger.click()
  const row = kit.page.getByRole('dialog', { name: 'Emoji' }).getByRole('button')
  await expect(row.first()).toHaveAccessibleName('thumbs up')
  await kit.page.keyboard.press('Escape')
  // The server changes while this page's query cache stays open.
  const reacted = await kit.context.request.put(`/api/messages/${id}/reactions`, {
    data: { emoji: '🧶', reacted: true },
  })
  expect(reacted.ok()).toBeTruthy()
  await trigger.click()
  await expect(row.first()).toHaveAccessibleName('yarn')
  await kit.context.close()
})

test('a reaction picker keeps a compact loading placeholder', async ({ browser }, info) => {
  const kit = await member(browser, info)
  await open(kit.page)
  const text = uniq('Loading reaction ')
  await sendMessage(kit.page, text)
  let release!: () => void
  const download = new Promise<void>((resolve) => {
    release = resolve
  })
  await kit.page.route(/\.js(?:\?|$)/, async (route) => {
    await download
    await route.continue()
  })
  try {
    const trigger = article(kit.page, text).getByRole('button', { name: 'Add reaction' })
    await trigger.focus()
    await trigger.click()
    const dialog = kit.page.getByRole('dialog', { name: 'Emoji' })
    await expect(dialog.getByText('Loading…')).toBeVisible()
    expect((await dialog.boundingBox())!.height).toBeLessThan(100)
    release()
    await expect(dialog.getByRole('button', { name: 'thumbs up', exact: true })).toBeVisible()
    expect((await dialog.boundingBox())!.height).toBeLessThan(100)
  } finally {
    release()
    await kit.context.close()
  }
})

for (const phone of [false, true]) {
  test(`message actions stay reachable at the top of the chat${phone ? ' @phone' : ''}`, async ({ browser }, info) => {
    const kit = await member(browser, info, 'longusernameabcdefghijkl')
    const prefix = uniq('Toolbar ')
    for (let i = 0; i < 30; i++) {
      const res = await kit.context.request.post(`/api/groups/${ROOT}/messages`, {
        data: { body_html: `<p>${prefix} ${i}</p>` },
      })
      expect(res.ok()).toBeTruthy()
    }
    await open(kit.page)
    if (phone) await anyView(kit.page, 'Chat').click()
    const message = kit.page.locator('.block-item').filter({ hasText: `${prefix} 5` })
    await expect(message).toBeAttached()
    await message.evaluate((el) => {
      const scroll = el.closest('[data-scroll]')!
      scroll.scrollTop += el.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 5
    })
    if (phone) await message.getByText(`${prefix} 5`, { exact: true }).tap()
    else await message.hover()
    const bar = message.locator('[data-action-bar]')
    await expect(bar).toBeVisible()
    await expect
      .poll(() =>
        bar.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          const scroll = el.closest('[data-scroll]')!.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          return rect.top >= scroll.top && rect.bottom <= scroll.bottom && el.contains(hit)
        }),
      )
      .toBe(true)
    await kit.page.screenshot({ path: `test-results/reaction-toolbar-${info.project.name}.png` })
    const reply = message.getByRole('button', { name: 'Reply to this message' })
    await reply.focus()
    const scrollTop = await message.evaluate((el) => {
      const scroll = el.closest('[data-scroll]')!
      const before = scroll.scrollTop
      scroll.scrollTop += 200
      return before
    })
    await expect(bar).toBeHidden()
    await message.evaluate((el, top) => {
      el.closest('[data-scroll]')!.scrollTop = top
    }, scrollTop)
    await expect(bar).toBeVisible()
    await message.getByRole('button', { name: 'Reply to this message' }).click()
    await expect(kit.page.getByRole('button', { name: 'Cancel reply' })).toBeVisible()
    await kit.context.close()
  })
}
