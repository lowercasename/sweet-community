import { chatEditor, expect, member, open, owner, png, prepare, ROOT, test, uniq } from './helpers'

for (const suffix of ['', ' @phone']) {
  test(`identity changes refresh open views and removal clears old names and pictures${suffix}`, async ({
    browser,
  }, info) => {
    const o = await owner(browser, info)
    const kit = await member(browser, info, 'identity')
    try {
      const uid = ((await (await kit.context.request.get('/api/me')).json()) as { id: string }).id
      const pictures: { id: string; url: string }[] = []
      for (const rgb of [
        [200, 10, 10],
        [10, 10, 200],
      ] as [number, number, number][]) {
        const upload = await kit.context.request.post('/api/images', {
          multipart: { file: { name: 'avatar.png', mimeType: 'image/png', buffer: png(20, 20, rgb) } },
        })
        expect(upload.status()).toBe(201)
        pictures.push(await upload.json())
      }
      expect(
        (await kit.context.request.put('/api/me/picture', { data: { image_id: pictures[0].id } })).ok(),
      ).toBeTruthy()
      const room = await o.context.request.post('/api/groups', { data: { name: uniq('Identity '), mode: 'chat' } })
      expect(room.status()).toBe(201)
      const rid = ((await room.json()) as { id: string }).id
      expect((await o.context.request.post(`/api/groups/${rid}/members`, { data: { user_id: uid } })).status()).toBe(
        201,
      )
      const conversation = await o.context.request.post('/api/groups', { data: { kind: 'dm', members: [uid] } })
      expect(conversation.status()).toBe(201)
      const cid = ((await conversation.json()) as { id: string }).id
      const messageText = uniq('A message before removal ')
      const postText = uniq('A post before removal ')
      for (const group of [rid, cid]) {
        expect(
          (
            await kit.context.request.post(`/api/groups/${group}/messages`, {
              data: { body_html: `<p>${messageText}</p>` },
            })
          ).status(),
        ).toBe(201)
      }
      const post = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
        data: { body_html: `<p>${postText}</p>` },
      })
      expect(post.status()).toBe(201)
      const pid = ((await post.json()) as { id: string }).id
      const pages = [o.page]
      for (let i = 0; i < 4; i++) {
        const page = await o.context.newPage()
        await prepare(page)
        pages.push(page)
      }
      const [notices, profile, dm, chat, content] = pages
      for (const [i, path] of [
        '/notifications',
        `/u/${kit.username}`,
        `/r/${cid}`,
        `/r/${rid}`,
        `/p/${pid}`,
      ].entries()) {
        await open(pages[i], path)
      }
      await expect(
        notices.getByRole('button', { name: `${kit.username} joined the community, new`, exact: true }),
      ).toBeVisible()
      await expect(profile.locator('article:visible').getByText(postText, { exact: true })).toBeVisible()
      await expect(dm.getByRole('heading', { name: kit.username, exact: true })).toBeVisible()
      await expect(chat.getByText(`raphael added ${kit.username} to the room`, { exact: true })).toBeVisible()
      await expect(content.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
      for (const page of pages) await expect(page.locator(`img[src="${pictures[0].url}"]`).first()).toBeAttached()

      const draft = uniq('Unsent message ')
      await chatEditor(chat).fill(draft)
      expect(
        (await kit.context.request.put('/api/me/picture', { data: { image_id: pictures[1].id } })).ok(),
      ).toBeTruthy()
      for (const page of pages) {
        await expect(page.locator(`img[src="${pictures[1].url}"]`).first()).toBeAttached()
        await expect(page.locator(`img[src="${pictures[0].url}"]`)).toHaveCount(0)
      }

      await expect(chatEditor(chat)).toHaveText(draft)
      expect((await o.context.request.delete(`/api/users/${uid}`)).status()).toBe(204)
      const removed = `removed-${uid.slice(-8)}`
      await expect(
        notices.getByRole('button', { name: `${removed} joined the community, new`, exact: true }),
      ).toBeVisible()
      await expect(profile.getByText('There is no user with that name.')).toBeVisible()
      await expect(dm.getByRole('heading', { name: removed, exact: true })).toBeVisible()
      await expect(chat.getByText(`raphael added ${removed} to the room`, { exact: true })).toBeVisible()
      for (const page of pages) {
        await expect(page.locator(`img[src="${pictures[1].url}"]`)).toHaveCount(0)
        await expect(page.getByText(postText, { exact: true })).toHaveCount(0)
        await expect(page.getByText(messageText, { exact: true })).toHaveCount(0)
      }
    } finally {
      await o.context.close()
      await kit.context.close()
    }
  })
}
