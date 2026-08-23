import { describe, expect, test } from 'vitest'
import sharp from 'sharp'
import { fileURLToPath } from 'node:url'

import { loadBenchmarkDataset } from './dataset.js'

describe('synthetic screenshot dataset', () => {
  test('contains 20 uniquely identified synthetic cases', async () => {
    const dataset = await loadBenchmarkDataset()
    const ids = dataset.cases.map(({ id }) => id)

    expect(dataset.cases).toHaveLength(20)
    expect(new Set(ids).size).toBe(ids.length)
    expect(JSON.stringify(dataset)).toContain('No private value shown')
  })

  test('renders every case at the Cloudinary OCR minimum size', async () => {
    const dataset = await loadBenchmarkDataset()

    for (const benchmarkCase of dataset.cases) {
      const image = new URL(
        `../../benchmarks/images/${benchmarkCase.id}.png`,
        import.meta.url,
      )
      const metadata = await sharp(fileURLToPath(image)).metadata()
      expect(metadata.width).toBe(1200)
      expect(metadata.height).toBe(900)
    }
  })
})
