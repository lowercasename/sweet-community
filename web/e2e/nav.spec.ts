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
  test('rooms and conversations sit in their own sections; conversations by latest word, All messages at the foot', async ({
    browser,
  }, testInfo) => {
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
    // A section's items are smaller than Home and sit touching, a stack under their title.
    const home = await nav(kit).getByRole('button', { name: 'Home' }).boundingBox()
    const room = await groups.getByRole('button', { name }).boundingBox()
    expect(home && room && room.height < home.height).toBeTruthy()

    // A conversation joins the Messages section at once, marked while I am in it, drawn by the other's face.
    await messageFromPeople(kit, mo.username)
    const conversations = nav(kit).getByRole('group', { name: 'Messages' })
    await expect(conversations.getByRole('button', { name: mo.username })).toHaveAttribute('aria-current', 'page')
    await expect(conversations.getByRole('button', { name: mo.username }).locator('img')).toHaveCount(1)
    await sendMessage(kit.page, uniq('hi mo '))
    // The section's own control starts one: pick a person, land in the conversation.
    await conversations.getByRole('button', { name: 'New message' }).click()
    await expect(kit.page).toHaveURL(/\/messages\/new$/)
    await kit.page.getByLabel('Add someone').selectOption({ label: jo.username })
    await kit.page.getByRole('button', { name: 'Start' }).click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name: jo.username })).toBeVisible()
    await sendMessage(kit.page, uniq('hi jo '))

    // The section orders by latest word; All messages lists them all the same way.
    const items = conversations.getByRole('button')
    await expect(items).toHaveCount(4)
    await expect(items.nth(0)).toHaveAccessibleName('New message')
    await expect(items.nth(1)).toHaveText(jo.username)
    await expect(items.nth(2)).toHaveText(mo.username)
    await expect(items.nth(3)).toHaveText('All messages')
    const a = await items.nth(1).boundingBox()
    const b = await items.nth(2).boundingBox()
    expect(a && b && b.y - (a.y + a.height) <= 1).toBeTruthy()
    await conversations.getByRole('button', { name: 'All messages' }).click()
    await expect(kit.page).toHaveURL(/\/messages$/)
    await expect(conversations.getByRole('button', { name: 'All messages' })).toHaveAttribute('aria-current', 'page')
    await expect(kit.page.getByRole('heading', { name: 'Messages' })).toBeVisible()
    const rows = kit.page.getByRole('list').getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText(jo.username)
    await expect(rows.nth(1)).toContainText(mo.username)

    // Mo speaks: mo's conversation moves to the top of kit's section and list, from the stream.
    await open(mo.page)
    await nav(mo).getByRole('button', { name: kit.username }).click()
    await expect(mo.page.getByRole('heading', { name: kit.username })).toBeVisible()
    await sendMessage(mo.page, uniq('hello back '))
    await expect(items.nth(1)).toHaveText(new RegExp(`^${mo.username}`))
    await expect(rows.nth(0)).toContainText(mo.username)
    await expect(rows.nth(1)).toContainText(jo.username)

    // Opening one from the list marks it in the section.
    await rows.nth(0).getByRole('button').click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await expect(conversations.getByRole('button', { name: mo.username })).toHaveAttribute('aria-current', 'page')

    // Collapsed, a name hidden behind its mark is a tooltip, not the browser's title.
    await nav(kit).getByRole('button', { name: 'Collapse' }).click()
    const tile = nav(kit).getByRole('button', { name })
    await expect(tile).not.toHaveAttribute('title')
    await tile.hover()
    await expect(kit.page.getByRole('tooltip')).toHaveText(name)

    await kit.context.close()
    await mo.context.close()
    await jo.context.close()
  })

  test('@phone the menu holds the same blocks, conversations included', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page).toHaveURL(/\/menu$/)
    const groups = kit.page.getByRole('group', { name: 'Rooms' })
    await expect(groups.getByRole('button', { name: 'New room' })).toBeVisible()
    await expect(
      kit.page.getByRole('group', { name: 'Messages' }).getByRole('button', { name: 'New message' }),
    ).toBeVisible()

    // People, Message mo, then back through the menu: mo is in the Messages section, and on the full list.
    await kit.page.getByRole('button', { name: 'People' }).click()
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    const conversations = kit.page.getByRole('group', { name: 'Messages' })
    await expect(conversations.getByRole('button', { name: mo.username })).toBeVisible()
    await conversations.getByRole('button', { name: 'All messages' }).click()
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
