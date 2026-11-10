import { describe, expect, it } from 'vitest'
import { failedUploads } from './images'

/** The line under the editor when uploads fail. It names no reason, because each image card shows its own. */
describe('failedUploads', () => {
  it('counts the images that failed', () => {
    expect(failedUploads(2, 2)).toBe('Failed to upload 2 of 2 images')
    expect(failedUploads(1, 3)).toBe('Failed to upload 1 of 3 images')
    expect(failedUploads(1, 1)).toBe('Failed to upload the image')
  })
})
