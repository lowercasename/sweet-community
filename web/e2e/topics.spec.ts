import { anyView, article, expect, member, open, owner, postEditor, test, uniq } from './helpers'

/**
 * Topics (architecture.md, Topics). The owner adds a topic on the Community
 * page. A new post gets the topic the feed is filtered to. A post's
 * topic pill opens the topic. The author changes the topic while editing the
 * post. The feed header shows the same pill. A subscriber gets a notification
 * for a new post in the topic. Deleting a topic leaves its posts without a topic.
 */
test.describe('topics', () => {
  test('the owner adds a topic, a subscriber gets a notification, and the author removes the topic from a post', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const name = uniq('Practice ')

    // The owner adds a topic. Until a topic exists, nothing about topics is shown anywhere.
    await open(o.page, '/community')
    await o.page.getByLabel('Topic name').fill(name)
    await o.page.getByLabel('Short description').fill('What is working, what is not.')
    await o.page.getByRole('button', { name: 'Create topic' }).click()
    await expect(o.page.getByRole('listitem').filter({ hasText: name })).toContainText('0 posts')

    // Home shows Everything. The composer has no topic control. To post in a topic, select it in the
    // feed header first, then post.
    await open(o.page)
    await expect(o.page.getByRole('button', { name: 'Showing' })).toContainText('Everything')
    // For the owner and moderators, the menu ends with Edit topics, which opens the Topics card.
    await o.page.getByRole('button', { name: 'Showing' }).click()
    await o.page.getByRole('menuitem', { name: 'Edit topics' }).click()
    await expect(o.page).toHaveURL(/\/community$/)
    await open(o.page)
    const composer = o.page.locator('form').filter({ has: postEditor(o.page) })
    await expect(composer.getByRole('button', { name: 'Topic' })).toHaveCount(0)
    await o.page.getByRole('button', { name: 'Showing' }).click()
    await o.page.getByRole('menuitemradio', { name: new RegExp(`^${name}`) }).click()
    await expect(o.page.getByRole('button', { name: 'Showing' })).toContainText(name)
    const text = uniq('A filed post ')
    await postEditor(o.page).click()
    await o.page.keyboard.type(text)
    await o.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-composer.png` })
    await o.page.getByRole('button', { name: 'Post', exact: true }).click()
    const mine = article(o.page, text)
    await expect(mine).toBeVisible()
    // The pill opens the topic for every user, including the author.
    await expect(mine.getByRole('link', { name: `Topic: ${name}` })).toBeVisible()
    await o.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-feed.png`, fullPage: true })

    // The pill also opens the topic for another user. The URL contains the topic, and the feed header shows its
    // name.
    await open(kit.page)
    const theirs = article(kit.page, text)
    const pill = theirs.getByRole('link', { name: `Topic: ${name}` })
    await expect(pill).toHaveText(name)
    await pill.click()
    await expect(kit.page).toHaveURL(/\/\?topic=/)
    await expect(kit.page.getByRole('button', { name: 'Showing' })).toContainText(name)
    await expect(kit.page.getByText('What is working, what is not.')).toBeVisible()
    await expect(article(kit.page, text)).toBeVisible()
    // Subscribe. From then on, the button shows the subscribed state.
    await kit.page.getByRole('button', { name: 'Subscribe' }).click()
    // While the pointer is over the toggle, it shows its action, Unsubscribe. Otherwise it shows its state.
    await expect(kit.page.getByRole('button', { name: 'Unsubscribe' })).toHaveAttribute('aria-pressed', 'true')
    await kit.page.mouse.move(8, 8)
    const subscribed = kit.page.getByRole('button', { name: 'Subscribed' })
    await expect(subscribed).toHaveAttribute('aria-pressed', 'true')
    // The pressed state is shown in Sweet red.
    await expect(subscribed).toHaveCSS('color', 'rgb(206, 23, 23)')
    await kit.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-topic.png`, fullPage: true })

    // While a topic is shown, a new post gets that topic, and there is no topic chooser beside Post. Mo posts in the
    // topic, and kit, who is subscribed, gets a notification.
    const url = kit.page.url()
    await mo.page.goto(url)
    await expect(mo.page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(mo.page.getByRole('button', { name: 'Showing' })).toContainText(name)
    const moComposer = mo.page.locator('form').filter({ has: postEditor(mo.page) })
    await expect(moComposer.getByRole('button', { name: 'Topic' })).toHaveCount(0)
    const second = uniq('Something that worked ')
    await postEditor(mo.page).click()
    await mo.page.keyboard.type(second)
    await mo.page.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(article(mo.page, second)).toBeVisible()
    await expect(article(kit.page, second)).toBeVisible()
    await open(kit.page, '/notifications')
    await expect(kit.page.getByText(`${mo.username} posted in ${name}`)).toBeVisible()
    // The author does not get a notification for their own post.
    await open(mo.page, '/notifications')
    await expect(mo.page.getByText(`posted in ${name}`)).toHaveCount(0)

    // Choosing Everything in the feed header returns to the unfiltered feed.
    await open(kit.page, url)
    await kit.page.getByRole('button', { name: 'Showing' }).click()
    await kit.page.getByRole('menuitemradio', { name: 'Everything' }).click()
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(kit.page.getByRole('button', { name: 'Showing' })).toContainText('Everything')

    // Mo removes the topic from their post while editing it, by choosing No topic and then Save. The pill is
    // removed for every user.
    await open(mo.page)
    const moPost = article(mo.page, second)
    await moPost.getByRole('button', { name: 'Post options' }).click()
    await mo.page.getByRole('menuitem', { name: 'Edit' }).click()
    await mo.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-edit.png` })
    await moPost.getByRole('button', { name: 'Topic' }).click()
    await mo.page.getByRole('menuitemradio', { name: 'No topic' }).click()
    await moPost.getByRole('button', { name: 'Save' }).click()
    await expect(moPost.getByRole('link', { name: `Topic: ${name}` })).toHaveCount(0)
    await expect(article(kit.page, second).getByRole('link', { name: `Topic: ${name}` })).toHaveCount(0)

    // Delete the topic. The dialog says what will happen. The owner's post stays, without a topic.
    await open(o.page, '/community')
    await o.page.getByRole('button', { name: `Options for ${name}` }).click()
    await o.page.getByRole('menuitem', { name: 'Delete' }).click()
    const dialog = o.page.getByRole('dialog')
    await expect(dialog).toContainText('Its 1 post stays, without a topic.')
    await expect(dialog).toContainText('Its 1 subscriber will no longer be notified.')
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(o.page.getByRole('listitem').filter({ hasText: name })).toHaveCount(0)
    await open(o.page)
    await expect(article(o.page, text)).toBeVisible()
    await expect(article(o.page, text).getByRole('link', { name: /^Topic:/ })).toHaveCount(0)

    await kit.context.close()
    await mo.context.close()
    await o.context.close()
  })

  test('@phone the pills in the feed header and on a post fit the small screen', async ({ browser }, testInfo) => {
    const o = await owner(browser, testInfo)
    // Use the longest allowed name and description, because the longest content is what breaks a layout.
    const name = uniq('Seed swaps and saving for spring ').slice(0, 40)
    const made = await o.context.request.post('/api/topics', {
      data: {
        name,
        description:
          'Which seeds to keep, how to dry and store them, and who has spare packets to share, at any length up to here.',
      },
    })
    expect(made.ok()).toBeTruthy()
    const id = ((await made.json()) as { id: string }).id
    await open(o.page, `/?topic=${id}`)
    await anyView(o.page, 'Posts').click()
    await expect(o.page.getByRole('button', { name: 'Showing' })).toContainText(name)
    const text = uniq('On a phone ')
    await postEditor(o.page).click()
    await o.page.keyboard.type(text)
    await o.page.screenshot({ path: `test-results/topics-phone-composer.png` })
    await o.page.getByRole('button', { name: 'Post', exact: true }).click()
    const mine = article(o.page, text)
    await expect(mine.getByRole('link', { name: `Topic: ${name}` })).toBeVisible()
    await expect(mine.getByRole('button', { name: 'Post options' })).toBeVisible()
    // No element in the composer or on the post is wider than the screen, including elements that are clipped.
    const overflow = await o.page.evaluate(
      () =>
        [...document.querySelectorAll('form *, article *')].filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)
        }).length,
    )
    expect(overflow).toBe(0)
    // The author's name is on one line, and the pill's icon keeps its size.
    const nameBox = await mine.getByRole('button', { name: 'raphael' }).boundingBox()
    expect(nameBox!.height).toBeLessThan(40)
    const iconBox = await mine
      .getByRole('link', { name: `Topic: ${name}` })
      .locator('svg')
      .first()
      .boundingBox()
    expect(iconBox!.width).toBe(14)
    await o.page.screenshot({ path: `test-results/topics-phone.png`, fullPage: true })
    await o.context.request.delete(`/api/topics/${id}`)
    await o.context.close()
  })
})
