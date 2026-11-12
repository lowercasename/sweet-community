import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { FRESH_MAIL_DIR, emailOf, expect, mailCode, prepare, test, uniq } from './helpers'

/**
 * A new instance, tested end to end.
 * The setup link in the log creates the owner. The welcome page sets the
 * community's name and creates an invite link. The name is then shown
 * everywhere, new users register through the link, and the owner gets a
 * notification for each of them.
 */
/** Screenshots a step of onboarding at desktop width and at phone width. Only this test passes through these pages. */
async function shoot(page: Page, name: string) {
  const size = page.viewportSize()!
  await page.screenshot({ path: `test-results/setup-${name}.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: `test-results/setup-${name}-phone.png` })
  await page.setViewportSize(size)
}

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
    // The owner creates their account with a username and an email address. There is no password. Then they set up the community.
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
    await expect(page.getByLabel('Password')).toHaveCount(0)
    await shoot(page, 'account')
    await page.getByLabel('Username').fill('raphael')
    await page.getByLabel('Email address').fill('raphael@example.test')
    await page.getByRole('button', { name: 'Create account' }).click()

    // Onboarding sets the community name and then creates an invite link.
    await expect(page.getByRole('heading', { name: 'Set up your community' })).toBeVisible()
    await shoot(page, 'community')
    await page.getByLabel('Community name').fill('Knitting Circle')
    await page.getByLabel('Short community description').fill('Wool and gossip.')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Invite people' })).toBeVisible()
    await shoot(page, 'invite')
    await page.getByRole('button', { name: 'Create invite link' }).click()
    const url = await page.getByLabel('Invite link').inputValue()
    expect(url).toMatch(/\/join\//)
    await shoot(page, 'invite-link')
    // The nav starts expanded for someone who has never collapsed it. The test setup stores
    // expanded for every other test, so this browser forgets that first.
    await page.evaluate(() => localStorage.removeItem('sweet.nav'))
    await page.getByRole('button', { name: 'Go to Knitting Circle' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    // Home opens with the welcome dialog, which offers the tour.
    await expect(page.getByRole('heading', { name: 'Welcome to Knitting Circle' })).toBeVisible()
    await shoot(page, 'welcome')
    await page.getByRole('button', { name: 'Not now' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Collapse' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toContainText('Knitting Circle')
    await expect(page).toHaveTitle('Knitting Circle')
    // A reload opens Home, not the welcome page again.
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Set up your community' })).toHaveCount(0)
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
      await expect(p.getByRole('heading', { name: 'Create your account' })).toBeVisible()
      await p.screenshot({ path: 'test-results/setup-join.png' })
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
