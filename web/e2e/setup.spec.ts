import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FRESH_MAIL_DIR, emailOf, expect, mailLink, prepare, test, uniq } from './helpers'

/**
 * A new instance, end to end (architecture.md, New-instance lifecycle): the
 * setup link in the log makes the owner; the welcome page names the
 * community and hands out an invite link; the name is then everywhere, the
 * link brings people in, and the owner hears of each.
 */
test.describe('a fresh instance', () => {
  test('the setup link, the welcome page, the first invite @fresh', async ({ browser }, testInfo) => {
    test.slow()
    const baseURL = testInfo.project.use.baseURL as string
    const log = readFileSync(join(process.cwd(), '..', 'data', 'e2e-fresh.log'), 'utf8')
    const m = log.match(/SETUP: .*?(http:\/\/\S+\/setup\/\S+)/)
    expect(m, 'the setup link in the log').toBeTruthy()
    const setupPath = new URL(m![1]).pathname

    // Before setup, the sign-in page says so and the setup page is the way in.
    const ctx = await browser.newContext({ baseURL })
    const page = await ctx.newPage()
    await prepare(page)
    await page.goto('/')
    await expect(page.getByText(/has not been set up yet/)).toBeVisible()
    await expect(page).toHaveTitle('Sweet')
    await page.goto(setupPath)
    await page.getByLabel('Username').fill('raphael')
    await page.getByLabel('Email address').fill('raphael@example.test')
    await page.getByLabel('Password').fill('correct horse')
    await page.getByRole('button', { name: 'Set up' }).click()

    // Onboarding: the name, then an invite link.
    await expect(page.getByRole('heading', { name: 'Community settings' })).toBeVisible()
    await page.getByLabel('Community name').fill('Knitting Circle')
    await page.getByLabel('Short community description').fill('Wool and gossip.')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Invite your first people' })).toBeVisible()
    await page.getByRole('button', { name: 'Create invite link' }).click()
    const url = await page.getByLabel('Invite link').inputValue()
    expect(url).toMatch(/\/join\//)
    await page.getByRole('button', { name: 'Go to Knitting Circle' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Knitting Circle')
    await expect(page).toHaveTitle('Knitting Circle')
    // A reload lands on Home, not the welcome page again.
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Community settings' })).toHaveCount(0)

    // The link brings two people in; each is joining Knitting Circle; the owner hears of both.
    const joinPath = new URL(url).pathname
    const names = [uniq('ann'), uniq('bo')]
    for (const name of names) {
      const stranger = await browser.newContext({ baseURL })
      const p = await stranger.newPage()
      await prepare(p)
      await p.goto(joinPath)
      await expect(p.getByText('raphael invited you to Knitting Circle.')).toBeVisible()
      await expect(p.getByText('Wool and gossip.')).toBeVisible()
      await p.getByLabel('Username').fill(name)
      await p.getByLabel('Email address').fill(emailOf(name))
      await p.getByLabel('Password').fill('longenough')
      await p.getByRole('button', { name: 'Join Knitting Circle' }).click()
      await expect(p.getByText('Check your email')).toBeVisible()
      await p.goto(mailLink(emailOf(name), 'verify', FRESH_MAIL_DIR))
      await expect(p.getByRole('navigation', { name: 'Main' })).toContainText('Knitting Circle')
      await stranger.close()
    }
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Notifications/ })
      .click()
    for (const name of names) await expect(page.getByText(`${name} joined the community`)).toBeVisible()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'People' }).click()
    await expect(page.getByText('2 joined through it')).toBeVisible()

    // The Community page, in the nav for the owner: a rename reaches the corner at once.
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Community' }).click()
    await expect(page).toHaveURL(/\/community$/)
    await page.getByLabel('Community name').fill('The Circle')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Saved.')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('The Circle')
    await expect(page).toHaveTitle('The Circle')
    await ctx.close()
  })
})
