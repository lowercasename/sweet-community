import { execFileSync } from 'node:child_process'
import { expect, member, open, test } from './helpers'

for (const suffix of ['', ' @phone']) {
  test(`chat groups messages across short pauses and shows local dates and clock times${suffix}`, async ({
    browser,
  }, info) => {
    const kit = await member(browser, info, 'longusername'.repeat(2))
    const mo = await member(browser, info, 'reader')
    const room = await kit.context.request.post('/api/groups', {
      data: { name: 'Chat dates and message grouping examples', mode: 'chat' },
    })
    expect(room.status()).toBe(201)
    const gid = (await room.json()).id as string
    const uid = (await (await mo.context.request.get('/api/me')).json()).id as string
    expect((await kit.context.request.post(`/api/groups/${gid}/members`, { data: { user_id: uid } })).status()).toBe(
      201,
    )
    const midnight = await kit.page.evaluate(() => {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    })
    const texts = [
      'Last night',
      'A longer message that wraps onto several lines on a phone, so its timestamp and controls must stay clear of the text.',
      'Seven minutes later',
      'Another fifteen minutes later',
      'After a longer pause',
      'A reply from someone else',
    ]
    const minutes = [-5, 5, 12, 27, 43, 44]
    const rows: { id: string; at: number }[] = []
    for (let i = 0; i < texts.length; i++) {
      const writer = i === texts.length - 1 ? mo : kit
      const res = await writer.context.request.post(`/api/groups/${gid}/messages`, {
        data: { body_html: `<p>${texts[i]}</p>` },
      })
      expect(res.status()).toBe(201)
      rows.push({ id: (await res.json()).id, at: midnight + minutes[i] * 60_000 })
    }
    // Only the disposable browser-test database is changed. The app still reads real server responses.
    execFileSync('python3', [
      '-I',
      '-c',
      `import json, sqlite3, sys
with sqlite3.connect('../data/e2e.db') as db:
    db.execute("UPDATE messages SET created_at = ? WHERE group_id = ? AND kind != 'message'", (int(sys.argv[2]) - 6 * 60000, sys.argv[1]))
    for row in json.loads(sys.argv[3]):
        db.execute('UPDATE messages SET created_at = ? WHERE id = ? AND group_id = ?', (row['at'], row['id'], sys.argv[1]))`,
      gid,
      String(midnight),
      JSON.stringify(rows),
    ])
    await open(kit.page, `/r/${gid}`)
    const chat = kit.page.locator('[data-tour="chat"]')
    await expect(chat.getByText(texts[5], { exact: true })).toBeVisible()
    await expect(chat.getByRole('separator', { name: 'Yesterday' })).toHaveCount(1)
    await expect(chat.getByRole('separator', { name: 'Today' })).toHaveCount(1)
    await expect(chat.getByRole('article')).toHaveCount(4)
    await expect(chat.getByText(`${kit.username} added ${mo.username} to the room`)).toBeVisible()
    for (const row of rows) {
      const block = chat.locator(`#message-${row.id}`)
      const clock = await kit.page.evaluate(
        (at) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        row.at,
      )
      await expect(block.locator('time')).toHaveText(clock)
      await expect(block.locator('time')).toHaveAttribute('datetime', new Date(row.at).toISOString())
    }
    const long = chat.locator(`#message-${rows[1].id}`)
    await long.scrollIntoViewIfNeeded()
    await long.hover()
    const time = (await long.locator('time').boundingBox())!
    const reply = (await long.getByRole('button', { name: 'Reply to this message' }).boundingBox())!
    expect(time.x + time.width).toBeLessThanOrEqual(reply.x)
    await kit.page.screenshot({ path: info.outputPath('chat-dates.png') })
    await kit.context.close()
    await mo.context.close()
  })
}
