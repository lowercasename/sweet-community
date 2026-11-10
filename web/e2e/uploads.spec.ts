import type { Page, Route } from '@playwright/test'
import { chatEditor, expect, member, open, png, postEditor, test, uniq } from './helpers'

/**
 * An image shows in the editor as soon as it is chosen, with its upload on its card. Post waits until every upload
 * has finished. A failed upload shows its error on its card, in place of the alt text field, with Try again, and the
 * error names no status code. The browser shrinks an image to the size the server keeps before uploading it.
 */
const posts = (page: Page) => page.locator('form').filter({ has: page.locator('.editor-post') })
const chat = (page: Page) => page.locator('form').filter({ has: page.locator('.editor-line') })

/** Holds every upload until the returned function is called. */
async function holdUploads(page: Page) {
  const held: Route[] = []
  await page.route('**/api/images', (route) => {
    held.push(route)
  })
  return async () => {
    for (const r of held) await r.continue()
    await page.unroute('**/api/images')
  }
}

/** Answers every upload with a proxy's 502 page, as Caddy does when the server is down. */
async function failUploads(page: Page) {
  await page.route('**/api/images', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: '<html><body>502 Bad Gateway</body></html>' }),
  )
}

/**
 * A JPEG with a red left half and a blue right half, stored on its side as a phone stores a photo taken upright. Its
 * EXIF block has orientation 6, which says to turn it 90 degrees clockwise to show it.
 */
async function sidewaysPhoto(page: Page, w: number, h: number): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const g = canvas.getContext('2d')!
      g.fillStyle = 'rgb(220, 20, 20)'
      g.fillRect(0, 0, w / 2, h)
      g.fillStyle = 'rgb(20, 20, 220)'
      g.fillRect(w / 2, 0, w / 2, h)
      const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/jpeg', 0.9))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    [w, h],
  )
  // APP1 with "Exif", a big-endian TIFF header, and one IFD entry: Orientation, SHORT, 6.
  const exif = [
    0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00,
    0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]
  return Buffer.from([...bytes.slice(0, 2), ...exif, ...bytes.slice(2)])
}

/** The width in a PNG's header, read from an upload's multipart body. */
function pngWidth(body: Buffer): number {
  const at = body.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  return at < 0 ? -1 : body.readUInt32BE(at + 16)
}

