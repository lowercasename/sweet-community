import { anyView, article, expect, member, open, prepare, test, uniq } from './helpers'

for (const tag of ['@dev', '@phone'])
  for (const visibility of ['open', 'private'])
    test(`${tag} ${visibility} room owners choose posts, chat or both without losing content`, async ({
      browser,
    }, info) => {
      const creator = await member(browser, info, 'owner'.padEnd(24, 'x'))
      const reader = await member(browser, info, 'reader'.padEnd(24, 'x'))
      for (const person of [creator, reader]) {
        person.username = person.username.padEnd(32, 'x')
        expect(
          (await person.context.request.put('/api/me/username', { data: { username: person.username } })).ok(),
        ).toBe(true)
      }
      const name = uniq('Room ').padEnd(40, 'x')
      const description = 'A room description '.padEnd(140, 'x')
      await open(creator.page, '/rooms/new')
      await creator.page.getByLabel('Room name', { exact: true }).fill(name)
      await creator.page.getByLabel('Description', { exact: true }).fill(description)
      await expect(creator.page.getByRole('combobox', { name: 'Mode', exact: true })).toHaveValue('posts')
      await creator.page.getByRole('radio', { name: visibility === 'open' ? 'Open' : 'Private', exact: true }).check()
      if (visibility === 'private')
        await creator.page.getByRole('checkbox', { name: reader.username, exact: true }).check()
      await creator.page.screenshot({
        path: info.outputPath('new-room-mode.png'),
        fullPage: true,
        scale: 'css',
        animations: 'disabled',
      })
      await creator.page.getByRole('button', { name: 'Create room', exact: true }).click()
      await expect(creator.page).toHaveURL(/\/r\/[^/]+$/)
      const path = new URL(creator.page.url()).pathname
      const gid = path.split('/').pop()!
      await open(reader.page, path)
      await expect(reader.page.locator('.editor-post')).toBeVisible()
      await expect(reader.page.locator('.editor-line')).toHaveCount(0)
      const postText = uniq('Keep the post ')
      await creator.context.request.post(`/api/groups/${gid}/posts`, { data: { body_html: `<p>${postText}</p>` } })
      await expect(article(reader.page, postText)).toBeVisible()
      await creator.page.getByRole('button', { name: 'Members and settings', exact: true }).click()
      await expect(creator.page.getByText('Chat notifications', { exact: true })).toHaveCount(0)
      const otherSettings = await creator.context.newPage()
      await prepare(otherSettings)
      await open(otherSettings, path + '/members')
      await expect(otherSettings.getByRole('combobox', { name: 'Mode', exact: true })).toHaveValue('posts')
      await creator.page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('chat')
      await creator.page.getByRole('combobox', { name: 'Mode', exact: true }).scrollIntoViewIfNeeded()
      await creator.page.screenshot({
        path: info.outputPath('room-mode-settings.png'),
        fullPage: true,
        scale: 'css',
        animations: 'disabled',
      })
      await creator.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(creator.page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      await expect(otherSettings.getByRole('combobox', { name: 'Mode', exact: true })).toHaveValue('chat')
      await expect(otherSettings.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      await otherSettings.getByRole('textbox', { name: 'Description', exact: true }).fill('Changed in another tab')
      await otherSettings.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(otherSettings.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      await otherSettings.close()
      await expect(reader.page.locator('.editor-post')).toHaveCount(0)
      await expect(reader.page.locator('.editor-line')).toBeVisible()
      const chatText = uniq('Keep the message ')
      await creator.context.request.post(`/api/groups/${gid}/messages`, { data: { body_html: `<p>${chatText}</p>` } })
      await expect(reader.page.getByText(chatText, { exact: true })).toBeVisible()
      await reader.page.getByRole('button', { name: 'Members and settings', exact: true }).click()
      await expect(reader.page.getByRole('combobox', { name: 'Mode', exact: true })).toHaveCount(0)
      await reader.page.getByRole('button', { name: `Back to ${name}`, exact: true }).click()
      await creator.page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('both')
      await creator.page.getByRole('button', { name: 'Save', exact: true }).click()
      await expect(creator.page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
      if (info.project.use.isMobile) await anyView(reader.page, 'Posts').click()
      await expect(article(reader.page, postText)).toBeVisible()
      if (info.project.use.isMobile) await anyView(reader.page, 'Chat').click()
      await expect(reader.page.getByText(chatText, { exact: true })).toBeVisible()
      await creator.context.close()
      await reader.context.close()
    })
