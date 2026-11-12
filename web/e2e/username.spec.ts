import { ROOT, anyView, article, expect, member, open, owner, pick, png, test, uniq } from './helpers'

/**
 * A user changes their username on Settings. Another user's open pages show the new name at once: on the user's
 * post, in a mention of them, and on their profile, which moves to the new address.
 */
for (const suffix of ['', ' @phone']) {
  test(`a new username reaches every open page${suffix}`, async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    const o = await owner(browser, testInfo)
    const kitId = ((await (await kit.context.request.get('/api/me')).json()) as { id: string }).id
    const text = uniq('A post by kit ')
    const mention = uniq('A mention of kit ')
    const posted = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: { body_html: `<p>${text}</p>` },
    })
    expect(posted.ok(), await posted.text()).toBeTruthy()
    const mentioned = await o.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: {
        body_html: `<p>${mention} <span data-type="mention" data-mention-id="${kitId}">@${kit.username}</span></p>`,
      },
    })
    expect(mentioned.ok(), await mentioned.text()).toBeTruthy()

    await open(o.page)
    if (testInfo.project.name === 'phone') await anyView(o.page, 'Posts').click()
    await expect(article(o.page, text)).toContainText(kit.username)
    await expect(article(o.page, mention).getByRole('link', { name: `@${kit.username}` })).toBeVisible()
    const profile = await o.context.newPage()
    await open(profile, `/u/${kit.username}`)
    await expect(profile.getByRole('heading', { name: kit.username }).last()).toBeVisible()

    const editing = await o.context.newPage()
    const mentionedId = ((await mentioned.json()) as { id: string }).id
    await open(editing, `/p/${mentionedId}`)
    await pick(editing, article(editing, mention), 'Post options', 'Edit')
    const editor = editing.locator('article .editor-post .ProseMirror')
    await editor.click()
    await editor.press('End')
    await editor.pressSequentially(' unfinished')

    const renamed = uniq('kat').padEnd(32, 'x')
    await open(kit.page, '/settings')
    await kit.page.getByLabel('New username').fill(renamed)
    await kit.page.getByRole('button', { name: 'Change username' }).click()
    await expect(kit.page.locator('p').getByText(renamed, { exact: true })).toBeVisible()

    await expect(article(o.page, text)).toContainText(renamed)
    await expect(article(o.page, mention).getByRole('link', { name: `@${renamed}` })).toBeVisible()
    await expect(profile).toHaveURL(new RegExp(`/u/${renamed}$`))
    await expect(profile.getByRole('heading', { name: renamed }).last()).toBeVisible()
    await expect(editor).toContainText(`@${renamed}`)
    await expect(editor).toContainText('unfinished')
    await editor.scrollIntoViewIfNeeded()
    await editing.screenshot({ path: testInfo.outputPath('editor-renamed-mention.png') })
    await profile.screenshot({ path: testInfo.outputPath('renamed-profile.png') })
    await kit.context.close()
    await o.context.close()
  })
}

for (const suffix of ['', ' @phone']) {
  test(`another member changing their picture preserves unfinished settings${suffix}`, async ({ browser }, info) => {
    const viewer = await member(browser, info)
    const other = await member(browser, info)
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    try {
      await open(viewer.page, '/settings')
      const field = viewer.page.getByLabel('New username')
      const unfinished = 'a_username_with_32_characters_12'
      expect(unfinished).toHaveLength(32)
      await field.fill(unfinished)
      let started!: () => void
      const refreshing = new Promise<void>((resolve) => {
        started = resolve
      })
      await viewer.page.route('**/api/groups', async (route) => {
        const response = await route.fetch()
        started()
        await held
        await route.fulfill({ response })
      })
      const upload = await other.context.request.post('/api/images', {
        multipart: { file: { name: 'avatar.png', mimeType: 'image/png', buffer: png(20, 20, [10, 10, 200]) } },
      })
      expect(upload.status()).toBe(201)
      const image = (await upload.json()) as { id: string }
      expect((await other.context.request.put('/api/me/picture', { data: { image_id: image.id } })).ok()).toBeTruthy()
      await refreshing
      await expect(field).toHaveValue(unfinished)
      await field.scrollIntoViewIfNeeded()
      await viewer.page.screenshot({ path: info.outputPath('settings-refresh.png') })
      release()
      await viewer.page.unrouteAll({ behavior: 'wait' })
      await expect(field).toHaveValue(unfinished)
    } finally {
      release()
      await viewer.context.close()
      await other.context.close()
    }
  })
}
