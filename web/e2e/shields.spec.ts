import type { Locator } from '@playwright/test'
import { anyView, article, expect, member, open, owner, test, uniq, writePost } from './helpers'

/**
 * How far the shield's centre sits below the centre of the text beside it, in pixels. The shield is centred on the
 * text and then lowered by about a pixel, because its point is narrow and a centred shield looks high. Raphael found
 * it off the text's line on 2026-11-09, when it was up to 2px high.
 */
async function shieldDrop(shield: Locator, text: Locator): Promise<number> {
  const s = (await shield.locator('svg').boundingBox())!
  const t = await text.evaluate((el) => {
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!
    const r = document.createRange()
    r.selectNodeContents(node)
    const b = r.getClientRects()[0]
    return b.y + b.height / 2
  })
  return s.y + s.height / 2 - t
}

const onTheLine = (drop: number) => expect(drop).toBeGreaterThanOrEqual(0.5) && expect(drop).toBeLessThanOrEqual(1.6)

/**
 * The shield marks what a person sees or can do only because they are an owner or a
 * moderator. The owner sees it on Delete for another member's post, on the Community item, and on each card of the
 * Community page. The author's own Delete has none.
 */
test.describe('shields', () => {
  // The same flow on the desktop and on the phone, where Community is on the Menu page.
  for (const tag of ['', ' @phone']) {
    test(`the owner sees the shield on Delete for a member post, on Community and on its cards${tag}`, async ({
      browser,
    }, info) => {
      const o = await owner(browser, info)
      const kit = await member(browser, info, 'kit')
      const phone = info.project.name === 'phone'
      await open(kit.page)
      if (phone) await anyView(kit.page, 'Posts').click()
      const text = uniq('A post to moderate ')
      await writePost(kit.page, text)

      // The author's own Delete has no shield.
      await article(kit.page, text).getByRole('button', { name: 'Post options' }).click()
      await expect(kit.page.getByRole('menuitem', { name: 'Delete' })).not.toHaveAttribute('aria-description')
      await kit.page.keyboard.press('Escape')

      // The owner's Delete on kit's post has the shield, and says why.
      await open(o.page)
      if (phone) await anyView(o.page, 'Posts').click()
      await article(o.page, text).getByRole('button', { name: 'Post options' }).click()
      const del = o.page.getByRole('menuitem', { name: 'Delete' })
      await expect(del).toHaveAttribute('aria-description', 'Only owners and moderators can do this')
      await expect(del.locator('[data-shield]')).toBeVisible()
      onTheLine(await shieldDrop(del.locator('[data-shield]'), del))
      // Menu items use the buttons' 15px text. A destructive item turns blush on hover, as a danger button does
      // (Raphael, 2026-11-09).
      await expect(del).toHaveCSS('font-size', '15px')
      await del.hover()
      await expect(del).toHaveCSS('background-color', 'rgb(253, 232, 232)')
      await o.page.screenshot({ path: `test-results/shields-${info.project.name}-menu.png` })
      await o.page.keyboard.press('Escape')

      // Community carries the shield in the nav or the menu, and every card on the page has one.
      if (phone) await open(o.page, '/menu')
      const item = phone
        ? o.page.getByRole('button', { name: 'Community' })
        : o.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Community' })
      await expect(item.locator('[data-shield]')).toBeVisible()
      onTheLine(await shieldDrop(item.locator('[data-shield]'), item))
      if (phone) await o.page.screenshot({ path: 'test-results/shields-phone-nav.png' })
      await item.click()
      const note = o.page.getByText(/marks what only owners and moderators can see and do\./)
      await expect(note).toBeVisible()
      onTheLine(await shieldDrop(note.locator('[data-shield]'), note))
      const reports = o.page.getByRole('heading', { name: 'Reports', exact: true })
      onTheLine(await shieldDrop(reports.locator('xpath=..').locator('[data-shield]'), reports))
      await expect(o.page.getByRole('img', { name: 'Only the owner sees this' })).toHaveCount(1)
      // Reports, Welcome message, Rules and Topics.
      await expect(o.page.getByRole('img', { name: 'Only the owner and moderators see this' })).toHaveCount(4)
      await o.page.screenshot({ path: `test-results/shields-${info.project.name}-community.png` })
      await o.context.close()
      await kit.context.close()
    })
  }
})
