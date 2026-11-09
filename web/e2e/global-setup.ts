import { mkdirSync } from 'node:fs'
import { request, type FullConfig } from '@playwright/test'

/**
 * Signs the owner in once and saves the cookie, so that no test has to go
 * through the sign-in form before it starts. The sign-in limiter counts only
 * wrong passwords (five at once per address, then one every twelve seconds),
 * so the correct passwords that a few tests type do not count against it.
 */
export default async function globalSetup(config: FullConfig) {
  mkdirSync('e2e/.auth', { recursive: true })
  // All projects share one sign-in. The cookie is bound to the host, not the port, so the
  // built binary and the dev server in front of it accept the same cookie.
  const baseURL = config.projects[0].use.baseURL as string
  const ctx = await request.newContext({ baseURL })
  const res = await ctx.post('/api/login', { data: { username: 'raphael', password: 'correct horse' } })
  if (!res.ok()) throw new Error(`owner login at ${baseURL}: ${res.status()} ${await res.text()}`)
  // Give the community a name, as onboarding would. If the community has no name, its owner is kept on the welcome
  // page.
  const named = await ctx.put('/api/settings', {
    data: { name: 'Sweet e2e', description: '', group_creation: 'anyone' },
  })
  if (!named.ok()) throw new Error(`naming the community: ${named.status()} ${await named.text()}`)
  // The owner has seen the welcome dialog, so it does not cover the page in every test. welcome.spec.ts opens it.
  const welcomed = await ctx.put('/api/me/settings', { data: { digest: 'weekly', welcomed: true } })
  if (!welcomed.ok()) throw new Error(`welcoming the owner: ${welcomed.status()} ${await welcomed.text()}`)
  for (const project of config.projects) {
    await ctx.storageState({ path: `e2e/.auth/owner-${project.name}.json` })
  }
  await ctx.dispose()
}
