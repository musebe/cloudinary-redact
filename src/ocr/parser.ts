import type { OcrToken, Rectangle } from './types.js'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as UnknownRecord
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readCoordinate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readRectangle(annotation: UnknownRecord): Rectangle | null {
  const boundingPoly = asRecord(annotation.boundingPoly)
  const vertices = asArray(boundingPoly.vertices).map(asRecord)
  if (vertices.length < 2) return null

  const xValues = vertices.map((vertex) => readCoordinate(vertex.x))
  const yValues = vertices.map((vertex) => readCoordinate(vertex.y))
  const x = Math.min(...xValues)
  const y = Math.min(...yValues)
  const right = Math.max(...xValues)
  const bottom = Math.max(...yValues)

  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

export type OcrEvidence = {
  status: string
  tokens: OcrToken[]
}

export function extractOcrEvidence(uploadResult: unknown): OcrEvidence {
  const info = asRecord(asRecord(uploadResult).info)
  const ocr = asRecord(info.ocr)
  const advancedOcr = asRecord(ocr.adv_ocr)
  const status = String(advancedOcr.status || 'unknown')
  const tokens: OcrToken[] = []

  for (const page of asArray(advancedOcr.data)) {
    const annotations = asArray(asRecord(page).textAnnotations)
    const wordAnnotations = annotations.length > 1 ? annotations.slice(1) : []

    for (const rawAnnotation of wordAnnotations) {
      const annotation = asRecord(rawAnnotation)
      const text = typeof annotation.description === 'string'
        ? annotation.description.trim()
        : ''
      const rectangle = readRectangle(annotation)
      if (text && rectangle) tokens.push({ text, rectangle })
    }
  }

  return { status, tokens }
}
