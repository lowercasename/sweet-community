import { article, expect, member, open, owner, test, uniq, writePost } from './helpers'

test.describe('notifications', () => {
  test('a comment on my post and being added to a room reach me; the bell shows a dot until I look', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const boss = await owner(browser, testInfo)
    await open(kit.page)
    await open(mo.page)
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()

    const text = uniq('A post to be answered ')
    await writePost(kit.page, text)
    await article(mo.page, text).getByRole('button', { name: 'Show comments' }).click()
    await article(mo.page, text).locator('.editor-line .ProseMirror').click()
    await mo.page.keyboard.type('Answered')
    await mo.page.getByRole('button', { name: 'Reply' }).click()

    // Live, over the stream: kit's bell lights; mo's does not.
    await expect(nav.getByRole('button', { name: 'Notifications, unread' })).toBeVisible()
    await expect(
      mo.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Notifications', exact: true }),
    ).toBeVisible()

    // Looking at the page reads nothing: the dot stays, and so does New, across a reload.
    await nav.getByRole('button', { name: 'Notifications, unread' }).click()
    await expect(kit.page).toHaveURL(/\/notifications$/)
    await expect(kit.page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    const row = kit.page.getByRole('button', { name: `${mo.username} commented on your post, new` })
    await expect(row).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications, unread' })).toBeVisible()
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: 'New' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications, unread' })).toBeVisible()

    // Opening the notification reads it: the post opens, the dot goes, and back on the page it is under Earlier.
    await row.click()
    await expect(kit.page).toHaveURL(/\/p\/[0-9a-f-]+$/)
    await expect(kit.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await kit.page.goBack()
    await expect(kit.page.getByRole('heading', { name: 'Earlier' })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'New' })).toHaveCount(0)
    await expect(kit.page.getByRole('button', { name: `${mo.username} commented on your post` })).toBeVisible()

    // Being added to a room arrives while I am looking: under New, unread, so the bell lights even here.
    const name = uniq('Wool')
    const room = await boss.context.request.post('/api/groups', { data: { kind: 'group', name, mode: 'both' } })
    const gid = ((await room.json()) as { id: string }).id
    const me = (await (await kit.context.request.get('/api/me')).json()) as { id: string }
    await boss.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: me.id } })
    const added = kit.page.getByRole('button', { name: `raphael added you to ${name}, new` })
    await expect(added).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'New' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications, unread' })).toBeVisible()

    // Clearing takes the opened ones for good; the unopened one stays, and a reload agrees.
    await kit.page.getByRole('button', { name: 'Clear' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Earlier' })).toHaveCount(0)
    await expect(kit.page.getByRole('button', { name: `${mo.username} commented on your post` })).toHaveCount(0)
    await expect(added).toBeVisible()
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: 'New' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `raphael added you to ${name}, new` })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `${mo.username} commented on your post` })).toHaveCount(0)
    await kit.page.getByRole('button', { name: `raphael added you to ${name}, new` }).click()
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await expect(kit.page).toHaveURL(new RegExp(`/r/${gid}$`))
    await expect(kit.page.getByRole('heading', { name })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
    await boss.context.close()
  })

  test('a message in a conversation lights the bell, and reading the conversation reads it, by either door', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page, '/people')
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    const me = (await (await kit.context.request.get('/api/me')).json()) as { id: string }
    const dm = await mo.context.request.post('/api/groups', { data: { kind: 'dm', members: [me.id] } })
    const gid = ((await dm.json()) as { id: string }).id
    await mo.context.request.post(`/api/groups/${gid}/messages`, { data: { body_html: '<p>hello kit</p>' } })

    // Over the event stream: the bell gets its dot, and the conversation gets a dot under Messages.
    await expect(nav.getByRole('button', { name: 'Notifications, unread' })).toBeVisible()
    await expect(nav.getByRole('button', { name: `${mo.username}, unread` })).toBeVisible()
    // Opening the conversation marks the notification read: the bell's dot goes, and the row moves to Earlier.
    await nav.getByRole('button', { name: `${mo.username}, unread` }).click()
    await expect(kit.page.getByText('hello kit')).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await nav.getByRole('button', { name: 'Notifications', exact: true }).click()
    await expect(kit.page.getByRole('heading', { name: 'Earlier' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `${mo.username} messaged you` })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'New' })).toHaveCount(0)

    // The other path: a new message creates a new row. Opening it from the notifications page opens the conversation and marks it read.
    await mo.context.request.post(`/api/groups/${gid}/messages`, { data: { body_html: '<p>still there?</p>' } })
    const row = kit.page.getByRole('button', { name: `${mo.username} messaged you, new` })
    await expect(row).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications, unread' })).toBeVisible()
    await row.click()
    await expect(kit.page).toHaveURL(new RegExp(`/r/${gid}$`))
    await expect(kit.page.getByText('still there?')).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await expect(nav.getByRole('button', { name: mo.username, exact: true })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })

  test('@phone the tab bar bell carries the dot and opens the page', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    const tabs = kit.page.locator('nav').last()
    await expect(tabs.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    const root = '00000000-0000-7000-8000-000000000000'
    const post = await kit.context.request.post(`/api/groups/${root}/posts`, { data: { body_html: '<p>phone</p>' } })
    const pid = ((await post.json()) as { id: string }).id
    await mo.context.request.post(`/api/posts/${pid}/comments`, { data: { body_html: '<p>yes</p>' } })
    await tabs.getByRole('button', { name: 'Notifications, unread' }).click()
    await expect(kit.page).toHaveURL(/\/notifications$/)
    await expect(kit.page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `${mo.username} commented on your post, new` })).toBeVisible()
    // The page alone reads nothing: the tab keeps its dot until the notification is opened.
    await expect(tabs.getByRole('button', { name: 'Notifications, unread' })).toHaveAttribute('aria-current', 'page')
    await kit.context.close()
    await mo.context.close()
  })
})
