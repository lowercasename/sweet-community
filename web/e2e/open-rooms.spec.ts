import { anyView, article, expect, member, open, ROOT, test, uniq } from './helpers'

for (const tag of ['@dev', '@phone'])
  test(tag + ' open rooms share posts on Home and keep their own chat and audience', async ({ browser }, info) => {
    const creator = await member(browser, info, 'roomowner')
    const reader = await member(browser, info, 'roomreader')
    const phone = !!info.project.use.isMobile
    const name = uniq('Conference plans and treatment learning ').slice(0, 40)
    await open(reader.page)
    if (phone) await anyView(reader.page, 'Posts').click()
    await open(creator.page, '/rooms/new')
    await creator.page.getByLabel('Room name', { exact: true }).fill(name)
    await creator.page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('both')
    await expect(creator.page.getByRole('radio', { name: 'Open', exact: true })).toBeChecked()
    await creator.page.screenshot({
      animations: 'disabled',
      scale: 'css',
      path: `test-results/room-creation-${info.project.name}.png`,
    })
    await creator.page.getByRole('button', { name: 'Create room', exact: true }).click()
    await expect(creator.page.getByRole('heading', { name, exact: true })).toBeVisible()
    await expect(creator.page.getByText('Open room · Everyone in the community', { exact: true })).toHaveCount(0)
    await creator.page.screenshot({
      animations: 'disabled',
      scale: 'css',
      path: `test-results/open-room-${info.project.name}.png`,
    })
    const gid = creator.page.url().split('/').pop()!
    const text = uniq('Conference post ')
    await creator.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: `<p>${text}</p>` } })
    await creator.context.request.post(`/api/groups/${gid}/messages`, {
      data: { body_html: '<p>Only in this room chat</p>' },
    })
    await expect(article(reader.page, text)).toBeVisible()
    await expect(article(reader.page, text)).toContainText(`Posted in ${name}`)
    await expect(reader.page.getByText('Only in this room chat', { exact: true })).toHaveCount(0)
    // Reading the post on Home clears its room indicator, but leaves room chat unread.
    await expect
      .poll(async () => {
        const { markers } = await (await reader.context.request.get('/api/markers')).json()
        return ['feed:' + gid, 'chat:' + gid].map(
          (stream) => markers.find((m: { stream: string }) => m.stream === stream)?.unread,
        )
      })
      .toEqual([0, 1])
    await reader.page.screenshot({
      animations: 'disabled',
      scale: 'css',
      path: `test-results/home-open-post-${info.project.name}.png`,
    })
    await article(reader.page, text).getByRole('link', { name, exact: true }).click()
    await expect(reader.page).toHaveURL(new RegExp(`/r/${gid}$`))
    if (phone) await anyView(reader.page, 'Chat').click()
    await expect(reader.page.getByText('Only in this room chat', { exact: true })).toBeVisible()
    await open(reader.page, '/')
    if (phone) await anyView(reader.page, 'Posts').click()
    await expect(reader.page.getByText('Topics', { exact: true })).toHaveCount(0)
    // A member of a private room still sees none of its content in Home.
    const privateRoom = await creator.context.request.post('/api/groups', {
      data: { name: uniq('Private '), visibility: 'private' },
    })
    const privateID = (await privateRoom.json()).id
    const me = await (await reader.context.request.get('/api/me')).json()
    await creator.context.request.post(`/api/groups/${privateID}/members`, { data: { user_id: me.id } })
    const secret = uniq('Private post ')
    await creator.context.request.post(`/api/groups/${privateID}/posts`, { data: { body_html: `<p>${secret}</p>` } })
    await expect(article(reader.page, secret)).toHaveCount(0)
    await open(reader.page, `/r/${privateID}`)
    await expect(reader.page.getByRole('img', { name: 'Private room', exact: true }).first()).toBeVisible()
    await expect(article(reader.page, secret)).toBeVisible()
    await reader.page.screenshot({
      animations: 'disabled',
      scale: 'css',
      path: `test-results/private-room-${info.project.name}.png`,
    })
    expect(
      (await (await reader.context.request.get(`/api/groups/${ROOT}/posts`)).json()).posts.some(
        (p: { body_html: string }) => p.body_html.includes(secret),
      ),
    ).toBe(false)
    await creator.context.close()
    await reader.context.close()
  })

for (const tag of ['@dev', '@phone'])
  test(tag + ' private room creation selects people before creating the room', async ({ browser }, info) => {
    const creator = await member(browser, info, 'creator')
    const reader = await member(browser, info, 'longusernameforselectionx')
    const outsider = await member(browser, info, 'outsider')
    await open(reader.page)
    await open(creator.page, '/rooms/new')
    await creator.page.getByLabel('Room name', { exact: true }).fill('Private plans with a long room name here')
    await creator.page.getByRole('radio', { name: 'Private', exact: true }).check()
    await creator.page.getByRole('textbox', { name: 'Search people' }).fill(reader.username)
    await creator.page.getByRole('checkbox', { name: reader.username, exact: true }).check()
    await creator.page.getByRole('textbox', { name: 'Search people' }).fill('')
    await expect(creator.page.getByRole('button', { name: `Remove ${reader.username}` })).toBeVisible()
    const list = creator.page.getByRole('group', { name: 'Available people' })
    expect((await list.boundingBox())!.height).toBeLessThanOrEqual(260)
    expect(await creator.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      creator.page.viewportSize()!.width,
    )
    await creator.page.screenshot({
      path: `test-results/private-picker-${info.project.name}.png`,
      scale: 'css',
      animations: 'disabled',
    })
    await creator.page.getByRole('button', { name: 'Create room', exact: true }).click()
    await expect(
      creator.page.getByRole('heading', { name: 'Private plans with a long room name here', exact: true }),
    ).toBeVisible()
    await expect(creator.page.getByText('Private room · Invited members only', { exact: true })).toHaveCount(0)
    const title = creator.page.getByRole('heading', { name: 'Private plans with a long room name here', exact: true })
    await expect(title.locator('..').getByRole('img', { name: 'Private room', exact: true })).toBeVisible()
    await creator.page.screenshot({
      path: `test-results/private-header-${info.project.name}.png`,
      scale: 'css',
      animations: 'disabled',
    })
    const gid = creator.page.url().split('/').pop()!
    if (info.project.use.isMobile) await open(reader.page, '/menu')
    await expect(reader.page.getByRole('button', { name: /Private plans with a long room name here/ })).toBeVisible()
    expect((await outsider.context.request.get(`/api/groups/${gid}`)).status()).toBe(404)
    const privatePost = uniq('A selected-members post ')
    await creator.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: `<p>${privatePost}</p>` } })
    await open(reader.page, `/u/${creator.username}`)
    await expect(
      article(reader.page, privatePost).getByRole('img', { name: 'Private room', exact: true }),
    ).toBeVisible()
    const placeLink = await article(reader.page, privatePost)
      .getByRole('link', { name: 'Private plans with a long room name here', exact: true })
      .boundingBox()
    const placeTile = await article(reader.page, privatePost).getByText('P', { exact: true }).boundingBox()
    expect(placeTile!.y + placeTile!.height).toBeGreaterThan(placeLink!.y)
    await reader.page.screenshot({
      path: `test-results/private-post-label-${info.project.name}.png`,
      scale: 'css',
      animations: 'disabled',
    })
    await open(reader.page, `/r/${gid}`)
    await expect(reader.page.getByRole('img', { name: 'Private room', exact: true }).first()).toBeVisible()
    await creator.context.close()
    await reader.context.close()
    await outsider.context.close()
  })
