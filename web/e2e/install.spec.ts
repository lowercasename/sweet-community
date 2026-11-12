import { devices } from '@playwright/test'
import { expect, member, open, prepare, sendOffer, test } from './helpers'

/** The offer to add the community to the home screen. It shows at the top of Home on a touch screen that can add it. */
test.describe('install prompt', () => {
  test('@phone on a phone whose browser offers to install, Add to home screen opens the browser’s dialog', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    const add = kit.page.getByRole('button', { name: 'Add to home screen' })
    await expect(add).toHaveCount(0)
    await kit.page.evaluate(sendOffer)
    await expect(kit.page.getByText(/to your home screen to open it like an app/)).toBeVisible()
    await add.tap()
    await expect.poll(() => kit.page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true)
    await expect(add).toHaveCount(0)
    await kit.context.close()
  })

  test('@phone on an iPhone it says where Add to Home Screen is, and Not now hides it after a reload too', async ({
    browser,
  }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    const signedIn = await kit.context.storageState()
    await kit.context.close()
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { defaultBrowserType, ...iphone } = devices['iPhone 13']
    const ctx = await browser.newContext({
      ...iphone,
      baseURL: testInfo.project.use.baseURL as string,
      storageState: signedIn,
    })
    const page = await ctx.newPage()
    await prepare(page)
    await open(page)
    await expect(page.getByText('Tap the Share button, then Add to Home Screen.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add to home screen' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Not now' }).tap()
    await expect(page.getByText(/to your home screen/)).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()
    await expect(page.getByText(/to your home screen/)).toHaveCount(0)
    await ctx.close()
  })

  test('with a mouse there is no offer, even when the browser sends one', async ({ browser }, testInfo) => {
    const kit = await member(browser, testInfo, 'kit')
    await open(kit.page)
    await kit.page.evaluate(sendOffer)
    await expect(kit.page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expect(kit.page.getByText(/to your home screen/)).toHaveCount(0)
    await kit.context.close()
  })
})
