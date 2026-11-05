// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { keys } from '../data/keys'
import { dm, member, renderWithQuery, user } from '../test-utils'

/**
 * A person's name, wherever it is written, opens a card about them with a
 * way to message them (architecture.md, Layout). The card shows the person
 * as the users cache has them now; my own card has no Message.
 */
vi.mock('../api', () => ({
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
  it('opens a card on a click with the person as they are now, and closes on Escape', async () => {
    await draw('mo')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'mo' }))
    // As they are now: the users cache, once it has them, not the snapshot the content carried.
    await within(card('mo')).findByText(/moderator · joined/)
    expect(within(card('mo')).getByRole('img', { name: 'mo' }).getAttribute('src')).toBe('/img/mo-now')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Message opens the conversation with them and goes there', async () => {
    const { openDM } = await import('../api')
    await draw('mo')
    fireEvent.click(screen.getByRole('button', { name: 'mo' }))
    fireEvent.click(within(card('mo')).getByRole('button', { name: 'Message' }))
    expect(openDM).toHaveBeenCalledWith(['mo'])
    await vi.waitFor(() => expect(window.location.pathname).toBe('/r/d1'))
  })

  it('my own card has no Message', async () => {
    await draw('kit')
    fireEvent.click(screen.getByRole('button', { name: 'kit' }))
    expect(within(card('kit')).queryByRole('button', { name: 'Message' })).toBeNull()
  })
})
