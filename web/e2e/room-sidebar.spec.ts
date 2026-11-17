import { anyView, expect, member, open, ROOT, test, uniq } from './helpers'

for (const tag of ['@dev', '@phone'])
  test(tag + ' room stars save shortcuts and quiet rooms still show unread dots', async ({ browser }, info) => {
    const owner = await member(browser, info, 'roomowner')
    const reader = await member(browser, info, 'roomreader')
    const phone = !!info.project.use.isMobile
    if (phone) await reader.page.setViewportSize({ width: 360, height: 800 })
    const name = uniq('Room ').padEnd(40, 'x')
    const room = await (await owner.context.request.post('/api/groups', { data: { name, visibility: 'open' } })).json()
    await open(reader.page, '/rooms')
    await expect(reader.page.getByRole('heading', { name: 'Browse Rooms', exact: true })).toBeVisible()
    await reader.page.getByRole('textbox', { name: 'Search rooms' }).fill(name)
    await reader.page.screenshot({ path: info.outputPath('browse-rooms.png'), animations: 'disabled' })
    await reader.page.getByRole('button', { name, exact: true }).click()
    const star = reader.page.getByRole('button', { name: 'Add to sidebar', exact: true })
    await expect(star).toHaveAttribute('aria-pressed', 'false')
    const second = await reader.context.newPage()
    await open(second, `/r/${room.id}`)
    await expect(second.getByRole('button', { name: 'Add to sidebar', exact: true })).toBeVisible()
    await reader.page.route(`**/api/groups/${room.id}/sidebar`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not save shortcut' }),
      }),
    )
    await star.click()
    await expect(reader.page.getByRole('dialog', { name: 'Could not save shortcut' })).toBeVisible()
    await reader.page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(star).toHaveAttribute('aria-pressed', 'false')
    await reader.page.unroute(`**/api/groups/${room.id}/sidebar`)
    await star.click()
    await expect(second.getByRole('button', { name: 'Remove from sidebar', exact: true })).toBeVisible()
    await second.close()
    await expect(reader.page.getByRole('button', { name: 'Remove from sidebar', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(reader.page).toHaveURL(new RegExp(`/r/${room.id}$`))
    await reader.page.reload()
    await expect(reader.page.getByRole('button', { name: 'Remove from sidebar', exact: true })).toBeVisible()
    if (phone) await anyView(reader.page, 'Chat').click()
    await reader.page.getByRole('button', { name: 'Chat notifications: Mentions and replies', exact: true }).click()
    await reader.page.getByRole('menuitemradio', { name: 'Off', exact: true }).click()
    await expect(reader.page.getByRole('button', { name: 'Chat notifications: Off', exact: true })).toBeEnabled()
    await expect(reader.page.getByText('Chat', { exact: true })).toHaveCount(0)
    await reader.page.screenshot({ path: info.outputPath('room-star.png'), animations: 'disabled' })
    expect(await reader.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      reader.page.viewportSize()!.width,
    )
    await open(reader.page, phone ? '/menu' : '/people')
    await owner.context.request.post(`/api/groups/${room.id}/messages`, {
      data: { body_html: '<p>Unread quiet chat</p>' },
    })
    await expect(reader.page.getByRole('button', { name: `${name}, unread`, exact: true })).toBeVisible()
    const ns = await (await reader.context.request.get('/api/notifications')).json()
    expect(ns.notifications.filter((n: { group_id: string }) => n.group_id === room.id)).toHaveLength(0)
    await reader.page.screenshot({ path: info.outputPath('room-dot.png'), animations: 'disabled' })
    await reader.page.getByRole('button', { name: `${name}, unread`, exact: true }).click()
    if (phone) await anyView(reader.page, 'Chat').click()
    await expect(reader.page.getByText('Unread quiet chat', { exact: true })).toBeVisible()
    await reader.page.getByRole('button', { name: 'Remove from sidebar', exact: true }).click()
    await expect(reader.page.getByRole('button', { name: 'Add to sidebar', exact: true })).toBeVisible()
    await expect(reader.page).toHaveURL(new RegExp(`/r/${room.id}$`))
    await expect
      .poll(async () => (await (await reader.context.request.get(`/api/groups/${ROOT}/notifications`)).json()).mode)
      .toBe('all')
    await owner.context.close()
    await reader.context.close()
  })
