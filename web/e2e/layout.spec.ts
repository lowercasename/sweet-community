import { expect, member, open, test, uniq } from './helpers'

test.describe('layout', () => {
  test('a draft survives closing its pane, reopening it, and a visit to Settings', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const draft = uniq('Half a post ')
    const chatDraft = uniq('half a message ')
    await kit.page.locator('.editor-post .ProseMirror').first().click()
    await kit.page.keyboard.type(draft)
    await kit.page.locator('.editor-line .ProseMirror').first().click()
    await kit.page.keyboard.type(chatDraft)

    // Close chat from the divider; the posts editor keeps its text; reopen from the rail.
    await kit.page.getByRole('separator', { name: 'Resize panes' }).focus()
    await kit.page.keyboard.press('End')
    await expect(kit.page.getByTitle('Show chat')).toBeVisible()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)
    await kit.page.getByTitle('Show chat').click()
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText(chatDraft)

    // Close posts, reopen.
    await kit.page.getByRole('separator', { name: 'Resize panes' }).focus()
    await kit.page.keyboard.press('Home')
    await kit.page.getByTitle('Show posts').click()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)

    // Settings and back, by the nav and by the back button.
    await kit.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Profile picture' })).toBeVisible()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toBeHidden()
    await kit.page.goBack()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText(chatDraft)
    await kit.context.close()
  })

  test('dragging the divider resizes; double-click resets', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const separator = kit.page.getByRole('separator', { name: 'Resize panes' })
    await expect(separator).toHaveAttribute('aria-valuenow', '40')
    await separator.focus()
    await kit.page.keyboard.press('ArrowRight')
    await kit.page.keyboard.press('ArrowRight')
    await expect(separator).toHaveAttribute('aria-valuenow', '44')
    await separator.dblclick()
    await expect(separator).toHaveAttribute('aria-valuenow', '40')
    await kit.context.close()
  })

  test('@phone one pane at a time, a tab bar, and chat across the whole width', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    // Narrow: no nav column, no divider, the tab bar instead.
    await expect(kit.page.getByRole('separator', { name: 'Resize panes' })).toHaveCount(0)
    const tabs = kit.page.getByRole('tablist').or(kit.page.locator('nav').last())
    await expect(tabs.getByRole('button', { name: 'Chat' })).toBeVisible()
    await tabs.getByRole('button', { name: 'Chat' }).click()
    const chat = kit.page.locator('.editor-line').first()
    await expect(chat).toBeVisible()
    const pane = await chat.locator('xpath=ancestor::section[1]').boundingBox()
    const viewport = kit.page.viewportSize()!
    expect(pane!.width).toBeGreaterThan(viewport.width - 4)
    await tabs.getByRole('button', { name: 'Posts' }).click()
    await expect(kit.page.locator('.editor-post').first()).toBeVisible()
    await expect(kit.page.locator('.editor-line').first()).toBeHidden()
    // The menu tab holds People and Settings.
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page.getByRole('button', { name: 'People' })).toBeVisible()
    await kit.context.close()
  })
})
