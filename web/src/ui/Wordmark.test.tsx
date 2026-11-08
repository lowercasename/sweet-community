// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Wordmark } from './Wordmark'

afterEach(cleanup)

describe('Wordmark', () => {
  it('says Sweet until there is a name, and the mark alone carries the words when collapsed', () => {
    render(<Wordmark expanded={false} />)
    expect(screen.getByRole('img', { name: 'Sweet' })).toBeTruthy()
    expect(screen.queryByText('Sweet')).toBeNull()
  })

  it('shows the words beside the mark, and the mark says nothing twice', () => {
    render(<Wordmark label="Knitting Circle" />)
    expect(screen.getByText('Knitting Circle')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('is one mark at two sizes: the letter two fifths of the circle in both', () => {
    const { container: md } = render(<Wordmark label="x" />)
    const { container: sm } = render(<Wordmark label="x" size="sm" />)
    const mark = (c: HTMLElement) => c.querySelector('span')!.className
    expect(mark(md)).toContain('h-8 w-8 text-[19px]')
    expect(mark(sm)).toContain('h-5 w-5 text-[12px]')
  })
})
