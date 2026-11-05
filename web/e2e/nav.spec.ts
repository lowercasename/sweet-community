import { expect, member, open, sendMessage, test, uniq, type Person } from './helpers'

const nav = (p: Person) => p.page.getByRole('navigation', { name: 'Main' })

/** Open a DM with someone from the People page, and land in it. */
async function messageFromPeople(p: Person, who: string) {
  await nav(p).getByRole('button', { name: 'People' }).click()
  await p.page.getByRole('listitem').filter({ hasText: who }).getByRole('button', { name: 'Message' }).click()
  await expect(p.page).toHaveURL(/\/r\/[^/]+$/)
  await expect(p.page.getByRole('heading', { name: who })).toBeVisible()
}

test.describe('nav', () => {
  test('groups sit in their own section; DMs sit behind Messages, latest word first', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const jo = await member(browser, testInfo, 'jo')
    await open(kit.page)

    // A new group lands in the Rooms section, made from that section's own control.
    const groups = nav(kit).getByRole('group', { name: 'Rooms' })
    await groups.getByRole('button', { name: 'New room' }).click()
    const name = uniq('Knitting ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(groups.getByRole('button', { name })).toBeVisible()
    await expect(groups.getByRole('button', { name })).toHaveAttribute('aria-current', 'page')

    // A DM is not in the nav; Messages is current while I am in one.
    await messageFromPeople(kit, mo.username)
    await expect(nav(kit).getByRole('button', { name: mo.username })).toHaveCount(0)
    await expect(nav(kit).getByRole('button', { name: 'Messages' })).toHaveAttribute('aria-current', 'page')
    await sendMessage(kit.page, uniq('hi mo '))
    await messageFromPeople(kit, jo.username)
    await sendMessage(kit.page, uniq('hi jo '))

    // Messages lists both, the one with the latest word first.
    await nav(kit).getByRole('button', { name: 'Messages' }).click()
    await expect(kit.page).toHaveURL(/\/messages$/)
    await expect(kit.page.getByRole('heading', { name: 'Messages' })).toBeVisible()
    const rows = kit.page.getByRole('list').getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText(jo.username)
    await expect(rows.nth(1)).toContainText(mo.username)

    // Mo speaks: mo's conversation moves to the top on kit's open page, from the stream.
    await open(mo.page, '/messages')
    await mo.page.getByRole('list').getByRole('button', { name: kit.username }).click()
    await expect(mo.page.getByRole('heading', { name: kit.username })).toBeVisible()
    await sendMessage(mo.page, uniq('hello back '))
    await expect(rows.nth(0)).toContainText(mo.username)
    await expect(rows.nth(1)).toContainText(jo.username)

    // Opening one from the list.
    await rows.nth(0).getByRole('button').click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await expect(nav(kit).getByRole('button', { name: 'Messages' })).toHaveAttribute('aria-current', 'page')

    await kit.context.close()
    await mo.context.close()
    await jo.context.close()
  })

  test('@phone the menu holds the same blocks, and Messages lists my DMs', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page).toHaveURL(/\/menu$/)
    const groups = kit.page.getByRole('group', { name: 'Rooms' })
    await expect(groups.getByRole('button', { name: 'New room' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: 'Messages' })).toBeVisible()

    // People, Message mo, then back through the menu to Messages, where mo is listed.
    await kit.page.getByRole('button', { name: 'People' }).click()
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    await kit.page.getByRole('button', { name: 'Messages' }).click()
    await expect(kit.page).toHaveURL(/\/messages$/)
    await expect(kit.page.getByRole('list').getByRole('button', { name: mo.username })).toBeVisible()

    // Home from the menu.
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    await kit.page.getByRole('button', { name: 'Home' }).click()
    await expect(kit.page).toHaveURL(/\/$/)
    await kit.context.close()
    await mo.context.close()
  })
})