test.describe('image uploads', () => {
  test('an image shows at once with its upload, and Post waits for the upload to finish', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const release = await holdUploads(kit.page)
    const words = uniq('Our plot ')
    await postEditor(kit.page).click()
    await kit.page.keyboard.type(words)
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'plot.png', mimeType: 'image/png', buffer: png(320, 200) })
    const card = posts(kit.page).locator('.image-card')
    await expect(card.getByText('Uploading')).toBeVisible()
    await expect(card.getByRole('progressbar')).toBeVisible()
    // The picture shows at once, from the local copy.
    await expect(card.locator('img')).toHaveAttribute('src', /^blob:/)
    await expect(posts(kit.page).getByRole('button', { name: 'Post', exact: true })).toBeDisabled()
    await kit.page.screenshot({ path: 'test-results/upload-pending.png' })
    await release()
    await expect(card.getByPlaceholder(/Describe this image/)).toBeVisible()
    await posts(kit.page).getByRole('button', { name: 'Post', exact: true }).click()
    await expect(kit.page.getByRole('article').filter({ hasText: words }).locator('img[src^="/img/"]')).toBeVisible()
    await kit.context.close()
  })

  test('a failed upload shows its error in place of the alt text, names no status code, and can be tried again', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    const errors: string[] = []
    kit.page.on('pageerror', (e) => errors.push(e.message))
    await open(kit.page)
    await failUploads(kit.page)
    await postEditor(kit.page).click()
    await kit.page.keyboard.type(uniq('Two pictures '))
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'a.png', mimeType: 'image/png', buffer: png(320, 200) },
        { name: 'b.png', mimeType: 'image/png', buffer: png(200, 320, [42, 143, 203]) },
      ])
    const cards = posts(kit.page).locator('.image-card')
    await expect(cards).toHaveCount(2)
    await expect(cards.getByText('Failed to upload', { exact: true })).toHaveCount(2)
    await expect(cards.getByPlaceholder(/Describe this image/)).toHaveCount(0)
    await expect(posts(kit.page).getByText('Failed to upload 2 of 2 images')).toBeVisible()
    await expect(kit.page.getByText(/502|Bad Gateway/)).toHaveCount(0)
    await expect(posts(kit.page).getByRole('button', { name: 'Post', exact: true })).toBeDisabled()
    await kit.page.screenshot({ path: 'test-results/upload-failed.png' })

    await kit.page.unroute('**/api/images')
    await cards.first().getByRole('button', { name: 'Try again' }).click()
    await expect(cards.first().getByPlaceholder(/Describe this image/)).toBeVisible()
    await expect(posts(kit.page).getByText('Failed to upload 1 of 2 images')).toBeVisible()
    await cards.nth(1).getByRole('button', { name: 'Remove image' }).click()
    await expect(posts(kit.page).getByText(/Failed to upload/)).toHaveCount(0)
    await expect(posts(kit.page).getByRole('button', { name: 'Post', exact: true })).toBeEnabled()
    expect(errors).toEqual([])
    await kit.context.close()
  })

  test('chat shows the same upload and failure on its attached images', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await failUploads(kit.page)
    await chatEditor(kit.page).click()
    await kit.page.keyboard.type(uniq('Look '))
    await chat(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png(320, 200) })
    const card = chat(kit.page).locator('.image-card')
    await expect(card.getByText('Failed to upload', { exact: true })).toBeVisible()
    await expect(chat(kit.page).getByRole('button', { name: 'Send' })).toBeDisabled()
    await kit.page.unroute('**/api/images')
    await card.getByRole('button', { name: 'Try again' }).click()
    await expect(card.getByPlaceholder(/Describe this image/)).toBeVisible()
    await expect(chat(kit.page).getByRole('button', { name: 'Send' })).toBeEnabled()
    await kit.context.close()
  })

  test('the browser shrinks a large image to 2000px on its longer side before uploading it', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const widths: number[] = []
    await kit.page.route('**/api/images', async (route) => {
      widths.push(pngWidth(route.request().postDataBuffer() ?? Buffer.alloc(0)))
      await route.continue()
    })
    await postEditor(kit.page).click()
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: png(3000, 2000) })
    await expect(
      posts(kit.page)
        .locator('.image-card')
        .getByPlaceholder(/Describe this image/),
    ).toBeVisible()
    expect(widths).toEqual([2000])
    await kit.context.close()
  })

  test('a phone photo is stored upright, whether the browser shrinks it or sends it as it is', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const words = uniq('Upright ')
    await postEditor(kit.page).click()
    await kit.page.keyboard.type(words)
    // The small photo is sent as it is, so the server turns it. The large one is turned by the browser as it shrinks it.
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'small.jpg', mimeType: 'image/jpeg', buffer: await sidewaysPhoto(kit.page, 400, 200) },
        { name: 'large.jpg', mimeType: 'image/jpeg', buffer: await sidewaysPhoto(kit.page, 2400, 1200) },
      ])
    await expect(
      posts(kit.page)
        .locator('.image-card')
        .getByPlaceholder(/Describe this image/),
    ).toHaveCount(2)
    await posts(kit.page).getByRole('button', { name: 'Post', exact: true }).click()
    const stored = kit.page.getByRole('article').filter({ hasText: words }).locator('img[src^="/img/"]')
    await expect(stored).toHaveCount(2)
    const sizes = await stored.evaluateAll((imgs) =>
      Promise.all(
        (imgs as HTMLImageElement[]).map(async (img) => {
          await img.decode()
          return [img.naturalWidth, img.naturalHeight]
        }),
      ),
    )
    expect(sizes).toEqual([
      [200, 400],
      [1000, 2000],
    ])
    await kit.context.close()
  })

  test('@phone an image shows at once with its upload on a phone', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await kit.page
      .getByRole('group', { name: 'View' })
      .getByRole('button', { name: /^Posts/ })
      .click()
    const release = await holdUploads(kit.page)
    await postEditor(kit.page).click()
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'plot.png', mimeType: 'image/png', buffer: png(320, 200) })
    await expect(posts(kit.page).locator('.image-card').getByText('Uploading')).toBeVisible()
    await kit.page.screenshot({ path: 'test-results/upload-pending-phone.png' })
    await release()
    await failUploads(kit.page)
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: png(200, 320, [42, 143, 203]) })
    await expect(posts(kit.page).locator('.image-card').getByText('Failed to upload', { exact: true })).toBeVisible()
    await kit.page.screenshot({ path: 'test-results/upload-failed-phone.png' })
    await kit.context.close()
  })
})
