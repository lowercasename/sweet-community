import { article, confirm, expect, member, open, owner, pick, test, uniq, writePost } from './helpers'

test.describe('roles', () => {
  test('the owner promotes a member from People; a moderator deletes anything and edits nothing of others', async ({ browser }, testInfo) => {
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
    await row.getByRole('button', { name: 'Make moderator' }).click()
    await expect(row).toContainText('moderator')
    await expect(row.getByRole('button', { name: 'Make member' })).toBeVisible()

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
})
