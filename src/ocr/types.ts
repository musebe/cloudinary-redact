import type { PublicSensitiveMatch, SensitiveCategory } from '../redaction/types.js'

export type Rectangle = {
  x: number
  y: number
  width: number
  height: number
}

export type OcrToken = {
  text: string
  rectangle: Rectangle
}

export type RedactionRegion = {
  category: SensitiveCategory
  maskedValue: string
  rectangle: Rectangle
  finding: PublicSensitiveMatch
}
