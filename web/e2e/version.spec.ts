import { expect, open, owner, test } from './helpers'

/**
 * An upgrade swaps the binary, frontend and all. The stream's first event
 * names the version; a tab that heard another one reloads (architecture.md,
 * Updates: Clients). A second binary cannot be started mid-test, so the
 * first connection is answered by a stand-in stream naming an older
 * version, and the real server's answer on reconnection is the upgrade.
 */
test('a tab that loaded another version reloads when the stream says so', async ({ browser }, info) => {
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
