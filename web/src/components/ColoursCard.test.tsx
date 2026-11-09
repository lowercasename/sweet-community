// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * The light or dark choice on Settings (architecture.md, Interface). It is kept on the device by public/theme.js,
 * which the page loads before anything is drawn. The card reads and sets the choice through that script.
 */
afterEach(() => {
  cleanup()
  delete window.sweetTheme
})

describe('ColoursCard', () => {
  it('shows the choice kept on this device and changes it', async () => {
    const set = vi.fn()
    window.sweetTheme = { get: () => 'device', set }
    const { ColoursCard } = await import('./ColoursCard')
    render(<ColoursCard />)
    const select = screen.getByLabelText('Interface mode') as HTMLSelectElement
    expect(select.value).toBe('device')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Match this device', 'Light', 'Dark'])
    fireEvent.change(select, { target: { value: 'dark' } })
    expect(set).toHaveBeenCalledWith('dark')
    expect(select.value).toBe('dark')
  })
})
