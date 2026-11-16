import { anyView, article, expect, member, open, pick, ROOT, test, uniq } from './helpers'

for (const tag of ['@dev', '@phone'])
  test(
    tag + ' Home drafts retain their chosen open room without changing community chat',
    async ({ browser }, info) => {
      const draftText = uniq('Practice question ')
      const writer = await member(browser, info, 'writer')
      const creator = await member(browser, info, 'creator')
      const room = await (
        await creator.context.request.post('/api/groups', {
          data: { name: uniq('Open ').padEnd(40, 'x'), visibility: 'open' },
        })
      ).json()
      await open(writer.page)
      if (info.project.use.isMobile) await anyView(writer.page, 'Posts').click()
      const editor = writer.page.locator('[data-tour="posts"] .ProseMirror').first()
      await editor.fill(draftText)
      await writer.page.getByRole('button', { name: 'Post in Home', exact: true }).click()
      await expect(writer.page.getByRole('dialog').getByRole('button', { name: 'Home', exact: true })).toBeVisible()
      await writer.page.screenshot({ path: info.outputPath('home-choice.png'), animations: 'disabled', scale: 'css' })
      await writer.page.getByRole('textbox', { name: 'Search rooms' }).fill(room.name)
      const picker = await writer.page.getByRole('dialog').boundingBox()
      expect(picker!.x).toBeGreaterThanOrEqual(0)
      expect(picker!.x + picker!.width).toBeLessThanOrEqual(writer.page.viewportSize()!.width)
      await writer.page.screenshot({
        path: info.outputPath('destination-menu.png'),
        animations: 'disabled',
        scale: 'css',
      })
      await writer.page.getByRole('dialog').getByRole('button', { name: room.name, exact: true }).click()
      await expect(editor).toHaveText(draftText)
      await expect(writer.page).toHaveURL(/\/$/)
      await writer.page.reload()
      if (info.project.use.isMobile) await anyView(writer.page, 'Posts').click()
      await expect(writer.page.getByRole('button', { name: `Post in ${room.name}`, exact: true })).toBeVisible()
      await expect(editor).toHaveText(draftText)
      await writer.page.screenshot({ path: info.outputPath('home-destination.png'), animations: 'disabled' })
      await writer.page.getByRole('button', { name: 'Post', exact: true }).click()
      await expect(article(writer.page, draftText)).toContainText(`Posted in ${room.name}`)
      const posts = await (await writer.context.request.get(`/api/groups/${room.id}/posts`)).json()
      expect(posts.posts[0].body_text).toBe(draftText)
      expect(
        (await (await writer.context.request.get('/api/me/room-sidebar')).json()).rooms.find(
          (r: { group_id: string }) => r.group_id === room.id,
        ).in_sidebar,
      ).toBe(false)
      if (info.project.use.isMobile) await anyView(writer.page, 'Chat').click()
      const chatText = uniq('Community chat remains here ')
      await creator.context.request.post(`/api/groups/${ROOT}/messages`, { data: { body_html: `<p>${chatText}</p>` } })
      await expect(writer.page.getByText(chatText, { exact: true })).toBeVisible()
      await writer.context.close()
      await creator.context.close()
    },
  )

test('a deleted destination preserves the draft and requires a new choice', async ({ browser }, info) => {
  const writer = await member(browser, info, 'writer')
  const room = await (
    await writer.context.request.post('/api/groups', { data: { name: uniq('Temporary '), visibility: 'open' } })
  ).json()
  const privateRoom = await (
    await writer.context.request.post('/api/groups', { data: { name: uniq('Private '), visibility: 'private' } })
  ).json()
  await open(writer.page)
  await writer.page.getByRole('button', { name: /^Post in / }).click()
  await writer.page.getByRole('textbox', { name: 'Search rooms' }).fill(privateRoom.name)
  await expect(writer.page.getByText('No rooms found.', { exact: true })).toBeVisible()
  await writer.page.getByRole('textbox', { name: 'Search rooms' }).fill(room.name)
  await writer.page.getByRole('dialog').getByRole('button', { name: room.name, exact: true }).click()
  const editor = writer.page.locator('[data-tour="posts"] .ProseMirror').first()
  await editor.fill('Practice question')
  await writer.context.request.delete(`/api/groups/${room.id}`)
  await expect(writer.page.getByRole('button', { name: 'Choose a room', exact: true })).toBeVisible()
  await expect(writer.page.getByRole('button', { name: 'Post', exact: true })).toBeDisabled()
  await expect(editor).toHaveText('Practice question')
  await writer.page.reload()
  await expect(editor).toHaveText('Practice question')
  await expect(writer.page.getByRole('button', { name: 'Post', exact: true })).toBeDisabled()
  await writer.context.close()
})

