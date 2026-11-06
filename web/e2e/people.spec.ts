import { anyView, article, expect, member, open, sendMessage, test, uniq, writePost } from './helpers'

test.describe('people', () => {
  test('a name opens a card about the person, which the pointer may enter, with a way to message them', async ({
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
    // The picture beside the name is the same control.
    await article(mo.page, text).getByRole('img', { name: kit.username }).hover()
    await expect(card).toBeVisible()
    await mo.page.mouse.move(8, 8)
    await expect(card).toBeHidden()
    await name.hover()
    await expect(card).toBeVisible()
    await expect(card).toContainText(/joined (just now|\d+m ago)/)
    // Into the card: it stays. Away from both: it goes.
    await card.getByRole('button', { name: 'Message' }).hover()
    await expect(card).toBeVisible()
    await mo.page.mouse.move(8, 8)
    await expect(card).toBeHidden()
    // A click opens it too, and Escape closes it.
    await name.click()
    await expect(card).toBeVisible()
    await mo.page.keyboard.press('Escape')
    await expect(card).toBeHidden()

    // Message from the card lands in the conversation with kit.
    await name.click()
    await card.getByRole('button', { name: 'Message' }).click()
    await expect(mo.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(mo.page.getByRole('heading', { name: kit.username })).toBeVisible()
    // In the chat, my own name opens a card with nobody to message.
    const hi = uniq('hi kit ')
    await sendMessage(mo.page, hi)
    await article(mo.page, hi).getByRole('button', { name: mo.username }).click()
    const mine = mo.page.getByRole('dialog', { name: `About ${mo.username}` })
    await expect(mine).toBeVisible()
    await expect(mine.getByRole('button', { name: 'Message' })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('@phone a tap on a name opens the card, and Message goes to the conversation', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const text = uniq('tap me ')
    await kit.context.request.post('/api/groups/00000000-0000-7000-8000-000000000000/posts', {
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
