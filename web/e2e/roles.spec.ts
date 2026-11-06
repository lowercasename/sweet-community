import { article, confirm, expect, member, open, owner, pick, test, uniq, writePost } from './helpers'

test.describe('roles', () => {
  test('the owner promotes a member from People; a moderator deletes anything and edits nothing of others', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(mo.page)
    const text = uniq("Mo's post ")
    await writePost(mo.page, text)

    await open(kit.page)
    // A member has no menu on someone else's post.
    await expect(article(kit.page, text).getByRole('button', { name: 'Post options' })).toHaveCount(0)

    await open(o.page, '/people')
    const row = o.page.getByRole('listitem').filter({ hasText: kit.username })
    await pick(o.page, row, `Options for ${kit.username}`, 'Make moderator')
    await expect(row).toContainText('moderator')
    // The membership keeps its joined time, and the actions stay on the name's line at this width.
    await expect(row).toContainText(/joined (just now|\d+m ago)/)
    await expect(row).not.toContainText('1970')
    const face = await row.getByRole('img').boundingBox()
    const action = await row.getByRole('button', { name: `Options for ${kit.username}` }).boundingBox()
    expect(face && action && action.y < face.y + face.height && action.y + action.height > face.y).toBeTruthy()

    // Kit's open page learns of the new role: the menu appears, with Delete and without Edit.
    await article(kit.page, text).getByRole('button', { name: 'Post options' }).click()
    await expect(kit.page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
    await expect(kit.page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0)
    await kit.page.keyboard.press('Escape')
    // And invites: a moderator now has the tools.
    await open(kit.page, '/people')
    await expect(kit.page.getByRole('button', { name: 'Create invite link' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: /Make / })).toHaveCount(0)

    await open(kit.page)
    await pick(kit.page, article(kit.page, text), 'Post options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(article(mo.page, text)).toHaveCount(0)
    await o.context.close()
    await kit.context.close()
    await mo.context.close()
  })

  test('removing someone: by the owner from People, and by themselves from Settings', async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    const text = uniq("Kit's post ")
    await writePost(kit.page, text)
    // Kit owns a room with mo in it.
    await open(kit.page, '/rooms/new')
    const name = uniq('Kits room ')
    await kit.page.getByLabel('Room name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await kit.page.getByRole('button', { name: 'Members and settings' }).click()
    await kit.page.getByLabel('Add someone').selectOption({ label: mo.username })
    await kit.page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(kit.page.getByRole('list').getByText(mo.username)).toBeVisible()
    await open(kit.page)
    await open(mo.page)

    // The owner removes kit from People, after a confirm.
    await open(o.page, '/people')
    const row = o.page.getByRole('listitem').filter({ hasText: kit.username })
    await pick(o.page, row, `Options for ${kit.username}`, 'Remove')
    await confirm(o.page, 'Remove')
    await expect(o.page.getByRole('listitem').filter({ hasText: kit.username })).toHaveCount(0)
    // Kit's open page signs itself out; the account cannot sign in again.
    await expect(kit.page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await kit.page.getByLabel('Username').fill(kit.username)
    await kit.page.getByLabel('Password').fill('longenough')
    await kit.page.getByRole('button', { name: 'Sign in' }).click()
    await expect(kit.page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(kit.page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    // Kit's post stays on the feed, under a removed name, on a page that was open and after a fresh load.
    await expect(article(mo.page, text)).toContainText(/removed-/)
    await open(o.page)
    await expect(article(o.page, text)).toContainText(/removed-/)
    await expect(article(o.page, text)).not.toContainText(kit.username)
    // The room passed to mo.
    await mo.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click()
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await expect(mo.page.getByRole('listitem').filter({ hasText: mo.username })).toContainText('owner')
    await expect(mo.page.getByRole('listitem').filter({ hasText: kit.username })).toHaveCount(0)

    // Mo removes themselves from Settings, after a confirm.
    await open(mo.page, '/settings')
    await mo.page.getByRole('button', { name: 'Remove my account' }).click()
    await confirm(mo.page, 'Remove')
    await expect(mo.page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await open(o.page, '/people')
    await expect(o.page.getByRole('listitem').filter({ hasText: mo.username })).toHaveCount(0)
    await o.context.close()
    await kit.context.close()
    await mo.context.close()
  })
})
