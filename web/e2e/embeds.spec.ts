import type { Page } from '@playwright/test'
import { article, chatEditor, expect, member, open, png, postEditor, test, uniq } from './helpers'

/**
 * A link on its own line becomes a link preview card. The server's real fetching is tested in Go, because its
 * fetcher refuses the local addresses that a test page would have. Here the page's requests for previews are
 * answered with fixed previews: one with a picture, and one page that gives none.
 */
const OPEN_DAY = 'https://plots.example/open-day'
const LOGO = 'https://plots.example/logo'
const NOTHING = 'https://plots.example/nothing'

/** Uploads a picture to the test server and returns its address. */
async function upload(page: Page, name: string, w: number, h: number) {
  const up = await page.context().request.post('/api/images', {
    multipart: { file: { name, mimeType: 'image/png', buffer: png(w, h, [70, 140, 70]) } },
  })
  expect(up.ok()).toBeTruthy()
  return ((await up.json()) as { url: string }).url
}

/**
 * Answers the page's preview requests. The open day's picture is 1200 by 630, the shape most pages give. The logo's
 * picture is square.
 */
async function previews(page: Page) {
  const image = await upload(page, 'open-day.png', 1200, 630)
  const logo = await upload(page, 'logo.png', 300, 300)
  await page.route('**/api/previews?*', async (route) => {
    const url = new URL(route.request().url()).searchParams.get('url')
    if (url === OPEN_DAY) {
      await route.fulfill({
        json: {
          url,
          title: 'Allotment open day: tours of every plot, a seed swap and tea in the shed',
          description:
            'Come and see what grows at Weald Stray. Tours start at ten, the seed swap runs all morning, and there will be tea and cake in the shed for anyone who stays.',
          image,
        },
      })
    } else if (url === LOGO) {
      await route.fulfill({ json: { url, title: 'Weald Stray Allotments', description: '', image: logo } })
    } else {
      await route.fulfill({ status: 404, json: { error: 'No preview' } })
    }
  })
}

const card = (scope: Page | ReturnType<Page['locator']>) => scope.locator('.link-preview')

/**
 * Checks a card's picture area: 1.91 times as wide as the card is tall, the shape most pages give, so their pictures
 * show whole.
 */
async function wide(posted: ReturnType<Page['locator']>) {
  const cardBox = (await posted.boundingBox())!
  const pic = (await posted.locator('img').boundingBox())!
  const inside = cardBox.height - 2
  expect(Math.abs(pic.height - inside)).toBeLessThan(1.5)
  expect(Math.abs(pic.width - Math.round(cardBox.height * 1.91))).toBeLessThan(2)
}

/** Checks that the link panel does not cover the post composer's text, where the link being edited is. */
async function clearOfText(page: Page) {
  const panel = (await page.getByRole('dialog', { name: /link$/ }).boundingBox())!
  const text = (await postEditor(page).boundingBox())!
  const above = panel.y + panel.height <= text.y
  const below = panel.y >= text.y + text.height
  expect(above || below).toBeTruthy()
}

