import { article, confirm, expect, member, open, owner, pick, sendMessage, test, uniq, writePost } from './helpers'

const nav = (page: Parameters<typeof open>[0]) => page.getByRole('navigation', { name: 'Main' })

test.describe('groups', () => {
  test('a group is created, used, visible only to its members, and left', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const o = await owner(browser, testInfo)
    await open(kit.page)
    await open(mo.page)
    await open(o.page)

    // Create the group from the nav.
    await nav(kit.page).getByRole('button', { name: 'New room' }).click()
    await expect(kit.page).toHaveURL(/\/rooms\/new$/)
    const name = uniq('Knitting ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name })).toBeVisible()
    const url = kit.page.url()
    const groupPath = new URL(url).pathname

    // The group is not visible to anyone else, including the instance owner.
    await expect(nav(mo.page).getByRole('button', { name })).toHaveCount(0)
    await expect(nav(o.page).getByRole('button', { name })).toHaveCount(0)
    await mo.page.goto(groupPath)
    await expect(mo.page).toHaveURL(/\/$/)

    // Posts and chat messages in the group are not shown outside it.
    const post = uniq('Purl two ')
    await writePost(kit.page, post)
    await sendMessage(kit.page, uniq('knit chat '))
    await open(o.page)
    await expect(article(o.page, post)).toHaveCount(0)

    // Add mo. The group appears in mo's nav immediately, and mo can see the post.
    await kit.page.getByRole('button', { name: 'Members and settings' }).click()
    await expect(kit.page).toHaveURL(/\/members$/)
    // The group's bar is still shown, with a button back to the group's view.
    await expect(kit.page.getByRole('heading', { name })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `Back to ${name}` })).toBeVisible()
    await kit.page.getByLabel('Add someone').selectOption({ label: mo.username })
    await kit.page.getByRole('button', { name: 'Add to room', exact: true }).click()
    await expect(kit.page.getByRole('list').getByText(mo.username)).toBeVisible()
    await nav(mo.page).getByRole('button', { name }).click()
    await expect(article(mo.page, post)).toBeVisible()

    // Go back from the members page to the group's view, then open the members page again.
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await mo.page.getByRole('button', { name: `Back to ${name}` }).click()
    await expect(mo.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(article(mo.page, post)).toBeVisible()
    // Mo leaves. The group is removed from mo's nav, and mo is removed from the members list.
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await mo.page.getByRole('button', { name: 'Leave room' }).click()
    await confirm(mo.page, 'Leave room')
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
    // There is still exactly one of each card, the controls are still shown, and the new name is shown everywhere.
    await expect(kit.page.getByRole('button', { name: 'Save' })).toBeDisabled()
    await expect(kit.page.getByRole('heading', { name: 'Room settings' })).toHaveCount(1)
    await expect(kit.page.getByRole('heading', { name: 'Members' })).toHaveCount(1)
    await expect(kit.page.getByRole('button', { name: 'Delete room' })).toBeEnabled()
    await expect(nav(kit.page).getByRole('button', { name: name + ' renamed' })).toBeVisible()
    // The group is now chat only. The view has one pane and no divider.
    await kit.page.goBack()
    await expect(kit.page.getByRole('separator', { name: 'Resize panes' })).toHaveCount(0)
    await expect(kit.page.locator('.editor-post')).toHaveCount(0)
    await expect(kit.page.locator('.editor-line').first()).toBeVisible()
    await kit.context.close()
  })

  test('ownership is transferred explicitly, the owner cannot leave before transferring it, and the last member deletes the room', async ({
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
    await kit.page.getByRole('button', { name: 'Add to room', exact: true }).click()
    const moRow = kit.page.getByRole('listitem').filter({ hasText: mo.username })
    await expect(moRow).toBeVisible()
    // The owner has no Leave button. Mo can be made moderator, then owner after a confirmation.
    await expect(kit.page.getByRole('button', { name: 'Leave room' })).toHaveCount(0)
    await pick(kit.page, moRow, `Options for ${mo.username}`, 'Make moderator')
    await expect(moRow).toContainText('moderator')
    // The row's menu button and the longer role text are on the same line as the name.
    const face = await moRow.getByRole('img').boundingBox()
    const action = await moRow.getByRole('button', { name: `Options for ${mo.username}` }).boundingBox()
    expect(face && action && action.y < face.y + face.height && action.y + action.height > face.y).toBeTruthy()
    await pick(kit.page, moRow, `Options for ${mo.username}`, 'Make owner')
    await confirm(kit.page, 'Make owner')
    await expect(moRow).toContainText('owner')
    await expect(moRow).toContainText(/joined (just now|\d+m ago)/)
    // Kit's own row shows the new role at once, without a reload.
    const kitRow = kit.page.getByRole('listitem').filter({ hasText: kit.username })
    await expect(kitRow).toContainText('moderator')
    await expect(kitRow).not.toContainText('owner')
    await expect(kitRow).toContainText(/joined (just now|\d+m ago)/)
    await expect(kit.page.getByRole('button', { name: 'Leave room' })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'Room settings' })).toHaveCount(0)
    // Mo is now the owner, sees the settings, and cannot leave.
    await open(mo.page)
    await nav(mo.page).getByRole('button', { name }).click()
    // The room's chat says who added mo, as a line apart from the messages.
    await expect(mo.page.getByText(`${kit.username} added ${mo.username} to the room`)).toBeVisible()
    await mo.page.getByRole('button', { name: 'Members and settings' }).click()
    await expect(mo.page.getByRole('heading', { name: 'Room settings' })).toBeVisible()
    await expect(mo.page.getByRole('button', { name: 'Leave room' })).toHaveCount(0)
    // Kit leaves, then mo deletes the room, and the room is removed from mo's nav.
    await kit.page.getByRole('button', { name: 'Leave room' }).click()
    await confirm(kit.page, 'Leave room')
    await expect(nav(kit.page).getByRole('button', { name })).toHaveCount(0)
    await mo.page.getByRole('button', { name: 'Delete room' }).click()
    await confirm(mo.page, 'Delete room')
    await expect(mo.page).toHaveURL(/\/$/)
    await expect(nav(mo.page).getByRole('button', { name })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test("deleting a room removes it, its posts and its notifications from another member's open pages at once", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page, '/rooms/new')
    const name = uniq('Going ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await kit.page.getByRole('button', { name: 'Members and settings' }).click()
    await kit.page.getByLabel('Add someone').selectOption({ label: mo.username })
    await kit.page.getByRole('button', { name: 'Add to room', exact: true }).click()
    await expect(kit.page.getByRole('listitem').filter({ hasText: mo.username })).toBeVisible()
    await nav(kit.page).getByRole('button', { name }).click()
    const text = uniq('A post in the room ')
    await writePost(kit.page, text)

    // Mo has the room in the nav and a notification of being added. After the room is deleted, the notification must
    // be gone, not shown without the room's name, so it is found by the actor alone.
    await open(mo.page, '/notifications')
    const added = mo.page.getByRole('button', { name: new RegExp(`${kit.username} added you to`) })
    await expect(added).toContainText(name)
    await expect(nav(mo.page).getByRole('button', { name })).toBeVisible()
    // Mo opens kit's profile in a second tab, and it shows the post.
    const profile = await mo.context.newPage()
    await open(profile, `/u/${kit.username}`)
    await expect(profile.getByText(text)).toBeVisible()

    await nav(kit.page).getByRole('button', { name }).click()
    await kit.page.getByRole('button', { name: 'Members and settings' }).click()
    await kit.page.getByRole('button', { name: 'Delete room' }).click()
    await confirm(kit.page, 'Delete room')
    await expect(kit.page).toHaveURL(/\/$/)

    await expect(added).toHaveCount(0)
    await expect(nav(mo.page).getByRole('button', { name })).toHaveCount(0)
    await expect(profile.getByText(text)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('after a handover the old owner is shown as a moderator at once, even when the event stream is down', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const name = uniq('Handover offline ')
    const room = (await (
      await kit.context.request.post('/api/groups', { data: { kind: 'group', name, mode: 'both' } })
    ).json()) as { id: string }
    const moId = ((await (await mo.context.request.get('/api/me')).json()) as { id: string }).id
    await kit.context.request.post(`/api/groups/${room.id}/members`, { data: { user_id: moId } })
    // Kit's event stream never connects, so the page knows only what its own requests return.
    await kit.page.route('**/api/events*', (route) => route.abort())
    await open(kit.page, `/r/${room.id}/members`)
    const moRow = kit.page.getByRole('listitem').filter({ hasText: mo.username })
    await pick(kit.page, moRow, `Options for ${mo.username}`, 'Make owner')
    await confirm(kit.page, 'Make owner')
    await expect(moRow).toContainText('owner')
    const kitRow = kit.page.getByRole('listitem').filter({ hasText: kit.username })
    await expect(kitRow).toContainText('moderator')
    await expect(kitRow).not.toContainText('owner')
    await expect(kit.page.getByRole('heading', { name: 'Room settings' })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('a DM is started from a user on the People page and is chat only', async ({ browser }, testInfo) => {
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
    // Mo's nav shows the conversation under kit's name, updated live, and the message is in it.
    await nav(mo.page).getByRole('button', { name: kit.username }).click()
    await expect(article(mo.page, text)).toBeVisible()
    // Opening a DM with the same user again opens the same DM. It is still named after mo, here and on Messages.
    await open(kit.page, '/people')
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(article(kit.page, text)).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'Just you' })).toHaveCount(0)
    await open(kit.page, '/conversations')
    await expect(kit.page.getByRole('list').getByRole('button', { name: mo.username })).toBeVisible()
    await expect(kit.page.getByRole('list').getByRole('button', { name: 'Just you' })).toHaveCount(0)
    await expect(nav(kit.page).getByRole('button', { name: 'Just you' })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('a conversation has exactly two users, hiding and showing it keeps its messages, and nobody can be added to it', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page, '/people')
    await open(mo.page)
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    // The bar has no people button, and the conversation has no members page.
    await expect(kit.page.getByRole('button', { name: 'Members and settings' })).toHaveCount(0)
    const path = new URL(kit.page.url()).pathname
    await kit.page.goto(`${path}/members`)
    await expect(kit.page).toHaveURL(new RegExp(`${path}$`))
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    const between = uniq('between us ')
    await sendMessage(kit.page, between)

    // Mo hides the conversation from the bar's menu. It is removed from mo's nav. Kit is not notified and can
    // still send messages.
    await nav(mo.page).getByRole('button', { name: kit.username }).click()
    await expect(article(mo.page, between)).toBeVisible()
    await mo.page.getByRole('button', { name: 'Conversation options' }).click()
    await mo.page.getByRole('menuitem', { name: 'Hide conversation' }).click()
    await confirm(mo.page, 'Hide')
    await expect(mo.page).toHaveURL(/\/conversations$/)
    await expect(nav(mo.page).getByRole('button', { name: kit.username })).toHaveCount(0)
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    const meanwhile = uniq('while mo is out ')
    await sendMessage(kit.page, meanwhile)

    // Mo opens it again from All conversations. It is the same conversation and has every message sent in it.
    await expect(mo.page.getByRole('heading', { name: 'Hidden' })).toBeVisible()
    await mo.page.getByRole('list').last().getByRole('button', { name: kit.username }).click()
    await expect(mo.page).toHaveURL(new RegExp(`${path}$`))
    await expect(article(mo.page, between)).toBeVisible()
    await expect(article(mo.page, meanwhile)).toBeVisible()
    await expect(nav(mo.page).getByRole('button', { name: kit.username })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })

  test('the instance setting controls who sees the New room button', async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo)
    await open(o.page, '/community')
    await open(kit.page)
    await expect(nav(kit.page).getByRole('button', { name: 'New room' })).toBeVisible()
    await o.page.getByLabel('Who can create rooms').selectOption('staff')
    await o.page.getByRole('button', { name: 'Save' }).click()
    await expect(nav(kit.page).getByRole('button', { name: 'New room' })).toHaveCount(0)
    await expect(nav(o.page).getByRole('button', { name: 'New room' })).toBeVisible()
    await o.page.getByLabel('Who can create rooms').selectOption('anyone')
    await o.page.getByRole('button', { name: 'Save' }).click()
    await expect(nav(kit.page).getByRole('button', { name: 'New room' })).toBeVisible()
    await o.context.close()
    await kit.context.close()
  })
})
