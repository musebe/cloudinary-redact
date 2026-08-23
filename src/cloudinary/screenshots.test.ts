import { describe, expect, test } from 'vitest'

import { buildRedactionTransformation } from './screenshots.js'

describe('targeted Cloudinary transformations', () => {
  test('builds one pixelation operation per sensitive region', () => {
    const transformation = buildRedactionTransformation(
      [
        {
          category: 'email',
          maskedValue: 'a***@example.com',
          finding: {
            category: 'email',
            value: 'alex@example.com',
            maskedValue: 'a***@example.com',
            start: 0,
            end: 16,
          },
          rectangle: { x: 10, y: 20, width: 200, height: 40 },
        },
      ],
      'pixelate',
    )

    expect(transformation).toEqual([
      {
        effect: 'pixelate_region:18',
        x: 10,
        y: 20,
        width: 200,
        height: 40,
      },
    ])
  })
})
