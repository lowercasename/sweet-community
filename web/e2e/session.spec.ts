import { expect, member, open, sendMessage, test, uniq } from './helpers'

/**
 * An open page whose session ends elsewhere, such as by "Sign out everywhere" on another device, shows the sign-in
 * page without being touched. The server ends the page's event stream instead of sending it anything more.
 */
test.describe('session', () => {
  test('a page whose session ends elsewhere shows sign-in and receives nothing more @dev', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)
    // Every session of kit's ends. The page itself does nothing.
    const out = await kit.context.request.post('/api/logout-all')
    expect(out.status()).toBe(204)
    // The next event that would reach kit's page ends its stream instead.
    const text = uniq('After you left ')
    await sendMessage(mo.page, text)
    await expect(kit.page.getByLabel('Username or email address')).toBeVisible()
    await expect(kit.page.getByText(text)).toHaveCount(0)
    await expect(kit.page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })
})
