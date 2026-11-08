import { article, expect, member, open, sendMessage, test, uniq, writePost } from './helpers'

test.describe('search', () => {
  test('search finds posts, comments and messages by their text in the groups I am a member of, and a result opens the item it matched', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const word = uniq('quince')
    await open(kit.page)
    await writePost(kit.page, `The ${word} is ready`)
    await article(kit.page, word).getByRole('button', { name: 'Show comments' }).click()
    await article(kit.page, word).locator('.editor-line .ProseMirror').click()
    await kit.page.keyboard.type(`${word} for everyone`)
    await kit.page.getByRole('button', { name: 'Reply', exact: true }).click()
    await article(kit.page, word).getByRole('button', { name: 'Hide comments' }).click()
    await sendMessage(kit.page, `who wants ${word}?`)
    const room = await kit.context.request.post('/api/groups', {
      data: { kind: 'group', name: uniq('Jam'), mode: 'both' },
    })
    const gid = ((await room.json()) as { id: string }).id
    await kit.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: `<p>secret ${word}</p>` } })

    await open(mo.page)
    await mo.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Search' }).click()
    await expect(mo.page).toHaveURL(/\/search$/)
    await expect(mo.page.getByRole('heading', { name: 'Search' })).toBeVisible()
    await mo.page.getByRole('textbox', { name: 'Search' }).fill(word)
    await mo.page.keyboard.press('Enter')
    await expect(mo.page).toHaveURL(new RegExp(`/search\\?q=${word}$`))
    const rows = mo.page.getByRole('list').getByRole('button')
    await expect(rows).toHaveCount(3)
    await expect(mo.page.getByText('secret')).toHaveCount(0)
    await expect(rows.filter({ hasText: 'Post' }).first()).toContainText(word)
    // A prefix of a word also matches.
    await mo.page.getByRole('textbox', { name: 'Search' }).fill(word.slice(0, -2))
    await mo.page.keyboard.press('Enter')
    await expect(rows).toHaveCount(3)
    // A reload keeps the search. A result opens its post.
    await mo.page.reload()
    await expect(mo.page.getByRole('list').getByRole('button')).toHaveCount(3)
    await mo.page.getByRole('list').getByRole('button').filter({ hasText: 'Comment' }).click()
    await expect(mo.page).toHaveURL(/\/p\/[0-9a-f-]+$/)
    await expect(mo.page.locator('article:visible').filter({ hasText: word }).first()).toBeVisible()
    await kit.context.close()
    await mo.context.close()
  })

  test('@phone the Search tab opens the search page', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await kit.page.locator('nav').last().getByRole('button', { name: 'Search' }).click()
    await expect(kit.page).toHaveURL(/\/search$/)
    await expect(kit.page.getByRole('textbox', { name: 'Search' })).toBeVisible()
    await expect(kit.page.locator('nav').last().getByRole('button', { name: 'Search' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await kit.context.close()
  })
})
