import type { Page } from '@playwright/test'
import { anyView, expect, member, open, ROOT, test, uniq, writePost } from './helpers'

/**
 * The line at the bottom of Home's feed: the release, a link to Sweet's
 * website, and a link to the source code. When the feed is shorter than its
 * pane, the line sits at the bottom of the pane. When the feed is longer, it
 * follows the last post.
 */
// A footer inside the pane's section has no landmark role, so it is found as an element.
const colophon = (page: Page) => page.locator('footer').filter({ hasText: 'Source code' })
const area = (page: Page) => page.locator('[data-scroll]').filter({ has: colophon(page) })

async function checkLine(page: Page) {
  const line = colophon(page)
  await line.scrollIntoViewIfNeeded()
  await expect(line).toBeVisible()
  await expect(line).toHaveText('Sweet dev · About · Source code')
  await expect(line.getByRole('link', { name: 'About' })).toHaveAttribute('href', 'https://sweet.community')
  await expect(line.getByRole('link', { name: 'Source code' })).toHaveAttribute(
    'href',
    'https://github.com/lowercasename/sweet-community',
  )
  return line
}

/** Checks that the feed does not scroll and the line is at the bottom of the pane, inside its 16px padding. */
async function atPaneBottom(page: Page) {
  const scroll = await area(page).evaluate((el) => el.scrollHeight - el.clientHeight)
  expect(scroll).toBeLessThanOrEqual(0)
  const pane = (await area(page).boundingBox())!
  const line = (await colophon(page).boundingBox())!
  expect(Math.abs(pane.y + pane.height - 16 - (line.y + line.height))).toBeLessThan(2)
}

/** Supplies an empty first page to test the footer's short-feed layout. Writes still use the real server. */
async function emptyHome(page: Page) {
  await page.route(`**/api/groups/${ROOT}/posts?*`, (route) => route.fulfill({ json: { posts: [], next_before: null } }))
}

test.describe('colophon', () => {
  test('the line sits at the bottom of a short feed, and follows the last post of a long one', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await emptyHome(kit.page)
    await open(kit.page)
    await checkLine(kit.page)
    await atPaneBottom(kit.page)
    await kit.page.screenshot({ path: 'test-results/colophon-desktop-short.png' })

    // Three posts in a short window make the feed longer than its pane.
    await kit.page.setViewportSize({ width: 1280, height: 480 })
    for (let i = 0; i < 3; i++) await writePost(kit.page, uniq('Long feed '))
    await area(kit.page).evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const last = (await area(kit.page).getByRole('article').last().boundingBox())!
    const line = (await colophon(kit.page).boundingBox())!
    expect(line.y).toBeGreaterThanOrEqual(last.y + last.height)
    await kit.page.screenshot({ path: 'test-results/colophon-desktop-long.png' })
    await kit.context.close()
  })

  test('@phone the posts view of Home ends with the same line at the bottom of a short feed, and the menu does not name the release', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await emptyHome(kit.page)
    await open(kit.page)
    await anyView(kit.page, 'Posts').click()
    const line = await checkLine(kit.page)
    await atPaneBottom(kit.page)
    const box = (await line.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(kit.page.viewportSize()!.width)
    await kit.page.screenshot({ path: 'test-results/colophon-phone.png' })
    await open(kit.page, '/menu')
    await expect(kit.page.getByRole('button', { name: /Sign out/ })).toBeVisible()
    await expect(kit.page.getByText(/^Sweet dev$/)).toHaveCount(0)
    await kit.context.close()
  })
})
