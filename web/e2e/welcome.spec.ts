import type { Page } from '@playwright/test'
import { expect, member, open, owner, test, uniq } from './helpers'

/**
 * The welcome dialog and the tour. The dialog opens
 * the first time a user sees Home. The tour's cards point at parts of the page and must fit the screen at each width.
 */

const welcomeHeading = (page: Page) => page.getByRole('heading', { name: 'Welcome to Sweet e2e' })
/** The tour's card. Joyride marks it as an alert dialog. The welcome dialog is a plain dialog. */
const tourCard = (page: Page) => page.getByRole('alertdialog')

/**
 * Steps through the tour with each card's primary button and returns the cards' titles. Each card must sit inside the
 * screen with at least the 16px gutter, and show its number out of the total.
 */
async function walk(page: Page): Promise<string[]> {
  const titles: string[] = []
  const counts: string[] = []
  const width = page.viewportSize()!.width
  for (;;) {
    const card = tourCard(page)
    await expect(card).toBeVisible()
    const title = (await card.getByRole('heading').textContent()) ?? ''
    titles.push(title)
    counts.push((await card.getByText(/^\d+ of \d+$/).textContent()) ?? '')
    const box = (await card.boundingBox())!
    expect(box.x, `left edge of "${title}"`).toBeGreaterThanOrEqual(15.5)
    // On a phone the card spans the screen less the gutters, so its two margins match.
    if (width < 800) expect(Math.abs(box.x - (width - box.x - box.width)), `margins of "${title}"`).toBeLessThan(1)
    expect(box.x + box.width, `right edge of "${title}"`).toBeLessThanOrEqual(width - 15.5)
    const primary = card.getByRole('button').last()
    const label = (await primary.textContent()) ?? ''
    await primary.click()
    if (label === 'Done' || label === 'Write welcome message') break
    await expect(card.getByRole('heading')).not.toHaveText(title)
  }
  await expect(tourCard(page)).toHaveCount(0)
  expect(counts).toEqual(titles.map((_, i) => `${i + 1} of ${titles.length}`))
  return titles
}

test.describe('welcome', () => {
  test('a new member sees the welcome message under the owner, takes the tour, and can open it again from Settings', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const text = `Say hello in the chat ${uniq('w')}`
    const put = await o.context.request.put('/api/welcome', { data: { body_html: `<p>${text}</p>` } })
    expect(put.ok()).toBeTruthy()
    await o.context.close()

    const kit = await member(browser, testInfo, 'kit', false)
    await open(kit.page)
    await expect(welcomeHeading(kit.page)).toBeVisible()
    await expect(kit.page.getByText('Sweet e2e runs on Sweet.')).toBeVisible()
    await expect(kit.page.getByText(text)).toBeVisible()
    await expect(kit.page.getByRole('dialog').getByText('raphael', { exact: true })).toBeVisible()
    // The dialog itself has focus, so no button shows a focus ring before the user does anything.
    await expect(kit.page.getByRole('dialog')).toBeFocused()
    await kit.page.getByRole('button', { name: 'Show me around' }).click()
    const titles = await walk(kit.page)
    expect(titles.slice(0, 3)).toEqual(['Posts', 'Chat', 'Resize the columns'])
    expect(titles).toContain('Conversations')
    expect(titles).not.toContain('Write a welcome message')

    // The dialog opens once. A reload does not bring it back.
    await kit.page.reload()
    await expect(kit.page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(welcomeHeading(kit.page)).toHaveCount(0)

    // Settings opens it again, and closing it leaves Home's address clean.
    await open(kit.page, '/settings')
    await kit.page.getByRole('button', { name: 'Show welcome' }).click()
    await expect(welcomeHeading(kit.page)).toBeVisible()
    await kit.page.getByRole('button', { name: 'Not now' }).click()
    await expect(welcomeHeading(kit.page)).toHaveCount(0)
    await expect(kit.page).toHaveURL(/\/$/)
    await kit.context.close()
  })

  test('Escape ends the tour', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit', false)
    await open(kit.page)
    await kit.page.getByRole('button', { name: 'Show me around' }).click()
    await expect(tourCard(kit.page).getByRole('heading', { name: 'Posts' })).toBeVisible()
    await kit.page.keyboard.press('Escape')
    await expect(tourCard(kit.page)).toHaveCount(0)
    await expect(welcomeHeading(kit.page)).toHaveCount(0)
    await kit.context.close()
  })

  test("the owner's tour ends on the Community page, in the welcome message editor", async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    await open(o.page, '/settings')
    await o.page.getByRole('button', { name: 'Show welcome' }).click()
    await o.page.getByRole('button', { name: 'Show me around' }).click()
    const titles = await walk(o.page)
    expect(titles).toContain('Running Sweet e2e')
    expect(titles).not.toContain('Rules')
    expect(titles.at(-1)).toBe('Write a welcome message')
    await expect(o.page).toHaveURL(/\/community\?edit=welcome$/)
    const editor = o.page.locator('.ProseMirror').first()
    await expect(editor).toBeInViewport()
    const text = `Introduce yourself ${uniq('w')}`
    await editor.fill(text)
    const card = o.page
      .getByRole('heading', { name: 'Welcome message' })
      .locator('xpath=ancestor::*[.//*[contains(@class, "ProseMirror")]][1]')
    await card.getByRole('button', { name: 'Save' }).click()
    await expect(o.page.getByText(text)).toBeVisible()
    await expect(o.page.getByRole('button', { name: 'Edit welcome message' })).toBeVisible()
    await o.context.close()
  })

  test('@phone the tour points at the bar and the Menu tab, and every card fits the screen', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit', false)
    await open(kit.page)
    await expect(welcomeHeading(kit.page)).toBeVisible()
    await kit.page.getByRole('button', { name: 'Show me around' }).click()
    // The first card sits under the Posts icon in the bar.
    const first = tourCard(kit.page)
    await expect(first.getByRole('heading', { name: 'Posts' })).toBeVisible()
    const icon = (await kit.page.locator('[data-tour="view-posts"]').boundingBox())!
    expect((await first.boundingBox())!.y).toBeGreaterThan(icon.y + icon.height)
    const titles = await walk(kit.page)
    expect(titles[0]).toBe('Posts')
    expect(titles).not.toContain('Resize the columns')
    expect(titles).toContain('Conversations')
    await kit.context.close()
  })
})
