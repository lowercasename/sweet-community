import { expect, member, open, test } from './helpers'

/**
 * Notifications that reach a user outside the app (architecture.md, Notifications).
 * The weekly digest is on until the user turns it off on Settings. The device
 * toggle is offered when the browser can show notifications.
 */
test.describe('notification settings', () => {
  test('the digest is on by default, can be turned off, and stays off after a reload', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    // Headless Chromium denies notifications unless the permission is granted. A user's browser asks the user.
    await kit.context.grantPermissions(['notifications'])
    await open(kit.page, '/settings')
    const on = kit.page.getByRole('button', { name: 'Weekly digest on' })
    await expect(on).toHaveAttribute('aria-pressed', 'true')
    await kit.page.getByText(/on this device when someone/).scrollIntoViewIfNeeded()
    await kit.page.screenshot({ path: `test-results/notify-${testInfo.project.name}-settings.png` })
    await on.hover()
    await expect(kit.page.getByRole('button', { name: 'Turn weekly digest off' })).toBeVisible()
    await kit.page.getByRole('button', { name: 'Turn weekly digest off' }).click()
    await expect(kit.page.getByRole('button', { name: 'Send me a weekly digest' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await kit.page.reload()
    await expect(kit.page.getByRole('button', { name: 'Send me a weekly digest' })).toBeVisible()
    await kit.page.getByRole('button', { name: 'Send me a weekly digest' }).click()
    // Move the pointer away so the button shows its state text instead of its hover text.
    await kit.page.mouse.move(0, 0)
    await expect(kit.page.getByRole('button', { name: 'Weekly digest on' })).toBeVisible()
    // The device section shows one of its states. Headless Chromium reports notifications as denied
    // regardless of granted permissions, and subscribing would need a push service, so the test only
    // checks that one of the three texts is shown.
    const device = kit.page.getByText(/Notify this device|blocking notifications from Sweet|cannot show notifications/)
    await expect(device.first()).toBeVisible()
    // The app is installable. It serves a manifest and the service worker that shows push notifications.
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
    await kit.page.getByText(/on this device when someone/).scrollIntoViewIfNeeded()
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
