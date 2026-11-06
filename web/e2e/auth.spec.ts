import { emailOf, expect, mailLink, member, open, owner, test, uniq } from './helpers'

test.describe('signing in and joining', () => {
  test('a wrong password is refused, the right one lands on Home', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Username').fill('raphael')
    await page.getByLabel('Password').fill('wrong horse')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('wrong username or password')).toBeVisible()
    await page.getByLabel('Password').fill('correct horse')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test('an invite link made on the People page lets a stranger join, once; the link in their mail signs them in', async ({
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
    await expect(page.getByText('raphael invited you')).toBeVisible()
    const name = uniq('jo')
    await page.getByLabel('Username').fill(name)
    await page.getByLabel('Email address').fill(emailOf(name))
    await page.getByLabel('Password').fill('longenough')
    await page.getByRole('button', { name: 'Join' }).click()
    // Not in yet: the link is in the mail.
    await expect(page.getByText('Check your email')).toBeVisible()
    await expect(page.getByText(emailOf(name))).toBeVisible()
    await page.goto(mailLink(emailOf(name), 'verify'))
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name })).toBeVisible()
    // The verification link is spent too.
    const twice = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const p3 = await twice.newPage()
    await p3.goto(mailLink(emailOf(name), 'verify'))
    await expect(p3.getByText('This link does not work')).toBeVisible()
    await twice.close()

    // The link is spent.
    const again = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const p2 = await again.newPage()
    await p2.goto(path)
    await expect(p2.getByText(/used or has expired/)).toBeVisible()
    await stranger.close()
    await again.close()
    await o.context.close()
  })

  test('an unverified account is sent back to its mail at sign-in, and can send the link elsewhere', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const invite = await o.context.request.post('/api/invites')
    const code = ((await invite.json()) as { code: string }).code
    await o.context.close()
    const name = uniq('un')
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const res = await ctx.request.post('/api/register', {
      data: { code, username: name, password: 'longenough', email: `typo-${emailOf(name)}` },
    })
    expect(res.status()).toBe(202)
    const page = await ctx.newPage()
    await page.goto('/')
    await page.getByLabel('Username or email').fill(name)
    await page.getByLabel('Password').fill('longenough')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Check your email')).toBeVisible()
    await expect(page.getByText(`typo-${emailOf(name)}`)).toBeVisible()
    await page.getByRole('button', { name: 'Use a different address' }).click()
    await page.getByLabel('Email address').fill(emailOf(name))
    await page.getByRole('button', { name: 'Send the link there' }).click()
    await expect(page.getByText('Sent again')).toBeVisible()
    await page.goto(mailLink(emailOf(name), 'verify'))
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await ctx.close()
  })

  test('the email address signs in too', async ({ browser }, testInfo) => {
    const m = await member(browser, testInfo)
    await m.context.close()
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.getByLabel('Username or email').fill(emailOf(m.username).toUpperCase())
    await page.getByLabel('Password').fill('longenough')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await ctx.close()
  })

  test('a forgotten password is reset by a link, which ends the other sessions @phone', async ({
    browser,
  }, testInfo) => {
    const m = await member(browser, testInfo)
    await open(m.page)
    const ctx = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.getByRole('link', { name: 'Forgot your password?' }).click()
    await expect(page).toHaveURL(/\/reset$/)
    await page.getByLabel('Email address').fill(emailOf(m.username))
    await page.getByRole('button', { name: 'Send a link' }).click()
    await expect(page.getByText(/a link to choose a new password is on its way/)).toBeVisible()
    await page.goto(mailLink(emailOf(m.username), 'reset'))
    await page.getByLabel('New password').fill('anotherlongone')
    await page.getByRole('button', { name: 'Set the password' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    // The earlier session is over.
    await m.page.reload()
    await expect(m.page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    // The link is spent (seen from a signed-out browser: signed in, a reset link is just Home).
    await m.page.goto(mailLink(emailOf(m.username), 'reset'))
    await m.page.getByLabel('New password').fill('yetanotherone')
    await m.page.getByRole('button', { name: 'Set the password' }).click()
    await expect(m.page.getByText(/used, or has expired/)).toBeVisible()
    await ctx.close()
    await m.context.close()
  })

  test('Settings: a new address takes effect when its link is opened; the password is changed with the old one', async ({
    browser,
  }, testInfo) => {
    // That the other sessions end is TestChangePassword's, on the server: a second sign-in here would spend the suite's sign-in allowance.
    const m = await member(browser, testInfo)
    await open(m.page, '/settings')
    await expect(m.page.getByText(emailOf(m.username), { exact: true })).toBeVisible()
    const next = `new-${emailOf(m.username)}`
    await m.page.getByLabel('New email address').fill(next)
    await m.page.getByLabel('Your password').fill('longenough')
    await m.page.getByRole('button', { name: 'Send a link there' }).click()
    await expect(m.page.getByText(`A link is on its way to ${next}`)).toBeVisible()
    await expect(m.page.getByText(emailOf(m.username), { exact: true })).toBeVisible()
    await m.page.goto(mailLink(next, 'verify'))
    await expect(m.page).toHaveURL(/\/settings$/)
    await expect(m.page.getByText(next, { exact: true })).toBeVisible()
    await expect(m.page.getByText(/A link is on its way/)).toHaveCount(0)

    await m.page.getByLabel('Current password').fill('longenough')
    await m.page.getByLabel('New password').fill('anotherlongone')
    await m.page.getByRole('button', { name: 'Change password' }).click()
    await expect(m.page.getByText(/Password changed/)).toBeVisible()
    await m.context.close()
  })

  test('sign out here returns to the sign-in page; a reload stays there', async ({ browser }, testInfo) => {
    const m = await member(browser, testInfo)
    await open(m.page, '/settings')
    await m.page.getByRole('button', { name: 'Sign out here' }).click()
    await expect(m.page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await m.page.reload()
    await expect(m.page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await m.context.close()
  })
})
