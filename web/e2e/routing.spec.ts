import { expect, member, open, test } from './helpers'

test.describe('routing', () => {
  test('every page has a URL, a reload keeps the current page, Back returns to the previous page, and unknown paths go to Home', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('button', { name: 'People' }).click()
    await expect(kit.page).toHaveURL(/\/people$/)
    await expect(kit.page.getByRole('heading', { name: 'People' })).toBeVisible()
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: 'People' })).toBeVisible()
    await nav.getByRole('button', { name: kit.username }).click()
    await expect(kit.page).toHaveURL(new RegExp(`/u/${kit.username}$`))
    await kit.page.getByRole('button', { name: 'Settings' }).click()
    await expect(kit.page).toHaveURL(/\/settings$/)
    await kit.page.goBack()
    await kit.page.goBack()
    await expect(kit.page).toHaveURL(/\/people$/)
    await expect(kit.page.getByRole('heading', { name: 'People' })).toBeVisible()
    await kit.page.goto('/nowhere/at/all')
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(kit.page.locator('.editor-post').first()).toBeVisible()
    // The bar shows the name of every view, including Home.
    await expect(kit.page.getByRole('heading', { name: 'Home' })).toBeVisible()
    for (const [path, title] of [
      ['/conversations', 'Conversations'],
      ['/conversations/new', 'New conversation'],
      ['/notifications', 'Notifications'],
      ['/settings', 'Settings'],
    ]) {
      await kit.page.goto(path)
      await expect(kit.page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
    await kit.context.close()
  })
})
