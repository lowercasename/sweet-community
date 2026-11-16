import { anyView, article, expect, member, open, ROOT, test, uniq } from './helpers'

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
      await writer.page.getByRole('button', { name: /^Post in / }).click()
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
