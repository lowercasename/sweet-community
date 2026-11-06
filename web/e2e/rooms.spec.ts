import { article, expect, member, open, png, test, uniq } from './helpers'

test.describe('room pictures', () => {
  test("the owner gives a room a picture; it marks the room in the nav and heads the room's posts elsewhere", async ({
    browser,
  }, testInfo) => {
    test.slow() // many page loads; the dev server's are the slow ones
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const name = uniq('Wool')
    const room = await kit.context.request.post('/api/groups', { data: { kind: 'group', name, mode: 'both' } })
    const gid = ((await room.json()) as { id: string }).id
    const me = (await (await mo.context.request.get('/api/me')).json()) as { id: string }
    await kit.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: me.id } })
    const text = uniq('a woolly post ')
    const post = await kit.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: `<p>${text}</p>` } })
    const pid = ((await post.json()) as { id: string }).id

    await open(kit.page, `/r/${gid}/members`)
    await open(mo.page)
    // The room's item may carry ", unread" in its name (kit's post is new to mo), so the name is matched at its start.
    const nav = (p: typeof kit) => p.page.getByRole('navigation', { name: 'Main' })
    const item = (p: typeof kit) => nav(p).getByRole('button', { name: new RegExp(`^${name}`) })
    await expect(item(kit).locator('img')).toHaveCount(0)
    await kit.page
      .locator('section')
      .filter({ hasText: 'Room settings' })
      .locator('input[type=file]')
      .setInputFiles({ name: 'wool.png', mimeType: 'image/png', buffer: png(64, 64) })
    await expect(item(kit).locator('img')).toHaveAttribute('src', /\/img\//)
    // Mo's nav learns it live.
    await expect(item(mo).locator('img')).toHaveAttribute('src', /\/img\//)

    // On the post's page and on kit's profile the post is headed by the room, with its picture.
    await open(mo.page, `/p/${pid}`)
    const headed = mo.page.locator('article:visible').filter({ hasText: text })
    await expect(headed).toContainText(`Posted in ${name}`)
    await expect(headed.locator('img').first()).toHaveAttribute('src', /\/img\//)
    // The header's line runs edge to edge of the card.
    const strip = (await headed
      .getByText('Posted in')
      .locator('xpath=ancestor::div[contains(@class,"border-b")][1]')
      .boundingBox())!
    const card = (await headed.boundingBox())!
    expect(Math.abs(strip.width - card.width)).toBeLessThan(3)
    await open(mo.page, `/u/${kit.username}`)
    await expect(article(mo.page, text)).toContainText(`Posted in ${name}`)
    // The header's name leads to the room, where there is no header: the room is the page.
    await article(mo.page, text).getByRole('link', { name }).click()
    await expect(mo.page).toHaveURL(new RegExp(`/r/${gid}$`))
    await expect(article(mo.page, text)).not.toContainText('Posted in')

    await kit.page.getByRole('button', { name: 'Remove picture' }).click()
    await expect(item(kit).locator('img')).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })
})
