import { readFile } from 'node:fs/promises'

import { calculateBenchmarkMetrics } from '../src/benchmark/metrics.js'
import { detectSensitiveText } from '../src/redaction/detector.js'
import type { SensitiveCategory } from '../src/redaction/types.js'

type Dataset = {
  dataset: string
  cases: Array<{
    id: string
    lines: string[]
    expected: Array<{ category: SensitiveCategory; value: string }>
  }>
}

const datasetUrl = new URL('../benchmarks/synthetic-screenshots-v1.json', import.meta.url)
const dataset = JSON.parse(await readFile(datasetUrl, 'utf8')) as Dataset
const expected = dataset.cases.flatMap((item) => item.expected)
const detected = dataset.cases.flatMap((item) =>
  detectSensitiveText(item.lines.join('\n')),
)
const metrics = calculateBenchmarkMetrics(expected, detected)

console.log(
  JSON.stringify(
    {
      dataset: dataset.dataset,
      cases: dataset.cases.length,
      expectedFindings: expected.length,
      detectedFindings: detected.length,
      ...metrics,
    },
    null,
    2,
  ),
)
