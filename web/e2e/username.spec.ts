import { ROOT, article, expect, member, open, owner, test, uniq } from './helpers'

/**
 * A user changes their username on Settings. Another user's open pages show the new name at once: on the user's
 * post, in a mention of them, and on their profile, which moves to the new address.
 */
test('a new username reaches every open page', async ({ browser }, testInfo) => {
  const kit = await member(browser, testInfo)
  const o = await owner(browser, testInfo)
  const kitId = ((await (await kit.context.request.get('/api/me')).json()) as { id: string }).id
  const text = uniq('A post by kit ')
  const mention = uniq('A mention of kit ')
  const posted = await kit.context.request.post(`/api/groups/${ROOT}/posts`, { data: { body_html: `<p>${text}</p>` } })
  expect(posted.ok(), await posted.text()).toBeTruthy()
  const mentioned = await o.context.request.post(`/api/groups/${ROOT}/posts`, {
    data: {
      body_html: `<p>${mention}<span data-type="mention" data-mention-id="${kitId}">@${kit.username}</span></p>`,
    },
  })
  expect(mentioned.ok(), await mentioned.text()).toBeTruthy()

  await open(o.page)
  await expect(article(o.page, text)).toContainText(kit.username)
  await expect(article(o.page, mention).getByRole('link', { name: `@${kit.username}` })).toBeVisible()
  const profile = await o.context.newPage()
  await open(profile, `/u/${kit.username}`)
  await expect(profile.getByRole('heading', { name: kit.username }).last()).toBeVisible()

  const renamed = uniq('kat')
  await open(kit.page, '/settings')
  await kit.page.getByLabel('New username').fill(renamed)
  await kit.page.getByRole('button', { name: 'Change username' }).click()
  await expect(kit.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: renamed })).toBeVisible()

  await expect(article(o.page, text)).toContainText(renamed)
  await expect(article(o.page, mention).getByRole('link', { name: `@${renamed}` })).toBeVisible()
  await expect(profile).toHaveURL(new RegExp(`/u/${renamed}$`))
  await expect(profile.getByRole('heading', { name: renamed }).last()).toBeVisible()
  await kit.context.close()
  await o.context.close()
})
