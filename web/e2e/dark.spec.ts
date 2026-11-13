import { article, expect, member, open, owner, sendMessage, test, uniq, writePost } from './helpers'

/**
 * Dark mode. Sweet follows the device's light or dark setting. Every colour is a token in
 * global.css, and the dark values replace the light ones when the device asks for dark.
 */
test.use({ colorScheme: 'dark' })

const bg = (loc: ReturnType<import('@playwright/test').Page['locator']>) =>
  loc.evaluate((el) => getComputedStyle(el).backgroundColor)

test('the app uses the dark colours when the device is set to dark', async ({ browser }, info) => {
  const o = await owner(browser, info)
  const kit = await member(browser, info, 'kit')
  await open(kit.page)
  const text = uniq('A post in the dark ')
  await writePost(kit.page, text)
  await sendMessage(kit.page, uniq('A message in the dark '))

  await open(o.page)
  // The page's dots, a card and the Post button's text take their dark values. The body's background colour is the
  // dot colour, and the paper is drawn over it as a grid.
  expect(await o.page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(42, 38, 38)')
  expect(await bg(article(o.page, text))).toBe('rgb(31, 28, 28)')
  // The Post button is disabled until something is written. Its fill is a dim red and its text a dim pink, so it
  // reads as the main action switched off.
  const postButton = o.page.getByRole('button', { name: 'Post', exact: true })
  await expect(postButton).toHaveCSS('background-color', 'rgb(85, 40, 41)')
  await expect(postButton).toHaveCSS('color', 'rgb(156, 115, 115)')
  // Native controls, such as a select, are drawn dark.
  expect(await o.page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('dark')
  await o.page.screenshot({ path: `test-results/dark-${info.project.name}-home.png` })

  // A dialog darkens the page behind it.
  await article(o.page, text).getByRole('button', { name: 'Post options' }).click()
  await o.page.screenshot({ path: `test-results/dark-${info.project.name}-menu.png` })
  await o.page.getByRole('menuitem', { name: 'Delete' }).click()
  const dialog = o.page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(await dialog.evaluate((el) => getComputedStyle(el, '::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0.6)')
  await o.page.screenshot({ path: `test-results/dark-${info.project.name}-dialog.png` })
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await open(o.page, '/community')
  await o.page.screenshot({ path: `test-results/dark-${info.project.name}-community.png` })
  await o.context.close()
  await kit.context.close()
})

test.describe('the choice on Settings', () => {
  test.use({ colorScheme: 'light' })

  test('overrides the device and is kept on this device', async ({ browser }, info) => {
    const kit = await member(browser, info, 'kit')
    const dots = () => kit.page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await open(kit.page, '/settings')
    expect(await dots()).toBe('rgb(232, 232, 232)')
    const choice = kit.page.getByLabel('Interface mode')
    await expect(choice).toHaveValue('device')
    await choice.selectOption('dark')
    expect(await dots()).toBe('rgb(42, 38, 38)')
    // Buttons and fields fade to their new colours over 150ms. The screenshot waits for that.
    await kit.page.getByRole('heading', { name: 'Interface mode' }).scrollIntoViewIfNeeded()
    await kit.page.waitForTimeout(300)
    await kit.page.screenshot({ path: `test-results/dark-${info.project.name}-settings.png` })
    // A reload draws the page dark from the start, because the choice is applied before the app loads.
    await kit.page.reload()
    expect(await kit.page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
    await expect(kit.page.getByLabel('Interface mode')).toHaveValue('dark')
    await kit.page.getByLabel('Interface mode').selectOption('device')
    expect(await dots()).toBe('rgb(232, 232, 232)')
    await kit.context.close()
  })
})
