import { article, confirm, expect, member, open, pick, sendMessage, test, uniq, view, writePost } from './helpers'

test.describe('posts and comments', () => {
  test('write, edit, comment, delete; another person sees each change live', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    // A deep feed, so the pane can scroll: a menu opened on a button that
    // had to be scrolled into view once closed itself a frame later.
    for (let i = 0; i < 14; i++) {
      await kit.context.request.post('/api/groups/00000000-0000-7000-8000-000000000000/posts', {
        data: { body_html: `<p>filler ${i}</p>` },
      })
    }
    await open(kit.page)
    await open(mo.page)

    const text = uniq('A post about trains ')
    await writePost(kit.page, text)
    await expect(article(mo.page, text)).toBeVisible()

    // Edit: the author has the menu, a bystander does not.
    await expect(article(mo.page, text).getByRole('button', { name: 'Post options' })).toHaveCount(0)
    await pick(kit.page, article(kit.page, text), 'Post options', 'Edit')
    await kit.page.locator('article .editor-post .ProseMirror').first().click()
    await kit.page.keyboard.press('End')
    await kit.page.keyboard.type(' and boats')
    await kit.page.getByRole('button', { name: 'Save' }).click()
    await expect(article(kit.page, text)).toContainText('and boats')
    await expect(article(kit.page, text)).toContainText('edited')
    await expect(article(mo.page, text)).toContainText('and boats')

    // Comment: appears for both; the count on the post follows.
    await article(mo.page, text).getByRole('button', { name: 'Show comments' }).click()
    await article(mo.page, text).locator('.editor-line .ProseMirror').click()
    await mo.page.keyboard.type('Boats are fine too')
    await mo.page.getByRole('button', { name: 'Reply' }).click()
    await expect(article(mo.page, text)).toContainText('Boats are fine too')
    await expect(article(kit.page, text).getByRole('button', { name: 'Show comments' })).toContainText('1')
    await article(kit.page, text).getByRole('button', { name: 'Show comments' }).click()
    await expect(article(kit.page, text)).toContainText('Boats are fine too')

    // The post's author may delete a comment on their post; the comment's author may too.
    const comment = article(kit.page, text).getByRole('article').filter({ hasText: 'Boats are fine too' })
    await pick(kit.page, comment, 'Comment options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(article(kit.page, text)).not.toContainText('Boats are fine too')
    await expect(article(mo.page, text)).not.toContainText('Boats are fine too')
    await expect(article(kit.page, text).getByRole('button', { name: 'Hide comments' })).not.toContainText('1')

    // Delete the post: asks first; gone for everyone.
    await pick(kit.page, article(kit.page, text), 'Post options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(article(kit.page, text)).toHaveCount(0)
    await expect(article(mo.page, text)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('Mod+Enter posts; the editor empties; the post is at the top', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const text = uniq('Quick one ')
    await kit.page.locator('.editor-post .ProseMirror').first().click()
    await kit.page.keyboard.type(text)
    await kit.page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter')
    await expect(article(kit.page, text)).toBeVisible()
    await expect(kit.page.locator('.editor-post .ProseMirror').first()).toHaveText('')
    await expect(kit.page.getByRole('article').first()).toContainText(text)
    await kit.context.close()
  })
})

test.describe('post page', () => {
  test('a post has a page of its own: from its time, with the thread open; Back returns to its room', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    const text = uniq('A post with an address ')
    await writePost(kit.page, text)
    await article(kit.page, text).getByRole('link').click()
    await expect(kit.page).toHaveURL(/\/p\/[0-9a-f-]+$/)
    const path = new URL(kit.page.url()).pathname
    await expect(kit.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()

    // The thread is open: a reply from here counts on the feed behind.
    const shown = kit.page.locator('article:visible').filter({ hasText: text })
    await expect(shown.locator('[data-placeholder]')).toHaveAttribute('data-placeholder', `Reply to ${kit.username}…`)
    await shown.locator('.editor-line .ProseMirror').click()
    await kit.page.keyboard.type('From the page')
    await kit.page.getByRole('button', { name: 'Reply' }).click()
    await expect(shown).toContainText('From the page')

    // The address holds: a reload, and another person.
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
    await open(mo.page, path)
    await expect(mo.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
    await expect(mo.page.locator('article:visible').filter({ hasText: text })).toContainText('From the page')

    await kit.page.getByRole('button', { name: 'Back to Home' }).click()
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(article(kit.page, text).getByRole('button', { name: 'Show comments' })).toContainText('1')

    // A post in a room mo is not in has no page for mo.
    const room = await kit.context.request.post('/api/groups', {
      data: { kind: 'group', name: uniq('Wool'), mode: 'both' },
    })
    const gid = ((await room.json()) as { id: string }).id
    const secret = await kit.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: '<p>secret</p>' } })
    const pid = ((await secret.json()) as { id: string }).id
    await mo.page.goto(`/p/${pid}`)
    await expect(mo.page.getByText(/This post is gone/)).toBeVisible()
    await expect(mo.page.getByText('secret')).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('@phone the post page fills the screen, and Back returns to the feed', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await view(kit.page, 'Posts').click()
    const text = uniq('Phone post ')
    await writePost(kit.page, text)
    await article(kit.page, text).getByRole('link').click()
    await expect(kit.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
    const shown = kit.page.locator('article:visible').filter({ hasText: text })
    await expect(shown).toBeVisible()
    await expect(shown.locator('.editor-line')).toBeVisible()
    await kit.page.getByRole('button', { name: 'Back to Home' }).click()
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(article(kit.page, text)).toBeVisible()
    await kit.context.close()
  })
})

test.describe('menus', () => {
  test('a post, comment or message menu is out of sight until its block is hovered', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const text = uniq('Hover me ')
    await writePost(kit.page, text)
    const post = article(kit.page, text)
    const menu = post.getByRole('button', { name: 'Post options' })
    await expect(menu).toHaveCSS('opacity', '0')
    await post.hover()
    await expect(menu).toHaveCSS('opacity', '1')
    // A comment's menu, when hovered, shows instead of the post's.
    await post.getByRole('button', { name: 'Show comments' }).click()
    await post.locator('.editor-line .ProseMirror').click()
    await kit.page.keyboard.type('A reply')
    await kit.page.getByRole('button', { name: 'Reply' }).click()
    const comment = post.getByRole('article').filter({ hasText: 'A reply' })
    await comment.hover()
    await expect(comment.getByRole('button', { name: 'Comment options' })).toHaveCSS('opacity', '1')
    await expect(menu).toHaveCSS('opacity', '0')
    // On the card but off the comment, the comment's menu goes and the post's returns.
    await post.getByRole('button', { name: 'Hide comments' }).hover()
    await expect(comment.getByRole('button', { name: 'Comment options' })).toHaveCSS('opacity', '0')
    await expect(menu).toHaveCSS('opacity', '1')
    // The open menu stays while the pointer is on it.
    await menu.click({ force: true })
    await expect(kit.page.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
    await kit.page.keyboard.press('Escape')
    // Chat: the same. (The thread closes first, so its reply box is not the first line editor on the page.)
    await post.getByRole('button', { name: 'Hide comments' }).click()
    const said = uniq('hover word ')
    await sendMessage(kit.page, said)
    await expect(article(kit.page, said).getByRole('button', { name: 'Message options' })).toHaveCSS('opacity', '0')
    await article(kit.page, said).hover()
    await expect(article(kit.page, said).getByRole('button', { name: 'Message options' })).toHaveCSS('opacity', '1')
    await kit.context.close()
  })

  test('@phone menus are always in sight, since there is nothing to hover with', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await view(kit.page, 'Posts').click()
    const text = uniq('Touch me ')
    await writePost(kit.page, text)
    await expect(article(kit.page, text).getByRole('button', { name: 'Post options' })).toHaveCSS('opacity', '1')
    await kit.context.close()
  })
})
