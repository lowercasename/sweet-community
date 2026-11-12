import { article, expect, member, open, owner, test, uniq, writePost } from './helpers'

test.describe('mentions', () => {
  test("typing @ suggests the group's users, and a mention notifies the user, shows their name, and links to their page", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)
    const text = uniq('a word for ')
    await kit.page.locator('.editor-post .ProseMirror').first().click()
    // An @ starts a mention only after a space, not directly after a word.
    await kit.page.keyboard.type(`${text} @${mo.username.slice(0, -1)}`)
    const list = kit.page.getByRole('listbox', { name: 'People' })
    await expect(list.getByRole('option', { name: mo.username })).toBeVisible()
    await kit.page.keyboard.press('Enter')
    await expect(list).toHaveCount(0)
    await kit.page.keyboard.type(' hello')
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const post = article(kit.page, text)
    await expect(post.getByRole('link', { name: `@${mo.username}` })).toBeVisible()

    // Mo gets a notification, and the notification opens the post.
    const nav = mo.page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('button', { name: 'Notifications, unread' }).click()
    await mo.page.getByRole('button', { name: `${kit.username} mentioned you in a post discussion, new` }).click()
    await expect(mo.page).toHaveURL(/\/p\/[0-9a-f-]+$/)
    await expect(mo.page.locator('article:visible').filter({ hasText: text })).toBeVisible()
    // The mention in the post body links to mo's page inside the app.
    await mo.page
      .locator('article:visible')
      .getByRole('link', { name: `@${mo.username}` })
      .click()
    await expect(mo.page).toHaveURL(new RegExp(`/u/${mo.username}$`))

    // The same flow in chat. The notification text says that the mention was in the chat.
    await open(kit.page)
    await kit.page.locator('.editor-line .ProseMirror').first().click()
    await kit.page.keyboard.type(`@${mo.username.slice(0, -1)}`)
    await expect(
      kit.page.getByRole('listbox', { name: 'People' }).getByRole('option', { name: mo.username }),
    ).toBeVisible()
    await kit.page.keyboard.press('Enter')
    const said = uniq('over here ')
    await kit.page.keyboard.type(` ${said}`)
    await kit.page.keyboard.press('Enter')
    await expect(article(kit.page, said).getByRole('link', { name: `@${mo.username}` })).toBeVisible()
    await open(mo.page, '/notifications')
    await expect(mo.page.getByRole('button', { name: `${kit.username} mentioned you in the chat, new` })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })

  test('in a room, typing @ suggests only the members of the room', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const boss = await owner(browser, testInfo)
    const me = (await (await kit.context.request.get('/api/me')).json()) as { id: string }
    const room = await boss.context.request.post('/api/groups', {
      data: { kind: 'group', name: uniq('Wool'), mode: 'both' },
    })
    const gid = ((await room.json()) as { id: string }).id
    await boss.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: me.id } })
    await open(kit.page, `/r/${gid}`)
    await kit.page.locator('.editor-line .ProseMirror').first().click()
    await kit.page.keyboard.type('@')
    const list = kit.page.getByRole('listbox', { name: 'People' })
    await expect(list.getByRole('option', { name: 'raphael' })).toBeVisible()
    await expect(list.getByRole('option', { name: mo.username })).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
    await boss.context.close()
  })

  test('in chat the suggestion list opens at the @, and Enter selects the user instead of sending the message', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    const editor = kit.page.locator('.editor-line .ProseMirror').first()
    await editor.click()
    await kit.page.keyboard.type('@')
    const list = kit.page.getByRole('listbox', { name: 'People' })
    await expect(list).toBeVisible()
    // The list is positioned at the @: within the editor's horizontal extent, and directly above
    // or below the editor. The chat editor is at the bottom of the screen, so the list opens above it.
    const box = (await list.boundingBox())!
    const where = (await editor.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(where.x - 8)
    expect(box.x).toBeLessThanOrEqual(where.x + where.width)
    const above = box.y + box.height <= where.y + 8
    const below = box.y >= where.y + 16
    expect(above || below).toBe(true)
    // Pressing Enter while the list is open selects a user and sends nothing.
    const before = await kit.page.getByRole('article').count()
    await kit.page.keyboard.press('Enter')
    await expect(list).toHaveCount(0)
    await expect(editor.locator('span[data-type="mention"]')).toHaveCount(1)
    await kit.page.waitForTimeout(300)
    expect(await kit.page.getByRole('article').count()).toBe(before)
    await kit.context.close()
  })
})
