import { article, expect, member, open, png, ROOT, test, uniq } from './helpers'

test.describe('images', () => {
  test('images added to a post are shown as cards with alt text in the editor, then as a gallery in the post @dev', async ({
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

  for (const tag of ['@dev', '@phone']) {
    test(`single images fit the reading width and retain their shape before and after loading ${tag}`, async ({
      browser,
    }, info) => {
      const kit = await member(browser, info)
      if (!info.project.use.isMobile) await kit.page.setViewportSize({ width: 1280, height: 1000 })
      for (const [name, width, height] of [
        ['Square', 1200, 1200],
        ['Portrait', 900, 1600],
        ['Landscape', 1200, 800],
      ] as const) {
        const upload = await kit.context.request.post('/api/images', {
          multipart: { file: { name: `${name}.png`, mimeType: 'image/png', buffer: png(width, height) } },
        })
        expect(upload.status()).toBe(201)
        const image = (await upload.json()) as { id: string }
        const text = uniq(name + ' ')
        const body = `<p>${text}</p><img src="/img/${image.id}" data-image-id="${image.id}" alt="${name}" width="${width}" height="${height}">`
        const created = await kit.context.request.post(`/api/groups/${ROOT}/posts`, { data: { body_html: body } })
        expect(created.status()).toBe(201)
        const post = (await created.json()) as { id: string }
        const img = kit.page.getByRole('button', { name: `Open image: ${name}`, exact: true })
        const fits = async () => {
          const box = (await img.boundingBox())!
          const content = (await img.locator('..').boundingBox())!
          const expectedWidth = Math.min(width, content.width, (680 * width) / height)
          expect(box.width).toBeCloseTo(expectedWidth, 0)
          expect(box.height).toBeCloseTo((expectedWidth * height) / width, 0)
          expect(box.x).toBeCloseTo(content.x, 0)
          expect(box.x + box.width).toBeLessThanOrEqual(content.x + content.width + 1)
        }
        await kit.page.route(`**/img/${image.id}`, () => {})
        await open(kit.page, `/p/${post.id}`)
        await expect(img).toBeVisible()
        await fits()
        await kit.page.unroute(`**/img/${image.id}`)
        await kit.page.reload()
        await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(width)
        await fits()
        await kit.page.screenshot({ path: info.outputPath(`${name.toLowerCase()}-post.png`), animations: 'disabled' })
        if (name === 'Square') {
          expect(
            (
              await kit.context.request.post(`/api/posts/${post.id}/comments`, {
                data: { body_html: body.replace('alt="Square"', 'alt="Comment"') },
              })
            ).status(),
          ).toBe(201)
          const comment = kit.page.getByRole('button', { name: 'Open image: Comment', exact: true })
          await comment.scrollIntoViewIfNeeded()
          await expect.poll(() => comment.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(width)
          const commentBox = (await comment.boundingBox())!
          expect(commentBox.width).toBeCloseTo(Math.min(680, (await comment.locator('..').boundingBox())!.width), 0)
          expect(commentBox.height).toBeCloseTo(commentBox.width, 0)
          await kit.page.screenshot({ path: info.outputPath('square-comment.png'), animations: 'disabled' })
          const room = await kit.context.request.post('/api/groups', { data: { name: uniq('Images '), mode: 'chat' } })
          const gid = (await room.json()).id
          expect(
            (await kit.context.request.post(`/api/groups/${gid}/messages`, { data: { body_html: body } })).status(),
          ).toBe(201)
          await open(kit.page, `/r/${gid}`)
          await img.scrollIntoViewIfNeeded()
          await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBe(width)
          await fits()
          await kit.page.screenshot({ path: info.outputPath('square-chat.png'), animations: 'disabled' })
        }
      }
      await kit.context.close()
    })
  }
})
