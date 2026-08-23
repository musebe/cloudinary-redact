import { readFile } from 'node:fs/promises'
import { z } from 'zod'

import { sensitiveCategories } from '../redaction/types.js'

const findingSchema = z.object({
  category: z.enum(sensitiveCategories),
  value: z.string().min(1).max(200),
})

const benchmarkCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  lines: z.array(z.string().min(1).max(200)).min(1).max(12),
  expected: z.array(findingSchema).max(12),
})

const datasetSchema = z.object({
  dataset: z.string().min(1),
  description: z.string().min(1),
  cases: z.array(benchmarkCaseSchema).min(1).max(100),
})

export type BenchmarkDataset = z.infer<typeof datasetSchema>

export async function loadBenchmarkDataset(
  url = new URL('../../benchmarks/synthetic-screenshots-v1.json', import.meta.url),
): Promise<BenchmarkDataset> {
  return datasetSchema.parse(JSON.parse(await readFile(url, 'utf8')))
}
