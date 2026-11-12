import { expect, member, open, owner, test, uniq, view, ROOT } from './helpers'

test.describe('chat unread', () => {
  test('unseen messages mark their room as unread in the nav, and the mark is cleared when the messages are viewed', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const boss = await owner(browser, testInfo)
    // Kit is on another page. The root group's chat is mounted behind People, but it is not being viewed.
    await open(kit.page, '/people')
    await open(mo.page)
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toBeVisible()

    const second = uniq('second word ')
    await mo.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: '<p>first word</p>' } })
    await mo.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: `<p>${second}</p>` } })
    const home = nav.getByRole('button', { name: 'Home, unread' })
    await expect(home).toBeVisible()
    await expect(home).not.toContainText('2')
    // Mo's own messages are not unread for mo.
    await expect(
      mo.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Home', exact: true }),
    ).toBeVisible()

    // Viewing the chat marks its messages read, and they stay read after a reload.
    await home.click()
    await expect(kit.page.getByText(second)).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toBeVisible()
    await kit.page.reload()
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toBeVisible()

    // A room. Unread messages are counted from the time the user joined. A message sent after the join is unread,
    // and opening the room clears it.
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
    const item = nav.getByRole('button', { name: `${name}, unread` })
    await expect(item).toBeVisible()
    await item.click()
    await expect(kit.page.getByText(fresh)).toBeVisible()
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible()

    // A new post also marks the room as unread. While the posts pane is collapsed, the posts rail shows the dot,
    // and opening the pane marks the post read.
    await kit.page.getByRole('separator', { name: 'Resize panes' }).focus()
    await kit.page.keyboard.press('Home')
    await expect(kit.page.getByRole('button', { name: 'Show posts', exact: true })).toBeVisible()
    await mo.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: '<p>a post of wool</p>' } })
    await expect(kit.page.getByRole('button', { name: 'Show posts, unread' })).toBeVisible()
    await expect(nav.getByRole('button', { name: `${name}, unread` })).toBeVisible()
    await kit.page.getByRole('button', { name: 'Show posts, unread' }).click()
    await expect(kit.page.getByRole('button', { name: 'Show posts, unread' })).toHaveCount(0)
    await expect(nav.getByRole('button', { name, exact: true })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
    await boss.context.close()
  })

  test('@phone unread messages show a dot on the Chat view button, on the Home tab while another page is open, and on Home in the menu', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    const tabs = kit.page.locator('nav').last()
    await view(kit.page, 'Posts').click()
    const word = uniq('phone word ')
    await mo.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: `<p>${word}</p>` } })
    await expect(view(kit.page, 'Chat, unread')).toBeVisible()
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(tabs.getByRole('button', { name: 'Home, unread' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: 'Home, unread' }).first()).toBeVisible()
    await tabs.getByRole('button', { name: 'Home, unread' }).click()
    await view(kit.page, 'Chat, unread').click()
    await expect(kit.page.getByText(word)).toBeVisible()
    await expect(view(kit.page, 'Chat')).toBeVisible()
    // Read messages stay read. Going back to Posts does not bring the dot back, and neither does a reload.
    await view(kit.page, 'Posts').click()
    await kit.page.waitForTimeout(1500)
    await expect(view(kit.page, 'Chat')).toBeVisible()
    await kit.page.reload()
    await expect(view(kit.page, 'Chat')).toBeVisible()
    await tabs.getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page.getByRole('button', { name: 'Home', exact: true }).first()).toBeVisible()
    // The Posts view button in the bar has its own dot, which is shown while the Chat view is open.
    await tabs.getByRole('button', { name: 'Home' }).click()
    await view(kit.page, 'Chat').click()
    await mo.context.request.post(`/api/groups/${ROOT}/posts`, { data: { body_html: `<p>${uniq('phone post ')}</p>` } })
    await expect(view(kit.page, 'Posts, unread')).toBeVisible()
    await view(kit.page, 'Posts, unread').click()
    await expect(view(kit.page, 'Posts')).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })
})

test.describe('comment unread', () => {
  test("another user's comment on your post shows a dot on its comments button, and reading the comments clears it", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const text = uniq('A riddle ')
    const created = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: { body_html: `<p>${text}</p>` },
    })
    const post = (await created.json()) as { id: string }
    await open(kit.page)
    const card = kit.page.getByRole('article').filter({ hasText: text })
    await expect(card.getByRole('button', { name: 'Show comments', exact: true })).toBeVisible()

    // Mo's comment arrives while kit is on the page.
    const reply = uniq('Teeth? ')
    await mo.context.request.post(`/api/posts/${post.id}/comments`, { data: { body_html: `<p>${reply}</p>` } })
    const unread = card.getByRole('button', { name: 'Show comments, unread' })
    await expect(unread).toBeVisible()

    // Reading the reply clears the dot. The closed comments then show no dot, also after a reload.
    await unread.click()
    await expect(card.getByText(reply)).toBeVisible()
    await card.getByRole('button', { name: 'Hide comments', exact: true }).click()
    await expect(card.getByRole('button', { name: 'Show comments', exact: true })).toBeVisible()
    await kit.page.reload()
    await expect(card.getByRole('button', { name: 'Show comments', exact: true })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })
})