test.describe('link preview cards', () => {
  test('Enter after a link on its own line makes a card in the editor, and the post shows it', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await previews(kit.page)
    await open(kit.page)
    const editor = postEditor(kit.page)
    await editor.click()
    await kit.page.keyboard.type(OPEN_DAY)
    await kit.page.keyboard.press('Enter')
    const composer = kit.page.locator('form').filter({ has: kit.page.locator('.editor-post') })
    await expect(composer.getByText('Embedded link')).toBeVisible()
    await expect(composer.getByRole('button', { name: 'Turn back into regular link' })).toBeVisible()
    await expect(card(composer)).toContainText('Allotment open day')
    const words = uniq('See you there ')
    await kit.page.keyboard.type(words)
    await kit.page.screenshot({ path: 'test-results/embed-editor.png' })
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const posted = card(article(kit.page, words))
    await expect(posted).toContainText('Allotment open day')
    await expect(posted).toHaveAttribute('href', OPEN_DAY)
    await expect(posted).toHaveAttribute('target', '_blank')
    // The card names the page's domain, not a name the page gives itself.
    await expect(posted).toContainText('plots.example')
    await expect(article(kit.page, words).locator('img').first()).toBeVisible()
    // The card is 100px tall, or 76px when it is narrower than 400px, as in a posts pane beside the chat.
    const box = (await posted.boundingBox())!
    expect(box.height).toBe(box.width >= 400 ? 100 : 76)
    expect(box.width).toBeLessThanOrEqual(480)
    await wide(posted)
    await expect(posted.locator('img')).toHaveCSS('object-fit', 'cover')
    await kit.page.screenshot({ path: 'test-results/embed-post.png' })
    await kit.context.close()
  })

  test('a square picture, such as a logo, is shown whole in the picture area', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await previews(kit.page)
    await open(kit.page)
    await postEditor(kit.page).click()
    const words = uniq('Our logo ')
    await kit.page.keyboard.type(words)
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type(LOGO)
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const posted = card(article(kit.page, words))
    await expect(posted).toContainText('Weald Stray Allotments')
    await wide(posted)
    await expect(posted.locator('img')).toHaveCSS('object-fit', 'contain')
    await kit.page.screenshot({ path: 'test-results/embed-logo.png' })
    await kit.context.close()
  })

  test('a card turned back stays a plain link when the post is saved', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await previews(kit.page)
    await open(kit.page)
    await postEditor(kit.page).click()
    const words = uniq('Plain please ')
    await kit.page.keyboard.type(words)
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type(OPEN_DAY)
    await kit.page.keyboard.press('Enter')
    await kit.page.getByRole('button', { name: 'Turn back into regular link' }).click()
    await expect(kit.page.getByText('Embedded link')).toHaveCount(0)
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const posted = article(kit.page, words)
    await expect(posted.getByRole('link', { name: OPEN_DAY })).toBeVisible()
    await expect(card(posted)).toHaveCount(0)
    await kit.context.close()
  })

  test('a link on the last line becomes a card when the post is saved, and a page with no preview stays a link', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await previews(kit.page)
    await open(kit.page)
    await postEditor(kit.page).click()
    const words = uniq('Last line ')
    await kit.page.keyboard.type(words)
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type(OPEN_DAY)
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(card(article(kit.page, words))).toContainText('Allotment open day')

    await postEditor(kit.page).click()
    const none = uniq('No preview ')
    await kit.page.keyboard.type(none)
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type(NOTHING)
    await kit.page.keyboard.press('Enter')
    // The page gives no preview, so the editor turns the card back into a link at once.
    await expect(kit.page.getByText('Embedded link')).toHaveCount(0)
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(article(kit.page, none).getByRole('link', { name: NOTHING })).toBeVisible()
    await expect(card(article(kit.page, none))).toHaveCount(0)
    await kit.context.close()
  })

  test('a link alone in a chat message or a comment is shown as a card', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await previews(kit.page)
    await open(kit.page)
    const words = uniq('Who is going ')
    await chatEditor(kit.page).click()
    await kit.page.keyboard.type(words)
    await kit.page.keyboard.press('Shift+Enter')
    await kit.page.keyboard.type(OPEN_DAY)
    await kit.page.keyboard.press('Enter')
    const message = kit.page.getByRole('article').filter({ hasText: words }).last()
    await expect(card(message)).toContainText('Allotment open day')
    await kit.page.screenshot({ path: 'test-results/embed-chat.png' })

    const post = uniq('Comment here ')
    await postEditor(kit.page).click()
    await kit.page.keyboard.type(post)
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    await article(kit.page, post).getByRole('button', { name: 'Show comments' }).click()
    await article(kit.page, post).locator('.editor-line .ProseMirror').click()
    await kit.page.keyboard.type(OPEN_DAY)
    await kit.page.getByRole('button', { name: 'Reply', exact: true }).click()
    await expect(card(article(kit.page, post))).toContainText('Allotment open day')
    await kit.context.close()
  })

  test("in dark mode a card uses Sweet's dark card colour", async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await kit.page.addInitScript(() => localStorage.setItem('sweet.theme', 'dark'))
    await previews(kit.page)
    await open(kit.page)
    await postEditor(kit.page).click()
    const words = uniq('In the dark ')
    await kit.page.keyboard.type(words)
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type(OPEN_DAY)
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const posted = card(article(kit.page, words))
    await expect(posted).toContainText('Allotment open day')
    const colour = await kit.page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = 'var(--color-card)'
      document.body.append(probe)
      const value = getComputedStyle(probe).backgroundColor
      probe.remove()
      return value
    })
    await expect(posted).toHaveCSS('background-color', colour)
    await kit.page.screenshot({ path: 'test-results/embed-post-dark.png' })
    await kit.context.close()
  })

  test('@phone a card is 76px tall on a phone', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await previews(kit.page)
    await open(kit.page)
    await kit.page
      .getByRole('group', { name: 'View' })
      .getByRole('button', { name: /^Posts/ })
      .click()
    await postEditor(kit.page).click()
    const words = uniq('On a phone ')
    await kit.page.keyboard.type(words)
    await kit.page.keyboard.press('Enter')
    await kit.page.keyboard.type(OPEN_DAY)
    await kit.page.keyboard.press('Enter')
    await expect(kit.page.getByText('Embedded link')).toBeVisible()
    await kit.page.screenshot({ path: 'test-results/embed-editor-phone.png' })
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const posted = card(article(kit.page, words))
    await expect(posted).toContainText('Allotment open day')
    expect((await posted.boundingBox())!.height).toBe(76)
    await wide(posted)
    await kit.page.screenshot({ path: 'test-results/embed-post-phone.png' })
    await kit.context.close()
  })
})

