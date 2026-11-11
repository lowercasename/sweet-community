import type { Page } from '@playwright/test'
import { article, chatEditor, expect, member, open, postEditor, test, uniq, writePost } from './helpers'

const drafts = (page: Page) =>
  page.evaluate(() => Object.keys(localStorage).filter((name) => name.startsWith('sweet.draft.')).length)

/**
 * The text being written in a post, comment or message is kept in the browser. It comes back after a reload, and
 * signing out deletes every draft in the browser.
 */
test.describe('drafts', () => {
  test('a post, a message and a comment being written come back after a reload', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const text = uniq('A post to reply to ')
    await writePost(kit.page, text)

    await postEditor(kit.page).click()
    await kit.page.keyboard.type('Half a post')
    await chatEditor(kit.page).click()
    await kit.page.keyboard.type('Half a message')
    await kit.page.reload()
    await expect(postEditor(kit.page)).toHaveText('Half a post')
    await expect(chatEditor(kit.page)).toHaveText('Half a message')

    // A reply on the post's own page.
    await article(kit.page, text).getByRole('link').click()
    const thread = kit.page.locator('article:visible').filter({ hasText: text }).locator('.editor-line .ProseMirror')
    await thread.click()
    await kit.page.keyboard.type('Half a reply')
    await kit.page.reload()
    await expect(thread).toHaveText('Half a reply')
    await kit.context.close()
  })

  test('signing out deletes the drafts in this browser', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await postEditor(kit.page).click()
    await kit.page.keyboard.type('Not for the next person')
    await expect.poll(() => drafts(kit.page)).toBe(1)
    await open(kit.page, '/settings')
    await kit.page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(kit.page.getByRole('button', { name: 'Send a sign-in email' })).toBeVisible()
    expect(await drafts(kit.page)).toBe(0)
    await kit.context.close()
  })
})
