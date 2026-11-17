import { anyView, article, expect, member, open, owner, pick, png, ROOT, test, uniq } from './helpers'

for (const tag of ['@dev', '@phone']) {
  test(`pinned posts appear once above newer posts and update live ${tag}`, async ({ browser }, info) => {
    const kit = await member(browser, info, 'kit')
    const mo = await member(browser, info, 'mo')
    await kit.page.setViewportSize({ width: info.project.use.isMobile ? 360 : 1280, height: 850 })
    await kit.context.request.put('/api/me/username', { data: { username: uniq('a'.repeat(26)).slice(0, 32) } })
    const room = await kit.context.request.post('/api/groups', {
      data: { name: 'A room with a forty character long name!!', mode: 'both' },
    })
    expect(room.status()).toBe(201)
    const gid = (await room.json()).id
    const uid = (await (await mo.context.request.get('/api/me')).json()).id
    expect((await kit.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: uid } })).status()).toBe(
      201,
    )
    const title = uniq('Pinned announcement ')
    const created = await kit.context.request.post(`/api/groups/${gid}/posts`, {
      data: { body_html: `<p>${title}</p>` },
    })
    const id = (await created.json()).id
    for (let i = 0; i < 22; i++)
      await kit.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: `<p>Later post ${i}</p>` } })
    await open(mo.page, `/r/${gid}`)
    if (info.project.use.isMobile) await anyView(mo.page, 'Posts').click()
    await expect(article(mo.page, title)).toHaveCount(0)
    await open(kit.page, `/p/${id}`)
    await pick(kit.page, article(kit.page, title), 'Post options', 'Pin post')
    await expect(article(mo.page, title).getByText('Pinned', { exact: true })).toBeVisible()
    await kit.page.screenshot({ path: info.outputPath('pinned-post-page.png'), scale: 'css' })
    await expect(mo.page.locator('article').first()).toContainText(title)
    await open(kit.page, `/r/${gid}`)
    if (info.project.use.isMobile) await anyView(kit.page, 'Posts').click()
    await expect(kit.page.locator('article').first()).toContainText(title)
    await expect(article(kit.page, title).locator(':scope > div').first()).toHaveText('Pinned')
    const strip = await article(kit.page, title).locator(':scope > div').first().boundingBox()
    const pin = await article(kit.page, title).getByText('Pinned', { exact: true }).locator('svg').boundingBox()
    expect(Math.abs(strip!.y + strip!.height / 2 - pin!.y - pin!.height / 2)).toBeLessThan(1)
    await kit.page.screenshot({ path: info.outputPath('pinned-feed.png'), scale: 'css' })
    await kit.page.getByRole('button', { name: /load more/i }).click()
    await expect(kit.page.locator('article').filter({ hasText: title })).toHaveCount(1)
    await pick(mo.page, article(mo.page, title), 'Post options', 'Report')
    await mo.page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await pick(kit.page, article(kit.page, title), 'Post options', 'Unpin post')
    await expect(article(kit.page, title).getByText('Pinned', { exact: true })).toHaveCount(0)
    await expect(kit.page.locator('article').first()).toContainText('Later post 21')
    await expect(article(mo.page, title)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test(`Home pins stay separate from open-room pins ${tag}`, async ({ browser }, info) => {
    const staff = await owner(browser, info)
    const kit = await member(browser, info)
    await kit.page.setViewportSize({ width: info.project.use.isMobile ? 360 : 1280, height: 850 })
    const room = await kit.context.request.post('/api/groups', {
      data: { name: uniq('Open pin room '), visibility: 'open' },
    })
    const gid = (await room.json()).id
    const roomTitle = uniq('Pinned within the room ')
    const rp = await kit.context.request.post(`/api/groups/${gid}/posts`, {
      data: { body_html: `<p>${roomTitle}</p>` },
    })
    const rid = (await rp.json()).id
    const homeTitle = uniq('Home announcement ')
    const hp = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: { body_html: `<p>${homeTitle}</p>` },
    })
    const hid = (await hp.json()).id
    const latest = uniq('Newest regular post ')
    await kit.context.request.post(`/api/groups/${ROOT}/posts`, { data: { body_html: `<p>${latest}</p>` } })
    try {
      await kit.context.request.put(`/api/posts/${rid}/pin`, { data: { pinned: true } })
      await staff.context.request.put(`/api/posts/${hid}/pin`, { data: { pinned: true } })
      await open(kit.page)
      if (info.project.use.isMobile) await anyView(kit.page, 'Posts').click()
      await expect(kit.page.locator('article.block-post').first()).toContainText(homeTitle)
      await expect(kit.page.locator('article.block-post').nth(1)).toContainText(latest)
      await expect(article(kit.page, roomTitle)).toContainText('Pinned in Open pin room')
      const header = article(kit.page, roomTitle)
      const label = header.getByText('Pinned in', { exact: true })
      const icon = label.locator('svg')
      const roomLink = header.getByRole('link', { name: /^Open pin room/ })
      const center = async (element: typeof label) => {
        const box = await element.boundingBox()
        expect(box).not.toBeNull()
        return box!.y + box!.height / 2
      }
      expect(Math.abs((await center(icon)) - (await center(roomLink)))).toBeLessThan(1)
      await kit.page.screenshot({ path: info.outputPath('home-pins.png'), scale: 'css' })
      await open(kit.page, `/u/${kit.username}`)
      await expect(article(kit.page, homeTitle)).toContainText('Pinned')
      await kit.page.screenshot({ path: info.outputPath('profile-pins.png'), scale: 'css' })
      await open(kit.page, `/r/${gid}`)
      await expect(kit.page.locator('article.block-post').first()).toContainText(roomTitle)
      await expect(article(kit.page, homeTitle)).toHaveCount(0)
      const moved = await kit.context.request.put(`/api/posts/${rid}`, {
        data: { body_html: `<p>${roomTitle}</p>`, group_id: ROOT },
      })
      expect(moved.status()).toBe(200)
      await expect(article(kit.page, roomTitle)).toHaveCount(0)
      await open(kit.page)
      await expect(article(kit.page, roomTitle).getByText(/^Pinned (in|on)/)).toHaveCount(0)
    } finally {
      await staff.context.request.put(`/api/posts/${hid}/pin`, { data: { pinned: false } })
      await kit.context.close()
      await staff.context.close()
    }
  })

  test(`chat edits preserve images, quotes and the new-message draft ${tag}`, async ({ browser }, info) => {
    const kit = await member(browser, info, 'kit')
    const mo = await member(browser, info, 'mo')
    await kit.page.setViewportSize({ width: info.project.use.isMobile ? 360 : 1280, height: 850 })
    await kit.context.request.put('/api/me/username', { data: { username: uniq('a'.repeat(26)).slice(0, 32) } })
    const room = await kit.context.request.post('/api/groups', { data: { name: uniq('Editing '), mode: 'both' } })
    const gid = (await room.json()).id
    const uid = (await (await mo.context.request.get('/api/me')).json()).id
    await kit.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: uid } })
    const upload = await kit.context.request.post('/api/images', {
      multipart: { file: { name: 'photo.png', mimeType: 'image/png', buffer: png(600, 400) } },
    })
    expect(upload.status()).toBe(201)
    const image = await upload.json()
    const body = `<img src="${image.url}" data-image-id="${image.id}" alt="A photograph" width="600" height="400"><p>Original text</p>`
    const created = await kit.context.request.post(`/api/groups/${gid}/messages`, { data: { body_html: body } })
    const id = (await created.json()).id
    const replied = await mo.context.request.post(`/api/groups/${gid}/messages`, {
      data: { body_html: '<p>A reply</p>', reply_to: id },
    })
    const replyId = (await replied.json()).id
    await open(kit.page, `/r/${gid}`)
    await open(mo.page, `/r/${gid}`)
    if (info.project.use.isMobile) {
      await anyView(kit.page, 'Chat').click()
      await anyView(mo.page, 'Chat').click()
    }
    const message = kit.page.locator(`[id="message-${id}"]`)
    const remote = mo.page.locator(`[id="message-${id}"]`)
    const composer = kit.page.locator('footer .ProseMirror')
    await composer.fill('An unsent new message')
    const edit = async () => {
      if (info.project.use.isMobile) {
        if ((await message.getAttribute('data-selected')) === null) await message.locator('.content p').tap()
      } else await message.hover()
      await message.getByRole('button', { name: 'Message options', exact: true }).click()
      await kit.page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
    }
    await edit()
    const field = message.getByRole('textbox').first()
    await expect(message.locator('.image-card img')).toBeVisible()
    await field.locator('p').last().click()
    await kit.page.keyboard.press('End')
    await kit.page.keyboard.type(' corrected')
    await kit.page.screenshot({ path: info.outputPath('editing-message.png'), scale: 'css' })
    await message.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(remote.locator('.content')).toContainText('Original text corrected')
    await expect(remote.getByText('edited', { exact: true })).toBeVisible()
    await expect(message.getByRole('button', { name: 'Open image: A photograph', exact: true })).toBeVisible()
    await expect(composer).toHaveText('An unsent new message')
    await expect(mo.page.locator(`[id="message-${replyId}"]`)).toContainText('Original text')
    await expect(mo.page.locator(`[id="message-${replyId}"]`)).not.toContainText('corrected')
    await mo.page.reload()
    await expect(mo.page.locator(`[id="message-${replyId}"]`)).not.toContainText('corrected')
    await edit()
    await field.locator('p').last().fill('Cancelled edit')
    await message.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(message.locator('.content')).toContainText('Original text corrected')
    await edit()
    await field.locator('p').last().fill('Saved after retry')
    await kit.page.route(`**/api/messages/${id}`, (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not save message' }),
      }),
    )
    await message.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(message.getByRole('alert')).toContainText('Could not save message')
    await expect(field.locator('p').last()).toHaveText('Saved after retry')
    await kit.page.screenshot({ path: info.outputPath('edit-error.png'), scale: 'css' })
    await kit.page.unroute(`**/api/messages/${id}`)
    await message.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(remote.locator('.content')).toHaveText('Saved after retry')
    await expect(message.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
    await expect(message.locator('.content')).toHaveText('Saved after retry')
    await kit.page.screenshot({ path: info.outputPath('edited-message.png'), scale: 'css' })
    const dm = await kit.context.request.post('/api/groups', { data: { kind: 'dm', members: [uid] } })
    const dgid = (await dm.json()).id
    const sent = await kit.context.request.post(`/api/groups/${dgid}/messages`, {
      data: { body_html: '<p>A private message</p>' },
    })
    const mid = (await sent.json()).id
    await open(kit.page, `/r/${dgid}`)
    await open(mo.page, `/r/${dgid}`)
    const dmMessage = kit.page.locator(`[id="message-${mid}"]`)
    if (info.project.use.isMobile) await dmMessage.locator('.content p').tap()
    else await dmMessage.hover()
    await dmMessage.getByRole('button', { name: 'Message options' }).click()
    await kit.page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
    await dmMessage.getByRole('textbox').fill('A corrected private message')
    await kit.page.screenshot({ path: info.outputPath('editing-conversation.png'), scale: 'css' })
    await dmMessage.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(mo.page.locator(`[id="message-${mid}"]`)).toContainText('A corrected private message')
    await expect(mo.page.locator(`[id="message-${mid}"]`).getByText('edited', { exact: true })).toBeVisible()

    await kit.context.close()
    await mo.context.close()
  })
}
