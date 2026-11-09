// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '../test-utils'

/**
 * The line at the bottom of Home's feed (architecture.md, Updates and Licence): the release, a link to the source
 * code, and who built Sweet.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getVersion: vi.fn(() =>
    Promise.resolve({ release: 'v1.2.3', build: 'abcdef123456', source_url: 'https://code.example.test/fork' }),
  ),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe('SweetColophon', () => {
  it('names the release, links to the source code, and says who built Sweet', async () => {
    const { SweetColophon } = await import('./SweetColophon')
    renderWithQuery(<SweetColophon />)
    await screen.findByText('Sweet v1.2.3')
    expect(screen.getByRole('link', { name: 'Source code' }).getAttribute('href')).toBe(
      'https://code.example.test/fork',
    )
    expect(screen.getByRole('link', { name: 'Raphael' }).getAttribute('href')).toBe('https://raphaelkabo.com')
    expect(screen.getByRole('img', { name: 'love' })).toBeTruthy()
    expect(screen.getByText(/Built with/).textContent).toBe('Built with  by Raphael')
  })

  it('shows nothing until the version has loaded', async () => {
    const { getVersion } = await import('../api')
    vi.mocked(getVersion).mockReturnValue(new Promise(() => {}))
    const { SweetColophon } = await import('./SweetColophon')
    renderWithQuery(<SweetColophon />)
    await waitFor(() => expect(getVersion).toHaveBeenCalled())
    expect(screen.queryByText(/Built with/)).toBeNull()
  })
})
