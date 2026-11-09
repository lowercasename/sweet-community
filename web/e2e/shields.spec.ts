import { anyView, article, expect, member, open, owner, test, uniq, writePost } from './helpers'

/**
 * The shield (architecture.md, Interface) marks what a person sees or can do only because they are an owner or a
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
      await o.page.screenshot({ path: `test-results/shields-${info.project.name}-menu.png` })
      await o.page.keyboard.press('Escape')

      // Community carries the shield in the nav or the menu, and every card on the page has one.
      if (phone) await open(o.page, '/menu')
      const item = phone
        ? o.page.getByRole('button', { name: 'Community' })
        : o.page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Community' })
      await expect(item.locator('[data-shield]')).toBeVisible()
      if (phone) await o.page.screenshot({ path: 'test-results/shields-phone-nav.png' })
      await item.click()
      await expect(o.page.getByText(/marks what only owners and moderators can see and do\./)).toBeVisible()
      await expect(o.page.getByRole('img', { name: 'Only the owner sees this' })).toHaveCount(1)
      await expect(o.page.getByRole('img', { name: 'Only the owner and moderators see this' })).toHaveCount(3)
      await o.page.screenshot({ path: `test-results/shields-${info.project.name}-community.png` })
      await o.context.close()
      await kit.context.close()
    })
  }
})
