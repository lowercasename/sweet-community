import { expect, open, owner, test } from './helpers'

/**
 * An upgrade replaces the binary, including the frontend. The first event on
 * the stream carries the server's version, and a tab that received a different
 * version reloads (architecture.md, Updates: Clients). A second binary cannot
 * be started during the test, so the first connection is answered by a fake
 * stream that sends an older version. The real server's response on
 * reconnection then acts as the upgrade.
 */
test('a tab that loaded a different version reloads when the stream reports a different version', async ({
  browser,
}, info) => {
  const o = await owner(browser, info)
  const page = o.page
  const stream = '**/api/events*'
  await page.route(stream, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: 'event: version\ndata: "older"\n\n',
    }),
  )
  await open(page, '/')
  await page.evaluate(() => {
    ;(window as unknown as { marker?: boolean }).marker = true
  })

  await page.unroute(stream)
  const reloaded = page.waitForEvent('load', { timeout: 10_000 })
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await reloaded
  expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBeUndefined()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await o.context.close()
})
