import { expect, member, open, owner, ROOT, test, uniq } from './helpers'

for (const suffix of ['', ' @phone']) {
  test(`reports hide identities and exclude their authors${suffix}`, async ({ browser }, info) => {
    const o = await owner(browser, info)
    const mod = await member(browser, info, 'moderatorlongnamelongxxxxx')
    const reporter = await member(browser, info, 'reporterlongnamelong')
    const modID = ((await (await mod.context.request.get('/api/me')).json()) as { id: string }).id
    const reporterID = ((await (await reporter.context.request.get('/api/me')).json()) as { id: string }).id
    expect(
      (await o.context.request.put(`/api/groups/${ROOT}/members/${modID}`, { data: { role: 'moderator' } })).ok(),
    ).toBeTruthy()
    const ownText = uniq('Owner post ')
    const modText = uniq('Moderator post ')
    const post = async (person: typeof o, text: string) => {
      const response = await person.context.request.post(`/api/groups/${ROOT}/posts`, {
        data: { body_html: `<p>${text} ${'Long content for the report. '.repeat(12)}</p>` },
      })
      expect(response.ok()).toBeTruthy()
      return ((await response.json()) as { id: string }).id
    }
    const ownPost = await post(o, ownText)
    const modPost = await post(mod, modText)
    try {
      await open(o.page, '/community')
      await open(mod.page, '/community')
      // Observe the actual stream payloads so a hidden UI cannot conceal a disclosure.
      await o.page.evaluate(async () => {
        const seen: { kind: string; payload: Record<string, unknown> }[] = []
        const observed = window as unknown as { reportEvents: typeof seen }
        observed.reportEvents = seen
        const source = new EventSource('/api/events')
        for (const kind of ['report', 'report_delete', 'notification', 'post']) {
          source.addEventListener(kind, (event) =>
            seen.push({ kind, payload: JSON.parse((event as MessageEvent).data) }),
          )
        }
        await new Promise<void>((resolve, reject) => {
          source.onopen = () => resolve()
          source.onerror = () => reject(new Error('Stream did not open'))
        })
      })
      const reason = 'This content needs review. '.repeat(20).slice(0, 500)
      for (const id of [ownPost, modPost]) {
        expect(
          (await reporter.context.request.post('/api/reports', { data: { kind: 'post', id, reason } })).status(),
        ).toBe(204)
      }
      const ownEntry = o.page.getByRole('listitem').filter({ hasText: modText })
      const modEntry = mod.page.getByRole('listitem').filter({ hasText: ownText })
      await expect(ownEntry).toContainText(reason)
      await expect(modEntry).toContainText(reason)
      await expect(o.page.getByRole('listitem').filter({ hasText: ownText })).toHaveCount(0)
      await expect(mod.page.getByRole('listitem').filter({ hasText: modText })).toHaveCount(0)
      await expect(ownEntry).not.toContainText(reporter.username)
      await ownEntry.scrollIntoViewIfNeeded()
      await o.page.screenshot({ path: `test-results/report-privacy-${info.project.name}-card.png` })
      expect(await o.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        o.page.viewportSize()!.width,
      )

      for (const person of [o, mod]) {
        const reports = await (await person.context.request.get('/api/reports')).text()
        const notes = (await (await person.context.request.get('/api/notifications')).json()) as {
          notifications: { kind: string }[]
        }
        const notifications = JSON.stringify(notes.notifications.filter((n) => n.kind === 'report'))
        for (const body of [reports, notifications]) {
          expect(body).not.toContain(reporterID)
          expect(body).not.toContain(reporter.username)
        }
      }
      const sentinel = uniq('After reports ')
      await post(o, sentinel)
      const received = () =>
        o.page.evaluate(
          () =>
            (
              window as unknown as {
                reportEvents: { kind: string; payload: Record<string, unknown> }[]
              }
            ).reportEvents,
        )
      await expect.poll(async () => JSON.stringify(await received())).toContain(sentinel)
      const events = (await received()).filter(
        (e) => e.kind === 'report' || (e.kind === 'notification' && e.payload.kind === 'report'),
      )
      expect(events.some((e) => e.kind === 'report' && e.payload.id === modPost)).toBeTruthy()
      expect(events.some((e) => e.payload.id === ownPost)).toBeFalsy()
      expect(JSON.stringify(events)).not.toContain(reporterID)
      expect(JSON.stringify(events)).not.toContain(reporter.username)

      await open(mod.page, '/notifications')
      const notice = mod.page.getByRole('button', { name: 'Post reported, new', exact: true })
      await expect(notice).toBeVisible()
      await mod.page.screenshot({ path: `test-results/report-privacy-${info.project.name}-notification.png` })
      await notice.click()
      await expect(modEntry).toContainText(reason)
      await modEntry.getByRole('button', { name: 'Dismiss report' }).click()
      await expect(modEntry).toHaveCount(0)
      await ownEntry.getByRole('button', { name: 'Dismiss report' }).scrollIntoViewIfNeeded()
      await o.page.screenshot({ path: `test-results/report-privacy-${info.project.name}-actions.png` })
      await ownEntry.getByRole('button', { name: 'Dismiss report' }).click()
      await expect(ownEntry).toHaveCount(0)
    } finally {
      await mod.context.request.post(`/api/reports/post/${ownPost}/dismiss`)
      await o.context.request.post(`/api/reports/post/${modPost}/dismiss`)
      await o.context.request.put(`/api/groups/${ROOT}/members/${modID}`, { data: { role: 'member' } })
      await o.context.close()
      await mod.context.close()
      await reporter.context.close()
    }
  })
}
