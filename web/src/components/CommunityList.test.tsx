// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CommunityList } from './CommunityList'

/**
 * The store app's list of communities on this device. A row opens its community, its Remove button removes it after a
 * confirmation, and the form adds a community by its address.
 */

const club = { url: 'https://club.example.org', name: 'Book club' }

afterEach(cleanup)

function show(props: Partial<Parameters<typeof CommunityList>[0]> = {}) {
  const handlers = {
    onOpen: vi.fn(),
    onAdd: vi.fn(() => Promise.resolve()),
    onRemove: vi.fn(() => Promise.resolve()),
  }
  render(<CommunityList communities={[club]} {...handlers} {...props} />)
  return handlers
}

describe('CommunityList', () => {
  it('with no communities shows only the form to add one', () => {
    show({ communities: [] })
    expect(screen.queryByRole('heading', { name: 'Your communities' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Add a community' })).toBeTruthy()
  })

  it('opens a community from its row, and shows its address under its name', () => {
    const { onOpen } = show()
    expect(screen.getByText('club.example.org')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Book club' }))
    expect(onOpen).toHaveBeenCalledWith(club)
  })

  it('shows why an address could not be added, and keeps what was typed', async () => {
    const onAdd = vi.fn(() => Promise.reject(new Error('There is no Sweet community at x.org.')))
    show({ onAdd })
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'x.org' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('There is no Sweet community at x.org.')).toBeTruthy()
    expect(onAdd).toHaveBeenCalledWith('x.org')
    expect((screen.getByLabelText('Address') as HTMLInputElement).value).toBe('x.org')
  })

  it('removes a community only after the confirmation', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true
    }
    const { onRemove } = show()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/This device will be signed out of this community/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(club))
  })
})
