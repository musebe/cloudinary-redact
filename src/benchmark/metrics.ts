import type { SensitiveCategory, SensitiveMatch } from '../redaction/types.js'

export type ExpectedFinding = {
  category: SensitiveCategory
  value: string
}

export type BenchmarkMetrics = {
  truePositives: number
  falsePositives: number
  falseNegatives: number
  precision: number
  recall: number
  f1: number
}

function findingKey(finding: ExpectedFinding): string {
  return `${finding.category}:${finding.value.toLowerCase().replace(/\s/g, '')}`
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator
}

export function calculateBenchmarkMetrics(
  expected: ExpectedFinding[],
  detected: SensitiveMatch[],
): BenchmarkMetrics {
  const expectedKeys = new Set(expected.map(findingKey))
  const detectedKeys = new Set(detected.map(findingKey))
  const truePositives = [...detectedKeys].filter((key) => expectedKeys.has(key)).length
  const falsePositives = detectedKeys.size - truePositives
  const falseNegatives = expectedKeys.size - truePositives
  const precision = safeRatio(truePositives, truePositives + falsePositives)
  const recall = safeRatio(truePositives, truePositives + falseNegatives)
  const f1 = safeRatio(2 * precision * recall, precision + recall)

  return {
    truePositives,
    falsePositives,
    falseNegatives,
    precision,
    recall,
    f1,
  }
}
