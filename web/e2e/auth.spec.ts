import { expect, member, open, owner, test, uniq } from './helpers'

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

  test('an invite link made on the People page lets a stranger join, once', async ({ browser }, testInfo) => {
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
    await page.getByLabel('Password').fill('longenough')
    await page.getByRole('button', { name: 'Join' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name })).toBeVisible()

    // The link is spent.
    const again = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const p2 = await again.newPage()
    await p2.goto(path)
    await expect(p2.getByText(/used or has expired/)).toBeVisible()
    await stranger.close()
    await again.close()
    await o.context.close()
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
