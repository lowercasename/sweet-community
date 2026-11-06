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

    // Looking puts it out, and that holds across a reload.
    await nav.getByRole('button', { name: 'Notifications, unread' }).click()
    await expect(kit.page).toHaveURL(/\/notifications$/)
    await expect(kit.page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    const row = kit.page.getByRole('button', { name: `${mo.username} commented on your post, new` })
    await expect(row).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    // Seen before this visit: under Earlier now.
    await expect(kit.page.getByRole('heading', { name: 'Earlier' })).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'New' })).toHaveCount(0)
    await expect(kit.page.getByRole('button', { name: `${mo.username} commented on your post` })).toBeVisible()

    // The comment opens its post; coming back, the page is a fresh visit.
    await kit.page.getByRole('button', { name: `${mo.username} commented on your post` }).click()
    await expect(kit.page).toHaveURL(/\/p\/[0-9a-f-]+$/)
    await expect(kit.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
    await kit.page.goBack()
    await expect(kit.page.getByRole('heading', { name: 'Earlier' })).toBeVisible()

    // Being added to a room arrives while I am looking: under New, read as it lands, so the bell stays quiet.
    const name = uniq('Wool')
    const room = await boss.context.request.post('/api/groups', { data: { kind: 'group', name, mode: 'both' } })
    const gid = ((await room.json()) as { id: string }).id
    const me = (await (await kit.context.request.get('/api/me')).json()) as { id: string }
    await boss.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: me.id } })
    const added = kit.page.getByRole('button', { name: `raphael added you to ${name}, new` })
    await expect(added).toBeVisible()
    await expect(kit.page.getByRole('heading', { name: 'New' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()

    // Clearing takes the earlier ones for good; the new one stays, and a reload agrees (it is Earlier by then).
    await kit.page.getByRole('button', { name: 'Clear' }).click()
    await expect(kit.page.getByRole('heading', { name: 'Earlier' })).toHaveCount(0)
    await expect(kit.page.getByRole('button', { name: `${mo.username} commented on your post` })).toHaveCount(0)
    await expect(added).toBeVisible()
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: 'Earlier' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `raphael added you to ${name}` })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: `${mo.username} commented on your post` })).toHaveCount(0)
    await kit.page.getByRole('button', { name: `raphael added you to ${name}` }).click()
    await expect(kit.page).toHaveURL(new RegExp(`/r/${gid}$`))
    await expect(kit.page.getByRole('heading', { name })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
    await boss.context.close()
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
    await expect(tabs.getByRole('button', { name: 'Notifications', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await kit.context.close()
    await mo.context.close()
  })
})
