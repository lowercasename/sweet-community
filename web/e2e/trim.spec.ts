import { article, expect, member, open, postEditor, test, uniq } from './helpers'

/**
 * Empty paragraphs at the start and end of a body are removed when it is sent
 * (architecture.md, Posts and editor). The server trims them, so the post as
 * shown, which is the row the server saved, has none.
 */
test.describe('trimming', () => {
  test('empty lines typed before and after a post are removed when it is sent, and empty lines between are kept', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    const first = uniq('first line ')
    await postEditor(kit.page).click()
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type(first)
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type('last line')
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.press('Enter')
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const post = article(kit.page, first)
    await expect(post).toBeVisible()
    const paragraphs = post.locator('.content p')
    await expect(paragraphs).toHaveCount(3)
    await expect(paragraphs.first()).toHaveText(first)
    await expect(paragraphs.nth(1)).toHaveText('')
    await expect(paragraphs.last()).toHaveText('last line')
    await kit.context.close()
  })
})
