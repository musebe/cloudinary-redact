import { describe, expect, test } from 'vitest'

import { detectImageMimeType, validateScreenshot } from './file.js'

describe('screenshot validation', () => {
  test('detects supported image signatures', () => {
    expect(detectImageMimeType(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe(
      'image/jpeg',
    )
    expect(
      detectImageMimeType(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png')
  })

  test('rejects a declared type that does not match the bytes', () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'fake.png', {
      type: 'image/png',
    })

    expect(() =>
      validateScreenshot(file, new Uint8Array([0xff, 0xd8, 0xff]), 1000),
    ).toThrow('do not match')
  })
})
