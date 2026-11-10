// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { prepareImages } from './bodyImages'
import { textThenLink } from '../test-utils'

describe('prepareImages', () => {
  it('makes every image load lazily and a button named for opening it, and leaves a body without images unchanged', () => {
    const body = textThenLink('Hello', 'https://example.com')
    expect(prepareImages(body)).toBe(body)
    const doc = new DOMParser().parseFromString(
      prepareImages(
        body +
          new XMLSerializer().serializeToString(
            Object.assign(document.createElement('img'), { src: '/img/1', alt: 'A' }),
          ),
      ),
      'text/html',
    )
    const img = doc.querySelector('img')!
    expect([img.getAttribute('loading'), img.getAttribute('decoding'), img.getAttribute('tabindex')]).toEqual([
      'lazy',
      'async',
      '0',
    ])
    expect([img.getAttribute('role'), img.getAttribute('aria-label')]).toEqual(['button', 'Open image: A'])
    expect(img.getAttribute('src')).toBe('/img/1')
  })
})
