// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { prepareImages } from './galleries'

const img = (n: number) => `<img src="/img/${n}" alt="" width="10" height="10" data-image-id="${n}">`
const imgs = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => img(from + i)).join('')
/** An image as prepared for display. */
const shown = (n: number) =>
  `<img src="/img/${n}" alt="" width="10" height="10" data-image-id="${n}" loading="lazy" decoding="async" tabindex="0" role="button" aria-label="Open image">`
const shownRun = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => shown(from + i)).join('')

describe('prepareImages', () => {
  it('leaves a body without images unchanged', () => {
    expect(prepareImages('<p>Hi</p>')).toBe('<p>Hi</p>')
  })

  it('makes each image load lazily and a button named for opening it', () => {
    expect(prepareImages(`<p>Hi</p>${img(1)}<p>Bye</p>`)).toBe(`<p>Hi</p>${shown(1)}<p>Bye</p>`)
    expect(prepareImages('<img src="/img/2" alt="A cat">')).toContain('aria-label="Open image: A cat"')
  })

  it('leaves an image inside a link a part of the link', () => {
    expect(prepareImages('<p><a href="https://example.com"><img src="/img/3" alt=""></a></p>')).not.toContain('role')
  })

  it('wraps a run of adjacent images', () => {
    expect(prepareImages(`<p>Look</p>${imgs(1, 3)}<p>End</p>`)).toBe(
      `<p>Look</p><div class="gallery" data-count="3">${shownRun(1, 3)}</div><p>End</p>`,
    )
  })

  it('splits runs at 8 and leaves a single remaining image plain', () => {
    expect(prepareImages(imgs(1, 9))).toBe(`<div class="gallery" data-count="8">${shownRun(1, 8)}</div>${shown(9)}`)
    expect(prepareImages(imgs(1, 10))).toBe(
      `<div class="gallery" data-count="8">${shownRun(1, 8)}</div><div class="gallery" data-count="2">${shownRun(9, 10)}</div>`,
    )
  })

  it('does not join images separated by a paragraph', () => {
    expect(prepareImages(`${img(1)}<p>between</p>${img(2)}`)).toBe(`${shown(1)}<p>between</p>${shown(2)}`)
  })
})
