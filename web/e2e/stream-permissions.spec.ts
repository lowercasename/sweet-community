import { expect, member, open, owner, ROOT, test, uniq } from './helpers'

for (const suffix of ['', ' @phone']) {
  test(`room removal stops private events and deletion clears the room${suffix} @release`, async ({
    browser,
  }, info) => {
    const o = await owner(browser, info)
    const m = await member(browser, info)
    const uid = ((await (await m.context.request.get('/api/me')).json()) as { id: string }).id
    const name = uniq('Private ')
    const room = ((await (await o.context.request.post('/api/groups', { data: { name } })).json()) as { id: string }).id
    expect((await o.context.request.post(`/api/groups/${room}/members`, { data: { user_id: uid } })).status()).toBe(201)
    await open(m.page, info.project.name === 'phone' ? '/menu' : '/')
    await expect(m.page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
    // Observe received data as well as the UI, which could hide data that was disclosed over the stream.
    await m.page.evaluate(async () => {
      const received: string[] = []
      const source = new EventSource('/api/events')
      const observed = window as unknown as { received: string[] }
      observed.received = received
      for (const kind of ['message', 'post'])
        source.addEventListener(kind, (event) => received.push((event as MessageEvent).data))
      await new Promise<void>((resolve, reject) => {
        source.onopen = () => resolve()
        source.onerror = () => reject(new Error('Stream did not open'))
      })
    })
    expect((await o.context.request.delete(`/api/groups/${room}/members/${uid}`)).status()).toBe(204)
    await expect(m.page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0)
    const privateText = uniq('Private message ')
    expect(
      (
        await o.context.request.post(`/api/groups/${room}/messages`, { data: { body_html: `<p>${privateText}</p>` } })
      ).status(),
    ).toBe(201)
    const publicText = uniq('Public post ')
    expect(
      (
        await o.context.request.post(`/api/groups/${ROOT}/posts`, { data: { body_html: `<p>${publicText}</p>` } })
      ).status(),
    ).toBe(201)
    const received = () => m.page.evaluate(() => (window as unknown as { received: string[] }).received.join('\n'))
    await expect.poll(received).toContain(publicText)
    expect(await received()).not.toContain(privateText)
    // Rejoining and deletion must also update an already open tab.
    expect((await o.context.request.post(`/api/groups/${room}/members`, { data: { user_id: uid } })).status()).toBe(201)
    await expect(m.page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible()
    expect((await o.context.request.delete(`/api/groups/${room}`)).status()).toBe(200)
    await expect(m.page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0)
    await m.context.close()
    await o.context.close()
  })
}
