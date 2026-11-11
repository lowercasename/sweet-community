// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Wordmark } from './Wordmark'

afterEach(cleanup)

describe('Wordmark', () => {
  it('defaults the label to Sweet, and when collapsed only the mark is shown, with the label as its accessible name', () => {
    render(<Wordmark expanded={false} />)
    expect(screen.getByRole('img', { name: 'Sweet' })).toBeTruthy()
    expect(screen.queryByText('Sweet')).toBeNull()
  })

  it('shows the label next to the mark, and the mark is hidden from assistive technology', () => {
    render(<Wordmark label="Knitting Circle" />)
    expect(screen.getByText('Knitting Circle')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})
