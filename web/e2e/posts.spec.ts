import { execFileSync } from 'node:child_process'
import { article, confirm, expect, member, open, pick, ROOT, sendMessage, test, uniq, view, writePost } from './helpers'

test.describe('posts and comments', () => {
  test('write, edit, comment and delete, and another user sees each change live', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    // Create enough posts for the pane to scroll. A menu opened from a button that
    // had to be scrolled into view once closed itself one frame later.
    for (let i = 0; i < 14; i++) {
      await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
        data: { body_html: `<p>filler ${i}</p>` },
      })
    }
    await open(kit.page)
    await open(mo.page)

    const text = uniq('A post about trains ')
    await writePost(kit.page, text)
    await expect(article(mo.page, text)).toBeVisible()

    // Edit. Another member can follow or report the discussion, but cannot edit it.
    await article(mo.page, text).getByRole('button', { name: 'Post options' }).click()
    await expect(mo.page.getByRole('menuitem')).toHaveText(['Follow discussion', 'Report'])
    await mo.page.keyboard.press('Escape')
    await pick(kit.page, article(kit.page, text), 'Post options', 'Edit')
    await kit.page.locator('article .editor-post .ProseMirror').first().click()
    await kit.page.keyboard.press('End')
    await kit.page.keyboard.type(' and boats')
    await kit.page.getByRole('button', { name: 'Save' }).click()
    await expect(article(kit.page, text)).toContainText('and boats')
    await expect(article(kit.page, text)).toContainText('edited')
    await expect(article(mo.page, text)).toContainText('and boats')

    // Comment. The comment appears for both users, and the comment count on the post updates.
    await article(mo.page, text).getByRole('button', { name: 'Show comments' }).click()
    await article(mo.page, text).locator('.editor-line .ProseMirror').click()
    await mo.page.keyboard.type('Boats are fine too')
    await mo.page.getByRole('button', { name: 'Reply', exact: true }).click()
    await expect(article(mo.page, text)).toContainText('Boats are fine too')
    await expect(article(kit.page, text).getByRole('button', { name: 'Show comments' })).toContainText('1')
    await article(kit.page, text).getByRole('button', { name: 'Show comments' }).click()
    await expect(article(kit.page, text)).toContainText('Boats are fine too')

    // The post's author may delete a comment on their post. The comment's author may also delete it.
    const comment = article(kit.page, text).getByRole('article').filter({ hasText: 'Boats are fine too' })
    await pick(kit.page, comment, 'Comment options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(article(kit.page, text)).not.toContainText('Boats are fine too')
    await expect(article(mo.page, text)).not.toContainText('Boats are fine too')
    await expect(article(kit.page, text).getByRole('button', { name: 'Hide comments' })).not.toContainText('1')

    // Delete the post. A confirmation is shown first, and then the post is removed for every user.
    await pick(kit.page, article(kit.page, text), 'Post options', 'Delete')
    await confirm(kit.page, 'Delete')
    await expect(article(kit.page, text)).toHaveCount(0)
    await expect(article(mo.page, text)).toHaveCount(0)
    await kit.context.close()
    await mo.context.close()
  })

  test('Mod+Enter submits the post, the editor is cleared, and the post is at the top of the feed', async ({
    browser,
  }, testInfo) => {
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
  test('a post has its own page, opened from its timestamp with the thread open, and Back returns to its room', async ({
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

    // The thread is open. A reply sent from this page is counted on the feed behind it.
    const shown = kit.page.locator('article:visible').filter({ hasText: text })
    await expect(shown.locator('[data-placeholder]')).toHaveAttribute('data-placeholder', `Reply to ${kit.username}…`)
    await shown.locator('.editor-line .ProseMirror').click()
    await kit.page.keyboard.type('From the page')
    await kit.page.getByRole('button', { name: 'Reply', exact: true }).click()
    await expect(shown).toContainText('From the page')

    // The URL still works after a reload and for another user.
    await kit.page.reload()
    await expect(kit.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
    await open(mo.page, path)
    await expect(mo.page.getByRole('heading', { name: `Post by ${kit.username}` })).toBeVisible()
    await expect(mo.page.locator('article:visible').filter({ hasText: text })).toContainText('From the page')

    await kit.page.getByRole('button', { name: 'Back to Home' }).click()
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(article(kit.page, text).getByRole('button', { name: 'Show comments' })).toContainText('1')

    // A post in a room that mo is not a member of has no page for mo.
    const room = await kit.context.request.post('/api/groups', {
      data: { kind: 'group', name: uniq('Wool'), mode: 'both' },
    })
    const gid = ((await room.json()) as { id: string }).id
    const secret = await kit.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: '<p>secret</p>' } })
    const pid = ((await secret.json()) as { id: string }).id
    await mo.page.goto(`/p/${pid}`)
    await expect(mo.page.getByText(/This post has been deleted/)).toBeVisible()
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
  test('a post, comment or message menu is hidden until its block is hovered', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const text = uniq('Hover me ')
    await writePost(kit.page, text)
    const post = article(kit.page, text)
    const menu = post.getByRole('button', { name: 'Post options' })
    await expect(menu).toHaveCSS('opacity', '0')
    await post.hover()
    await expect(menu).toHaveCSS('opacity', '1')
    // When a comment is hovered, the comment's menu is shown instead of the post's.
    await post.getByRole('button', { name: 'Show comments' }).click()
    await post.locator('.editor-line .ProseMirror').click()
    await kit.page.keyboard.type('A reply')
    await kit.page.getByRole('button', { name: 'Reply', exact: true }).click()
    const comment = post.getByRole('article').filter({ hasText: 'A reply' })
    await comment.hover()
    await expect(comment.getByRole('button', { name: 'Comment options' })).toHaveCSS('opacity', '1')
    await expect(menu).toHaveCSS('opacity', '0')
    // When the pointer is on the card but not on the comment, the comment's menu is hidden and the post's menu is
    // shown again.
    await post.getByRole('button', { name: 'Hide comments' }).hover()
    await expect(comment.getByRole('button', { name: 'Comment options' })).toHaveCSS('opacity', '0')
    await expect(menu).toHaveCSS('opacity', '1')
    // The open menu stays open while the pointer is on it.
    await menu.click({ force: true })
    await expect(kit.page.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
    await kit.page.keyboard.press('Escape')
    // Chat behaves the same way. The thread is closed first, so that its reply box is not the first line editor on
    // the page.
    await post.getByRole('button', { name: 'Hide comments' }).click()
    const said = uniq('hover word ')
    await sendMessage(kit.page, said)
    await expect(article(kit.page, said).getByRole('button', { name: 'Message options' })).toHaveCSS('opacity', '0')
    await article(kit.page, said).hover()
    await expect(article(kit.page, said).getByRole('button', { name: 'Message options' })).toHaveCSS('opacity', '1')
    await kit.context.close()
  })

  test('@phone menus are always visible, because a touch screen has no pointer to hover with', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await view(kit.page, 'Posts').click()
    const text = uniq('Touch me ')
    await writePost(kit.page, text)
    await expect(article(kit.page, text).getByRole('button', { name: 'Post options' })).toHaveCSS('opacity', '1')
    await kit.context.close()
  })
})

