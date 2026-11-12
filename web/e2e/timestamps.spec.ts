import { execFileSync } from 'node:child_process'
import { expect, member, open, owner, ROOT, test } from './helpers'

for (const suffix of ['', ' @phone']) {
  test(`timestamps fit across the product${suffix}`, async ({ browser }, info) => {
    const kit = await member(browser, info, 'longusername'.repeat(2))
    const mo = await member(browser, info, 'anotherlongusername')
    const boss = await owner(browser, info)
    const uid = (await (await kit.context.request.get('/api/me')).json()).id
    const other = (await (await mo.context.request.get('/api/me')).json()).id
    const post = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: { body_html: '<p>Timestamp layout examples</p>' },
    })
    expect(post.status()).toBe(201)
    const pid = (await post.json()).id
    const comment = await mo.context.request.post(`/api/posts/${pid}/comments`, {
      data: { body_html: '<p>A comment with a long timestamp</p>' },
    })
    expect(comment.status()).toBe(201)
    const cid = (await comment.json()).id
    const conversation = await mo.context.request.post('/api/groups', { data: { kind: 'dm', members: [uid] } })
    expect(conversation.status()).toBe(201)
    const gid = (await conversation.json()).id
    const room = await kit.context.request.post('/api/groups', { data: { name: 'Timestamp examples', mode: 'posts' } })
    expect(room.status()).toBe(201)
    const rid = (await room.json()).id
    expect((await kit.context.request.post(`/api/groups/${rid}/members`, { data: { user_id: other } })).status()).toBe(
      201,
    )
    const message = await mo.context.request.post(`/api/groups/${gid}/messages`, {
      data: { body_html: '<p>A conversation message</p>' },
    })
    expect(message.status()).toBe(201)
    expect(
      (
        await mo.context.request.post('/api/reports', { data: { kind: 'post', id: pid, reason: 'Example report' } })
      ).status(),
    ).toBe(204)
    expect((await boss.context.request.post('/api/invites')).status()).toBe(201)

    // Give only this fixture old dates in the disposable browser-test database.
    execFileSync('python3', [
      '-I',
      '-c',
      `import sqlite3, sys
with sqlite3.connect('../data/e2e.db') as db:
    at = 1764513120000
    db.execute('UPDATE posts SET created_at = ?, edited_at = ? WHERE id = ?', (at, at + 60000, sys.argv[1]))
    db.execute('UPDATE comments SET created_at = ?, edited_at = ? WHERE id = ?', (at, at + 60000, sys.argv[2]))
    db.execute('UPDATE notifications SET created_at = ? WHERE user_id = ?', (at, sys.argv[3]))
    db.execute('UPDATE memberships SET joined_at = ? WHERE user_id IN (?, ?)', (at, sys.argv[3], sys.argv[4]))
    db.execute('UPDATE messages SET created_at = ? WHERE group_id = ?', (at, sys.argv[5]))
    db.execute('UPDATE reports SET created_at = ? WHERE post_id = ?', (at, sys.argv[1]))`,
      pid,
      cid,
      uid,
      other,
      gid,
    ])

    for (const [person, path, name] of [
      [kit, `/p/${pid}`, 'post-and-comments'],
      [kit, '/notifications', 'notifications'],
      [kit, '/conversations', 'conversations'],
      [kit, '/search?q=Timestamp', 'search'],
      [kit, `/u/${kit.username}`, 'profile'],
      [kit, `/r/${rid}/members`, 'members'],
      [boss, '/people', 'people-and-invites'],
      [boss, '/community', 'reports'],
    ] as const) {
      await open(person.page, path)
      await expect(person.page.locator('time').first()).toBeVisible()
      const overflow = await person.page.locator('time:visible').evaluateAll((times) =>
        times
          .filter((time) => {
            const rect = time.getBoundingClientRect()
            return rect.left < 0 || rect.right > window.innerWidth
          })
          .map((time) => time.textContent),
      )
      expect(overflow, name).toEqual([])
      if (name === 'notifications' || name === 'conversations') {
        const label = name === 'notifications' ? `${mo.username} messaged you` : mo.username
        const subject = (await person.page.getByText(label, { exact: true }).last().boundingBox())!
        const time = (await person.page.locator('time').first().boundingBox())!
        expect(time.y).toBeGreaterThanOrEqual(subject.y + subject.height)
      }
      await person.page.screenshot({ path: info.outputPath(`${name}.png`) })
      if (name === 'post-and-comments') {
        await person.page.getByRole('button', { name: kit.username, exact: true }).last().click()
        await expect(person.page.getByRole('dialog', { name: `About ${kit.username}` }).locator('time')).toBeVisible()
        await person.page.screenshot({ path: info.outputPath('person-card.png') })
      }
      if (name === 'people-and-invites') {
        await person.page.getByRole('listitem').filter({ hasText: kit.username }).scrollIntoViewIfNeeded()
        await person.page.screenshot({ path: info.outputPath('people.png') })
      }
    }
    await kit.context.close()
    await mo.context.close()
    await boss.context.close()
  })
}
