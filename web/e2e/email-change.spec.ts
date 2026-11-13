import { emailOf, expect, mailCode, mailLink, member, open, test } from './helpers'

test('confirming an email change keeps the session and invalidates old sign-ins', async ({ browser }, info) => {
  const m = await member(browser, info)
  const oldAddress = emailOf(m.username)
  const ctx = await browser.newContext({
    baseURL: info.project.use.baseURL as string,
    viewport: info.project.use.viewport ?? undefined,
    isMobile: info.project.use.isMobile,
    hasTouch: info.project.use.hasTouch,
  })
  try {
    expect((await ctx.request.post('/api/signin/email', { data: { login: oldAddress } })).status()).toBe(202)
    const oldLink = mailLink(oldAddress, 'signin')
    const oldCode = mailCode(oldAddress)
    // Confirm both changes in Settings. Returning to the old address must not restore old credentials.
    for (const address of [`new-${oldAddress}`, oldAddress]) {
      await open(m.page, '/settings')
      await m.page.getByLabel('New email address').fill(address)
      await m.page.getByRole('button', { name: 'Change email address' }).click()
      await expect(m.page.getByText(`A link has been sent to ${address}`)).toBeVisible()
      await m.page.goto(mailLink(address, 'verify'))
      await m.page.getByRole('button', { name: 'Confirm address' }).click()
      await expect(m.page.getByText(`Your email address is now ${address}.`)).toBeVisible()
      await m.page.getByRole('link', { name: 'Back to Settings' }).click()
      await expect(m.page.getByText(address, { exact: true })).toBeVisible()
    }
    const page = await ctx.newPage()
    await page.goto(oldLink)
    await page.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(page.getByText('This link has been used or has expired')).toBeVisible()
    expect((await ctx.request.post('/api/signin/code', { data: { code: oldCode } })).status()).toBe(400)
    expect((await ctx.request.get('/api/me')).status()).toBe(401)
  } finally {
    await ctx.close()
    await m.context.close()
  }
})
