import { anyView, article, expect, member, open, prepare, ROOT, test, uniq } from './helpers'

for (const suffix of ['', ' @phone']) {
  test(`repeated updates keep comment counts and unread indicators correct${suffix}`, async ({ browser }, info) => {
    const kit = await member(browser, info, 'counts')
    const mo = await member(browser, info, 'writer')
    try {
      // Deliver each content event twice to the real app.
      await kit.context.addInitScript(() => {
        const add = EventSource.prototype.addEventListener
        const repeated = new Set([
          'post',
          'post_delete',
          'comment',
          'comment_delete',
          'message',
          'message_delete',
          'notification',
        ])
        EventSource.prototype.addEventListener = function (type, listener, options) {
          if (repeated.has(type) && typeof listener === 'function') {
            return add.call(
              this,
              type,
              (event: Event) => {
                listener.call(this, event)
                listener.call(this, event)
              },
              options,
            )
          }
          return add.call(this, type, listener, options)
        }
      })
      const text = uniq('Counted post ')
      const created = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
        data: { body_html: `<p>${text}</p>` },
      })
      expect(created.status()).toBe(201)
      const pid = ((await created.json()) as { id: string }).id
      await open(kit.page)
      if (suffix) await anyView(kit.page, 'Posts').click()
      const profile = await kit.context.newPage()
      await prepare(profile)
      await open(profile, `/u/${kit.username}`)
      const feedCount = article(kit.page, text).getByRole('button', { name: 'Show comments' })
      const profileCount = profile
        .locator('article:visible')
        .filter({ hasText: text })
        .getByRole('button', { name: 'Show comments' })
      await expect(feedCount).toHaveText('')
      await expect(profileCount).toHaveText('')
      const comments: string[] = []
      for (let i = 0; i < 2; i++) {
        const reply = await mo.context.request.post(`/api/posts/${pid}/comments`, {
          data: { body_html: '<p>Reply</p>' },
        })
        expect(reply.status()).toBe(201)
        comments.push(((await reply.json()) as { id: string }).id)
      }
      await expect(feedCount).toHaveText('2')
      await expect(profileCount).toHaveText('2')
      await expect(kit.page.getByRole('button', { name: 'Notifications, unread', exact: true })).toBeVisible()
      // Neither page has loaded the notifications list. Reading both notifications must still clear the dot.
      const notifications = (
        (await (await kit.context.request.get('/api/notifications')).json()) as { notifications: { id: string }[] }
      ).notifications
      expect(notifications).toHaveLength(2)
      for (const n of notifications)
        expect((await kit.context.request.put(`/api/notifications/${n.id}/read`)).ok()).toBeTruthy()
      await expect(kit.page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
      for (const [i, id] of comments.entries()) {
        expect((await mo.context.request.delete(`/api/comments/${id}`)).ok()).toBeTruthy()
        const count = i === 0 ? '1' : ''
        await expect(feedCount).toHaveText(count)
        await expect(profileCount).toHaveText(count)
      }
      await profile.close()

      const roomName = uniq('Unread room ')
      const room = await kit.context.request.post('/api/groups', { data: { name: roomName } })
      expect(room.status()).toBe(201)
      const gid = ((await room.json()) as { id: string }).id
      const uid = ((await (await mo.context.request.get('/api/me')).json()) as { id: string }).id
      expect((await kit.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: uid } })).status()).toBe(
        201,
      )
      await open(kit.page, suffix ? '/menu' : '/people')
      const unreadPost = await mo.context.request.post(`/api/groups/${gid}/posts`, {
        data: { body_html: '<p>Unread post</p>' },
      })
      expect(unreadPost.status()).toBe(201)
      const postID = ((await unreadPost.json()) as { id: string }).id
      const unreadMessage = await mo.context.request.post(`/api/groups/${gid}/messages`, {
        data: { body_html: '<p>Unread message</p>' },
      })
      expect(unreadMessage.status()).toBe(201)
      const messageID = ((await unreadMessage.json()) as { id: string }).id
      await expect(kit.page.getByRole('button', { name: `${roomName}, unread`, exact: true })).toBeVisible()
      expect((await mo.context.request.delete(`/api/posts/${postID}`)).ok()).toBeTruthy()
      expect((await mo.context.request.delete(`/api/messages/${messageID}`)).ok()).toBeTruthy()
      await expect(kit.page.getByRole('button', { name: roomName, exact: true })).toBeVisible()
      await expect(kit.page.getByRole('button', { name: `${roomName}, unread`, exact: true })).toHaveCount(0)
    } finally {
      await kit.context.close()
      await mo.context.close()
    }
  })
}
