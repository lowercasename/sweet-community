import { article, confirm, expect, member, open, pick, png, sendMessage, test, uniq } from './helpers'

test.describe('chat', () => {
  test('a message appears live for the other user, and its author can delete it', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)

    const text = uniq('hello from kit ')
    await sendMessage(kit.page, text)
    await expect(article(mo.page, text)).toBeVisible()
    // After sending, the editor is empty and keeps focus for the next message.
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText('')

    // Only the author (or staff) sees the message menu.
    await expect(article(mo.page, text).getByRole('button', { name: 'Message options' })).toHaveCount(0)
    await pick(kit.page, article(kit.page, text), 'Message options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(kit.page.getByText(text)).toHaveCount(0)
    await expect(mo.page.getByText(text)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('Shift+Enter inserts a new line, and Enter sends the message', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const a = uniq('line one ')
    await kit.page.locator('.editor-line .ProseMirror').first().click()
    await kit.page.keyboard.type(a)
    await kit.page.keyboard.press('Shift+Enter')
    await kit.page.keyboard.type('line two')
    await expect(article(kit.page, a)).toHaveCount(0)
    await kit.page.keyboard.press('Enter')
    await expect(article(kit.page, a)).toContainText('line two')
    await kit.context.close()
  })

  test("each message's menu is at the top right of its own block, including the first message, and a hovered message has a pink background", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const text = uniq('look at this ')
    const chat = kit.page.locator('form', { has: kit.page.locator('.editor-line') })
    await chat
      .locator('input[type=file]')
      .setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: png(1200, 300) })
    await expect(chat.locator('textarea')).toHaveCount(1)
    await sendMessage(kit.page, text)
    const msg = article(kit.page, text)
    const author = (await msg.getByRole('button', { name: kit.username }).boundingBox())!
    const block = msg.locator('.content').first()
    const b1 = (await block.boundingBox())!
    const menu = (await msg.getByRole('button', { name: 'Message options' }).first().boundingBox())!
    // The menu is below the author line and at the top right of the message's own block, whatever the image height.
    expect(menu.y).toBeGreaterThanOrEqual(author.y + author.height - 1)
    expect(Math.abs(menu.y - b1.y)).toBeLessThan(6)
    expect(menu.x).toBeGreaterThan(b1.x + b1.width - 1)
    // A second message by the same user is added to the same run. Its menu is also at the top right of its own block.
    const more = uniq('and this ')
    await sendMessage(kit.page, more)
    const line = (await msg.getByText(more).boundingBox())!
    const menu2 = (await msg.getByRole('button', { name: 'Message options' }).nth(1).boundingBox())!
    expect(Math.abs(menu2.y - line.y)).toBeLessThan(6)
    expect(menu2.x).toBeGreaterThan(line.x + line.width - 1)
    // A third message. The lines of a run keep a 4px gap between them, and a menu never makes its block taller.
    const third = uniq('and that ')
    await sendMessage(kit.page, third)
    const l2 = (await msg.getByText(more).boundingBox())!
    const l3 = (await msg.getByText(third).boundingBox())!
    expect(Math.round(l3.y - (l2.y + l2.height))).toBe(4)
    // Hovering a message gives it a light pink background.
    await msg.getByText(third).hover()
    await expect(msg.getByText(third).locator('xpath=ancestor::div[contains(@class,"block-message")][1]')).toHaveCSS(
      'background-color',
      'rgb(255, 250, 252)',
    )
    await kit.context.close()
  })
})
