import { article, confirm, expect, member, open, pick, png, sendMessage, test, uniq } from './helpers'

test.describe('chat', () => {
  test('a message appears live for the other user, and its author can delete it @dev', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)

    const text = uniq('hello from kit ')
    await sendMessage(kit.page, text)
    await expect(article(mo.page, text)).toBeVisible()
    // After sending, the editor is empty and keeps focus for the next message.
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText('')

    // Another member's menu on the message holds only Report. Delete is for the author and staff.
    await article(mo.page, text).hover()
    await article(mo.page, text).getByRole('button', { name: 'Message options' }).click()
    await expect(mo.page.getByRole('menuitem')).toHaveText(['Report'])
    await mo.page.keyboard.press('Escape')
    await pick(kit.page, article(kit.page, text), 'Message options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(kit.page.getByText(text)).toHaveCount(0)
    await expect(mo.page.getByText(text)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test("a message's actions float over the top right of its own block while it is hovered, and take no space", async ({
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
    const more = uniq('and this ')
    await sendMessage(kit.page, more)
    const third = uniq('and that ')
    await sendMessage(kit.page, third)
    const msg = article(kit.page, text)
    const block = (t: string) => msg.getByText(t).locator('xpath=ancestor::div[contains(@class,"block-item")][1]')
    const bar = (t: string) => block(t).locator('[data-action-bar]')
    // A bar is hidden, and takes no clicks, until its block is hovered.
    await expect(bar(more)).toHaveCSS('opacity', '0')
    await expect(bar(more)).toHaveCSS('pointer-events', 'none')
    // Hovering a message gives it a light pink background and shows its own bar only.
    for (const t of [text, more]) {
      await msg.getByText(t).hover()
      await expect(block(t)).toHaveCSS('background-color', 'rgb(253, 242, 242)')
      await expect(bar(t)).toHaveCSS('opacity', '1')
      await expect(bar(third)).toHaveCSS('opacity', '0')
      // The bar sits at the block's top right, above its top edge, whatever the height of an image in the message.
      const b = (await block(t).boundingBox())!
      const r = (await bar(t).boundingBox())!
      expect(Math.abs(r.x + r.width - (b.x + b.width))).toBeLessThan(10)
      expect(r.y).toBeLessThan(b.y)
    }
    // Its buttons are the compact 26px size.
    expect((await bar(more).getByRole('button', { name: 'Message options' }).boundingBox())!.height).toBe(26)
    // The lines of a run keep a 4px gap between them, because the bar takes no space.
    const l2 = (await msg.getByText(more).boundingBox())!
    const l3 = (await msg.getByText(third).boundingBox())!
    expect(Math.round(l3.y - (l2.y + l2.height))).toBe(4)
    await kit.context.close()
  })
})
