import { expect, member, open, test } from './helpers'

test.describe('routing', () => {
  test('every page is a URL: reload keeps the place, back returns, unknown paths go home', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('button', { name: 'People' }).click()
    await expect(kit.page).toHaveURL(/\/people$/)
    await expect(kit.page.getByRole('heading', { name: 'People' })).toBeVisible()
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: 'People' })).toBeVisible()
    await nav.getByRole('button', { name: 'Settings' }).click()
    await expect(kit.page).toHaveURL(/\/settings$/)
    await kit.page.goBack()
    await expect(kit.page).toHaveURL(/\/people$/)
    await expect(kit.page.getByRole('heading', { name: 'People' })).toBeVisible()
    await kit.page.goto('/nowhere/at/all')
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(kit.page.locator('.editor-post').first()).toBeVisible()
    await kit.context.close()
  })
})
