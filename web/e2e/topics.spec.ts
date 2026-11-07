import { anyView, article, expect, member, open, owner, postEditor, test, uniq } from './helpers'

/**
 * Topics (architecture.md, Topics): the owner adds one on the Community
 * page, a post is filed under it from the grafted Post button, its pill
 * opens the topic for a reader and the filing menu for the staff, the bar
 * wears the same pill, following a topic brings a notification, and a
 * deleted topic leaves its posts without one.
 */
test.describe('topics', () => {
  test('from the owner adding one to a follower being told, and a moderator refiling', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const name = uniq('Practice ')

    // The owner adds a topic. Until one exists, nothing about topics shows anywhere.
    await open(o.page, '/community')
    await o.page.getByLabel('Topic name').fill(name)
    await o.page.getByLabel('What goes in it').fill('What is working, what is not.')
    await o.page.getByRole('button', { name: 'Add topic' }).click()
    await expect(o.page.getByRole('listitem').filter({ hasText: name })).toContainText('0 posts')

    // Home: the bar's pill reads Everything. The post is filed from the control grafted onto Post.
    await open(o.page)
    await expect(o.page.getByRole('button', { name: 'Topic' }).first()).toContainText('Everything')
    const text = uniq('A filed post ')
    await postEditor(o.page).click()
    await o.page.keyboard.type(text)
    const composer = o.page.locator('form').filter({ has: postEditor(o.page) })
    await composer.getByRole('button', { name: 'Topic' }).click()
    await o.page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click()
    await expect(composer.getByRole('button', { name: 'Topic' })).toContainText(name)
    await o.page.getByRole('button', { name: 'Post', exact: true }).click()
    const mine = article(o.page, text)
    await expect(mine).toBeVisible()
    // The owner is staff: the pill is the filing menu.
    await expect(mine.getByRole('button', { name: `Topic: ${name}` })).toBeVisible()
    await o.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-feed.png`, fullPage: true })

    // A reader's pill opens the topic: the URL names it, the strip names it, the bar's pill reads it.
    await open(kit.page)
    const theirs = article(kit.page, text)
    const pill = theirs.getByRole('link', { name: `Topic: ${name}` })
    await expect(pill).toHaveText(name)
    await pill.click()
    await expect(kit.page).toHaveURL(/\/\?topic=/)
    const strip = kit.page.getByRole('region', { name: 'Topic' })
    await expect(strip).toContainText(name)
    await expect(strip).toContainText('What is working, what is not.')
    await expect(kit.page.getByRole('button', { name: 'Topic' }).first()).toContainText(name)
    await expect(article(kit.page, text)).toBeVisible()
    // Following: Notify me is pressed from then on.
    await strip.getByRole('button', { name: 'Notify me' }).click()
    await expect(strip.getByRole('button', { name: 'Notify me' })).toHaveAttribute('aria-pressed', 'true')
    await kit.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-topic.png`, fullPage: true })

    // In the topic view the composer starts with the topic. Mo posts there; kit, following, is told.
    const url = kit.page.url()
    await mo.page.goto(url)
    await expect(mo.page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    const moComposer = mo.page.locator('form').filter({ has: postEditor(mo.page) })
    await expect(moComposer.getByRole('button', { name: 'Topic' })).toContainText(name)
    const second = uniq('Something that worked ')
    await postEditor(mo.page).click()
    await mo.page.keyboard.type(second)
    await mo.page.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(article(mo.page, second)).toBeVisible()
    await expect(article(kit.page, second)).toBeVisible()
    await open(kit.page, '/notifications')
    await expect(kit.page.getByText(`${mo.username} posted in ${name}`)).toBeVisible()
    // The author is not told of their own post.
    await open(mo.page, '/notifications')
    await expect(mo.page.getByText(`posted in ${name}`)).toHaveCount(0)

    // Show everything is the way back. The post outside the topic is on the feed again.
    await open(kit.page, url)
    await kit.page.getByRole('link', { name: 'Show everything' }).click()
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(kit.page.getByRole('region', { name: 'Topic' })).toHaveCount(0)

    // The owner refiles mo's post from its pill: No topic. The pill goes, for everyone.
    await open(o.page)
    const moPost = article(o.page, second)
    await moPost.getByRole('button', { name: `Topic: ${name}` }).click()
    await o.page.getByRole('menuitemradio', { name: 'No topic' }).click()
    await expect(moPost.getByRole('button', { name: `Topic: ${name}` })).toHaveCount(0)
    await expect(article(kit.page, second).getByRole('link', { name: `Topic: ${name}` })).toHaveCount(0)

    // Deleting the topic: the dialog says what happens, the owner's post stays, unfiled.
    await open(o.page, '/community')
    await o.page.getByRole('button', { name: `Options for ${name}` }).click()
    await o.page.getByRole('menuitem', { name: 'Delete' }).click()
    const dialog = o.page.getByRole('dialog')
    await expect(dialog).toContainText('Its 1 post stays, without a topic.')
    await expect(dialog).toContainText('The 1 person who asked to be notified about it will not be any more.')
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(o.page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0)
    await open(o.page)
    await expect(article(o.page, text)).toBeVisible()
    await expect(article(o.page, text).getByRole('button', { name: /^Topic:/ })).toHaveCount(0)

    await kit.context.close()
    await mo.context.close()
    await o.context.close()
  })

  test('@phone the pill, the strip and the grafted button fit the small screen', async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    const name = uniq('Reading ')
    const made = await o.context.request.post('/api/topics', { data: { name, description: 'Papers and reports.' } })
    expect(made.ok()).toBeTruthy()
    const id = ((await made.json()) as { id: string }).id
    await open(o.page, `/?topic=${id}`)
    await anyView(o.page, 'Posts').click()
    const strip = o.page.getByRole('region', { name: 'Topic' })
    await expect(strip).toContainText(name)
    const composer = o.page.locator('form').filter({ has: postEditor(o.page) })
    await expect(composer.getByRole('button', { name: 'Topic' })).toContainText(name)
    const text = uniq('On a phone ')
    await postEditor(o.page).click()
    await o.page.keyboard.type(text)
    await o.page.getByRole('button', { name: 'Post', exact: true }).click()
    const mine = article(o.page, text)
    await expect(mine.getByRole('button', { name: `Topic: ${name}` })).toBeVisible()
    // Nothing wider than the screen.
    const width = await o.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(width).toBe(0)
    await o.page.screenshot({ path: `test-results/topics-phone.png`, fullPage: true })
    await o.context.request.delete(`/api/topics/${id}`)
    await o.context.close()
  })
})
