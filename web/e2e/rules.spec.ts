import { expect, member, open, owner, test, uniq } from './helpers'

/**
 * The community's rules. The owner writes them on the Community page. Home's bar then
 * has a Rules button that opens them, for every member at once. The join page shows them, and joining agrees to them.
 */
test.describe('rules', () => {
  test('the owner writes the rules, members open them from Home, and the join page shows them', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    await expect(kit.page.getByRole('button', { name: 'Rules' })).toHaveCount(0)

    const rule = uniq('Be kind to each other ')
    await open(o.page, '/community')
    await o.page.getByRole('button', { name: /^(Write|Edit) rules$/ }).click()
    const editor = o.page.locator('.ProseMirror').first()
    await editor.click()
    await o.page.keyboard.press('ControlOrMeta+a')
    await o.page.keyboard.type(rule)
    await o.page.locator('form').filter({ has: editor }).getByRole('button', { name: 'Save' }).click()
    await expect(o.page.getByText(rule)).toBeVisible()

    // Kit's open Home gets the Rules button at once, and it opens the rules.
    await kit.page.getByRole('button', { name: 'Rules' }).click()
    await expect(kit.page).toHaveURL(/\/rules$/)
    await expect(kit.page.getByText(rule)).toBeVisible()

    // The join page shows the rules, and its button says that joining agrees to them.
    const code = ((await (await o.context.request.post('/api/invites')).json()) as { code: string }).code
    const stranger = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string })
    const page = await stranger.newPage()
    await page.goto(`/join/${code}`)
    await expect(page.getByText(rule)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Agree and join' })).toBeVisible()
    await stranger.close()

    // The rules are cleared again, so other tests see a community without them.
    expect((await o.context.request.put('/api/rules', { data: { body_html: '' } })).ok()).toBeTruthy()
    await kit.context.close()
    await o.context.close()
  })

  test('@phone the rules are at the end of the menu, not in the bar', async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    const rule = uniq('Be patient ')
    expect((await o.context.request.put('/api/rules', { data: { body_html: `<p>${rule}</p>` } })).ok()).toBeTruthy()
    try {
      const kit = await member(browser, testInfo, 'kit')
      await open(kit.page)
      await expect(kit.page.getByRole('button', { name: 'Rules' })).toHaveCount(0)
      await open(kit.page, '/menu')
      await kit.page.getByRole('button', { name: 'Rules' }).tap()
      await expect(kit.page.getByText(rule)).toBeVisible()
      await kit.page.getByRole('button', { name: 'Back to menu' }).tap()
      await expect(kit.page).toHaveURL(/\/menu$/)
      await kit.context.close()
    } finally {
      await o.context.request.put('/api/rules', { data: { body_html: '' } })
      await o.context.close()
    }
  })
})
