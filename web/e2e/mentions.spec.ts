import { article, expect, member, open, test, uniq, writePost } from './helpers'

test.describe('mentions', () => {
  test('@ offers the people here; a mention tells its person, wears their name, and leads to their page', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)
    const text = uniq('a word for ')
    await kit.page.locator('.editor-post .ProseMirror').first().click()
    // An @ counts after a space, not glued to a word.
    await kit.page.keyboard.type(`${text} @${mo.username.slice(0, -1)}`)
    const list = kit.page.getByRole('listbox', { name: 'People' })
    await expect(list.getByRole('option', { name: mo.username })).toBeVisible()
    await kit.page.keyboard.press('Enter')
    await expect(list).toHaveCount(0)
    await kit.page.keyboard.type(' hello')
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const post = article(kit.page, text)
    await expect(post.getByRole('link', { name: `@${mo.username}` })).toBeVisible()

    // Mo is told, and the notification opens the post.
    const nav = mo.page.getByRole('navigation', { name: 'Main' })
    await nav.getByRole('button', { name: 'Notifications, unread' }).click()
    await mo.page.getByRole('button', { name: `${kit.username} mentioned you in a post, new` }).click()
    await expect(mo.page).toHaveURL(/\/p\/[0-9a-f-]+$/)
    await expect(mo.page.locator('article:visible').filter({ hasText: text })).toBeVisible()
    // The name in the body leads to mo's page, in the app.
    await mo.page
      .locator('article:visible')
      .getByRole('link', { name: `@${mo.username}` })
      .click()
    await expect(mo.page).toHaveURL(new RegExp(`/u/${mo.username}$`))

    // In chat: the same, worded by the room.
    await open(kit.page)
    await kit.page.locator('.editor-line .ProseMirror').first().click()
    await kit.page.keyboard.type(`@${mo.username.slice(0, -1)}`)
    await expect(
      kit.page.getByRole('listbox', { name: 'People' }).getByRole('option', { name: mo.username }),
    ).toBeVisible()
    await kit.page.keyboard.press('Enter')
    const said = uniq('over here ')
    await kit.page.keyboard.type(` ${said}`)
    await kit.page.keyboard.press('Enter')
    await expect(article(kit.page, said).getByRole('link', { name: `@${mo.username}` })).toBeVisible()
    await open(mo.page, '/notifications')
    await expect(mo.page.getByRole('button', { name: `${kit.username} mentioned you in the chat, new` })).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })
})
