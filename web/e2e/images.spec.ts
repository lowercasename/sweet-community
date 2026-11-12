import { article, expect, member, open, png, ROOT, test, uniq } from './helpers'

test.describe('images', () => {
  test('images added to a post are shown as cards with alt text in the editor, then as a gallery in the post', async ({
    browser,
  }, testInfo) => {
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
    // There are three cards, labelled as one gallery. Alt text is added to the second image.
    await expect(kit.page.locator('.editor-post textarea')).toHaveCount(3)
    await expect(kit.page.getByText('Gallery of 3 images')).toBeVisible()
    await kit.page.locator('.editor-post textarea').nth(1).fill('A tall blue rectangle')
    await kit.page.getByRole('button', { name: 'Post', exact: true }).click()
    const post = article(kit.page, text)
    await expect(post).toBeVisible()
    await expect(post.locator('.gallery img')).toHaveCount(3)
    await expect(post.locator('.gallery')).toHaveAttribute('data-count', '3')
    await expect(post.locator('.gallery img').nth(1)).toHaveAttribute('alt', 'A tall blue rectangle')
    // The images are actually served. A decoded image has its natural size, which a broken image does not.
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

  test('a new profile picture is shown immediately in the feed and in the nav, for every user', async ({
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
      // The profile picture in the nav is decorative. The account row's name identifies the user, and the
      // picture's src is what changes.
      kit.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: kit.username }).locator('img'),
    ).toHaveAttribute('src', /\/img\//)
    // Mo's open feed updates without a reload.
    await expect(article(mo.page, text).getByRole('img', { name: kit.username })).toHaveAttribute('src', /\/img\//)
    await kit.context.close()
    await mo.context.close()
  })

  test("a tall image is drawn no taller than 480px, in its own shape at the text's left edge, before and after it loads", async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    const upload = await kit.context.request.post('/api/images', {
      multipart: { file: { name: 'tall.png', mimeType: 'image/png', buffer: png(900, 1600) } },
    })
    const image = (await upload.json()) as { id: string }
    const text = uniq('Tall ')
    const created = await kit.context.request.post(`/api/groups/${ROOT}/posts`, {
      data: {
        body_html: `<p>${text}</p><img src="/img/${image.id}" data-image-id="${image.id}" alt="Tall" width="900" height="1600">`,
      },
    })
    const post = (await created.json()) as { id: string }
    const img = kit.page.getByRole('button', { name: 'Open image: Tall' })
    const fits = async () => {
      const box = (await img.boundingBox())!
      expect([Math.round(box.width), Math.round(box.height)]).toEqual([270, 480])
      expect(Math.round(box.x)).toBe(Math.round((await article(kit.page, text).getByText(text).boundingBox())!.x))
    }
    // At first the image does not load.
    await kit.page.route('**/img/**', () => {})
    await open(kit.page, `/p/${post.id}`)
    await expect(img).toBeVisible()
    await fits()
    await kit.page.unroute('**/img/**')
    await kit.page.reload()
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0)
    await fits()
    await kit.context.close()
  })
})
