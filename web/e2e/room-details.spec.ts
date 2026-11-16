import { expect, member, open, test, uniq } from './helpers'

for (const tag of ['@dev', '@phone']) {
  test(
    tag + ' room descriptions and role sections stay consistent for owners and members',
    async ({ browser }, info) => {
      const writer = await member(browser, info, 'writer')
      const moderator = await member(browser, info, 'moderator')
      const reader = await member(browser, info, 'reader')
      moderator.username = moderator.username.padEnd(32, 'x')
      expect(
        (await moderator.context.request.put('/api/me/username', { data: { username: moderator.username } })).ok(),
      ).toBe(true)
      if (info.project.use.isMobile) {
        await writer.page.setViewportSize({ width: 360, height: 800 })
        await reader.page.setViewportSize({ width: 360, height: 800 })
      }
      const roomName = uniq('Garden ').padEnd(40, 'x')
      const description = ('Discuss <plants> & gardens. ' + uniq('Seasonal ')).padEnd(140, 'x')
      await open(writer.page, '/rooms/new')
      await writer.page.getByLabel('Room name', { exact: true }).fill(roomName)
      await writer.page.getByRole('textbox', { name: 'Description', exact: true }).fill(description)
      await writer.page.screenshot({
        path: info.outputPath('create-description.png'),
        animations: 'disabled',
        scale: 'css',
      })
      await writer.page.getByRole('button', { name: 'Create room', exact: true }).click()
      await expect(writer.page).toHaveURL(/\/r\/[^/]+$/)
      const roomPath = new URL(writer.page.url()).pathname
      await writer.page.getByRole('button', { name: 'Members and settings', exact: true }).click()
      await expect(writer.page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(description)
      await expect(writer.page.getByRole('region', { name: 'Owner', exact: true })).toContainText(writer.username)
      await expect(writer.page.getByRole('region', { name: 'Moderators', exact: true })).toContainText('No moderators.')
      await writer.page
        .getByRole('region', { name: 'Members', exact: true })
        .getByRole('button', { name: `Options for ${moderator.username}` })
        .click()
      await writer.page.getByRole('menuitem', { name: 'Make moderator', exact: true }).click()
      await expect(writer.page.getByRole('region', { name: 'Moderators', exact: true })).toContainText(
        moderator.username,
      )
      await expect(writer.page.getByRole('region', { name: 'Members', exact: true })).not.toContainText(
        moderator.username,
      )
      await writer.page.getByRole('heading', { name: 'Room settings', exact: true }).scrollIntoViewIfNeeded()
      await writer.page.screenshot({ path: info.outputPath('owner-details.png'), animations: 'disabled', scale: 'css' })
      await writer.page
        .getByRole('region', { name: 'Owner', exact: true })
        .evaluate((el) => el.scrollIntoView({ block: 'start' }))
      const moderatorSection = writer.page.getByRole('region', { name: 'Moderators', exact: true })
      const personBox = await moderatorSection
        .getByRole('button', { name: moderator.username, exact: true })
        .boundingBox()
      const menuBox = await moderatorSection
        .getByRole('button', { name: `Options for ${moderator.username}`, exact: true })
        .boundingBox()
      expect(
        personBox && menuBox && menuBox.y < personBox.y + personBox.height && menuBox.x > personBox.x + personBox.width,
      ).toBeTruthy()
      await writer.page.screenshot({ path: info.outputPath('owner-people.png'), animations: 'disabled', scale: 'css' })
      await open(reader.page, roomPath + '/members')
      await expect(reader.page.getByText(description, { exact: true })).toBeVisible()
      await expect(reader.page.getByRole('region', { name: 'Owner', exact: true })).toContainText(writer.username)
      await expect(reader.page.getByRole('region', { name: 'Moderators', exact: true })).toContainText(
        moderator.username,
      )
      await expect(reader.page.getByRole('region', { name: 'Members', exact: true })).toContainText(reader.username)
      await expect(reader.page.getByRole('button', { name: /^Options for / })).toHaveCount(0)
      await reader.page.screenshot({
        path: info.outputPath('member-details.png'),
        animations: 'disabled',
        scale: 'css',
      })
      await open(reader.page, '/rooms')
      await reader.page.getByRole('textbox', { name: 'Search rooms' }).fill(roomName)
      await expect(reader.page.getByRole('button', { name: roomName, exact: true })).toContainText(description)
      await reader.page.screenshot({
        path: info.outputPath('browse-long-description.png'),
        animations: 'disabled',
        scale: 'css',
      })
      const listedRoom = reader.page.getByRole('button', { name: roomName, exact: true })
      const title = await listedRoom.getByText(roomName, { exact: true }).boundingBox()
      const star = await listedRoom
        .locator('..')
        .locator('..')
        .getByRole('button', { name: 'Add to sidebar', exact: true })
        .boundingBox()
      expect(title && star && Math.abs(title.y + title.height / 2 - star.y - star.height / 2)).toBeLessThanOrEqual(5)
      await open(reader.page, roomPath + '/members')
      const changed = uniq('Wildflowers ')
      await writer.page.getByRole('textbox', { name: 'Description', exact: true }).fill(changed)
      const updateURL = '**/api/groups/' + roomPath.split('/').at(-1)
      await writer.page.route(updateURL, (route) =>
        route.request().method() === 'PUT'
          ? route.fulfill({
              status: 500,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Could not save description' }),
            })
          : route.continue(),
      )
      await writer.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(writer.page.getByRole('alert')).toContainText('Could not save description')
      await expect(writer.page.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue(changed)
      await writer.page.unroute(updateURL)
      await writer.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(reader.page.getByText(changed, { exact: true })).toBeVisible()
      await reader.page.reload()
      await expect(reader.page.getByText(changed, { exact: true })).toBeVisible()
      await open(reader.page, '/rooms')
      await reader.page.getByRole('textbox', { name: 'Search rooms' }).fill(changed)
      const room = reader.page.getByRole('button', { name: roomName, exact: true })
      await expect(room).toContainText(changed)
      await reader.page.screenshot({
        path: info.outputPath('browse-description.png'),
        animations: 'disabled',
        scale: 'css',
      })
      await room.click()
      await expect(reader.page).toHaveURL(new RegExp(roomPath + '$'))
      await expect(reader.page.getByRole('heading', { name: roomName, exact: true })).toBeVisible()
      await open(reader.page, roomPath + '/members')
      await writer.page.getByRole('textbox', { name: 'Description', exact: true }).fill('')
      await writer.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(reader.page.getByRole('heading', { name: 'About this room', exact: true })).toHaveCount(0)
      await reader.page.reload()
      await expect(reader.page.getByRole('heading', { name: 'People in this room', exact: true })).toBeVisible()
      await expect(reader.page.getByText(changed, { exact: true })).toHaveCount(0)
      // Transferring ownership moves both people to the correct sections for all viewers.
      await writer.page
        .getByRole('region', { name: 'Moderators', exact: true })
        .getByRole('button', { name: `Options for ${moderator.username}` })
        .click()
      await writer.page.getByRole('menuitem', { name: 'Make owner', exact: true }).click()
      await writer.page.getByRole('dialog').getByRole('button', { name: 'Make owner', exact: true }).click()
      await expect(writer.page.getByRole('region', { name: 'Owner', exact: true })).toContainText(moderator.username)
      await expect(writer.page.getByRole('region', { name: 'Moderators', exact: true })).toContainText(writer.username)
      await expect(writer.page.getByRole('textbox', { name: 'Description', exact: true })).toHaveCount(0)
      await expect(reader.page.getByRole('region', { name: 'Owner', exact: true })).toContainText(moderator.username)
      await expect(reader.page.getByRole('region', { name: 'Moderators', exact: true })).toContainText(writer.username)
      await writer.context.close()
      await moderator.context.close()
      await reader.context.close()
    },
  )
}
