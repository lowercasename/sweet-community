import { anyView, article, expect, member, open, owner, postEditor, test, uniq } from './helpers'

/**
 * Topics (architecture.md, Topics): the owner adds one on the Community
 * page, a post is filed under it from the button beside Post, its pill
 * opens the topic, the author changes it while editing, the feed's head
 * wears the same pill, subscribing brings a notification, and a
 * deleted topic leaves its posts without one.
 */
test.describe('topics', () => {
  test('from the owner adding one to a subscriber being told, and the author unfiling', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const name = uniq('Practice ')

    // The owner adds a topic. Until one exists, nothing about topics shows anywhere.
    await open(o.page, '/community')
    await o.page.getByLabel('Topic name').fill(name)
    await o.page.getByLabel('Short description').fill('What is working, what is not.')
    await o.page.getByRole('button', { name: 'Add topic' }).click()
    await expect(o.page.getByRole('listitem').filter({ hasText: name })).toContainText('0 posts')

    // Home shows Everything. The composer has no topic control. To post in a topic, select it in the
    // feed header first, then post.
    await open(o.page)
    await expect(o.page.getByRole('button', { name: 'Showing' })).toContainText('Everything')
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
    // The pill opens the topic for everyone, the author included.
    await expect(mine.getByRole('link', { name: `Topic: ${name}` })).toBeVisible()
    await o.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-feed.png`, fullPage: true })

    // A reader's pill opens the topic: the URL names it, the feed's head reads it.
    await open(kit.page)
    const theirs = article(kit.page, text)
    const pill = theirs.getByRole('link', { name: `Topic: ${name}` })
    await expect(pill).toHaveText(name)
    await pill.click()
    await expect(kit.page).toHaveURL(/\/\?topic=/)
    await expect(kit.page.getByRole('button', { name: 'Showing' })).toContainText(name)
    await expect(kit.page.getByText('What is working, what is not.')).toBeVisible()
    await expect(article(kit.page, text)).toBeVisible()
    // Subscribing: the button says so from then on.
    await kit.page.getByRole('button', { name: 'Subscribe' }).click()
    // Under the pointer the toggle offers its action, Unsubscribe. Away from it, it shows its state.
    await expect(kit.page.getByRole('button', { name: 'Unsubscribe' })).toHaveAttribute('aria-pressed', 'true')
    await kit.page.mouse.move(8, 8)
    const subscribed = kit.page.getByRole('button', { name: 'Subscribed' })
    await expect(subscribed).toHaveAttribute('aria-pressed', 'true')
    // Pressed looks pressed: Sweet red.
    await expect(subscribed).toHaveCSS('color', 'rgb(206, 23, 23)')
    await kit.page.screenshot({ path: `test-results/topics-${testInfo.project.name}-topic.png`, fullPage: true })

    // Inside the topic a post goes where you are: no chooser beside Post. Mo posts there; kit, subscribed, is told.
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
    // The author is not told of their own post.
    await open(mo.page, '/notifications')
    await expect(mo.page.getByText(`posted in ${name}`)).toHaveCount(0)

    // Everything, from the feed's head, is the way back.
    await open(kit.page, url)
    await kit.page.getByRole('button', { name: 'Showing' }).click()
    await kit.page.getByRole('menuitemradio', { name: 'Everything' }).click()
    await expect(kit.page).toHaveURL(/\/$/)
    await expect(kit.page.getByRole('button', { name: 'Showing' })).toContainText('Everything')

    // Mo unfiles their post while editing it: No topic, Save. The pill goes, for everyone.
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

    // Deleting the topic: the dialog says what happens, the owner's post stays, unfiled.
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

  test('@phone the pills at the head of the feed, beside Post and on a post fit the small screen', async ({
    browser,
  }, testInfo) => {
    const o = await owner(browser, testInfo)
    // The longest a name and a description can be, since that is where a layout breaks.
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
    // Nothing wider than the screen, in the composer or on the post, not even clipped.
    const overflow = await o.page.evaluate(
      () =>
        [...document.querySelectorAll('form *, article *')].filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)
        }).length,
    )
    expect(overflow).toBe(0)
    // The author's name is on one line, and the pill's icon kept its size.
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
