import { loadBenchmarkDataset } from '../src/benchmark/dataset.js'
import { calculateBenchmarkMetrics } from '../src/benchmark/metrics.js'
import { detectSensitiveText } from '../src/redaction/detector.js'

const dataset = await loadBenchmarkDataset()
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