test.describe('long threads', () => {
  for (const phone of [false, true]) {
    test(`${phone ? '@phone ' : ''}a long thread opens at its newest comments, and Load earlier comments shows the first`, async ({
      browser,
    }, testInfo) => {
      const kit = await member(browser, testInfo, 'kit')
      await open(kit.page)
      const text = uniq('A post with a long thread ')
      const post = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
        data: { body_html: `<p>${text}</p>` },
      })
      const pid = ((await post.json()) as { id: string }).id
      for (let i = 1; i <= 51; i++) {
        await kit.context.request.post(`/api/posts/${pid}/comments`, {
          data: { body_html: `<p>Comment number ${i}</p>` },
        })
      }
      // Equal timestamps must not leave a comment between pages.
      execFileSync('python3', [
        '-I',
        '-c',
        `import sqlite3, sys
with sqlite3.connect('../data/e2e.db') as db:
    db.execute('UPDATE comments SET created_at = 100 WHERE post_id = ?', (sys.argv[1],))`,
        pid,
      ])
      await kit.page.goto(`/p/${pid}`)
      const shown = kit.page.locator('article:visible').filter({ hasText: text })
      await expect(shown.getByText('Comment number 51', { exact: true })).toBeVisible()
      await expect(shown.getByText('Comment number 1', { exact: true })).toHaveCount(0)
      const earlier = shown.getByRole('button', { name: 'Load earlier comments' })
      await earlier.scrollIntoViewIfNeeded()
      await kit.page.screenshot({ path: `test-results/thread-load-earlier${phone ? '-phone' : ''}.png` })
      await earlier.click()
      await expect(shown.getByText('Comment number 1', { exact: true })).toBeVisible()
      await expect(earlier).toHaveCount(0)
      await kit.context.close()
    })
  }
})
