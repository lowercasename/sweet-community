import { expect, member, open, test, uniq, view } from './helpers'

test.describe('layout', () => {
  test('a draft is kept after its pane is closed and reopened, and after a visit to Settings', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const draft = uniq('Half a post ')
    const chatDraft = uniq('half a message ')
    await kit.page.locator('.editor-post .ProseMirror').first().click()
    await kit.page.keyboard.type(draft)
    await kit.page.locator('.editor-line .ProseMirror').first().click()
    await kit.page.keyboard.type(chatDraft)

    // Close the chat pane from the divider. The post editor keeps its text. Reopen the chat pane from the rail.
    await kit.page.getByRole('separator', { name: 'Resize panes' }).focus()
    await kit.page.keyboard.press('End')
    await expect(kit.page.getByRole('button', { name: 'Show chat' })).toBeVisible()
    // A hovered rail keeps a solid background, so the dotted page does not show through it (Raphael, 2026-11-09).
    const rail = kit.page.getByRole('button', { name: 'Show chat' })
    await rail.hover()
    // The hover colour fades in over 150ms.
    await kit.page.waitForTimeout(300)
    expect(await rail.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toMatch(/\/|rgba|transparent/)
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)
    await kit.page.getByRole('button', { name: 'Show chat' }).click()
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText(chatDraft)

    // Close the posts pane and reopen it.
    await kit.page.getByRole('separator', { name: 'Resize panes' }).focus()
    await kit.page.keyboard.press('Home')
    await kit.page.getByRole('button', { name: 'Show posts' }).click()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)

    // Open Settings from the nav and return with the back button.
    // Settings is opened inside the app, from my own page, so the draft stays mounted behind it.
    await kit.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: kit.username }).click()
    await kit.page.getByRole('button', { name: 'Settings' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Profile picture' })).toBeVisible()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toBeHidden()
    await kit.page.goBack()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText(draft)
    await expect(kit.page.locator('.editor-line .ProseMirror').first()).toHaveText(chatDraft)
    await kit.context.close()
  })

  test("a pane's scroll area runs from its top edge to its bottom edge, and the margin is inside the scroll area", async ({
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
    // The first card is 16px below the top of the scroll area, so the margin scrolls with the content.
    const card = (await kit.page
      .locator('.editor-post')
      .first()
      .locator('xpath=ancestor::div[contains(@class,"rounded-card")][1]')
      .boundingBox())!
    expect(Math.round(card.y - s.y)).toBe(16)
    await kit.context.close()
  })

  test('in a short window the middle of the nav column scrolls, and the account row and Collapse stay at the bottom', async ({
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
    // People is below the visible part of the middle section. Scrolling the middle section brings it into view,
    // and the bottom section does not move.
    const people = nav.getByRole('button', { name: 'People' })
    await people.scrollIntoViewIfNeeded()
    await expect(people).toBeInViewport()
    expect((await collapse.boundingBox())!.y).toBe(c.y)
    await kit.context.close()
  })

  test('dragging the divider resizes the panes, and a double-click resets them', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const separator = kit.page.getByRole('separator', { name: 'Resize panes' })
    await expect(separator).toHaveAttribute('aria-valuenow', '40')
    // On hover the divider shows a grey line, and its handle turns red (Raphael, 2026-11-09).
    await separator.hover()
    await expect(separator.locator('span').first()).toHaveCSS('background-color', 'rgb(146, 146, 146)')
    await expect(separator.locator('span').nth(1)).toHaveCSS('background-color', 'rgb(206, 23, 23)')
    await separator.focus()
    await kit.page.keyboard.press('ArrowRight')
    await kit.page.keyboard.press('ArrowRight')
    await expect(separator).toHaveAttribute('aria-valuenow', '44')
    await separator.dblclick()
    await expect(separator).toHaveAttribute('aria-valuenow', '40')
    await kit.context.close()
  })

  test('@phone shows one pane at a time and a tab bar, and the chat pane spans the whole width', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    // At narrow widths there is no nav column and no divider. The tab bar is shown instead.
    await expect(kit.page.getByRole('separator', { name: 'Resize panes' })).toHaveCount(0)
    // The bar shows the view's name and the buttons that switch between its panes. The tab bar holds groups and
    // tools.
    await expect(kit.page.getByRole('heading', { name: 'Home' })).toBeVisible()
    const tabs = kit.page.locator('nav').last()
    await expect(tabs.getByRole('button')).toHaveText(['Home', 'Search', 'Notifications', 'Menu'])
    // The menu fills the whole screen. It has no bar above it and no card edges around it.
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
    // The menu tab contains People and Settings.
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page.getByRole('button', { name: 'People' })).toBeVisible()
    await kit.context.close()
  })
})
