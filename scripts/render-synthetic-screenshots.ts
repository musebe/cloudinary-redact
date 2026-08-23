import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

import { loadBenchmarkDataset } from '../src/benchmark/dataset.js'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function renderSvg(id: string, lines: string[]): string {
  const text = lines
    .map(
      (line, index) =>
        `<text x="108" y="${300 + index * 92}" class="line">${escapeXml(line)}</text>`,
    )
    .join('')

  return `<svg width="1200" height="900" viewBox="0 0 1200 900" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="900" fill="#eef3f9"/>
    <rect x="62" y="58" width="1076" height="784" rx="28" fill="#ffffff" stroke="#cfd9e6" stroke-width="2"/>
    <rect x="62" y="58" width="1076" height="96" rx="28" fill="#0f172a"/>
    <circle cx="112" cy="106" r="12" fill="#f87171"/>
    <circle cx="150" cy="106" r="12" fill="#fbbf24"/>
    <circle cx="188" cy="106" r="12" fill="#34d399"/>
    <text x="108" y="224" class="title">Synthetic support screen</text>
    ${text}
    <text x="108" y="785" class="footer">Fixture: ${escapeXml(id)} · No real customer data</text>
    <style>
      .title { font: 700 38px Arial, sans-serif; fill: #0f172a; }
      .line { font: 34px Arial, sans-serif; fill: #243247; }
      .footer { font: 24px Arial, sans-serif; fill: #64748b; }
    </style>
  </svg>`
}

const dataset = await loadBenchmarkDataset()
const outputDirectory = new URL('../benchmarks/images/', import.meta.url)
await mkdir(outputDirectory, { recursive: true })

for (const benchmarkCase of dataset.cases) {
  const output = new URL(`${benchmarkCase.id}.png`, outputDirectory)
  await sharp(Buffer.from(renderSvg(benchmarkCase.id, benchmarkCase.lines)))
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(output))
}

console.log(`Rendered ${dataset.cases.length} synthetic screenshots.`)
