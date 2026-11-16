import { expect, member, open, png, sendMessage, test, uniq, type Person } from './helpers'

const nav = (p: Person) => p.page.getByRole('navigation', { name: 'Main' })

/** Opens a DM with a user from the People page and waits until the DM is shown. */
async function messageFromPeople(p: Person, who: string) {
  await nav(p).getByRole('button', { name: 'People' }).click()
  await p.page.getByRole('listitem').filter({ hasText: who }).getByRole('button', { name: 'Message' }).click()
  await expect(p.page).toHaveURL(/\/r\/[^/]+$/)
  await expect(p.page.getByRole('heading', { name: who })).toBeVisible()
}

test.describe('nav', () => {
  for (const suffix of [' @dev', ' @phone']) {
    test('private room locks align beside short and truncated names' + suffix, async ({ browser }, info) => {
      const kit = await member(browser, info, 'navcheck')
      const long = "It's A Room, Mario, But Not As You Know It"
      for (const name of [long, 'Mod Team']) {
        expect(
          (await kit.context.request.post('/api/groups', { data: { name, visibility: 'private' } })).status(),
        ).toBe(201)
      }
      await open(kit.page, info.project.use.isMobile ? '/menu' : '/')
      const area = info.project.use.isMobile
        ? kit.page.getByRole('group', { name: 'Rooms' })
        : nav(kit).getByRole('group', { name: 'Rooms' })
      const first = area.getByRole('button', { name: long, exact: true })
      const second = area.getByRole('button', { name: 'Mod Team', exact: true })
      const tabToFirst = async () => {
        await nav(kit).getByRole('button', { name: 'Home', exact: true }).focus()
        const count = await nav(kit).getByRole('button').count()
        for (let step = 0; step < count; step++) {
          await kit.page.keyboard.press('Tab')
          if (await first.evaluate((el) => el === document.activeElement)) break
        }
        await expect(first).toBeFocused()
      }
      if (!info.project.use.isMobile) await first.click()
      await kit.page.screenshot({
        path: `test-results/nav-private-${info.project.name}.png`,
        scale: 'css',
        animations: 'disabled',
      })
      const a = await first.getByRole('img', { name: 'Private room', exact: true }).boundingBox()
      const b = await second.getByRole('img', { name: 'Private room', exact: true }).boundingBox()
      expect(Math.abs(a!.x - b!.x)).toBeLessThan(1)
      await expect(first.getByText('I', { exact: true })).toBeVisible()
      await expect(second.getByText('M', { exact: true })).toBeVisible()
      if (!info.project.use.isMobile) {
        await first.hover()
        await expect(kit.page.getByRole('tooltip', { name: long, exact: true })).toBeVisible()
        await kit.page.screenshot({
          path: `test-results/nav-private-hover-${info.project.name}.png`,
          scale: 'css',
          animations: 'disabled',
        })
        await second.click()
        await expect(second).toHaveAttribute('aria-current', 'page')
        await kit.page.screenshot({
          path: `test-results/nav-private-short-selected-${info.project.name}.png`,
          scale: 'css',
          animations: 'disabled',
        })
        await tabToFirst()
        await expect(kit.page.getByRole('tooltip', { name: long, exact: true })).toBeVisible()
        await nav(kit).getByRole('button', { name: 'Collapse', exact: true }).click()
        await tabToFirst()
        await expect(kit.page.getByRole('tooltip', { name: long, exact: true })).toBeVisible()
        await kit.page.screenshot({
          path: `test-results/nav-private-collapsed-${info.project.name}.png`,
          scale: 'css',
          animations: 'disabled',
        })
      }
      await kit.context.close()
    })

    test(
      'a missing room picture shows its initial and a replacement picture loads' + suffix,
      async ({ browser }, info) => {
        const kit = await member(browser, info, 'picturecheck')
        const room = await (
          await kit.context.request.post('/api/groups', {
            data: { name: "It's A Room, Mario, But Not As You Know It", visibility: 'private' },
          })
        ).json()
        const pictures = []
        for (const rgb of [
          [200, 20, 20],
          [20, 20, 200],
        ] as [number, number, number][]) {
          const upload = await kit.context.request.post('/api/images', {
            multipart: { file: { name: 'room.png', mimeType: 'image/png', buffer: png(20, 20, rgb) } },
          })
          expect(upload.status()).toBe(201)
          pictures.push(await upload.json())
        }
        await kit.context.request.put(`/api/groups/${room.id}/picture`, { data: { image_id: pictures[0].id } })
        await kit.page.route(`**${pictures[0].url}`, (route) =>
          route.fulfill({ status: 404, contentType: 'text/plain', body: '404 page not found' }),
        )
        await open(kit.page, info.project.use.isMobile ? '/menu' : `/r/${room.id}`)
        const item = kit.page
          .getByRole('group', { name: 'Rooms', exact: true })
          .getByRole('button', { name: room.name, exact: true })
        await expect(item.getByText('I', { exact: true })).toBeVisible()
        await kit.page.screenshot({
          path: `test-results/nav-picture-fallback-${info.project.name}.png`,
          scale: 'css',
          animations: 'disabled',
        })
        await kit.context.request.put(`/api/groups/${room.id}/picture`, { data: { image_id: pictures[1].id } })
        await expect(item.locator('img')).toHaveAttribute('src', pictures[1].url)
        await expect
          .poll(() => item.locator('img').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
          .toBe(true)
        await kit.context.close()
      },
    )
  }

  test('nav labels are dark text at regular weight, and a section title is the lighter grey', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    const people = nav(kit).getByRole('button', { name: 'People' }).getByText('People')
    await expect(people).toHaveCSS('color', 'rgb(26, 23, 23)')
    await expect(people).toHaveCSS('font-weight', '400')
    // The current item is red, on its label as well as its icon.
    await expect(nav(kit).getByRole('button', { name: 'Home' }).getByText('Home')).toHaveCSS(
      'color',
      'rgb(206, 23, 23)',
    )
    const title = nav(kit).getByRole('group', { name: 'Rooms' }).getByText('Rooms', { exact: true })
    await expect(title).toHaveCSS('color', 'rgb(105, 105, 105)')
    // The release is no longer in the nav. It is at the bottom of Home's feed.
    await expect(nav(kit).getByText('Sweet dev')).toHaveCount(0)
    await kit.context.close()
  })

  test('rooms and conversations have separate nav sections, conversations are ordered by latest message, and the Conversations page lists all', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    const jo = await member(browser, testInfo, 'jo')
    await open(kit.page)

    // A group created with the Rooms section's New room button appears in the Rooms section.
    const groups = nav(kit).getByRole('group', { name: 'Rooms' })
    await groups.getByRole('button', { name: 'New room' }).click()
    const name = uniq('Knitting ')
    await kit.page.getByLabel('Name').fill(name)
    await kit.page.getByRole('button', { name: 'Create room' }).click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(groups.getByRole('button', { name })).toBeVisible()
    await expect(groups.getByRole('button', { name })).toHaveAttribute('aria-current', 'page')
    // A section's items are smaller than Home and have no gap between them, so they form a list under the
    // section title.
    const home = await nav(kit).getByRole('button', { name: 'Home' }).boundingBox()
    const room = await groups.getByRole('button', { name }).boundingBox()
    expect(home && room && room.height < home.height).toBeTruthy()

    // A new conversation appears in the Conversations section immediately. It is marked as current while it is open, and
    // it is shown with the other user's profile picture.
    await messageFromPeople(kit, mo.username)
    const conversations = nav(kit).getByRole('group', { name: 'Conversations' })
    await expect(conversations.getByRole('button', { name: mo.username })).toHaveAttribute('aria-current', 'page')
    await expect(conversations.getByRole('button', { name: mo.username }).locator('img')).toHaveCount(1)
    await sendMessage(kit.page, uniq('hi mo '))
    // The section's New conversation button starts a conversation. After a user is chosen, the conversation opens.
    await conversations.getByRole('button', { name: 'New conversation' }).click()
    await expect(kit.page).toHaveURL(/\/conversations\/new$/)
    await kit.page.getByLabel('To', { exact: true }).selectOption({ label: jo.username })
    await kit.page.getByRole('button', { name: 'Message', exact: true }).click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name: jo.username })).toBeVisible()
    await sendMessage(kit.page, uniq('hi jo '))

    // The section is ordered by latest message. When every conversation is shown, there is no All conversations row.
    // The Conversations page lists them in the same order.
    const items = conversations.getByRole('button')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toHaveAccessibleName('New conversation')
    await expect(items.nth(1)).toHaveText(jo.username)
    await expect(items.nth(2)).toHaveText(mo.username)
    const a = await items.nth(1).boundingBox()
    const b = await items.nth(2).boundingBox()
    expect(a && b && b.y - (a.y + a.height) <= 1).toBeTruthy()
    await kit.page.goto('/conversations')
    await expect(kit.page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
    const rows = kit.page.getByRole('list').getByRole('listitem')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText(jo.username)
    await expect(rows.nth(1)).toContainText(mo.username)

    // Mo sends a message. An event from the stream moves mo's conversation to the top of kit's nav section and of
    // the Conversations page list.
    await open(mo.page)
    await nav(mo).getByRole('button', { name: kit.username }).click()
    await expect(mo.page.getByRole('heading', { name: kit.username })).toBeVisible()
    await sendMessage(mo.page, uniq('hello back '))
    await expect(items.nth(1)).toHaveText(new RegExp(`^${mo.username}`))
    await expect(rows.nth(0)).toContainText(mo.username)
    await expect(rows.nth(1)).toContainText(jo.username)

    // Opening a conversation from the list marks it as current in the nav section.
    await rows.nth(0).getByRole('button').click()
    await expect(kit.page).toHaveURL(/\/r\/[^/]+$/)
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await expect(conversations.getByRole('button', { name: mo.username })).toHaveAttribute('aria-current', 'page')

    // When the nav is collapsed, an item's name is hidden and only its tile is shown. The name is shown in a
    // tooltip, not in the browser's title attribute.
    await nav(kit).getByRole('button', { name: 'Collapse' }).click()
    const tile = nav(kit).getByRole('button', { name })
    await expect(tile).not.toHaveAttribute('title')
    await tile.hover()
    await expect(kit.page.getByRole('tooltip')).toHaveText(name)

    await kit.context.close()
    await mo.context.close()
    await jo.context.close()
  })

  test('@phone the menu contains the same blocks as the nav, including conversations', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    await expect(kit.page).toHaveURL(/\/menu$/)
    const groups = kit.page.getByRole('group', { name: 'Rooms' })
    await expect(groups.getByRole('button', { name: 'New room' })).toBeVisible()
    await expect(
      kit.page.getByRole('group', { name: 'Conversations' }).getByRole('button', { name: 'New conversation' }),
    ).toBeVisible()

    // Open People, message mo, then open the menu again. Mo is in the Conversations section and in the full list.
    await kit.page.getByRole('button', { name: 'People' }).click()
    await kit.page
      .getByRole('listitem')
      .filter({ hasText: mo.username })
      .getByRole('button', { name: 'Message' })
      .click()
    await expect(kit.page.getByRole('heading', { name: mo.username })).toBeVisible()
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    const conversations = kit.page.getByRole('group', { name: 'Conversations' })
    await expect(conversations.getByRole('button', { name: mo.username })).toBeVisible()
    await expect(conversations.getByRole('button', { name: 'All conversations' })).toHaveCount(0)
    await kit.page.goto('/conversations')
    await expect(kit.page.getByRole('list').getByRole('button', { name: mo.username })).toBeVisible()

    // Open Home from the menu.
    await nav(kit).getByRole('button', { name: 'Menu' }).click()
    // Click the menu's Home button, not the tab bar's.
    await kit.page.getByRole('button', { name: 'Home' }).first().click()
    await expect(kit.page).toHaveURL(/\/$/)
    await kit.context.close()
    await mo.context.close()
  })

  test('a rule in the nav has the same space above it as below it, after a section of small items', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await messageFromPeople(kit, mo.username)
    for (const expanded of [true, false]) {
      if (!expanded) await nav(kit).getByRole('button', { name: 'Collapse' }).click()
      const face = (await nav(kit).getByRole('button', { name: mo.username }).locator('img').boundingBox())!
      const rule = (await nav(kit).locator('hr').first().boundingBox())!
      const search = (await nav(kit).getByRole('button', { name: 'Search' }).locator('svg').boundingBox())!
      const above = rule.y - (face.y + face.height)
      const below = search.y - (rule.y + rule.height)
      expect(Math.abs(above - below)).toBeLessThanOrEqual(2)
    }
    await kit.context.close()
    await mo.context.close()
  })
})
