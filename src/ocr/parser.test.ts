import { describe, expect, test } from 'vitest'

import { extractOcrEvidence } from './parser.js'
import { buildRedactionRegions } from './regions.js'

describe('Cloudinary OCR evidence', () => {
  test('extracts word annotations and maps a sensitive line to one rectangle', () => {
    const evidence = extractOcrEvidence({
      info: {
        ocr: {
          adv_ocr: {
            status: 'complete',
            data: [
              {
                textAnnotations: [
                  {
                    description: 'Email alex@example.com',
                    boundingPoly: {
                      vertices: [{ x: 10, y: 10 }, { x: 250, y: 40 }],
                    },
                  },
                  {
                    description: 'Email',
                    boundingPoly: {
                      vertices: [{ x: 10, y: 10 }, { x: 70, y: 40 }],
                    },
                  },
                  {
                    description: 'alex@example.com',
                    boundingPoly: {
                      vertices: [{ x: 80, y: 10 }, { x: 250, y: 40 }],
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    })

    const regions = buildRedactionRegions(evidence.tokens, 1200, 900)

    expect(evidence.status).toBe('complete')
    expect(evidence.tokens).toHaveLength(2)
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      category: 'email',
      maskedValue: 'a***@example.com',
    })
    expect(regions[0]?.rectangle.x).toBe(74)
  })
})
