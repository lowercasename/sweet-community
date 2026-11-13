import { emailOf, expect, mailCode, mailLink, member, open, owner, test, uniq } from './helpers'

/**
 * Signing in and joining. A password is optional. The usual way in is a sign-in email
 * with a link and a six-digit code. The code works in the browser that asked for it. The link opens a page whose
 * Finish signing in button uses it. The server allows five sign-in emails at once from one address, so these tests
 * ask for few.
 */
test.describe('signing in and joining', () => {
  test('a password is the other way in: a wrong one is refused, and the right one opens Home @dev', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByLabel('Password')).toHaveCount(0)
    await page.getByRole('button', { name: 'Use a password instead' }).click()
    await page.getByLabel('Username or email address').fill('raphael')
    await page.getByLabel('Password').fill('wrong horse')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Wrong username or password')).toBeVisible()
    await page.getByLabel('Password').fill('correct horse')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('an invite link created on the People page lets a new user join without a password, and the code in their email finishes joining', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    await open(o.page, '/people')
    await o.page.getByRole('button', { name: 'Create invite link' }).click()
    const url = await o.page.getByRole('textbox').first().inputValue()
    expect(url).toMatch(/\/join\//)
    const path = new URL(url).pathname

    const stranger = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const page = await stranger.newPage()
    await page.goto(path)
    await expect(page.getByText('raphael invited you to Sweet e2e.')).toBeVisible()
    await expect(page.getByLabel('Password')).toHaveCount(0)
    const name = uniq('jo')
    await page.getByLabel('Username').fill(name)
    await page.getByLabel('Email address').fill(emailOf(name))
    await page.getByRole('button', { name: 'Join' }).click()
    // The user is not signed in yet. The email holds a link and a code.
    await expect(page.getByText('Check your email')).toBeVisible()
    await expect(page.getByText(emailOf(name))).toBeVisible()
    await page.getByLabel('Code').fill(mailCode(emailOf(name)))
    await page.getByRole('button', { name: 'Finish joining' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name })).toBeVisible()
    // The code used the token, so the link in the same email no longer works.
    const twice = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const p3 = await twice.newPage()
    await p3.goto(mailLink(emailOf(name), 'signin'))
    await p3.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(p3.getByText('This link has been used or has expired')).toBeVisible()
    await twice.close()

    // The invite link still works for the next user during the week it is valid.
    // The owner gets a notification for each user who joins.
    const again = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const p2 = await again.newPage()
    await p2.goto(path)
    await expect(p2.getByText('raphael invited you to Sweet e2e.')).toBeVisible()
    await open(o.page, '/notifications')
    await expect(o.page.getByRole('button', { name: new RegExp(`^${name} joined the community`) })).toBeVisible()
    // Revoke the invite by its code, because the People page lists every open invite link, including the
    // ones the helpers created. A revoked invite link works for nobody.
    const revoked = await o.context.request.delete(`/api/invites/${path.split('/').pop()}`)
    expect(revoked.ok()).toBeTruthy()
    await p2.reload()
    await expect(p2.getByText(/expired or been revoked/)).toBeVisible()
    await stranger.close()
    await again.close()
    await o.context.close()
  })

  for (const suffix of ['', ' @phone'])
    test(`only the registering browser can correct an address${suffix}`, async ({ browser }, testInfo) => {
      const o = await owner(browser, testInfo)
      const invite = await o.context.request.post('/api/invites')
      const code = ((await invite.json()) as { code: string }).code
      await o.context.close()
      const name = uniq('un')
      const ctx = await browser.newContext({
        baseURL: testInfo.project.use.baseURL as string,
        viewport: testInfo.project.use.viewport,
        isMobile: testInfo.project.use.isMobile,
        hasTouch: testInfo.project.use.hasTouch,
      })
      const page = await ctx.newPage()
      await page.goto(`/join/${code}`)
      await page.getByLabel('Username').fill(name)
      await page.getByLabel('Email address').fill(`typo-${emailOf(name)}`)
      await page.getByRole('button', { name: 'Join' }).click()
      await expect(page.getByText(`typo-${emailOf(name)}`)).toBeVisible()
      const stranger = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
      try {
        expect((await stranger.request.post('/api/signin/email', { data: { login: name } })).status()).toBe(202)
        expect(
          (
            await stranger.request.post('/api/signin/address', {
              data: { email: `stranger-${emailOf(name)}` },
            })
          ).status(),
        ).toBe(403)
      } finally {
        await stranger.close()
      }
      await page.getByRole('button', { name: 'Use a different address' }).click()
      await page.getByLabel('Email address').fill(emailOf(name))
      await page.getByRole('button', { name: 'Send to this address' }).click()
      await expect(page.getByText(emailOf(name), { exact: true })).toBeVisible()
      await page.getByLabel('Code').fill(mailCode(emailOf(name)))
      await page.getByRole('button', { name: 'Finish joining' }).click()
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
      await ctx.close()
    })

  test('a user signs in with a sign-in email asked for by their email address, typing the code @release', async ({
    browser,
  }, testInfo) => {
    const m = await member(browser, testInfo)
    await m.context.close()
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.getByLabel('Username or email address').fill(emailOf(m.username).toUpperCase())
    await page.getByRole('button', { name: 'Send a sign-in email' }).click()
    await expect(page.getByText('Check your email')).toBeVisible()
    await page.getByLabel('Code').fill(mailCode(emailOf(m.username)))
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await ctx.close()
  })

  test('the link in a sign-in email opens a page whose button signs in, in another browser @phone @release', async ({
    browser,
  }, testInfo) => {
    // The email sent on joining is a sign-in email. Asking for another would spend the server's allowance of five at
    // once, which the built and dev projects share.
    const o = await owner(browser, testInfo)
    const invite = await o.context.request.post('/api/invites')
    const code = ((await invite.json()) as { code: string }).code
    await o.context.close()
    const name = uniq('ph')
    const joined = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    expect(
      (await joined.request.post('/api/register', { data: { code, username: name, email: emailOf(name) } })).status(),
    ).toBe(202)
    await joined.close()
    // A phone opens the link. Opening it uses nothing. The button does.
    const ctx = await browser.newContext({
      baseURL: testInfo.project.use.baseURL as string,
      viewport: testInfo.project.use.viewport ?? undefined,
      isMobile: testInfo.project.use.isMobile,
      hasTouch: testInfo.project.use.hasTouch,
    })
    const page = await ctx.newPage()
    await page.goto(mailLink(emailOf(name), 'signin'))
    await expect(page.getByRole('button', { name: 'Finish signing in' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Finish signing in' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await ctx.close()
  })

  test('on Settings, a new email address takes effect when its link is confirmed, and a password is set and removed without the old one', async ({
    browser,
  }, testInfo) => {
    const m = await member(browser, testInfo)
    await open(m.page, '/settings')
    await expect(m.page.getByText(emailOf(m.username), { exact: true })).toBeVisible()
    const next = `new-${emailOf(m.username)}`
    await m.page.getByLabel('New email address').fill(next)
    await m.page.getByRole('button', { name: 'Change email address' }).click()
    await expect(m.page.getByText(`A link has been sent to ${next}`)).toBeVisible()
    await expect(m.page.getByText(emailOf(m.username), { exact: true })).toBeVisible()
    await m.page.goto(mailLink(next, 'verify'))
    await m.page.getByRole('button', { name: 'Confirm address' }).click()
    await expect(m.page.getByText(`Your email address is now ${next}.`)).toBeVisible()
    await m.page.getByRole('link', { name: 'Back to Settings' }).click()
    await expect(m.page.getByText(next, { exact: true })).toBeVisible()
    await expect(m.page.getByText(/A link has been sent/)).toHaveCount(0)

    // The account has no password. Setting one asks for nothing else.
    await expect(m.page.getByText(/You sign in by email/)).toBeVisible()
    await m.page.getByLabel('Password', { exact: true }).fill('anotherlongone')
    await m.page.getByRole('button', { name: 'Set password' }).click()
    await expect(m.page.getByText(/Password set/)).toBeVisible()
    await expect(m.page.getByText('You can sign in with your password or by email.')).toBeVisible()
    await m.page.getByRole('button', { name: 'Remove password' }).click()
    await m.page.getByRole('dialog').getByRole('button', { name: 'Remove password' }).click()
    await expect(m.page.getByText(/Password removed/)).toBeVisible()
    await expect(m.page.getByRole('button', { name: 'Set password' })).toBeVisible()
    await m.context.close()
  })

  test('Sign out returns to the sign-in page, and a reload stays on the sign-in page @dev', async ({
    browser,
  }, testInfo) => {
    const m = await member(browser, testInfo)
    await open(m.page, '/settings')
    await m.page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(m.page.getByRole('button', { name: 'Send a sign-in email' })).toBeVisible()
    await m.page.reload()
    await expect(m.page.getByRole('button', { name: 'Send a sign-in email' })).toBeVisible()
    await m.context.close()
  })
})
