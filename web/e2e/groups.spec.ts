import { article, confirm, expect, member, open, owner, sendMessage, test, uniq, writePost } from './helpers'

const nav = (page: Parameters<typeof open>[0]) => page.getByRole('navigation', { name: 'Main' })

test.describe('groups', () => {
  test('a group is made, lived in, found only by its members, and left', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const o = await owner(browser, testInfo)
    await open(kit.page)
    await open(mo.page)
    await open(o.page)

    // Create, from the nav.
    await nav(kit.page).getByRole('button', { name: 'New group' }).click()
    await expect(kit.page).toHaveURL(/\/groups\/new$/)
    const name = uniq('Knitting ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create group' }).click()
    await expect(kit.page).toHaveURL(/\/g\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name })).toBeVisible()
    const url = kit.page.url()
    const groupPath = new URL(url).pathname

    // To everyone else, the instance owner included, it does not exist.
    await expect(nav(mo.page).getByRole('button', { name })).toHaveCount(0)
    await expect(nav(o.page).getByRole('button', { name })).toHaveCount(0)
    await mo.page.goto(groupPath)
    await expect(mo.page).toHaveURL(/\/$/)

    // Posts and chat in it stay in it.
    const post = uniq('Purl two ')
    await writePost(kit.page, post)
    await sendMessage(kit.page, uniq('knit chat '))
    await open(o.page)
    await expect(article(o.page, post)).toHaveCount(0)

    // Add mo: it appears in mo's nav at once; mo sees the post.
    await kit.page.getByRole('button', { name: 'Members' }).click()
    await expect(kit.page).toHaveURL(/\/members$/)
    // The group's bar stays, with the way back.
    await expect(kit.page.getByRole('heading', { name })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `Back to ${name}` })).toBeVisible()
    await kit.page.getByLabel('Add someone').selectOption({ label: mo.username })
    await kit.page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(kit.page.getByRole('list').getByText(mo.username)).toBeVisible()
    await nav(mo.page).getByRole('button', { name }).click()
    await expect(article(mo.page, post)).toBeVisible()

    // Back from Members to the view, then Members again.
    await mo.page.getByRole('button', { name: 'Members' }).click()
    await mo.page.getByRole('button', { name: `Back to ${name}` }).click()
    await expect(mo.page).toHaveURL(/\/g\/[^/]+$/)
    await expect(article(mo.page, post)).toBeVisible()
    // Mo leaves; it is gone from mo's nav and mo is off the list.
    await mo.page.getByRole('button', { name: 'Members' }).click()
    await mo.page.getByRole('button', { name: 'Leave group' }).click()
    await confirm(mo.page, 'Leave')
    await expect(mo.page).toHaveURL(/\/$/)
    await expect(nav(mo.page).getByRole('button', { name })).toHaveCount(0)
    await expect(kit.page.getByRole('list').getByText(mo.username)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
    await o.context.close()
  })

  test('saving group settings keeps one settings card and the owner in charge', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page, '/groups/new')
    const name = uniq('Test Group ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create group' }).click()
    await kit.page.getByRole('button', { name: 'Members' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Group settings' })).toHaveCount(1)

    await kit.page.getByLabel('Name').fill(name + ' renamed')
    await kit.page.getByLabel('Mode').selectOption('chat')
    await kit.page.getByRole('button', { name: 'Save' }).click()
    // Still exactly one of each card, the controls still there, the name changed everywhere.
    await expect(kit.page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(kit.page.getByRole('heading', { name: 'Group settings' })).toHaveCount(1)
    await expect(kit.page.getByRole('heading', { name: 'Members' })).toHaveCount(1)
    await expect(kit.page.getByRole('button', { name: 'Delete group' })).toBeEnabled()
    await expect(nav(kit.page).getByRole('button', { name: name + ' renamed' })).toBeVisible()
    // Chat only now: the view has one pane and no divider.
    await kit.page.goBack()
    await expect(kit.page.getByRole('separator', { name: 'Resize panes' })).toHaveCount(0)
    await expect(kit.page.locator('.editor-post')).toHaveCount(0)
    await expect(kit.page.locator('.editor-line').first()).toBeVisible()
    await kit.context.close()
  })

  test('ownership is handed over explicitly; the owner cannot leave before; the last out deletes', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page, '/groups/new')
    const name = uniq('Handover ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create group' }).click()
    await kit.page.getByRole('button', { name: 'Members' }).click()
    await kit.page.getByLabel('Add someone').selectOption({ label: mo.username })
    await kit.page.getByRole('button', { name: 'Add', exact: true }).click()
    const moRow = kit.page.getByRole('listitem').filter({ hasText: mo.username })
    await expect(moRow).toBeVisible()
    // The owner has no Leave; mo may be made moderator, then owner, after a confirm.
    await expect(kit.page.getByRole('button', { name: 'Leave group' })).toHaveCount(0)
    await moRow.getByRole('button', { name: 'Make moderator' }).click()
    await expect(moRow).toContainText('moderator')
    await moRow.getByRole('button', { name: 'Make owner' }).click()
    await confirm(kit.page, 'Hand over')
    await expect(moRow).toContainText('owner')
    await expect(kit.page.getByRole('button', { name: 'Leave group' })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'Group settings' })).toHaveCount(0)
    // Mo, now owner, sees the settings and cannot leave.
    await open(mo.page)
    await nav(mo.page).getByRole('button', { name }).click()
    await mo.page.getByRole('button', { name: 'Members' }).click()
    await expect(mo.page.getByRole('heading', { name: 'Group settings' })).toBeVisible()
    await expect(mo.page.getByRole('button', { name: 'Leave group' })).toHaveCount(0)
    // Kit leaves; mo deletes; it is gone for mo.
    await kit.page.getByRole('button', { name: 'Leave group' }).click()
    await confirm(kit.page, 'Leave')
    await expect(nav(kit.page).getByRole('button', { name })).toHaveCount(0)
    await mo.page.getByRole('button', { name: 'Delete group' }).click()
    await confirm(mo.page, 'Delete')
    await expect(mo.page).toHaveURL(/\/$/)
    await expect(nav(mo.page).getByRole('button', { name })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('a DM starts from a person on the People page and is chat only', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page, '/people')
    await open(mo.page)
    await kit.page.getByRole('listitem').filter({ hasText: mo.username }).getByRole('button', { name: 'Message' }).click()
    await expect(kit.page).toHaveURL(/\/g\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await expect(kit.page.locator('.editor-post')).toHaveCount(0)
    const text = uniq('psst ')
    await sendMessage(kit.page, text)
    // Mo's nav names the DM after kit and the message is there.
    await nav(mo.page).getByRole('button', { name: kit.username }).click()
    await expect(article(mo.page, text)).toBeVisible()
    // The same two people open the same DM again.
    await open(kit.page, '/people')
    await kit.page.getByRole('listitem').filter({ hasText: mo.username }).getByRole('button', { name: 'Message' }).click()
    await expect(article(kit.page, text)).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })

  test('the instance setting decides who sees New group', async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo)
    await open(o.page, '/settings')
    await open(kit.page)
    await expect(nav(kit.page).getByRole('button', { name: 'New group' })).toBeVisible()
    await o.page.getByLabel('Who can create groups').selectOption('staff')
    await expect(nav(kit.page).getByRole('button', { name: 'New group' })).toHaveCount(0)
    await expect(nav(o.page).getByRole('button', { name: 'New group' })).toBeVisible()
    await o.page.getByLabel('Who can create groups').selectOption('anyone')
    await expect(nav(kit.page).getByRole('button', { name: 'New group' })).toBeVisible()
    await o.context.close()
    await kit.context.close()
  })
})
