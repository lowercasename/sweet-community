// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { ROOT, group, paragraph, renderWithQuery, user } from '../test-utils'

/**
 * The welcome dialog. It opens the first time a user sees Home, shows the
 * welcome message under the owner's name, and offers the tour.
 */
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  getMySettings: vi.fn(() => Promise.resolve({ digest: 'weekly', welcomed: false })),
  setMySettings: vi.fn((s: { digest: string }) => Promise.resolve({ ...s, welcomed: true })),
  getSettings: vi.fn(() =>
    Promise.resolve({ group_creation: 'anyone', name: 'Knitting Circle', description: '', owner_set: true }),
  ),
  getWelcome: vi.fn(() => Promise.resolve({ body_html: paragraph('Say hello in Introductions.') })),
  getRules: vi.fn(() => Promise.resolve({ body_html: '' })),
  listTopics: vi.fn(() => Promise.resolve({ topics: [] })),
  listMembers: vi.fn(() =>
    Promise.resolve({
      members: [
        { group_id: ROOT, user: user('ada'), role: 'owner', joined_at: 1 },
        { group_id: ROOT, user: user('kit'), role: 'member', joined_at: 2 },
      ],
    }),
  ),
}))

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

const render = async (props: { asked?: boolean; atHome?: boolean } = {}) => {
  const { Welcome } = await import('./Welcome')
  const onClosed = vi.fn()
  renderWithQuery(
    <Welcome
      root={group(ROOT, 'member')}
      atHome={props.atHome ?? true}
      asked={props.asked ?? false}
      onClosed={onClosed}
    />,
  )
  return onClosed
}

describe('Welcome', () => {
  it('opens for a user who has not been welcomed, with the welcome message under the owner', async () => {
    await render()
    await screen.findByRole('heading', { name: 'Welcome to Knitting Circle' })
    expect(screen.getByText('Knitting Circle runs on Sweet.')).toBeTruthy()
    await screen.findByText('Say hello in Introductions.')
    await screen.findByText('ada')
    expect(screen.getByText(/Would you like a quick tour\?/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show me around' })).toBeTruthy()
  })

  it('records that the user has been welcomed when they choose Not now', async () => {
    const { setMySettings } = await import('../api')
    const onClosed = await render()
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(setMySettings).toHaveBeenCalledWith({ digest: 'weekly', welcomed: true })
    expect(onClosed).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Welcome to Knitting Circle' })).toBeNull())
  })

  it('stays closed for a user who has been welcomed, and opens when asked from Settings', async () => {
    const { getMySettings, setMySettings } = await import('../api')
    vi.mocked(getMySettings).mockResolvedValue({ digest: 'weekly', welcomed: true })
    await render()
    await waitFor(() => expect(getMySettings).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Welcome to Knitting Circle' })).toBeNull()
    cleanup()
    await render({ asked: true })
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(setMySettings).not.toHaveBeenCalled()
  })

  it('opens only on Home', async () => {
    const { getMySettings } = await import('../api')
    vi.mocked(getMySettings).mockResolvedValue({ digest: 'weekly', welcomed: false })
    await render({ atHome: false })
    await waitFor(() => expect(getMySettings).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Welcome to Knitting Circle' })).toBeNull()
  })

  it('shows no message and no name when there is no welcome message', async () => {
    const { getMySettings, getWelcome } = await import('../api')
    vi.mocked(getMySettings).mockResolvedValue({ digest: 'weekly', welcomed: false })
    vi.mocked(getWelcome).mockResolvedValue({ body_html: '' })
    await render()
    await screen.findByRole('heading', { name: 'Welcome to Knitting Circle' })
    await waitFor(() => expect(getWelcome).toHaveBeenCalled())
    expect(screen.queryByText('ada')).toBeNull()
  })
})
