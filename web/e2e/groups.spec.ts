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
    await nav(kit.page).getByRole('button', { name: 'New room' }).click()
    await expect(kit.page).toHaveURL(/\/rooms\/new$/)
    const name = uniq('Knitting ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
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
    await kit.page.getByRole('button', { name: 'Members and settings' }).click()
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
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await mo.page.getByRole('button', { name: `Back to ${name}` }).click()
    await expect(mo.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(article(mo.page, post)).toBeVisible()
    // Mo leaves; it is gone from mo's nav and mo is off the list.
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await mo.page.getByRole('button', { name: 'Leave room' }).click()
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
    await open(kit.page, '/rooms/new')
    const name = uniq('Test Group ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await kit.page.getByRole('button', { name: 'Members and settings' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Room settings' })).toHaveCount(1)

    await kit.page.getByLabel('Name').fill(name + ' renamed')
    await kit.page.getByLabel('Mode').selectOption('chat')
    await kit.page.getByRole('button', { name: 'Save' }).click()
    // Still exactly one of each card, the controls still there, the name changed everywhere.
    await expect(kit.page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(kit.page.getByRole('heading', { name: 'Room settings' })).toHaveCount(1)
    await expect(kit.page.getByRole('heading', { name: 'Members' })).toHaveCount(1)
    await expect(kit.page.getByRole('button', { name: 'Delete room' })).toBeEnabled()
    await expect(nav(kit.page).getByRole('button', { name: name + ' renamed' })).toBeVisible()
    // Chat only now: the view has one pane and no divider.
    await kit.page.goBack()
    await expect(kit.page.getByRole('separator', { name: 'Resize panes' })).toHaveCount(0)
    await expect(kit.page.locator('.editor-post')).toHaveCount(0)
    await expect(kit.page.locator('.editor-line').first()).toBeVisible()
    await kit.context.close()
  })

  test('ownership is handed over explicitly; the owner cannot leave before; the last out deletes', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page, '/rooms/new')
    const name = uniq('Handover ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await kit.page.getByRole('button', { name: 'Members and settings' }).click()
    await kit.page.getByLabel('Add someone').selectOption({ label: mo.username })
    await kit.page.getByRole('button', { name: 'Add', exact: true }).click()
    const moRow = kit.page.getByRole('listitem').filter({ hasText: mo.username })
    await expect(moRow).toBeVisible()
    // The owner has no Leave; mo may be made moderator, then owner, after a confirm.
    await expect(kit.page.getByRole('button', { name: 'Leave room' })).toHaveCount(0)
    await moRow.getByRole('button', { name: 'Make moderator' }).click()
    await expect(moRow).toContainText('moderator')
    // Three actions and the longer role text still share the name's line: the text shrinks before the row wraps.
    const face = await moRow.getByRole('img').boundingBox()
    const action = await moRow.getByRole('button', { name: 'Remove' }).boundingBox()
    expect(face && action && action.y < face.y + face.height && action.y + action.height > face.y).toBeTruthy()
    await moRow.getByRole('button', { name: 'Make owner' }).click()
    await confirm(kit.page, 'Switch ownership')
    await expect(moRow).toContainText('owner')
    await expect(moRow).toContainText(/joined (just now|\d+m ago)/)
    await expect(kit.page.getByRole('listitem').filter({ hasText: kit.username })).toContainText(
      /joined (just now|\d+m ago)/,
    )
    await expect(kit.page.getByRole('button', { name: 'Leave room' })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'Room settings' })).toHaveCount(0)
    // Mo, now owner, sees the settings and cannot leave.
    await open(mo.page)
    await nav(mo.page).getByRole('button', { name }).click()
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await expect(mo.page.getByRole('heading', { name: 'Room settings' })).toBeVisible()
    await expect(mo.page.getByRole('button', { name: 'Leave room' })).toHaveCount(0)
    // Kit leaves; mo deletes; it is gone for mo.
    await kit.page.getByRole('button', { name: 'Leave room' }).click()
    await confirm(kit.page, 'Leave')
    await expect(nav(kit.page).getByRole('button', { name })).toHaveCount(0)
    await mo.page.getByRole('button', { name: 'Delete room' }).click()
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
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await expect(kit.page.locator('.editor-post')).toHaveCount(0)
    const text = uniq('psst ')
    await sendMessage(kit.page, text)
    // Mo's nav names the conversation after kit, live, and the message is there.
    await nav(mo.page).getByRole('button', { name: kit.username }).click()
    await expect(article(mo.page, text)).toBeVisible()
    // The same two people open the same DM again, and it is still named after mo, here and on Messages.
    await open(kit.page, '/people')
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(article(kit.page, text)).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'Just you' })).toHaveCount(0)
    await nav(kit.page).getByRole('button', { name: 'All messages' }).click()
    await expect(kit.page.getByRole('list').getByRole('button', { name: mo.username })).toBeVisible()
    await expect(kit.page.getByRole('list').getByRole('button', { name: 'Just you' })).toHaveCount(0)
    await expect(nav(kit.page).getByRole('button', { name: 'Just you' })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('a conversation is its people: one with others is another one; hiding and showing keeps it', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const jo = await member(browser, testInfo, 'jo')
    await open(kit.page, '/people')
    await open(mo.page)
    await open(jo.page)
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    const between = uniq('between us ')
    await sendMessage(kit.page, between)

    // Nobody is added. A word with jo too is another conversation, started on New message with the pair filled in: empty, and the pair stays what it was.
    await nav(mo.page).getByRole('button', { name: kit.username }).click()
    await mo.page.getByRole('button', { name: /^\d+ people$/ }).click()
    await expect(mo.page.getByRole('heading', { name: 'People' })).toBeVisible()
    await expect(mo.page.getByLabel('Add someone')).toHaveCount(0)
    await mo.page.getByRole('button', { name: 'New conversation with these people and others' }).click()
    await expect(mo.page).toHaveURL(/\/messages\/new\?with=/)
    await expect(mo.page.getByRole('button', { name: `Remove ${kit.username}` })).toBeVisible()
    await mo.page.getByLabel('Add someone').selectOption({ label: jo.username })
    await mo.page.getByRole('button', { name: 'Start' }).click()
    const names = (...people: string[]) => people.sort().join(', ')
    await expect(mo.page.getByRole('heading', { name: names(jo.username, kit.username) })).toBeVisible()
    await expect(article(mo.page, between)).toHaveCount(0)
    const three = new URL(mo.page.url()).pathname
    await expect(kit.page.getByRole('heading', { name: mo.username, exact: true })).toBeVisible()
    await expect(nav(kit.page).getByRole('button', { name: names(jo.username, mo.username) })).toBeVisible()
    const all = uniq('all three ')
    await sendMessage(mo.page, all)

    // Jo hides it: gone from jo's nav, still of the three to the others, who are told nothing.
    await nav(jo.page)
      .getByRole('button', { name: names(kit.username, mo.username) })
      .click()
    await jo.page.getByRole('button', { name: /^\d+ people$/ }).click()
    await jo.page.getByRole('button', { name: 'Hide conversation' }).click()
    await confirm(jo.page, 'Hide')
    await expect(jo.page).toHaveURL(/\/messages$/)
    await expect(nav(jo.page).getByRole('button', { name: names(kit.username, mo.username) })).toHaveCount(0)
    await mo.page.getByRole('button', { name: /^\d+ people$/ }).click()
    const joRow = mo.page.getByRole('listitem').filter({ hasText: jo.username })
    await expect(joRow).toBeVisible()
    await expect(joRow).not.toContainText(/hidden|stepped/)
    await expect(mo.page.getByRole('heading', { name: names(jo.username, kit.username) })).toBeVisible()
    // What is said meanwhile is said in jo's conversation too.
    await mo.page.getByRole('button', { name: /^Back to / }).click()
    const meanwhile = uniq('while jo is out ')
    await sendMessage(mo.page, meanwhile)

    // Jo brings it back from All messages: the same conversation, everything said in it.
    await expect(jo.page.getByRole('heading', { name: 'Hidden' })).toBeVisible()
    await jo.page
      .getByRole('list')
      .last()
      .getByRole('button', { name: names(kit.username, mo.username) })
      .click()
    await expect(jo.page).toHaveURL(new RegExp(three.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'))
    await expect(article(jo.page, all)).toBeVisible()
    await expect(article(jo.page, meanwhile)).toBeVisible()
    await expect(nav(jo.page).getByRole('button', { name: names(kit.username, mo.username) })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
    await jo.context.close()
  })

  test('the instance setting decides who sees New room', async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo)
    await open(o.page, '/settings')
    await open(kit.page)
    await expect(nav(kit.page).getByRole('button', { name: 'New room' })).toBeVisible()
    await o.page.getByLabel('Who can create rooms').selectOption('staff')
    await expect(nav(kit.page).getByRole('button', { name: 'New room' })).toHaveCount(0)
    await expect(nav(o.page).getByRole('button', { name: 'New room' })).toBeVisible()
    await o.page.getByLabel('Who can create rooms').selectOption('anyone')
    await expect(nav(kit.page).getByRole('button', { name: 'New room' })).toBeVisible()
    await o.context.close()
    await kit.context.close()
  })
})
