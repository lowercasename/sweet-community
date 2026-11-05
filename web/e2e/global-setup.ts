import { mkdirSync } from 'node:fs'
import { request, type FullConfig } from '@playwright/test'

/**
 * Sign the owner in once and keep the cookie: the login limiter allows five
 * quick attempts per address, which a suite of tests would exhaust.
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync('e2e/.auth', { recursive: true })
  // One sign-in, shared: the cookie is bound to the host, not the port, so the
  // built binary and the dev server in front of it accept the same one. The
  // suite then spends four more on the sign-in flows themselves, within the five.
  const baseURL = config.projects[0].use.baseURL as string
  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post('/api/login', { data: { username: 'raphael', password: 'correct horse' } })
  if (!res.ok()) throw new Error(`owner login at ${baseURL}: ${res.status()} ${await res.text()}`)
  for (const project of config.projects) {
    await ctx.storageState({ path: `e2e/.auth/owner-${project.name}.json` })
  }
  await ctx.dispose()
}
