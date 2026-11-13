import type { Page } from '@playwright/test'
import { chatEditor, expect, member, open, test, uniq } from './helpers'

/**
 * On a device with a mouse or trackpad, every composer has an Add emoji button. It opens a picker that shows the
 * device's own emoji, so nothing is loaded from another site. Choosing an emoji inserts it at the cursor, closes the
 * picker and puts the cursor back in the composer. Phones have no button, because their keyboards have emoji.
 */
const picker = (page: Page) => page.getByRole('dialog', { name: 'Emoji' })
const composer = (page: Page, kind: 'line' | 'post') =>
  page.locator('form').filter({ has: page.locator(`.editor-${kind}`) })

/** Records every request that goes to a host other than the test server. */
function watchOutside(page: Page) {
  const outside: string[] = []
  page.on('request', (r) => {
    if (!r.url().startsWith('http://127.0.0.1')) outside.push(r.url())
  })
  return outside
}

test.describe('emoji', () => {
  test('the chat composer inserts the chosen emoji at the cursor, and the message is sent with it', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    const outside = watchOutside(kit.page)
    await open(kit.page)
    const words = uniq('Lovely ')
    await chatEditor(kit.page).click()
    await kit.page.keyboard.type(`${words} `)
    const button = composer(kit.page, 'line').getByRole('button', { name: 'Add emoji' })
    await button.click()
    await expect(picker(kit.page)).toBeVisible()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    // The picker opens above the composer, so it does not cover the text being written.
    const field = (await chatEditor(kit.page).boundingBox())!
    const above = (await picker(kit.page).boundingBox())!
    expect(above.y + above.height).toBeLessThanOrEqual(field.y)
    // The search box takes focus once the picker has loaded, so typing searches.
    await expect(picker(kit.page).getByRole('textbox', { name: 'Search emoji' })).toBeFocused()
    await kit.page.keyboard.type('red heart')
    await picker(kit.page).locator('[data-epr-part="emoji"][aria-label^="red heart" i]').first().click()
    await expect(picker(kit.page)).toHaveCount(0)
    await expect(chatEditor(kit.page)).toHaveText(`${words} ❤️`)
    // The cursor is back in the composer after the emoji, so typing continues the message and Enter sends it. The
    // editor takes focus on the next animation frame.
    await expect(chatEditor(kit.page)).toBeFocused()
    await kit.page.keyboard.type(' thanks')
    await kit.page.keyboard.press('Enter')
    await expect(
      kit.page
        .getByRole('article')
        .filter({ hasText: `${words} ❤️ thanks` })
        .first(),
    ).toBeVisible()
    expect(outside).toEqual([])
    await kit.context.close()
  })

  test("the post composer's picker stays on screen, and Escape closes it and returns focus to the button", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const button = composer(kit.page, 'post').getByRole('button', { name: 'Add emoji' })
    await button.click()
    await expect(picker(kit.page)).toBeVisible()
    const box = (await picker(kit.page).boundingBox())!
    const view = kit.page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(view.width)
    expect(box.y + box.height).toBeLessThanOrEqual(view.height)
    // There is no room above the post composer, so the picker opens below the whole composer, not over its text.
    const form = (await composer(kit.page, 'post').boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(form.y + form.height)
    await kit.page.screenshot({ path: 'test-results/emoji-post-light.png' })
    await kit.page.keyboard.press('Escape')
    await expect(picker(kit.page)).toHaveCount(0)
    await expect(button).toBeFocused()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await kit.context.close()
  })

  test("in dark mode the picker uses Sweet's dark card colour", async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await kit.page.addInitScript(() => localStorage.setItem('sweet.theme', 'dark'))
    await open(kit.page)
    await composer(kit.page, 'line').getByRole('button', { name: 'Add emoji' }).click()
    const root = picker(kit.page).locator('[data-epr-part="root"]')
    await expect(root).toBeVisible()
    const card = await kit.page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--color-card)'
      document.body.append(probe)
      const colour = getComputedStyle(probe).backgroundColor
      probe.remove()
      return colour
    })
    await expect(root).toHaveCSS('background-color', card)
    await kit.page.screenshot({ path: 'test-results/emoji-chat-dark.png' })
    await kit.context.close()
  })
})
