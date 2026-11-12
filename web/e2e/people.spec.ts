import { anyView, article, expect, member, open, sendMessage, test, uniq, writePost, ROOT } from './helpers'

test.describe('people', () => {
  test('a username opens a card about the user, the pointer can move into the card, and the card has a button to message the user', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    const text = uniq('card me ')
    await writePost(kit.page, text)
    await open(mo.page)

    const name = article(mo.page, text).getByRole('button', { name: kit.username })
    const card = mo.page.getByRole('dialog', { name: `About ${kit.username}` })
    // The profile picture beside the name is the same control.
    await article(mo.page, text).getByRole('img', { name: kit.username }).hover()
    await expect(card).toBeVisible()
    await mo.page.mouse.move(8, 8)
    await expect(card).toBeHidden()
    await name.hover()
    await expect(card).toBeVisible()
    await expect(card.locator('time')).not.toContainText(/\d{1,2}:\d{2}/)
    // The card stays open while the pointer is in it. It closes when the pointer leaves both the name and the card.
    await card.getByRole('button', { name: 'Message' }).hover()
    await expect(card).toBeVisible()
    await mo.page.mouse.move(8, 8)
    await expect(card).toBeHidden()
    // A click also opens the card, and Escape closes it.
    await name.click()
    await expect(card).toBeVisible()
    await mo.page.keyboard.press('Escape')
    await expect(card).toBeHidden()

    // The card's Message button opens the conversation with kit.
    await name.click()
    await card.getByRole('button', { name: 'Message' }).click()
    await expect(mo.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(mo.page.getByRole('heading', { name: kit.username })).toBeVisible()
    // In the chat, my own name opens a card that has no Message button.
    const hi = uniq('hi kit ')
    await sendMessage(mo.page, hi)
    await article(mo.page, hi).getByRole('button', { name: mo.username }).click()
    const mine = mo.page.getByRole('dialog', { name: `About ${mo.username}` })
    await expect(mine).toBeVisible()
    await expect(mine.getByRole('button', { name: 'Message' })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('a card for a name near the bottom of the pane opens above the name, not over the editor', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    // The authors alternate, so each message is its own run with its own name. The last message is at the bottom.
    for (let i = 0; i < 30; i++) {
      await (i % 2 ? kit : mo).context.request.post(`/api/groups/${ROOT}/messages`, {
        data: { body_html: `<p>filler ${i}</p>` },
      })
    }
    const last = uniq('last word ')
    await mo.context.request.post(`/api/groups/${ROOT}/messages`, {
      data: { body_html: `<p>${last}</p>` },
    })
    await open(kit.page)
    const name = article(kit.page, last).getByRole('button', { name: mo.username })
    await expect(name).toBeVisible()
    await name.hover()
    const card = kit.page.getByRole('dialog', { name: `About ${mo.username}` })
    await expect(card).toBeVisible()
    // The card never covers the editor below the pane. It moves above its name when there is not enough space below.
    const editor = (await kit.page.locator('form', { has: kit.page.locator('.editor-line') }).boundingBox())!
    const c = (await card.boundingBox())!
    expect(c.y + c.height).toBeLessThanOrEqual(editor.y + 1)
    await kit.context.close()
    await mo.context.close()
  })

  test('@phone tapping a name opens the card, and Message opens the conversation', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const text = uniq('tap me ')
    await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: { body_html: `<p>${text}</p>` },
    })
    await open(mo.page)
    await anyView(mo.page, 'Posts').click()
    await article(mo.page, text).getByRole('button', { name: kit.username }).click()
    const card = mo.page.getByRole('dialog', { name: `About ${kit.username}` })
    await expect(card).toBeVisible()
    await card.getByRole('button', { name: 'Message' }).click()
    await expect(mo.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(mo.page.getByRole('heading', { name: kit.username })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })
})