for (const tag of ['@dev', '@phone'])
  test(tag + ' editing moves a discussion between Home and open rooms', async ({ browser }, info) => {
    const writer = await member(browser, info, 'writer')
    const reader = await member(browser, info, 'reader')
    writer.username = writer.username.padEnd(32, 'x')
    expect((await writer.context.request.put('/api/me/username', { data: { username: writer.username } })).ok()).toBe(
      true,
    )
    if (info.project.use.isMobile) await writer.page.setViewportSize({ width: 360, height: 800 })
    const room = await (
      await writer.context.request.post('/api/groups', {
        data: { name: uniq('Practice ').padEnd(40, 'x'), visibility: 'open' },
      })
    ).json()
    const body = uniq('A discussion to move ')
    const post = await (
      await writer.context.request.post(`/api/groups/${room.id}/posts`, { data: { body_html: `<p>${body}</p>` } })
    ).json()
    const reply = uniq('Keep this reply ')
    await reader.context.request.post(`/api/posts/${post.id}/comments`, { data: { body_html: `<p>${reply}</p>` } })
    await open(reader.page, `/r/${room.id}`)
    if (info.project.use.isMobile) await anyView(reader.page, 'Posts').click()
    await expect(article(reader.page, body)).toBeVisible()
    await open(writer.page, `/p/${post.id}`)
    let card = article(writer.page, body)
    await pick(writer.page, card, 'Post options', 'Edit')
    await card.getByRole('button', { name: `Post in ${room.name}`, exact: true }).click()
    await writer.page.screenshot({
      path: info.outputPath('edit-destination-menu.png'),
      animations: 'disabled',
      scale: 'css',
    })
    await writer.page.getByRole('dialog').getByRole('button', { name: 'Home', exact: true }).click()
    await writer.page.reload()
    card = article(writer.page, body)
    await pick(writer.page, card, 'Post options', 'Edit')
    await expect(card.locator('.ProseMirror').first()).toHaveText(body)
    await expect(card.getByRole('button', { name: 'Post in Home', exact: true })).toBeVisible()
    await card
      .locator('.ProseMirror')
      .first()
      .fill(body + ' edited')
    // A failed save keeps the text and selected destination.
    await writer.page.route(`**/api/posts/${post.id}`, (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Could not save' }),
          })
        : route.continue(),
    )
    await card.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(card.getByText('Could not save', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Post in Home', exact: true })).toBeVisible()
    await writer.page.unroute(`**/api/posts/${post.id}`)
    await writer.page.reload()
    card = article(writer.page, body)
    await pick(writer.page, card, 'Post options', 'Edit')
    await expect(card.getByRole('button', { name: 'Post in Home', exact: true })).toBeVisible()
    await expect(card.locator('.ProseMirror').first()).toHaveText(body + ' edited')
    await card.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(card.getByRole('button', { name: 'Save', exact: true })).toBeHidden()
    await expect(writer.page).toHaveURL(new RegExp(`/p/${post.id}$`))
    await expect(card.getByText(reply, { exact: true })).toBeVisible()
    await expect(article(reader.page, body)).toBeHidden()
    // Move back from Home and check a second client's feed updates without a reload.
    await pick(writer.page, card, 'Post options', 'Edit')
    await card.getByRole('button', { name: 'Post in Home', exact: true }).click()
    await writer.page.getByRole('textbox', { name: 'Search rooms' }).fill(room.name)
    await writer.page.getByRole('dialog').getByRole('button', { name: room.name, exact: true }).click()
    await writer.page.screenshot({
      path: info.outputPath('edit-destination-selected.png'),
      animations: 'disabled',
      scale: 'css',
    })
    await card.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(card).toContainText(`Posted in ${room.name}`)
    await expect(article(reader.page, body)).toBeVisible()
    await open(writer.page, '/notifications')
    await writer.page
      .getByRole('button', { name: `${reader.username} commented in a discussion you follow` })
      .click()
    await expect(writer.page).toHaveURL(new RegExp(`/p/${post.id}$`))
    await expect(article(writer.page, body)).toContainText(`Posted in ${room.name}`)
    await expect(article(writer.page, body).getByText(reply, { exact: true })).toBeVisible()
    await writer.context.close()
    await reader.context.close()
  })

for (const tag of ['@dev', '@phone'])
  test(
    tag + ' edit destinations work in profiles and feeds while private posts stay fixed',
    async ({ browser }, info) => {
      const writer = await member(browser, info, 'writer')
      const reader = await member(browser, info, 'reader')
      const makeRoom = async (visibility: string) =>
        (
          await writer.context.request.post('/api/groups', { data: { name: uniq(visibility + ' '), visibility } })
        ).json()
      const first = await makeRoom('open')
      const second = await makeRoom('open')
      const privateRoom = await makeRoom('private')
      const body = uniq('Movable discussion ')
      const post = await (
        await writer.context.request.post(`/api/groups/${first.id}/posts`, { data: { body_html: `<p>${body}</p>` } })
      ).json()
      await open(reader.page, `/search?q=${encodeURIComponent(body)}`)
      await expect(reader.page.getByRole('listitem').filter({ hasText: body })).toContainText(first.name)
      await open(writer.page, `/u/${writer.username}`)
      let card = article(writer.page, body)
      await pick(writer.page, card, 'Post options', 'Edit')
      await card.getByRole('button', { name: `Post in ${first.name}`, exact: true }).click()
      await writer.page.getByRole('textbox', { name: 'Search rooms' }).fill(privateRoom.name)
      await expect(writer.page.getByText('No rooms found.', { exact: true })).toBeVisible()
      await writer.page.getByRole('textbox', { name: 'Search rooms' }).fill(second.name)
      await writer.page.getByRole('dialog').getByRole('button', { name: second.name, exact: true }).click()
      await card.getByRole('button', { name: 'Cancel', exact: true }).click()
      await pick(writer.page, card, 'Post options', 'Edit')
      await expect(card.getByRole('button', { name: `Post in ${first.name}`, exact: true })).toBeVisible()
      await card.getByRole('button', { name: `Post in ${first.name}`, exact: true }).click()
      await writer.page.getByRole('textbox', { name: 'Search rooms' }).fill(second.name)
      await writer.page.getByRole('dialog').getByRole('button', { name: second.name, exact: true }).click()
      await card.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(card).toContainText(`Posted in ${second.name}`)
      await expect(reader.page.getByRole('listitem').filter({ hasText: body })).toContainText(second.name)
      await open(writer.page, `/r/${second.id}`)
      if (info.project.use.isMobile) await anyView(writer.page, 'Posts').click()
      card = article(writer.page, body)
      await pick(writer.page, card, 'Post options', 'Edit')
      await card.getByRole('button', { name: `Post in ${second.name}`, exact: true }).click()
      await writer.page.getByRole('dialog').getByRole('button', { name: 'Home', exact: true }).click()
      await card.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(card).toBeHidden()
      await expect(writer.page).toHaveURL(new RegExp(`/r/${second.id}$`))
      await open(writer.page)
      if (info.project.use.isMobile) await anyView(writer.page, 'Posts').click()
      card = article(writer.page, body)
      await pick(writer.page, card, 'Post options', 'Edit')
      await expect(card.getByRole('button', { name: 'Post in Home', exact: true })).toBeVisible()
      await card.getByRole('button', { name: 'Cancel', exact: true }).click()
      const secret = uniq('Private discussion ')
      const secretPost = await (
        await writer.context.request.post(`/api/groups/${privateRoom.id}/posts`, {
          data: { body_html: `<p>${secret}</p>` },
        })
      ).json()
      await open(writer.page, `/p/${secretPost.id}`)
      card = article(writer.page, secret)
      await pick(writer.page, card, 'Post options', 'Edit')
      await expect(card.getByRole('button', { name: /^Post in / })).toHaveCount(0)
      await card
        .locator('.ProseMirror')
        .first()
        .fill(secret + ' edited')
      await card.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(card).toContainText(secret + ' edited')
      expect((await (await writer.context.request.get(`/api/posts/${post.id}`)).json()).group_id).toBe(ROOT)
      expect((await (await writer.context.request.get(`/api/posts/${secretPost.id}`)).json()).group_id).toBe(
        privateRoom.id,
      )
      await writer.context.close()
      await reader.context.close()
    },
  )
