import type { Page } from '@playwright/test'
import { chatEditor, expect, member, open, postEditor, test } from './helpers'

/**
 * When the device goes offline, the bar shows an Offline badge after the title and the editors cannot send. Nothing
 * is added above the editors, so they do not move. Connecting and reconnecting show nothing.
 */

const badge = (page: Page) => page.getByRole('status').filter({ hasText: /^Offline$/ })
const notice = (page: Page) => page.getByText(/Offline:|Connecting…|Reconnecting…/)

/** Checks that the badge is in the bar, on the title's line and after it, and inside the viewport. */
async function badgeInBar(page: Page) {
  await expect(badge(page)).toBeVisible()
  const title = await page.getByRole('heading', { name: 'Home', level: 2 }).boundingBox()
  const box = await badge(page).boundingBox()
  expect(title && box).toBeTruthy()
  expect(Math.abs(box!.y + box!.height / 2 - (title!.y + title!.height / 2))).toBeLessThan(3)
  expect(box!.x).toBeGreaterThan(title!.x + title!.width)
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
}

test.describe('offline', () => {
  test('going offline shows an Offline badge in the bar, disables sending, and moves nothing', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    await postEditor(kit.page).click()
    await kit.page.keyboard.type('Draft while offline')
    const post = kit.page.getByRole('button', { name: 'Post', exact: true })
    await expect(post).toBeEnabled()
    await expect(notice(kit.page)).toHaveCount(0)
    const postAt = await postEditor(kit.page).boundingBox()
    const chatAt = await chatEditor(kit.page).boundingBox()

    await kit.context.setOffline(true)
    await badgeInBar(kit.page)
    await expect(post).toBeDisabled()
    await expect(notice(kit.page)).toHaveCount(0)
    expect(await postEditor(kit.page).boundingBox()).toEqual(postAt)
    expect(await chatEditor(kit.page).boundingBox()).toEqual(chatAt)

    // Back online, the badge goes and the draft can be posted. Reconnecting shows nothing.
    await kit.context.setOffline(false)
    await expect(badge(kit.page)).toHaveCount(0)
    await expect(notice(kit.page)).toHaveCount(0)
    await expect(post).toBeEnabled()
    await expect(kit.page.getByText('Draft while offline')).toBeVisible()
    await kit.context.close()
  })

  test('on a phone the Offline badge fits in the bar beside the title and the view buttons @phone', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    await kit.context.setOffline(true)
    await badgeInBar(kit.page)
    await expect(kit.page.getByRole('group', { name: 'View' })).toBeVisible()
    const width = await kit.page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(kit.page.viewportSize()!.width)
    await kit.context.close()
  })
})
