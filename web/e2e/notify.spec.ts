import { expect, member, open, test } from './helpers'

/**
 * What reaches a person away from the app (architecture.md, Notifications):
 * the weekly digest is on until they turn it off on Settings, and the
 * device toggle is offered where the browser can show notifications.
 */
test.describe('notification settings', () => {
  test('the digest is on by default, turns off, and stays off across a reload', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    // Headless Chromium denies notifications unless told otherwise; a person's browser asks them.
    await kit.context.grantPermissions(['notifications'])
    await open(kit.page, '/settings')
    const on = kit.page.getByRole('button', { name: 'Weekly digest on' })
    await expect(on).toHaveAttribute('aria-pressed', 'true')
    await kit.page.getByText(/A notification on this device/).scrollIntoViewIfNeeded()
    await kit.page.screenshot({ path: `test-results/notify-${testInfo.project.name}-settings.png` })
    await on.hover()
    await expect(kit.page.getByRole('button', { name: 'Turn off' })).toBeVisible()
    await kit.page.getByRole('button', { name: 'Turn off' }).click()
    await expect(kit.page.getByRole('button', { name: 'Send me a weekly digest' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await kit.page.reload()
    await expect(kit.page.getByRole('button', { name: 'Send me a weekly digest' })).toBeVisible()
    await kit.page.getByRole('button', { name: 'Send me a weekly digest' }).click()
    await expect(kit.page.getByRole('button', { name: 'Weekly digest on' })).toBeVisible()
    // The device section says one true thing about this browser. Headless Chromium reports notifications as blocked
    // whatever the test grants, and subscribing would need a push service, so it stops at the words.
    const device = kit.page.getByText(/Notify this device|blocking notifications from Sweet|cannot show notifications/)
    await expect(device.first()).toBeVisible()
    // The app is installable: a manifest and the worker that shows pushes.
    const manifest = await kit.context.request.get('/manifest.json')
    expect(manifest.ok()).toBeTruthy()
    expect(((await manifest.json()) as { name: string }).name).toBe('Sweet')
    const worker = await kit.context.request.get('/sw.js')
    expect(worker.ok()).toBeTruthy()
    expect(worker.headers()['content-type']).toContain('javascript')
    await kit.context.close()
  })

  test('@phone the notification settings fit the screen', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await kit.context.grantPermissions(['notifications'])
    await open(kit.page, '/settings')
    await expect(kit.page.getByRole('button', { name: 'Weekly digest on' })).toBeVisible()
    await kit.page.getByText(/A notification on this device/).scrollIntoViewIfNeeded()
    const overflow = await kit.page.evaluate(
      () =>
        [...document.querySelectorAll('main *')].filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)
        }).length,
    )
    expect(overflow).toBe(0)
    await kit.page.screenshot({ path: `test-results/notify-phone-settings.png` })
    await kit.context.close()
  })
})
