import { article, expect, member, open, png, test, uniq } from './helpers'

test.describe('images', () => {
  test('images added to a post become cards with alt text, then a gallery', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const text = uniq('Three from the walk ')
    await kit.page.locator('.editor-post .ProseMirror').first().click()
    await kit.page.keyboard.type(text)
    await kit.page
      .locator('section input[type=file]')
      .first()
      .setInputFiles([
        { name: 'a.png', mimeType: 'image/png', buffer: png(320, 200, [206, 23, 23]) },
        { name: 'b.png', mimeType: 'image/png', buffer: png(200, 320, [42, 143, 203]) },
        { name: 'c.png', mimeType: 'image/png', buffer: png(300, 300, [237, 94, 94]) },
      ])
    // Three cards, labelled as one gallery; alt text goes on the second.
    await expect(kit.page.locator('.editor-post textarea')).toHaveCount(3)
    await expect(kit.page.getByText('Gallery of 3 images')).toBeVisible()
    await kit.page.locator('.editor-post textarea').nth(1).fill('A tall blue rectangle')
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const post = article(kit.page, text)
    await expect(post).toBeVisible()
    await expect(post.locator('.gallery img')).toHaveCount(3)
    await expect(post.locator('.gallery')).toHaveAttribute('data-count', '3')
    await expect(post.locator('.gallery img').nth(1)).toHaveAttribute('alt', 'A tall blue rectangle')
    // The pictures really are served: natural size once decoded, not a broken image.
    await expect
      .poll(() =>
        post
          .locator('.gallery img')
          .first()
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(320)
    await kit.context.close()
  })

  test('a new profile picture shows on the feed and in the nav, for everyone, at once', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const mo = await member(browser, testInfo, 'mo')
    await open(kit.page)
    await open(mo.page)
    const text = uniq('Face check ')
    await kit.page.locator('.editor-post .ProseMirror').first().click()
    await kit.page.keyboard.type(text)
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    await expect(article(mo.page, text)).toBeVisible()
    const donut = await article(mo.page, text).getByRole('img', { name: kit.username }).getAttribute('src')
    expect(donut).not.toContain('/img/')

    await open(kit.page, '/settings')
    await kit.page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(64, 64) })
    await expect(
      // The nav's face is decorative: the account row's name says who; its picture is what changes.
      kit.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: kit.username }).locator('img'),
    ).toHaveAttribute('src', /\/img\//)
    // Mo's open feed follows without a reload.
    await expect(article(mo.page, text).getByRole('img', { name: kit.username })).toHaveAttribute('src', /\/img\//)
    await kit.context.close()
    await mo.context.close()
  })
})