test.describe('the link panel', () => {
  test('adds, edits and removes a link, and Enter in the panel does not post', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await postEditor(kit.page).click()
    const words = uniq('Bring a trowel ')
    await kit.page.keyboard.type(words + 'please')
    for (let i = 0; i < 'please'.length; i++) await kit.page.keyboard.press('Shift+ArrowLeft')
    const composer = kit.page.locator('form').filter({ has: kit.page.locator('.editor-post') })
    await composer.getByRole('button', { name: 'Link' }).click()
    const panel = kit.page.getByRole('dialog', { name: 'Add link' })
    await expect(panel.getByLabel('Link address')).toBeFocused()
    await clearOfText(kit.page)
    await kit.page.screenshot({ path: 'test-results/link-panel.png' })
    await kit.page.keyboard.type('plots.example/tools')
    await kit.page.keyboard.press('Enter')
    await expect(panel).toHaveCount(0)
    await expect(postEditor(kit.page).getByRole('link', { name: 'please' })).toHaveAttribute(
      'href',
      'https://plots.example/tools',
    )
    // Enter in the panel saved the link and did not post.
    await expect(kit.page.getByRole('article').filter({ hasText: words })).toHaveCount(0)

    // The cursor is in the link, so the button shows as pressed and the panel edits the link. Cmd+K opens it too.
    await expect(composer.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true')
    await kit.page.keyboard.press('ControlOrMeta+k')
    const edit = kit.page.getByRole('dialog', { name: 'Edit link' })
    await expect(edit.getByLabel('Link address')).toHaveValue('https://plots.example/tools')
    await edit.getByRole('button', { name: 'Remove link' }).click()
    await expect(postEditor(kit.page).getByRole('link')).toHaveCount(0)
    await expect(postEditor(kit.page)).toContainText(words + 'please')
    await kit.context.close()
  })

  test('@phone the link panel fits on a phone', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await kit.page
      .getByRole('group', { name: 'View' })
      .getByRole('button', { name: /^Posts/ })
      .click()
    await postEditor(kit.page).click()
    await kit.page.keyboard.type('Tools')
    const composer = kit.page.locator('form').filter({ has: kit.page.locator('.editor-post') })
    await composer.getByRole('button', { name: 'Link' }).click()
    const panel = kit.page.getByRole('dialog', { name: 'Add link' })
    await expect(panel).toBeVisible()
    const box = (await panel.boundingBox())!
    const view = kit.page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(view.width)
    await clearOfText(kit.page)
    await kit.page.screenshot({ path: 'test-results/link-panel-phone.png' })
    await kit.context.close()
  })
})
