import { expect, member, owner, open, test, ROOT, uniq, view } from './helpers'

for (const suffix of ['', ' @phone']) {
  test(`discussion following, grouping, reading and muting${suffix}`, async ({ browser }, info) => {
    const kit = await member(browser, info, 'longusername'.repeat(2))
    const mo = await member(browser, info, 'anotherlongusername')
    const boss = await owner(browser, info)
    const post = await (
      await boss.context.request.post(`/api/groups/${ROOT}/posts`, {
        data: { body_html: '<p>A discussion about our next gathering</p>' },
      })
    ).json()
    await kit.context.request.post(`/api/posts/${post.id}/comments`, {
      data: { body_html: '<p>I would like to come.</p>' },
    })
    await open(kit.page, '/notifications')
    for (const body of ['Let us choose a date.', 'How about Saturday?']) {
      await mo.context.request.post(`/api/posts/${post.id}/comments`, { data: { body_html: `<p>${body}</p>` } })
    }
    await expect(
      kit.page.getByRole('button', { name: `${mo.username} commented in a discussion you follow, new` }),
    ).toHaveCount(1)
    await expect(kit.page.getByText(/2 updates/)).toBeVisible()
    const second = await kit.context.newPage()
    await second.goto('/notifications')
    await open(kit.page, `/p/${post.id}`)
    await kit.page.getByText('How about Saturday?', { exact: true }).scrollIntoViewIfNeeded()
    await expect(second.getByRole('heading', { name: 'New', exact: true })).toHaveCount(0)
    const options = kit.page.getByRole('button', { name: 'Post options', exact: true })
    await options.click()
    await expect(kit.page.getByRole('menuitem', { name: 'Mute discussion', exact: true })).toBeVisible()
    await kit.page.getByRole('menuitem', { name: 'Mute discussion', exact: true }).click()
    await options.click()
    await expect(kit.page.getByRole('menuitem', { name: 'Follow discussion', exact: true })).toBeVisible()
    await expect(kit.page.getByRole('menuitem', { name: 'Mute discussion', exact: true })).toHaveCount(0)
    await kit.page.screenshot({ path: info.outputPath('muted-discussion.png'), fullPage: true })
    await mo.context.request.post(`/api/posts/${post.id}/comments`, { data: { body_html: '<p>A muted comment</p>' } })
    const notifications = await (await kit.context.request.get('/api/notifications')).json()
    expect(notifications.notifications.filter((n: { read_at: number | null }) => n.read_at === null)).toHaveLength(0)
    await kit.page.getByRole('menuitem', { name: 'Follow discussion', exact: true }).click()
    await options.click()
    await expect(kit.page.getByRole('menuitem', { name: 'Mute discussion', exact: true })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
    await boss.context.close()
  })

  test(`chat delivery controls and bulk actions preserve unread content${suffix}`, async ({ browser }, info) => {
    const kit = await member(browser, info, 'longusername'.repeat(2))
    const boss = await owner(browser, info)
    const me = await (await kit.context.request.get('/api/me')).json()
    const room = await (
      await boss.context.request.post('/api/groups', {
        data: { kind: 'group', mode: 'chat', name: uniq('A long room name for our discussion ').slice(0, 40) },
      })
    ).json()
    await boss.context.request.post(`/api/groups/${room.id}/members`, { data: { user_id: me.id } })
    await kit.context.request.delete('/api/notifications')
    await open(kit.page, `/r/${room.id}`)
    const alerts = kit.page.getByRole('button', { name: /^Chat device alerts:/ })
    await expect(alerts).toHaveAccessibleName('Chat device alerts: All messages')
    await alerts.click()
    await kit.page.getByRole('menuitemradio', { name: 'Mentions and replies' }).click()
    await expect(alerts).toHaveAccessibleName('Chat device alerts: Mentions and replies')
    await kit.page.reload()
    await expect(alerts).toHaveAccessibleName('Chat device alerts: Mentions and replies')
    await alerts.click()
    await expect(kit.page.getByRole('menuitemradio', { name: 'Mentions and replies' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(kit.page.getByRole('menu').getByText('Notifications for this chat', { exact: true })).toBeVisible()
    await expect(kit.page.getByRole('menuitemradio')).toHaveText(['All messages', 'Mentions and replies', 'Off'])
    await kit.page.screenshot({ path: info.outputPath('chat-alerts.png'), fullPage: true })
    await kit.page.keyboard.press('Escape')
    await open(kit.page, '/notifications')
    const send = async (text: string) =>
      boss.context.request.post(`/api/groups/${room.id}/messages`, { data: { body_html: `<p>${text}</p>` } })
    await send('A first message')
    await send('A second message')
    await expect(kit.page.getByText(/2 updates/)).toBeVisible()
    await kit.page.screenshot({ path: info.outputPath('unread-notifications.png'), fullPage: true })
    await kit.page.getByRole('button', { name: 'Mark all read', exact: true }).click()
    await expect(kit.page.getByRole('heading', { name: 'New', exact: true })).toHaveCount(0)
    await expect(kit.page.getByRole('heading', { name: 'Earlier', exact: true })).toBeVisible()
    await kit.page.screenshot({ path: info.outputPath('read-notifications.png'), fullPage: true })
    await send('A third message')
    await expect(kit.page.getByRole('heading', { name: 'New', exact: true })).toBeVisible()
    await kit.page.getByRole('button', { name: 'Clear all', exact: true }).click()
    await expect(kit.page.getByText('Nice and quiet in here.')).toBeVisible()
    const markers = await (await kit.context.request.get('/api/markers')).json()
    expect(markers.markers.find((m: { stream: string }) => m.stream === `chat:${room.id}`).unread).toBe(3)
    await kit.page.getByRole('combobox', { name: 'Comments on followed posts' }).selectOption('off')
    await open(kit.page, '/settings')
    await expect(kit.page.getByRole('combobox', { name: 'Comments on followed posts' })).toHaveValue('off')
    await open(kit.page, '/notifications')
    await kit.page.screenshot({ path: info.outputPath('notification-settings.png'), fullPage: true })
    await open(kit.page, `/r/${room.id}`)
    await expect(kit.page.getByText('A third message', { exact: true })).toBeVisible()
    await expect
      .poll(async () => {
        const result = await (await kit.context.request.get('/api/markers')).json()
        return result.markers.find((m: { stream: string }) => m.stream === `chat:${room.id}`).unread
      })
      .toBe(0)
    await open(kit.page)
    if (info.project.name === 'phone') await view(kit.page, 'Chat').click()
    const chatAlerts = kit.page.locator('[data-tour="chat"]').getByRole('button', { name: /^Chat device alerts:/ })
    await expect(chatAlerts).toBeVisible()
    await kit.page.screenshot({ path: info.outputPath('home-chat-controls.png'), fullPage: true })
    if (info.project.name === 'phone') await view(kit.page, 'Posts').click()
    else {
      await kit.page.getByRole('separator', { name: 'Resize panes' }).focus()
      await kit.page.keyboard.press('End')
    }
    await expect(chatAlerts).toBeHidden()
    await kit.page.screenshot({ path: info.outputPath('home-chat-collapsed.png'), fullPage: true })
    await kit.context.close()
    await boss.context.close()
  })
}
