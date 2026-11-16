// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

afterEach(cleanup)

it('shows the default picture after a load failure and accepts a new picture', () => {
  const { rerender } = render(<Avatar name="Kit" picture="/img/missing" />)
  fireEvent.error(screen.getByRole('img', { name: 'Kit' }))
  expect(screen.getByRole('img', { name: 'Kit' }).getAttribute('src')).not.toBe('/img/missing')
  rerender(<Avatar name="Kit" picture="/img/replacement" />)
  expect(screen.getByRole('img', { name: 'Kit' }).getAttribute('src')).toBe('/img/replacement')
})
