import { article, confirm, expect, member, open, owner, pick, test, uniq, writePost } from './helpers'

test.describe('roles', () => {
  test('the owner promotes a member from People, and a moderator can delete anything but cannot edit anything by other users', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(mo.page)
    const text = uniq("Mo's post ")
    await writePost(mo.page, text)

    await open(kit.page)
    // A member's menu on another user's post holds only Report.
    await article(kit.page, text).getByRole('button', { name: 'Post options' }).click()
    await expect(kit.page.getByRole('menuitem')).toHaveText(['Report'])
    await kit.page.keyboard.press('Escape')

    await open(o.page, '/people')
    const row = o.page.getByRole('listitem').filter({ hasText: kit.username })
    await pick(o.page, row, `Options for ${kit.username}`, 'Make moderator')
    await expect(row).toContainText('moderator')
    // The membership keeps its joined time, and the menu button stays on the same line as the name at this width.
    await expect(row).toContainText(/joined (just now|\d+m ago)/)
    await expect(row).not.toContainText('1970')
    const face = await row.getByRole('img').boundingBox()
    const action = await row.getByRole('button', { name: `Options for ${kit.username}` }).boundingBox()
    expect(face && action && action.y < face.y + face.height && action.y + action.height > face.y).toBeTruthy()

    // Kit's open page receives the role change. The menu now has Delete, and still no Edit.
    await article(kit.page, text).getByRole('button', { name: 'Post options' }).click()
    await expect(kit.page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
    await expect(kit.page.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0)
    await kit.page.keyboard.press('Escape')
    // Invites. A moderator now has the invite controls.
    await open(kit.page, '/people')
    await expect(kit.page.getByRole('button', { name: 'Create invite link' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: /Make / })).toHaveCount(0)
    // A moderator may manage topics, so the Community page is in their nav, with the Topics card only.
    await kit.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Community' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Topics' })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'About this community' })).toHaveCount(0)

    await open(kit.page)
    await pick(kit.page, article(kit.page, text), 'Post options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(article(mo.page, text)).toHaveCount(0)
    await o.context.close()
    await kit.context.close()
    await mo.context.close()
  })

  test('a user is removed by the owner from People, or removes themselves from Settings', async ({
    browser,
  }, testInfo) => {
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
    await kit.page.getByRole('button', { name: 'Add to room', exact: true }).click()
    await expect(kit.page.getByRole('list').getByText(mo.username)).toBeVisible()
    await open(kit.page)
    await open(mo.page)

    // The owner removes kit from People, after a confirmation.
    await open(o.page, '/people')
    const row = o.page.getByRole('listitem').filter({ hasText: kit.username })
    await pick(o.page, row, `Options for ${kit.username}`, 'Remove')
    await confirm(o.page, 'Remove')
    await expect(o.page.getByRole('listitem').filter({ hasText: kit.username })).toHaveCount(0)
    // Kit's open page signs itself out, and a reload stays on the sign-in page. The server test
    // TestRemovedUserCannotComeBackAndIsNotNotified checks that the account is sent no sign-in email.
    await expect(kit.page.getByRole('button', { name: 'Send a sign-in email' })).toBeVisible()
    await kit.page.reload()
    await expect(kit.page.getByRole('button', { name: 'Send a sign-in email' })).toBeVisible()
    await expect(kit.page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    // Kit's post is deleted with the account (Raphael, 2026-11-08). It leaves a page that was already open, and it is
    // not there after a fresh load.
    await expect(article(mo.page, text)).toHaveCount(0)
    await open(o.page)
    await expect(o.page.getByText(text)).toHaveCount(0)
    // Ownership of the room passed to mo.
    await mo.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name }).click()
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await expect(mo.page.getByRole('listitem').filter({ hasText: mo.username })).toContainText('owner')
    await expect(mo.page.getByRole('listitem').filter({ hasText: kit.username })).toHaveCount(0)

    // Mo removes themselves from Settings, after a confirmation.
    await open(mo.page, '/settings')
    await mo.page.getByRole('button', { name: 'Remove my account' }).click()
    await confirm(mo.page, 'Remove my account')
    await expect(mo.page.getByRole('button', { name: 'Send a sign-in email' })).toBeVisible()
    await open(o.page, '/people')
    await expect(o.page.getByRole('listitem').filter({ hasText: mo.username })).toHaveCount(0)
    await o.context.close()
    await kit.context.close()
    await mo.context.close()
  })
})
