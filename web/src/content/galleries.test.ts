// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { wrapGalleries } from './galleries'

const img = (n: number) => `<img src="/img/${n}" alt="" width="10" height="10" data-image-id="${n}">`
const imgs = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => img(from + i)).join('')

describe('wrapGalleries', () => {
  it('leaves text and lone images alone', () => {
    const html = `<p>Hi</p>${img(1)}<p>Bye</p>`
    expect(wrapGalleries(html)).toBe(html)
  })

  it('wraps a run of adjacent images', () => {
    expect(wrapGalleries(`<p>Look</p>${imgs(1, 3)}<p>End</p>`)).toBe(
      `<p>Look</p><div class="gallery" data-count="3">${imgs(1, 3)}</div><p>End</p>`,
    )
  })

  it('splits runs at 8 and leaves a lone remainder plain', () => {
    expect(wrapGalleries(imgs(1, 9))).toBe(`<div class="gallery" data-count="8">${imgs(1, 8)}</div>${img(9)}`)
    expect(wrapGalleries(imgs(1, 10))).toBe(
      `<div class="gallery" data-count="8">${imgs(1, 8)}</div><div class="gallery" data-count="2">${imgs(9, 10)}</div>`,
    )
  })

  it('does not join images separated by a paragraph', () => {
    const html = `${img(1)}<p>between</p>${img(2)}`
    expect(wrapGalleries(html)).toBe(html)
  })
})
