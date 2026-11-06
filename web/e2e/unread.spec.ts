import { expect, member, open, owner, test, uniq } from './helpers'

const ROOT = '00000000-0000-7000-8000-000000000000'

test.describe('chat unread', () => {
  test('messages I have not seen count on their room in the nav, and clear when I look', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const boss = await owner(browser, testInfo)
    // Kit is elsewhere: the root's chat is mounted behind People, not watched.
    await open(kit.page, '/people')
    await open(mo.page)
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toBeVisible()

    const second = uniq('second word ')
    await mo.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: '<p>first word</p>' } })
    await mo.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: `<p>${second}</p>` } })
    const home = nav.getByRole('button', { name: 'Home, 2 unread' })
    await expect(home).toBeVisible()
    await expect(home).toContainText('2')
    // Mo's own words are not unread to mo.
    await expect(
      mo.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Home', exact: true }),
    ).toBeVisible()

    // Looking is reading, and it holds across a reload.
    await home.click()
    await expect(kit.page.getByText(second)).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toBeVisible()
    await kit.page.reload()
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toBeVisible()

    // A room: joining counts from the join; a message after it counts; opening the room clears it.
    const name = uniq('Wool')
    const room = await boss.context.request.post('/api/groups', { data: { kind: 'group', name, mode: 'both' } })
    const gid = ((await room.json()) as { id: string }).id
    await boss.context.request.post(`/api/groups/${gid}/messages`, { data: { body_html: '<p>history</p>' } })
    for (const p of [kit, mo]) {
      const me = (await (await p.context.request.get('/api/me')).json()) as { id: string }
      await boss.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: me.id } })
    }
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible()
    const fresh = uniq('fresh wool ')
    await mo.context.request.post(`/api/groups/${gid}/messages`, { data: { body_html: `<p>${fresh}</p>` } })
    const item = nav.getByRole('button', { name: `${name}, 1 unread` })
    await expect(item).toBeVisible()
    await item.click()
    await expect(kit.page.getByText(fresh)).toBeVisible()
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
    await boss.context.close()
  })

  test('@phone the Chat tab carries a dot while the room has unread, and the menu counts it', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    const tabs = kit.page.locator('nav').last()
    await tabs.getByRole('button', { name: 'Posts' }).click()
    const word = uniq('phone word ')
    await mo.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: `<p>${word}</p>` } })
    await expect(tabs.getByRole('button', { name: 'Chat, unread' })).toBeVisible()
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page.getByRole('button', { name: 'Home, 1 unread' })).toBeVisible()
    await tabs.getByRole('button', { name: 'Chat, unread' }).click()
    await expect(kit.page.getByText(word)).toBeVisible()
    await expect(tabs.getByRole('button', { name: 'Chat', exact: true })).toBeVisible()
    // Read is read: going back to Posts does not bring the dot back, nor does a reload.
    await tabs.getByRole('button', { name: 'Posts' }).click()
    await kit.page.waitForTimeout(1500)
    await expect(tabs.getByRole('button', { name: 'Chat', exact: true })).toBeVisible()
    await kit.page.reload()
    await expect(tabs.getByRole('button', { name: 'Chat', exact: true })).toBeVisible()
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page.getByRole('button', { name: 'Home', exact: true })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })
})
