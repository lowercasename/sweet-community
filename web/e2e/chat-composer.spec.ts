import type { Editor } from '@tiptap/react'
import { article, chatEditor, expect, member, open, png, test, uniq } from './helpers'

for (const tag of ['@dev', '@phone']) {
  test(`chat keeps its controls beside the last line and opens tools above it ${tag}`, async ({ browser }, info) => {
    const kit = await member(browser, info)
    await kit.page.setViewportSize({ width: info.project.use.isMobile ? 360 : 1280, height: 800 })
    const created = await kit.context.request.post('/api/groups', { data: { name: uniq('Composer '), mode: 'chat' } })
    const gid = (await created.json()).id
    await open(kit.page, `/r/${gid}`)
    const field = chatEditor(kit.page)
    const form = kit.page.locator('form').filter({ has: field })
    const tools = form.getByRole('button', { name: 'Formatting and attachments', exact: true })
    const send = form.getByRole('button', { name: 'Send', exact: true })
    const aligned = async () => {
      const text = (await field.boundingBox())!
      const left = (await tools.boundingBox())!
      const right = (await send.boundingBox())!
      expect(left.x + left.width).toBeLessThanOrEqual(text.x)
      expect(right.x).toBeGreaterThanOrEqual(text.x + text.width)
      expect(Math.abs(left.y + left.height - text.y - text.height)).toBeLessThanOrEqual(2)
      expect(Math.abs(right.y + right.height - text.y - text.height)).toBeLessThanOrEqual(2)
      expect(right.x + right.width).toBeLessThanOrEqual(kit.page.viewportSize()!.width)
      expect(left.width).toBeGreaterThanOrEqual(44)
      expect(right.width).toBeGreaterThanOrEqual(44)
    }
    await expect(send).toBeDisabled()
    await expect(tools).toHaveAttribute('aria-expanded', 'false')
    await aligned()
    await kit.page.screenshot({ path: info.outputPath('empty.png'), scale: 'css' })
    await tools.focus()
    await kit.page.keyboard.press('Enter')
    await expect(form.getByRole('button', { name: 'Bold', exact: true })).toBeFocused()
    await kit.page.keyboard.press('Escape')
    await expect(tools).toHaveAttribute('aria-expanded', 'false')
    await expect(field).toBeFocused()
    await expect(kit.page.getByRole('tooltip').filter({ hasText: 'Formatting and attachments' })).toHaveCount(0)
    await field.fill('Selected words')
    await kit.page.keyboard.press('ControlOrMeta+a')
    await tools.click()
    await expect(field).toBeFocused()
    await form.getByRole('button', { name: 'Bold', exact: true }).click()
    await expect(field.locator('strong')).toHaveText('Selected words')
    const toolbar = form.getByRole('group', { name: 'Message tools', exact: true })
    expect((await toolbar.boundingBox())!.y + (await toolbar.boundingBox())!.height).toBeLessThanOrEqual(
      (await field.boundingBox())!.y,
    )
    await aligned()
    await kit.page.screenshot({ path: info.outputPath('tools.png'), scale: 'css' })
    await tools.click()
    await expect(field).toBeFocused()
    await kit.page.keyboard.press('ArrowRight')
    await expect
      .poll(() => field.evaluate((element: HTMLElement & { editor: Editor }) => element.editor.state.selection.empty))
      .toBe(true)
    await kit.page.keyboard.press('Shift+Enter')
    await kit.page.keyboard.type('Second line with enough words to wrap on a narrow phone.')
    await aligned()
    await kit.page.screenshot({ path: info.outputPath('multiline.png'), scale: 'css' })
    // The link shortcut opens the shared panel even when the tools are closed.
    await kit.page.keyboard.press('ControlOrMeta+k')
    const link = kit.page.getByRole('dialog', { name: /link/i })
    await expect(link).toBeVisible()
    await link.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(field).toBeFocused()
    await expect(tools).toHaveAttribute('aria-expanded', 'true')
    await form
      .locator('input[type=file]')
      .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png(300, 200) })
    await expect(send).toBeEnabled()
    await expect(tools).toHaveAttribute('aria-expanded', 'false')
    await expect(form.locator('.image-card img')).toBeVisible()
    expect((await form.locator('.image-card img').boundingBox())!.y).toBeLessThan((await field.boundingBox())!.y)
    await kit.page.screenshot({ path: info.outputPath('attachment.png'), scale: 'css' })
    let rejectSend: (() => Promise<void>) | undefined
    await kit.page.route(`**/api/groups/${gid}/messages`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      rejectSend = () =>
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Could not send message' }),
        })
    })
    await field.click()
    await send.click()
    await expect(send).toHaveAttribute('aria-busy', 'true')
    await expect(field).toBeFocused()
    await kit.page.screenshot({ path: info.outputPath('sending.png'), scale: 'css' })
    await rejectSend!()
    await expect(form.getByRole('alert')).toContainText('Could not send message')
    await expect(field).toContainText('Selected words')
    await kit.page.unroute(`**/api/groups/${gid}/messages`)
    await send.click()
    await expect(article(kit.page, 'Selected words')).toBeVisible()
    await expect(field).toBeEmpty()
    await expect(send).toBeDisabled()
    await expect(form.locator('.image-card img')).toHaveCount(0)
    const message = kit.page.locator('.block-item').filter({ hasText: 'Selected words' }).first()
    if (info.project.use.isMobile) await message.locator('.content p').last().tap()
    else await message.hover()
    await message.getByRole('button', { name: 'Reply to this message' }).click()
    await expect(form.getByText('Replying to')).toBeVisible()
    await expect(field).toBeFocused()
    await field.fill('A reply with a long line that wraps on the phone')
    await aligned()
    await kit.page.screenshot({ path: info.outputPath('reply.png'), scale: 'css' })
    await kit.page.keyboard.press('Escape')
    await expect(form.getByText('Replying to')).toHaveCount(0)
    // A short viewport checks layout space, without claiming to emulate a native keyboard.
    await kit.page.setViewportSize({ width: info.project.use.isMobile ? 360 : 600, height: 420 })
    await field.fill('A message in a short viewport')
    await aligned()
    await expect(send).toBeInViewport()
    await tools.click()
    await expect(form.getByRole('group', { name: 'Message tools' })).toBeInViewport()
    await kit.page.screenshot({ path: info.outputPath('short-viewport.png'), scale: 'css' })
    await kit.context.close()
  })
}
