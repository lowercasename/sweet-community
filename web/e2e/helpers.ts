import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { expect, test as base, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

/** Returns a name that no other call in the test run returns. */
let counter = 0
export const uniq = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-5)}${(counter++).toString(36)}`

/** A signed-in user: their browser context, page and username. */
export interface Person {
  context: BrowserContext
  page: Page
  username: string
}

/** Sets a fixed layout so that every test sees the same screen. Both panes are shown and the nav is expanded. */
export async function prepare(page: Page) {
  // Log the page's script errors and console errors. A script error is the first thing to check when a flow fails.
  page.on('pageerror', (e) => console.log(`PAGEERROR ${page.url()}: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`CONSOLE ${page.url()}: ${m.text()}`)
  })
  await page.addInitScript(() => {
    localStorage.setItem('sweet.layout', 'both')
    localStorage.setItem('sweet.nav', 'expanded')
    localStorage.setItem('sweet.split', '0.4')
  })
}

/** The project's baseURL and viewport settings. A browser context created by hand must be given them explicitly. */
function options(info: TestInfo) {
  const use = info.project.use
  return {
    baseURL: use.baseURL as string,
    viewport: use.viewport ?? undefined,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  }
}

/** The owner, signed in with the cookie that the global setup saved. */
export async function owner(browser: Browser, info: TestInfo): Promise<Person> {
  const context = await browser.newContext({
    ...options(info),
    storageState: `e2e/.auth/owner-${info.project.name}.json`,
  })
  const page = await context.newPage()
  await prepare(page)
  return { context, page, username: 'raphael' }
}

/**
 * The directory where the test server writes each email it sends, one file per message (serve.sh).
 * Playwright runs from `web/`.
 */
const MAIL_DIR = join(process.cwd(), '..', 'data', 'e2e-mail')
/** The mail directory of the fresh instance (serve-fresh.sh). */
export const FRESH_MAIL_DIR = join(process.cwd(), '..', 'data', 'e2e-fresh-mail')

/** The email address a test user signs up with. */
export const emailOf = (username: string) => `${username}@example.test`

/** The files of the messages sent to an address, oldest first. */
function mailFiles(to: string, dir: string): string[] {
  const suffix = `-${to.replace('@', '_at_')}.txt`
  return readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .sort()
}

/** The text of the newest message sent to an address. */
function newestMail(to: string, dir: string): string {
  const files = mailFiles(to, dir)
  expect(files.length, `mail to ${to}`).toBeGreaterThan(0)
  return readFileSync(join(dir, files[files.length - 1]), 'utf8')
}

/**
 * Returns the path (`/signin/<token>` or `/verify/<token>`) in the newest message sent to an address. The server
 * writes the file before it responds, so the file exists by the time the request that caused it returns.
 */
export function mailLink(to: string, kind: 'signin' | 'verify', dir = MAIL_DIR): string {
  const m = newestMail(to, dir).match(new RegExp(`https?://[^/\\s]+(/${kind}/\\S+)`))
  expect(m, `a ${kind} link in the mail to ${to}`).toBeTruthy()
  return m![1]
}

/** Returns the six-digit code in the newest sign-in email sent to an address. */
export function mailCode(to: string, dir = MAIL_DIR): string {
  const m = newestMail(to, dir).match(/Code: (\d{6})/)
  expect(m, `a code in the mail to ${to}`).toBeTruthy()
  return m![1]
}

/**
 * Creates a new member. The owner creates an invite, the new user registers with it, with no password, and uses the
 * sign-in link they were sent. Their browser context is then signed in.
 */
export async function member(browser: Browser, info: TestInfo, prefix = 'kit'): Promise<Person> {
  const o = await owner(browser, info)
  const invite = await o.context.request.post('/api/invites')
  expect(invite.ok()).toBeTruthy()
  const code = ((await invite.json()) as { code: string }).code
  await o.context.close()

  const context = await browser.newContext(options(info))
  const username = uniq(prefix)
  const res = await context.request.post('/api/register', { data: { code, username, email: emailOf(username) } })
  expect(res.ok(), await res.text()).toBeTruthy()
  const token = mailLink(emailOf(username), 'signin').split('/').pop()!
  const signedIn = await context.request.post('/api/signin/link', { data: { token } })
  expect(signedIn.ok(), await signedIn.text()).toBeTruthy()
  const page = await context.newPage()
  await prepare(page)
  return { context, page, username }
}

/** Opens the app at a path and waits until the main navigation of the signed-in app is visible. */
export async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

/** On the phone, the buttons that switch a group between its Posts view and its Chat view are in the bar. */
export const view = (page: Page, name: 'Posts' | 'Chat' | 'Posts, unread' | 'Chat, unread', exact = true) =>
  page.getByRole('group', { name: 'View' }).getByRole('button', { name, exact })

/** The same view button, matched whether or not it shows an unread dot. Use it to switch views, not to check dots. */
export const anyView = (page: Page, name: 'Posts' | 'Chat') =>
  page.getByRole('group', { name: 'View' }).getByRole('button', { name: new RegExp(`^${name}`) })

/** The editable area of the post editor and of the chat editor. */
export const postEditor = (page: Page) => page.locator('.editor-post .ProseMirror').first()
export const chatEditor = (page: Page) => page.locator('.editor-line .ProseMirror').first()

/** Writes a post in the visible feed and waits for it to appear. */
export async function writePost(page: Page, text: string) {
  await postEditor(page).click()
  await page.keyboard.type(text)
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(page.getByRole('article').filter({ hasText: text }).first()).toBeVisible()
}

/** Sends a chat message and waits for it to appear. */
export async function sendMessage(page: Page, text: string) {
  await chatEditor(page).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('article').filter({ hasText: text }).first()).toBeVisible()
}

export const article = (page: Page, text: string) => page.getByRole('article').filter({ hasText: text }).first()

/** Opens the three-dot menu on an article and selects an item. */
export async function pick(page: Page, scope: ReturnType<Page['locator']>, menu: string, item: string) {
  await scope.getByRole('button', { name: menu }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Confirms the open dialog by clicking the button whose label is `action`. */
export async function confirm(page: Page, action: string) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: action, exact: true }).click()
  await expect(dialog).toBeHidden()
}

/** Returns a small valid PNG of w×h pixels in one solid colour. */
export function png(w: number, h: number, rgb: [number, number, number] = [206, 23, 23]): Buffer {
  const crcTable = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c
  }
  const crc = (buf: Buffer) => {
    let c = -1
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type), data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(td))
    return Buffer.concat([len, td, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())])
  const raw = Buffer.concat(Array.from({ length: h }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export const test = base
export { expect }
