import type { Page, Route } from '@playwright/test'
import { article, chatEditor, expect, member, open, pick, png, postEditor, test, uniq, writePost } from './helpers'

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

/** The width of the PNG or JPEG in an upload's multipart body, from its header. */
function uploadedWidth(body: Buffer): number {
  const png = body.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  if (png >= 0) return body.readUInt32BE(png + 16)
  // A baseline JPEG's frame header: FF C0, length, precision, height, width.
  const sof = body.indexOf(Buffer.from([0xff, 0xc0]))
  return sof < 0 ? -1 : body.readUInt16BE(sof + 7)
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
      widths.push(uploadedWidth(route.request().postDataBuffer() ?? Buffer.alloc(0)))
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

  test('every image is converted before uploading: a JPEG stays a JPEG and other images become PNG', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const bodies: Buffer[] = []
    await kit.page.route('**/api/images', async (route) => {
      bodies.push(route.request().postDataBuffer() ?? Buffer.alloc(0))
      await route.continue()
    })
    // A small photo taken upright, stored on its side with an EXIF block. A transparent WebP.
    const photo = await sidewaysPhoto(kit.page, 400, 200)
    const sticker = Buffer.from(
      await kit.page.evaluate(async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 60
        canvas.height = 60
        const g = canvas.getContext('2d')!
        g.fillStyle = 'rgba(206, 23, 23, 0.5)'
        g.fillRect(10, 10, 40, 40)
        const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/webp', 0.9))
        return Array.from(new Uint8Array(await blob.arrayBuffer()))
      }),
    )
    await postEditor(kit.page).click()
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: photo },
        { name: 'sticker.webp', mimeType: 'image/webp', buffer: sticker },
      ])
    await expect(
      posts(kit.page)
        .locator('.image-card')
        .getByPlaceholder(/Describe this image/),
    ).toHaveCount(2)
    expect(bodies).toHaveLength(2)
    const [jpeg, png] = bodies
    // The photo was drawn again by the browser: upright, and without its EXIF block.
    expect(jpeg.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
    expect(jpeg.includes(Buffer.from('Exif'))).toBe(false)
    expect(png.includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true)
    expect(pngWidth(png)).toBe(60)
    await kit.context.close()
  })

  test('an upload that gets no answer fails after a while, and can be tried again', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await kit.page.clock.install()
    await open(kit.page)
    const release = await holdUploads(kit.page)
    const sent = kit.page.waitForRequest('**/api/images')
    await postEditor(kit.page).click()
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'plot.png', mimeType: 'image/png', buffer: png(320, 200) })
    const card = posts(kit.page).locator('.image-card')
    await expect(card.getByText('Uploading')).toBeVisible()
    // The upload's timers start when the converted image is sent, and the answer's timer when the last byte has gone.
    // Time moves on a minute at a time until the upload gives up.
    await sent
    await expect(async () => {
      await kit.page.clock.fastForward('01:01')
      await expect(card.getByText('Failed to upload', { exact: true })).toBeVisible({ timeout: 1000 })
    }).toPass()
    await release()
    await card.getByRole('button', { name: 'Try again' }).click()
    await expect(card.getByPlaceholder(/Describe this image/)).toBeVisible()
    await kit.context.close()
  })

  test('an image removed while it uploads and brought back with undo shows its finished upload', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const release = await holdUploads(kit.page)
    await postEditor(kit.page).click()
    await kit.page.keyboard.type(uniq('Undo '))
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'plot.png', mimeType: 'image/png', buffer: png(320, 200) })
    const card = posts(kit.page).locator('.image-card')
    await expect(card.getByText('Uploading')).toBeVisible()
    // The undo history joins changes made within 500 ms into one step. A person removes the image later than that.
    await kit.page.waitForTimeout(600)
    // The new image is selected, so Backspace removes it.
    await kit.page.keyboard.press('Backspace')
    await expect(card).toHaveCount(0)
    const done = kit.page.waitForResponse('**/api/images')
    await release()
    await done
    await kit.page.keyboard.press('ControlOrMeta+z')
    await expect(card.getByPlaceholder(/Describe this image/)).toBeVisible()
    await expect(card.locator('img')).toHaveAttribute('src', /^\/img\//)
    await expect(posts(kit.page).getByRole('button', { name: 'Post', exact: true })).toBeEnabled()
    await kit.context.close()
  })

  test('pictures in pasted HTML from another site are left out of the editor', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    await postEditor(kit.page).click()
    await postEditor(kit.page).evaluate((el) => {
      const data = new DataTransfer()
      data.setData('text/html', '<p>From a recipe site</p><img src="https://example.com/cake.jpg" alt="A cake">')
      data.setData('text/plain', 'From a recipe site')
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    })
    await expect(postEditor(kit.page)).toContainText('From a recipe site')
    await expect(posts(kit.page).locator('.image-card')).toHaveCount(0)
    await kit.context.close()
  })

  test('an image whose upload fails after it was removed, brought back with undo, shows the failure', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const held: Route[] = []
    await kit.page.route('**/api/images', (route) => {
      held.push(route)
    })
    await postEditor(kit.page).click()
    await kit.page.keyboard.type(uniq('Undo a failure '))
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'plot.png', mimeType: 'image/png', buffer: png(320, 200) })
    const card = posts(kit.page).locator('.image-card')
    await expect.poll(() => held.length).toBe(1)
    // The undo history joins changes made within 500 ms into one step. A person removes the image later than that.
    await kit.page.waitForTimeout(600)
    await kit.page.keyboard.press('Backspace')
    await expect(card).toHaveCount(0)
    const failed = kit.page.waitForResponse('**/api/images')
    await held[0].fulfill({ status: 502, contentType: 'text/html', body: '<html>502</html>' })
    await failed
    await kit.page.keyboard.press('ControlOrMeta+z')
    await expect(card.getByText('Failed to upload', { exact: true })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible()
    await kit.context.close()
  })

  test('an opaque PNG photo is sent as a JPEG, and a flat image stays a PNG', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const bodies: Buffer[] = []
    await kit.page.route('**/api/images', async (route) => {
      bodies.push(route.request().postDataBuffer() ?? Buffer.alloc(0))
      await route.continue()
    })
    // A photo saved as PNG, whose JPEG is a fraction of its size, and a flat image, which stays a PNG.
    const make = (noise: boolean) =>
      kit.page.evaluate(async (noise) => {
        const canvas = document.createElement('canvas')
        canvas.width = 600
        canvas.height = 400
        const g = canvas.getContext('2d')!
        g.fillStyle = '#f5f5f5'
        g.fillRect(0, 0, 600, 400)
        if (noise) {
          const d = g.getImageData(0, 0, 600, 400)
          for (let i = 0; i < d.data.length; i += 4) {
            d.data[i] = Math.random() * 256
            d.data[i + 1] = Math.random() * 256
            d.data[i + 2] = Math.random() * 256
          }
          g.putImageData(d, 0, 0)
        } else {
          g.fillStyle = '#1a1717'
          g.fillRect(40, 40, 300, 20)
        }
        const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'))
        return Array.from(new Uint8Array(await blob.arrayBuffer()))
      }, noise)
    const photo = Buffer.from(await make(true))
    const screenshot = Buffer.from(await make(false))
    await postEditor(kit.page).click()
    await posts(kit.page)
      .locator('input[type=file]')
      .setInputFiles([
        { name: 'photo.png', mimeType: 'image/png', buffer: photo },
        { name: 'screenshot.png', mimeType: 'image/png', buffer: screenshot },
      ])
    await expect(
      posts(kit.page)
        .locator('.image-card')
        .getByPlaceholder(/Describe this image/),
    ).toHaveCount(2)
    expect(bodies[0].includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
    expect(bodies[1].includes(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(true)
    await kit.context.close()
  })

  test('removing an attached image in chat stops its upload, and an image attached while a message sends stays', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const release = await holdUploads(kit.page)
    const stopped = kit.page.waitForEvent('requestfailed', (r) => r.url().endsWith('/api/images'))
    await chatEditor(kit.page).click()
    await chat(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png(320, 200) })
    const card = chat(kit.page).locator('.image-card')
    await expect(card.getByText('Uploading')).toBeVisible()
    await kit.page.waitForRequest('**/api/images')
    await card.getByRole('button', { name: 'Remove image' }).click()
    await stopped
    await release()

    // The message is held while it sends, and another image is attached meanwhile.
    const held: Route[] = []
    await kit.page.route('**/api/groups/*/messages', (route) => {
      if (route.request().method() === 'POST') held.push(route)
      else route.continue()
    })
    await chatEditor(kit.page).click()
    await kit.page.keyboard.type(uniq('Sent '))
    await kit.page.keyboard.press('Enter')
    await expect.poll(() => held.length).toBe(1)
    await chat(kit.page)
      .locator('input[type=file]')
      .setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: png(200, 320, [42, 143, 203]) })
    await expect(card.getByPlaceholder(/Describe this image/)).toBeVisible()
    await held[0].continue()
    await kit.page.unroute('**/api/groups/*/messages')
    await expect(chatEditor(kit.page)).toHaveText('')
    await expect(card).toHaveCount(1)
    await kit.context.close()
  })

  test('closing an editor stops the uploads of the images in it', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    await open(kit.page)
    const text = uniq('Edit with a picture ')
    await writePost(kit.page, text)
    await pick(kit.page, article(kit.page, text), 'Post options', 'Edit')
    const form = kit.page.locator('form').filter({ has: kit.page.getByRole('button', { name: 'Cancel' }) })
    const release = await holdUploads(kit.page)
    const stopped = kit.page.waitForEvent('requestfailed', (r) => r.url().endsWith('/api/images'))
    await form.locator('.ProseMirror').click()
    await form
      .locator('input[type=file]')
      .setInputFiles({ name: 'plot.png', mimeType: 'image/png', buffer: png(320, 200) })
    await expect(form.locator('.image-card').getByText('Uploading')).toBeVisible()
    await kit.page.waitForRequest('**/api/images')
    await form.getByRole('button', { name: 'Cancel' }).click()
    await stopped
    await release()
    await kit.context.close()
  })

  test('a profile picture and a room picture are shrunk before uploading', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    const name = uniq('Fells')
    const room = await kit.context.request.post('/api/groups', { data: { kind: 'group', name, mode: 'both' } })
    const gid = ((await room.json()) as { id: string }).id
    const widths: number[] = []
    await kit.page.route('**/api/images', async (route) => {
      widths.push(uploadedWidth(route.request().postDataBuffer() ?? Buffer.alloc(0)))
      await route.continue()
    })
    const nav = kit.page.getByRole('navigation', { name: 'Main' })

    await open(kit.page, '/settings')
    await kit.page
      .locator('input[type=file]')
      .first()
      .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(3000, 2000) })
    await expect(nav.getByRole('button', { name: kit.username }).locator('img')).toHaveAttribute('src', /\/img\//)

    await open(kit.page, `/r/${gid}/members`)
    await kit.page
      .locator('section')
      .filter({ hasText: 'Room settings' })
      .locator('input[type=file]')
      .setInputFiles({ name: 'fells.png', mimeType: 'image/png', buffer: png(3000, 2000) })
    await expect(nav.getByRole('button', { name: new RegExp(`^${name}`) }).locator('img')).toHaveAttribute(
      'src',
      /\/img\//,
    )
    expect(widths).toEqual([2000, 2000])
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
