import { article, confirm, expect, member, open, pick, sendMessage, test, uniq } from './helpers'

test.describe('chat', () => {
  test('a message reaches the other person live, and its author can delete it', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)

    const text = uniq('hello from kit ')
    await sendMessage(kit.page, text)
    await expect(article(mo.page, text)).toBeVisible()
    // Sent: the editor is empty and still focused for the next line.
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText('')

    // Only the author (or staff) sees the menu.
    await expect(article(mo.page, text).getByRole('button', { name: 'Message options' })).toHaveCount(0)
    await pick(kit.page, article(kit.page, text), 'Message options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(kit.page.getByText(text)).toHaveCount(0)
    await expect(mo.page.getByText(text)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('Shift+Enter makes a new line; Enter sends', async ({ browser }, testInfo) => {
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
})
