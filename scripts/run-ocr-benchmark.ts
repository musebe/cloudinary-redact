import 'dotenv/config'

import { readFile } from 'node:fs/promises'

import {
  deleteRestrictedScreenshot,
  uploadRestrictedScreenshot,
} from '../src/cloudinary/screenshots.js'
import { loadBenchmarkDataset } from '../src/benchmark/dataset.js'
import { calculateBenchmarkMetrics } from '../src/benchmark/metrics.js'
import { extractOcrEvidence } from '../src/ocr/parser.js'
import { buildRedactionRegions } from '../src/ocr/regions.js'
import type { SensitiveMatch } from '../src/redaction/types.js'

const dataset = await loadBenchmarkDataset()
const expected = dataset.cases.flatMap((item) => item.expected)
const detected: SensitiveMatch[] = []
const caseResults: Array<{ id: string; expected: number; detected: number }> = []

for (const benchmarkCase of dataset.cases) {
  const imageUrl = new URL(
    `../benchmarks/images/${benchmarkCase.id}.png`,
    import.meta.url,
  )
  const bytes = new Uint8Array(await readFile(imageUrl))
  let publicId: string | undefined

  try {
    const upload = await uploadRestrictedScreenshot(
      bytes,
      `${benchmarkCase.id}.png`,
    )
    publicId = upload.publicId
    const evidence = extractOcrEvidence(upload.raw)
    if (evidence.status !== 'complete') {
      throw new Error(`OCR status for ${benchmarkCase.id}: ${evidence.status}`)
    }
    const regions = buildRedactionRegions(evidence.tokens, upload.width, upload.height)
    detected.push(...regions.map(({ finding }) => finding))
    caseResults.push({
      id: benchmarkCase.id,
      expected: benchmarkCase.expected.length,
      detected: regions.length,
    })
  } finally {
    if (publicId) await deleteRestrictedScreenshot(publicId)
  }
}

console.log(
  JSON.stringify(
    {
      dataset: dataset.dataset,
      cases: dataset.cases.length,
      ...calculateBenchmarkMetrics(expected, detected),
      caseResults,
    },
    null,
    2,
  ),
)
