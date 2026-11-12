import { vi } from 'vitest'

// happy-dom has no layout. Zero-sized rectangles would hide every toolbar.
// Playwright checks viewport visibility with the real middleware.
vi.mock('@floating-ui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@floating-ui/react')>()),
  hide: () => ({ name: 'hide', fn: () => ({}) }),
}))
