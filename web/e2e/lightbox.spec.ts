import type { Page } from '@playwright/test'
import { article, expect, member, open, png, test, uniq, ROOT } from './helpers'

/**
 * An image in a post, comment or message opens alone, full screen, when it is clicked or chosen with Enter. Escape,
 * the close button or a click beside the image closes it. Images load only when they come near the screen.
 */

/** Posts a picture of this size on Home and returns the post's text and the picture's address. */
async function postPicture(page: Page, w: number, h: number) {
  const up = await page.context().request.post('/api/images', {
    multipart: { file: { name: 'plot.png', mimeType: 'image/png', buffer: png(w, h, [70, 140, 70]) } },
  })
  expect(up.ok()).toBeTruthy()
  const img = (await up.json()) as { id: string; url: string; width: number; height: number }
  const text = uniq('The plot in June ')
  const res = await page.context().request.post(`/api/groups/${ROOT}/posts`, {
    data: {
      body_html: `<p>${text}</p><img src="${img.url}" alt="Rows of beans" width="${img.width}" height="${img.height}" data-image-id="${img.id}">`,
    },
  })
  expect(res.ok()).toBeTruthy()
  return { text, url: img.url }
}

test.describe('lightbox', () => {
  test('an image in a post opens alone, full screen, and closes with Escape, the close button or a click beside it', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo)
    const { text, url } = await postPicture(kit.page, 1200, 800)
    await open(kit.page)
    const picture = article(kit.page, text).locator('img[src^="/img/"]')
    await picture.click()
    const box = kit.page.getByRole('dialog', { name: 'Image' })
    await expect(box.locator(`img[src="${url}"]`)).toBeVisible()
    await expect(box.getByRole('button', { name: 'Previous' })).toHaveCount(0)
    await expect(box.getByRole('button', { name: 'Next' })).toHaveCount(0)
    // The lightbox fades in.
    await expect(box).toHaveCSS('opacity', '1')
    await kit.page.screenshot({ path: 'test-results/lightbox.png' })
    await kit.page.keyboard.press('Escape')
    await expect(box).toHaveCount(0)

    // A keyboard opens it with Enter, and the close button returns to the image.
    await picture.focus()
    await kit.page.keyboard.press('Enter')
    await expect(box).toBeVisible()
    await box.getByRole('button', { name: 'Close' }).click()
    await expect(box).toHaveCount(0)
    await expect(picture).toBeFocused()

    // A click beside the image closes it.
    await picture.click()
    await expect(box).toBeVisible()
    await kit.page.mouse.click(10, 10)
    await expect(box).toHaveCount(0)
    await kit.context.close()
  })

  test('@phone an image opens full screen on a phone', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo)
    const { text, url } = await postPicture(kit.page, 800, 1200)
    await open(kit.page)
    await kit.page
      .getByRole('group', { name: 'View' })
      .getByRole('button', { name: /^Posts/ })
      .click()
    await article(kit.page, text).locator('img[src^="/img/"]').click()
    const box = kit.page.getByRole('dialog', { name: 'Image' })
    await expect(box.locator(`img[src="${url}"]`)).toBeVisible()
    // The lightbox fades in.
    await expect(box).toHaveCSS('opacity', '1')
    await kit.page.screenshot({ path: 'test-results/lightbox-phone.png' })
    await box.getByRole('button', { name: 'Close' }).click()
    await expect(box).toHaveCount(0)
    await kit.context.close()
  })
})
