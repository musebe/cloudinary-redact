import {
  createReviewDerivative,
  SCREENSHOT_ASSET_FOLDER,
  type RedactionMode,
  uploadRestrictedScreenshot,
} from '../cloudinary/screenshots.js'
import { extractOcrEvidence } from '../ocr/parser.js'
import { buildRedactionRegions } from '../ocr/regions.js'

export async function processScreenshot(options: {
  bytes: Uint8Array
  filename: string
  mode: RedactionMode
}) {
  const uploaded = await uploadRestrictedScreenshot(options.bytes, options.filename)
  const ocr = extractOcrEvidence(uploaded.raw)

  if (ocr.status !== 'complete') {
    throw new Error(`Cloudinary OCR did not complete. Status: ${ocr.status}`)
  }

  const regions = buildRedactionRegions(
    ocr.tokens,
    uploaded.width,
    uploaded.height,
  )
  if (regions.length > 20) {
    throw new Error(
      'Too many sensitive regions were detected for automatic redaction.',
    )
  }
  const derivative = await createReviewDerivative({
    publicId: uploaded.publicId,
    regions,
    mode: options.mode,
  })

  return {
    assetId: uploaded.assetId,
    publicId: uploaded.publicId,
    assetFolder: SCREENSHOT_ASSET_FOLDER,
    width: uploaded.width,
    height: uploaded.height,
    ocrStatus: ocr.status,
    tokenCount: ocr.tokens.length,
    reviewStatus: 'review_required' as const,
    mode: options.mode,
    findings: regions.map(({ category, maskedValue, rectangle }) => ({
      category,
      maskedValue,
      rectangle,
    })),
    originalUrl: derivative.originalUrl,
    redactedUrl: derivative.redactedUrl,
  }
}
