// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { renderWithQuery } from '../test-utils'

/**
 * The line at the bottom of Home's feed: the release, a link to Sweet's
 * website, and a link to the source code.
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
  it('names the release and links to About and the source code, on one line', async () => {
    const { SweetColophon } = await import('./SweetColophon')
    const { container } = renderWithQuery(<SweetColophon />)
    await screen.findByText('Sweet v1.2.3')
    expect(screen.getByRole('link', { name: 'About' }).getAttribute('href')).toBe('https://sweet.community')
    expect(screen.getByRole('link', { name: 'Source code' }).getAttribute('href')).toBe(
      'https://code.example.test/fork',
    )
    expect(container.querySelector('footer')?.textContent).toBe('Sweet v1.2.3 · About · Source code')
  })

  it('shows nothing until the version has loaded', async () => {
    const { getVersion } = await import('../api')
    vi.mocked(getVersion).mockReturnValue(new Promise(() => {}))
    const { SweetColophon } = await import('./SweetColophon')
    const { container } = renderWithQuery(<SweetColophon />)
    await waitFor(() => expect(getVersion).toHaveBeenCalled())
    expect(container.textContent).toBe('')
  })
})
