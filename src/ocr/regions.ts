import {
  detectSensitiveText,
} from '../redaction/detector.js'
import type { OcrToken, Rectangle, RedactionRegion } from './types.js'

type TokenSpan = OcrToken & { start: number; end: number }

function centerY(token: OcrToken): number {
  return token.rectangle.y + token.rectangle.height / 2
}

function groupIntoLines(tokens: OcrToken[]): OcrToken[][] {
  const sorted = [...tokens].sort(
    (left, right) => centerY(left) - centerY(right) || left.rectangle.x - right.rectangle.x,
  )
  const lines: OcrToken[][] = []

  for (const token of sorted) {
    const line = lines.find((candidate) => {
      const averageY = candidate.reduce((total, item) => total + centerY(item), 0) /
        candidate.length
      const averageHeight = candidate.reduce(
        (total, item) => total + item.rectangle.height,
        0,
      ) / candidate.length
      return Math.abs(centerY(token) - averageY) <= Math.max(8, averageHeight * 0.6)
    })

    if (line) line.push(token)
    else lines.push([token])
  }

  return lines.map((line) =>
    [...line].sort((left, right) => left.rectangle.x - right.rectangle.x),
  )
}

function separatorBetween(left: string, right: string): string {
  const leftBinds = /[@._/+(\-]$/u.test(left)
  const rightBinds = /^[@.,:;_/)\-]/u.test(right)
  return leftBinds || rightBinds ? '' : ' '
}

function buildLineText(tokens: OcrToken[]): { text: string; spans: TokenSpan[] } {
  let text = ''
  const spans: TokenSpan[] = []

  tokens.forEach((token, index) => {
    if (index > 0) text += separatorBetween(tokens[index - 1]!.text, token.text)
    const start = text.length
    text += token.text
    spans.push({ ...token, start, end: text.length })
  })

  return { text, spans }
}

function unionRectangles(rectangles: Rectangle[]): Rectangle {
  const x = Math.min(...rectangles.map((rectangle) => rectangle.x))
  const y = Math.min(...rectangles.map((rectangle) => rectangle.y))
  const right = Math.max(
    ...rectangles.map((rectangle) => rectangle.x + rectangle.width),
  )
  const bottom = Math.max(
    ...rectangles.map((rectangle) => rectangle.y + rectangle.height),
  )
  return { x, y, width: right - x, height: bottom - y }
}

function addPadding(
  rectangle: Rectangle,
  imageWidth: number,
  imageHeight: number,
  padding = 6,
): Rectangle {
  const x = Math.max(0, Math.floor(rectangle.x - padding))
  const y = Math.max(0, Math.floor(rectangle.y - padding))
  const right = Math.min(imageWidth, Math.ceil(rectangle.x + rectangle.width + padding))
  const bottom = Math.min(
    imageHeight,
    Math.ceil(rectangle.y + rectangle.height + padding),
  )
  return { x, y, width: right - x, height: bottom - y }
}

export function buildRedactionRegions(
  tokens: OcrToken[],
  imageWidth: number,
  imageHeight: number,
): RedactionRegion[] {
  const regions: RedactionRegion[] = []

  for (const line of groupIntoLines(tokens)) {
    const { text, spans } = buildLineText(line)

    for (const match of detectSensitiveText(text)) {
      const matchedTokens = spans.filter(
        (span) => match.start < span.end && match.end > span.start,
      )
      if (matchedTokens.length === 0) continue

      regions.push({
        category: match.category,
        maskedValue: match.maskedValue,
        finding: match,
        rectangle: addPadding(
          unionRectangles(matchedTokens.map(({ rectangle }) => rectangle)),
          imageWidth,
          imageHeight,
        ),
      })
    }
  }

  return regions
}
