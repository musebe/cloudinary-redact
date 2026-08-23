import { describe, expect, test } from 'vitest'

import { calculateBenchmarkMetrics } from './metrics.js'

describe('benchmark metrics', () => {
  test('calculates precision, recall, and F1 from exact labeled findings', () => {
    const metrics = calculateBenchmarkMetrics(
      [
        { category: 'email', value: 'one@example.com' },
        { category: 'phone', value: '+254 700 000 000' },
      ],
      [
        {
          category: 'email',
          value: 'one@example.com',
          maskedValue: 'o***@example.com',
          start: 0,
          end: 15,
        },
        {
          category: 'api_key',
          value: 'sk-falsepositivevalue12345',
          maskedValue: 'sk-••••2345',
          start: 16,
          end: 43,
        },
      ],
    )

    expect(metrics).toMatchObject({
      truePositives: 1,
      falsePositives: 1,
      falseNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      f1: 0.5,
    })
  })
})
