import type { APIRequestContext } from '@playwright/test'
import { anyView, article, confirm, expect, member, open, owner, pick, test, uniq, writePost, ROOT } from './helpers'

/**
 * Reporting. A member reports a post, comment or message from its menu. The owner and
 * the moderators are notified, and act on the report from the Reports card at the top of the Community page.
 */

const idOf = async (request: APIRequestContext) => ((await (await request.get('/api/me')).json()) as { id: string }).id

test.describe('reports', () => {
  test('a member reports a post, the owner is notified, and deletes the post from the Reports card', async ({
    browser,
  }, info) => {
    const o = await owner(browser, info)
    const kit = await member(browser, info, 'kit')
    const mo = await member(browser, info, 'mo')
    await open(kit.page)
    const text = uniq('Cheap wool at this link ')
    await writePost(kit.page, text)
    // The owner already has the Community page open. The report reaches it live.
    await open(o.page, '/community')
    await expect(o.page.getByRole('heading', { name: 'Reports' })).toBeVisible()

    // Mo reports kit's post from its menu. The dialog says who will see it, and that kit will not learn who reported.
    await open(mo.page)
    await pick(mo.page, article(mo.page, text), 'Post options', 'Report')
    const dialog = mo.page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Report this post?' })).toBeVisible()
    await expect(dialog).toContainText(`${kit.username} will not be told who reported it.`)
    await dialog.getByLabel("What's wrong?").fill('Spam link')
    await mo.page.screenshot({ path: `test-results/reports-${info.project.name}-dialog.png` })
    await dialog.getByRole('button', { name: 'Report post' }).click()
    await expect(dialog.getByRole('heading', { name: 'Post reported' })).toBeVisible()
    await mo.page.screenshot({ path: `test-results/reports-${info.project.name}-sent.png`, animations: 'disabled' })
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toHaveCount(0)

    // The entry appears on the open page without a reload.
    await expect(o.page.getByRole('listitem').filter({ hasText: text })).toContainText('Spam link')
    // The owner's notification opens the Community page, where the Reports card comes first.
    await o.page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: /^Notifications/ })
      .click()
    // Report notifications have no names. Open the newest unread report.
    await o.page.getByRole('button', { name: 'Post reported, new', exact: true }).first().click()
    await expect(o.page).toHaveURL(/\/community$/)
    const top = async (name: string) => (await o.page.getByRole('heading', { name, exact: true }).boundingBox())!.y
    expect(await top('Reports')).toBeLessThan(await top('About this community'))
    const entry = o.page.getByRole('listitem').filter({ hasText: text })
    await expect(entry).toContainText('Post in Home')
    await expect(entry).not.toContainText(mo.username)
    await expect(entry).toContainText('Spam link')
    await entry.scrollIntoViewIfNeeded()
    await o.page.screenshot({ path: `test-results/reports-${info.project.name}-card.png` })

    // Delete post asks first. It deletes the post for everyone and the entry leaves the card.
    await entry.getByRole('button', { name: 'Delete post' }).click()
    await confirm(o.page, 'Delete post')
    await expect(entry).toHaveCount(0)
    await expect(article(kit.page, text)).toHaveCount(0)
    await o.context.close()
    await kit.context.close()
    await mo.context.close()
  })

  test('a message in a conversation is reported, and the owner, who is not in it, dismisses the report', async ({
    browser,
  }, info) => {
    const o = await owner(browser, info)
    const kit = await member(browser, info, 'kit')
    const mo = await member(browser, info, 'mo')
    const made = await kit.context.request.post('/api/groups', {
      data: { kind: 'dm', members: [await idOf(mo.context.request)] },
    })
    const dm = (await made.json()) as { id: string }
    const text = uniq('You are no good ')
    expect(
      (await kit.context.request.post(`/api/groups/${dm.id}/messages`, { data: { body_html: `<p>${text}</p>` } })).ok(),
    ).toBeTruthy()

    // Mo reports the message. The dialog says that moderators will see it although they cannot read conversations.
    await open(mo.page, `/r/${dm.id}`)
    const block = mo.page.getByText(text).locator('xpath=ancestor::div[contains(@class,"block-message")][1]')
    await block.hover()
    await block.getByRole('button', { name: 'Message options' }).click()
    await mo.page.getByRole('menuitem', { name: 'Report' }).click()
    const dialog = mo.page.getByRole('dialog')
    await expect(dialog).toContainText(
      'They cannot read private conversations, but they will see this message and your report text.',
    )
    await dialog.getByRole('button', { name: 'Report message' }).click()
    await dialog.getByRole('button', { name: 'Done' }).click()

    // The owner sees the message without being in the conversation. There is no Open, because a conversation
    // belongs to its two people. Dismiss report closes it and the message stays.
    await open(o.page, '/community')
    const entry = o.page.getByRole('listitem').filter({ hasText: text })
    await expect(entry).toContainText('Message in a conversation')
    await expect(entry.getByRole('button', { name: 'Open' })).toHaveCount(0)
    await entry.getByRole('button', { name: 'Dismiss report' }).click()
    await expect(entry).toHaveCount(0)
    await expect(mo.page.getByText(text)).toBeVisible()
    await o.context.close()
    await kit.context.close()
    await mo.context.close()
  })

  test('the Reports card on a phone, with a long name, a long post and a long reason @phone', async ({
    browser,
  }, info) => {
    const o = await owner(browser, info)
    const kit = await member(browser, info, 'kitkitkitkitkitkitkitkitk')
    const mo = await member(browser, info, 'mo')
    const text = uniq('A long post ')
    const body = `<p>${text} ${'about wool and needles and the weather, '.repeat(6)}</p>`
    const made = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: { body_html: body },
    })
    const post = (await made.json()) as { id: string }
    const reason = 'This advertises a shop. '.repeat(10).trim()
    expect(
      (await mo.context.request.post('/api/reports', { data: { kind: 'post', id: post.id, reason } })).ok(),
    ).toBeTruthy()
    // A second member reports the post without a reason. A comment that kit deleted after it was reported shows its
    // deleted state.
    const jo = await member(browser, info, 'jo')
    expect((await jo.context.request.post('/api/reports', { data: { kind: 'post', id: post.id } })).ok()).toBeTruthy()
    const gone = uniq('A deleted comment ')
    const c = await kit.context.request.post(`/api/posts/${post.id}/comments`, {
      data: { body_html: `<p>${gone}</p>` },
    })
    const comment = (await c.json()) as { id: string }
    expect(
      (await mo.context.request.post('/api/reports', { data: { kind: 'comment', id: comment.id } })).ok(),
    ).toBeTruthy()
    expect((await kit.context.request.delete(`/api/comments/${comment.id}`)).ok()).toBeTruthy()
    try {
      // The report dialog on the phone.
      await open(mo.page)
      await anyView(mo.page, 'Posts').click()
      await pick(mo.page, article(mo.page, text), 'Post options', 'Report')
      await mo.page.screenshot({ path: 'test-results/reports-phone-dialog.png' })
      await mo.page.getByRole('dialog').getByRole('button', { name: 'Report post' }).click()
      await expect(mo.page.getByRole('heading', { name: 'Post reported' })).toBeVisible()
      await mo.page.screenshot({ path: 'test-results/reports-phone-sent.png', animations: 'disabled' })
      await mo.page.getByRole('dialog').getByRole('button', { name: 'Done' }).click()

      // The owner reaches the card from the menu.
      await open(o.page, '/menu')
      await o.page.getByRole('button', { name: 'Community' }).click()
      const entry = o.page.getByRole('listitem').filter({ hasText: text })
      await expect(entry).toContainText(reason)
      await expect(entry).not.toContainText(jo.username)
      const deleted = o.page.getByRole('listitem').filter({ hasText: gone })
      await expect(deleted).toContainText('The comment has since been deleted.')
      await expect(deleted.getByRole('button', { name: 'Delete comment' })).toHaveCount(0)
      await deleted.scrollIntoViewIfNeeded()
      await o.page.screenshot({ path: 'test-results/reports-phone-deleted.png' })
      await entry.scrollIntoViewIfNeeded()
      await o.page.screenshot({ path: 'test-results/reports-phone-card.png' })
      // Nothing in the entry is wider than the page.
      const width = await o.page.evaluate(() => document.documentElement.scrollWidth)
      expect(width).toBeLessThanOrEqual(o.page.viewportSize()!.width)
    } finally {
      await o.context.request.post(`/api/reports/post/${post.id}/dismiss`)
      await o.context.request.post(`/api/reports/comment/${comment.id}/dismiss`)
      await jo.context.close()
      await o.context.close()
      await kit.context.close()
      await mo.context.close()
    }
  })
})
