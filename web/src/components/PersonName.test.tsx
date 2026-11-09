// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { keys } from '../data/keys'
import { dm, member, renderWithQuery, user } from '../test-utils'

/**
 * A user's name, wherever it is shown, opens a card about the user with a
 * Message button. The card shows the user's current
 * data from the users cache. The viewer's own card has no Message button.
 */
vi.mock('../api', () => ({
  listMembers: vi.fn(() => Promise.resolve({ members: [] })),
  listUsers: vi.fn(),
  openDM: vi.fn(),
}))

afterEach(cleanup)

beforeEach(async () => {
  const { listUsers, openDM } = await import('../api')
  vi.mocked(listUsers).mockResolvedValue({
    users: [member('kit'), { ...member('mo', 'moderator'), picture: '/img/mo-now' }],
  })
  vi.mocked(openDM).mockResolvedValue(dm('d1', [user('kit'), user('mo')]))
})

async function draw(who: string, me = 'kit') {
  const { PersonName } = await import('./PersonName')
  renderWithQuery(<PersonName user={user(who)} />, (qc) => qc.setQueryData(keys.me, user(me)))
  await screen.findByRole('button', { name: who })
}

const card = (who: string) => screen.getByRole('dialog', { name: `About ${who}` })

describe('PersonName', () => {
  it('opens a card with the current user data on click, and closes on Escape', async () => {
    await draw('mo')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'mo' }))
    // The card shows the current data from the users cache once loaded, not the snapshot in the content.
    await within(card('mo')).findByText(/moderator · joined/)
    expect(within(card('mo')).getByRole('img', { name: 'mo' }).getAttribute('src')).toBe('/img/mo-now')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Message opens the conversation with the user and navigates to it', async () => {
    const { openDM } = await import('../api')
    await draw('mo')
    fireEvent.click(screen.getByRole('button', { name: 'mo' }))
    // Message is shown only once the user's role is loaded, because only a user on the instance can be messaged.
    fireEvent.click(await within(card('mo')).findByRole('button', { name: 'Message' }))
    expect(openDM).toHaveBeenCalledWith('mo')
    await vi.waitFor(() => expect(window.location.pathname).toBe('/r/d1'))
  })

  it('the avatar beside the name is part of the same button, so clicking it also opens the card', async () => {
    const { PersonName } = await import('./PersonName')
    renderWithQuery(<PersonName user={user('mo')} avatar="md" />, (qc) => qc.setQueryData(keys.me, user('kit')))
    const trigger = await screen.findByRole('button', { name: 'mo' })
    fireEvent.click(within(trigger).getByRole('img', { name: 'mo' }))
    expect(card('mo')).toBeTruthy()
  })

  it('a user no longer on the instance has a card with their name and no Message button', async () => {
    await draw('gone')
    fireEvent.click(screen.getByRole('button', { name: 'gone' }))
    expect(within(card('gone')).queryByRole('button', { name: 'Message' })).toBeNull()
  })

  it('the card for the viewer has no Message button', async () => {
    await draw('kit')
    fireEvent.click(screen.getByRole('button', { name: 'kit' }))
    expect(within(card('kit')).queryByRole('button', { name: 'Message' })).toBeNull()
  })

  it('View profile navigates to their profile', async () => {
    const { PersonName } = await import('./PersonName')
    renderWithQuery(<PersonName user={user('mo')} />)
    fireEvent.click(await screen.findByRole('button', { name: 'mo' }))
    fireEvent.click(await screen.findByRole('button', { name: 'View profile' }))
    expect(window.location.pathname).toBe('/u/mo')
  })
})
