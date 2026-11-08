import { chatEditor, expect, member, open, test, uniq } from './helpers'

const ROOT = '00000000-0000-7000-8000-000000000000'

/**
 * Replies in chat (architecture.md, Chat). Reply on a message attaches it
 * above the chat editor. The sent reply shows a quote of the original, which
 * scrolls to it. The original's author is notified with the reply kind.
 */
test.describe('replies', () => {
  test('a reply quotes the original for everyone, notifies its author, and the quote leads back to the original', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)
    const original = uniq('Who has the projector ')
    await kit.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: `<p>${original}</p>` } })

    // Mo hovers the message and replies. The message is attached above the editor until the reply is sent.
    const block = mo.page.getByText(original).locator('xpath=ancestor::div[contains(@class,"block-message")][1]')
    await block.hover()
    await block.getByRole('button', { name: 'Reply to this message' }).click()
    await expect(mo.page.getByText('Replying to')).toBeVisible()
    // The editor takes focus on Reply, so mo can type at once.
    await expect(chatEditor(mo.page)).toBeFocused()
    const answer = uniq('I do ')
    await mo.page.keyboard.type(answer)
    await mo.page.keyboard.press('Enter')
    await expect(mo.page.getByText('Replying to')).toHaveCount(0)

    // Both users see the reply with its quote of the original.
    const quote = `${kit.username}: ${original}`
    await expect(mo.page.getByRole('button', { name: quote })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: quote })).toBeVisible()
    await expect(kit.page.getByText(answer)).toBeVisible()

    // Kit is notified with the reply kind.
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('button', { name: 'Notifications, unread' })).toBeVisible()
    await open(kit.page, '/notifications')
    // Opening the notification opens the chat at the reply, and the address loses its message parameter.
    await kit.page.getByRole('button', { name: `${mo.username} replied to your message in the chat, new` }).click()
    await expect(kit.page.locator('.block-message .content').getByText(answer, { exact: true })).toBeInViewport()
    await expect(kit.page).toHaveURL(/\/$/)

    // One click on the quote scrolls to the original, even from the bottom of the chat.
    await open(kit.page)
    await kit.page.getByRole('button', { name: quote }).click()
    // The original's own body, not the quote, which repeats its text.
    await expect(kit.page.locator('.block-message .content').getByText(original, { exact: true })).toBeInViewport()
    await kit.context.close()
    await mo.context.close()
  })

  test('a quote of a message on an earlier page loads earlier pages until the original is shown', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const room = (await (
      await kit.context.request.post('/api/groups', { data: { kind: 'group', name: uniq('Long chat '), mode: 'both' } })
    ).json()) as { id: string }
    const messages = `/api/groups/${room.id}/messages`
    const original = uniq('Far back ')
    const first = (await (
      await kit.context.request.post(messages, { data: { body_html: `<p>${original}</p>` } })
    ).json()) as {
      id: string
    }
    // More than one page of messages, which is 50, lies between the original and the reply.
    for (let i = 0; i < 60; i++) await kit.context.request.post(messages, { data: { body_html: `<p>filler ${i}</p>` } })
    await kit.context.request.post(messages, { data: { body_html: '<p>Answer</p>', reply_to: first.id } })
    await open(kit.page, `/r/${room.id}`)
    await kit.page.getByRole('button', { name: `${kit.username}: ${original}` }).click()
    await expect(kit.page.locator('.block-message .content').getByText(original, { exact: true })).toBeInViewport()
    await kit.context.close()
  })

  test('@phone Reply is shown without hovering, because a touch screen has no pointer', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    const text = uniq('On a phone ')
    await kit.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: `<p>${text}</p>` } })
    const block = kit.page.getByText(text).locator('xpath=ancestor::div[contains(@class,"block-message")][1]')
    const reply = block.getByRole('button', { name: 'Reply to this message' })
    await expect(reply).toBeVisible()
    await reply.tap()
    await expect(kit.page.getByText('Replying to')).toBeVisible()
    await kit.context.close()
  })
})
