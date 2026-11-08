import { article, expect, member, open, test, uniq, writePost } from './helpers'

test.describe('profiles', () => {
  test("a user's page has a bio edited by that user, posts from shared rooms only, and a Message button, and my own page opens from the account row", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    const nav = kit.page.getByRole('navigation', { name: 'Main' })
    // The account row at the bottom of the nav opens my own page. The Settings button is on my page.
    await nav.getByRole('button', { name: kit.username }).click()
    await expect(kit.page).toHaveURL(new RegExp(`/u/${kit.username}$`))
    await expect(kit.page.getByRole('heading', { name: kit.username })).toHaveCount(2)
    await expect(kit.page.getByRole('button', { name: 'Settings' })).toBeVisible()
    await expect(kit.page.getByRole('button', { name: 'Message', exact: true })).toHaveCount(0)
    // The bio is written on this page, read by other users, and sanitised like any other body.
    await kit.page.getByRole('button', { name: 'Write a bio' }).click()
    // The root group's chat editor is still mounted behind the page. The bio editor is the visible one.
    await kit.page.locator('.editor-line .ProseMirror >> visible=true').click()
    await kit.page.keyboard.type('I knit things')
    await kit.page.getByRole('button', { name: 'Save' }).click()
    await expect(kit.page.getByText('I knit things')).toBeVisible()
    await expect(kit.page.getByRole('button', { name: 'Edit bio' })).toBeVisible()

    // Posts. One is in a room that mo is not a member of, and one is in the root group. Mo sees only the root
    // group's post. Kit sees both, and the room's post is labelled with the room's name.
    const room = await kit.context.request.post('/api/groups', { data: { kind: 'group', name: 'Wool', mode: 'both' } })
    const gid = ((await room.json()) as { id: string }).id
    const secret = uniq('secret wool ')
    await kit.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: `<p>${secret}</p>` } })
    await open(kit.page)
    const shown = uniq('for everyone ')
    await writePost(kit.page, shown)
    await nav.getByRole('button', { name: kit.username }).click()
    await expect(article(kit.page, shown)).toBeVisible()
    await expect(article(kit.page, secret)).toBeVisible()
    await expect(article(kit.page, secret)).toContainText('Posted in Wool')

    await open(mo.page, `/u/${kit.username}`)
    await expect(mo.page.getByText('I knit things')).toBeVisible()
    await expect(article(mo.page, shown)).toBeVisible()
    await expect(mo.page.getByText(secret)).toHaveCount(0)
    await expect(mo.page.getByRole('button', { name: /bio/ })).toHaveCount(0)
    await mo.page.getByRole('button', { name: 'Message', exact: true }).click()
    await expect(mo.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(mo.page.getByRole('heading', { name: kit.username })).toBeVisible()

    // The profile card links to the user's page.
    await open(mo.page)
    await article(mo.page, shown).getByRole('button', { name: kit.username }).hover()
    await mo.page
      .getByRole('dialog', { name: `About ${kit.username}` })
      .getByRole('button', { name: 'View profile' })
      .click()
    await expect(mo.page).toHaveURL(new RegExp(`/u/${kit.username}$`))
    await open(mo.page, '/u/nobody-here')
    await expect(mo.page.getByText(/no user with that name/)).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })
})
