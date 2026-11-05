import { deflateSync } from 'node:zlib'
import { expect, test as base, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test'

/** A name nobody else in the run has. */
let counter = 0
export const uniq = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-5)}${(counter++).toString(36)}`

/** Someone signed in: their context, page and name. */
export interface Person {
  context: BrowserContext
  page: Page
  username: string
}

/** Fix the layout so tests see the same thing every time: both panes, nav expanded. */
async function prepare(page: Page) {
  // A script error on the page is the first thing to know about when a flow fails.
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

/** A context made by hand needs the project's baseURL and viewport spelled out. */
function options(info: TestInfo) {
  const use = info.project.use
  return { baseURL: use.baseURL as string, viewport: use.viewport ?? undefined, isMobile: use.isMobile, hasTouch: use.hasTouch }
}

/** The owner, signed in from the cookie the global setup saved. */
export async function owner(browser: Browser, info: TestInfo): Promise<Person> {
  const context = await browser.newContext({ ...options(info), storageState: `e2e/.auth/owner-${info.project.name}.json` })
  const page = await context.newPage()
  await prepare(page)
  return { context, page, username: 'raphael' }
}

/** A new member: the owner mints an invite, they register through it, and their context is signed in. */
export async function member(browser: Browser, info: TestInfo, prefix = 'kit'): Promise<Person> {
  const o = await owner(browser, info)
  const invite = await o.context.request.post('/api/invites')
  expect(invite.ok()).toBeTruthy()
  const code = ((await invite.json()) as { code: string }).code
  await o.context.close()

  const context = await browser.newContext(options(info))
  const username = uniq(prefix)
  const res = await context.request.post('/api/register', { data: { code, username, password: 'longenough' } })
  expect(res.ok(), await res.text()).toBeTruthy()
  const page = await context.newPage()
  await prepare(page)
  return { context, page, username }
}

/** Open the app at a path and wait for the signed-in frame. */
export async function open(page: Page, path = '/') {
  await page.goto(path)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}

/** The posts editor's surface and the chat editor's surface. */
export const postEditor = (page: Page) => page.locator('.editor-post .ProseMirror').first()
export const chatEditor = (page: Page) => page.locator('.editor-line .ProseMirror').first()

/** Write a post in the visible feed and wait for it to appear. */
export async function writePost(page: Page, text: string) {
  await postEditor(page).click()
  await page.keyboard.type(text)
  await page.getByRole('button', { name: 'Post', exact: true }).click()
  await expect(page.getByRole('article').filter({ hasText: text }).first()).toBeVisible()
}

/** Send a chat message and wait for it to appear. */
export async function sendMessage(page: Page, text: string) {
  await chatEditor(page).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('article').filter({ hasText: text }).first()).toBeVisible()
}

export const article = (page: Page, text: string) => page.getByRole('article').filter({ hasText: text }).first()

/** Open the three-dot menu on an article and pick an item. */
export async function pick(page: Page, scope: ReturnType<Page['locator']>, menu: string, item: string) {
  await scope.getByRole('button', { name: menu }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Confirm the open dialog by its action word. */
export async function confirm(page: Page, action: string) {
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: action, exact: true }).click()
  await expect(dialog).toBeHidden()
}

/** A small valid PNG: w×h, solid colour. */
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
