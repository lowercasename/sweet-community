import type { Page } from '@playwright/test'
import { anyView, expect, member, open, test, uniq } from './helpers'

/**
 * The line at the bottom of Home's feed: the release, a link to the source
 * code, and who built Sweet. The nav no longer names the release. A room's feed has no such line.
 */
// A footer inside the pane's section has no landmark role, so it is found as an element.
const colophon = (page: Page) => page.locator('footer').filter({ hasText: 'Built with' })

async function checkLine(page: Page) {
  const line = colophon(page)
  await line.scrollIntoViewIfNeeded()
  await expect(line).toBeVisible()
  await expect(line).toContainText('Sweet dev')
  await expect(line.getByRole('link', { name: 'Source code' })).toHaveAttribute(
    'href',
    'https://github.com/lowercasename/sweet-community',
  )
  await expect(line.getByRole('link', { name: 'Raphael' })).toHaveAttribute('href', 'https://raphaelkabo.com')
  await expect(line.getByRole('img', { name: 'love' })).toBeVisible()
  // The heart sits on the text's line.
  const heart = (await line.getByRole('img', { name: 'love' }).boundingBox())!
  const raphael = (await line.getByRole('link', { name: 'Raphael' }).boundingBox())!
  expect(Math.abs(heart.y + heart.height / 2 - (raphael.y + raphael.height / 2))).toBeLessThan(2.5)
  return line
}

test.describe('colophon', () => {
  test("Home's feed ends with the release and the source code link, and a room's feed does not", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await checkLine(kit.page)
    await kit.page.screenshot({ path: 'test-results/colophon-desktop.png' })
    await expect(kit.page.getByRole('navigation', { name: 'Main' })).not.toContainText('Sweet dev')
    const res = await kit.context.request.post('/api/groups', {
      data: { kind: 'group', name: uniq('Wool'), mode: 'both' },
    })
    const room = (await res.json()) as { id: string }
    await open(kit.page, `/r/${room.id}`)
    await expect(kit.page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(colophon(kit.page)).toHaveCount(0)
    await kit.context.close()
  })

  test('@phone the posts view of Home ends with the same line, and the menu does not name the release', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await anyView(kit.page, 'Posts').click()
    const line = await checkLine(kit.page)
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
