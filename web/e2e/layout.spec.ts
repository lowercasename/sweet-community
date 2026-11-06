import { expect, member, open, test, uniq, view } from './helpers'

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
    await expect(kit.page.getByRole('button', { name: 'Show chat' })).toBeVisible()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)
    await kit.page.getByRole('button', { name: 'Show chat' }).click()
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText(chatDraft)

    // Close posts, reopen.
    await kit.page.getByRole('separator', { name: 'Resize panes' }).focus()
    await kit.page.keyboard.press('Home')
    await kit.page.getByRole('button', { name: 'Show posts' }).click()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)

    // Settings and back, by the nav and by the back button.
    // Settings is reached in the app, from my own page, so the draft stays mounted behind it.
    await kit.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: kit.username }).click()
    await kit.page.getByRole('button', { name: 'Settings' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Profile picture' })).toBeVisible()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toBeHidden()
    await kit.page.goBack()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText(chatDraft)
    await kit.context.close()
  })

  test('a pane scrolls from its top edge to its bottom edge; the margin is inside the scroll', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const pane = kit.page.locator('.editor-post').first().locator('xpath=ancestor::section[1]')
    const scroll = pane.locator('[data-scroll]').first()
    const p = (await pane.boundingBox())!
    const s = (await scroll.boundingBox())!
    expect(Math.abs(s.y - p.y)).toBeLessThan(1)
    expect(Math.abs(s.y + s.height - (p.y + p.height))).toBeLessThan(1)
    // The first card sits 16px in from the scroll's top: the margin scrolls with the content.
    const card = (await kit.page
      .locator('.editor-post')
      .first()
      .locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]')
      .boundingBox())!
    expect(Math.round(card.y - s.y)).toBe(16)
    await kit.context.close()
  })

  test('on a short window the nav column scrolls in the middle; the account and Collapse stay at the foot', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await kit.page.setViewportSize({ width: 1100, height: 420 })
    for (const name of ['Alpha', 'Beta', 'Gamma', 'Delta']) {
      await kit.context.request.post('/api/groups', { data: { kind: 'group', name: uniq(name), mode: 'both' } })
    }
    await open(kit.page)
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    const collapse = nav.getByRole('button', { name: 'Collapse' })
    await expect(collapse).toBeVisible()
    const c = (await collapse.boundingBox())!
    expect(c.y + c.height).toBeLessThanOrEqual(420)
    const n = (await nav.boundingBox())!
    expect(n.height).toBeLessThanOrEqual(420)
    // Settings is below the fold of the middle; scrolling the middle brings it up, the foot does not move.
    const settings = nav.getByRole('button', { name: 'People' })
    await settings.scrollIntoViewIfNeeded()
    await expect(settings).toBeInViewport()
    expect((await collapse.boundingBox())!.y).toBe(c.y)
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
    // The bar names the view, and holds the choice of its panes; the tab bar holds places and tools.
    await expect(kit.page.getByRole('heading', { name: 'Home' })).toBeVisible()
    const tabs = kit.page.locator('nav').last()
    await expect(tabs.getByRole('button')).toHaveText(['Home', 'Search', 'Notifications', 'Menu'])
    // The menu is the whole screen: no bar above it, no card edges around it.
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Menu' })).toHaveCount(0)
    const menuCard = await kit.page
      .getByRole('button', { name: 'Sign out' })
      .locator('xpath=ancestor::section[1]')
      .boundingBox()
    expect(menuCard && menuCard.x === 0 && menuCard.width === kit.page.viewportSize()!.width).toBeTruthy()
    await tabs.getByRole('button', { name: 'Home' }).click()
    await expect(view(kit.page, 'Chat')).toBeVisible()
    await view(kit.page, 'Chat').click()
    const chat = kit.page.locator('.editor-line').first()
    await expect(chat).toBeVisible()
    const pane = await chat.locator('xpath=ancestor::section[1]').boundingBox()
    const viewport = kit.page.viewportSize()!
    expect(pane!.width).toBeGreaterThan(viewport.width - 4)
    await view(kit.page, 'Posts').click()
    await expect(kit.page.locator('.editor-post').first()).toBeVisible()
    await expect(kit.page.locator('.editor-line').first()).toBeHidden()
    // The menu tab holds People and Settings.
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page.getByRole('button', { name: 'People' })).toBeVisible()
    await kit.context.close()
  })
})
