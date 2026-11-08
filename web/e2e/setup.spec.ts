import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FRESH_MAIL_DIR, emailOf, expect, mailCode, prepare, test, uniq } from './helpers'

/**
 * A new instance, tested end to end (architecture.md, New-instance lifecycle).
 * The setup link in the log creates the owner. The welcome page sets the
 * community's name and creates an invite link. The name is then shown
 * everywhere, new users register through the link, and the owner gets a
 * notification for each of them.
 */
test.describe('a fresh instance', () => {
  test('the setup link, the welcome page and the first invite @fresh', async ({ browser }, testInfo) => {
    test.slow()
    const baseURL = testInfo.project.use.baseURL as string
    const log = readFileSync(join(process.cwd(), '..', 'data', 'e2e-fresh.log'), 'utf8')
    const m = log.match(/SETUP: .*?(http:\/\/\S+\/setup\/\S+)/)
    expect(m, 'the setup link in the log').toBeTruthy()
    const setupPath = new URL(m![1]).pathname

    // Before setup, the sign-in page says that the instance is not set up, and the setup page is how the owner gets in.
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

    // Onboarding sets the community name and then creates an invite link.
    await expect(page.getByRole('heading', { name: 'Community settings' })).toBeVisible()
    await page.getByLabel('Community name').fill('Knitting Circle')
    await page.getByLabel('Short community description').fill('Wool and gossip.')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Invite people' })).toBeVisible()
    await page.getByRole('button', { name: 'Create invite link' }).click()
    const url = await page.getByLabel('Invite link').inputValue()
    expect(url).toMatch(/\/join\//)
    await page.getByRole('button', { name: 'Go to Knitting Circle' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Knitting Circle')
    await expect(page).toHaveTitle('Knitting Circle')
    // A reload opens Home, not the welcome page again.
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Community settings' })).toHaveCount(0)
    // The new community has no topics. Home offers the owner Add topics, which opens the Topics card.
    await page.getByRole('link', { name: 'Add topics' }).click()
    await expect(page).toHaveURL(/\/community$/)
    await expect(page.getByRole('heading', { name: 'Topics' })).toBeVisible()
    await page.goto('/')

    // Two users register through the link. The join page names Knitting Circle for each of them. The owner gets a
    // notification for both.
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
      await p.getByRole('button', { name: 'Join Knitting Circle' }).click()
      await expect(p.getByText('Check your email')).toBeVisible()
      await p.getByLabel('Code').fill(mailCode(emailOf(name), FRESH_MAIL_DIR))
      await p.getByRole('button', { name: 'Finish joining' }).click()
      await expect(p.getByRole('navigation', { name: 'Main' })).toContainText('Knitting Circle')
      await stranger.close()
    }
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Notifications/ })
      .click()
    for (const name of names)
      await expect(page.getByRole('button', { name: new RegExp(`^${name} joined the community`) })).toBeVisible()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'People' }).click()
    await expect(page.getByText('2 joined with this link')).toBeVisible()

    // The owner has a Community button in the nav. Renaming the community updates the name at the top of the nav
    // immediately.
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
