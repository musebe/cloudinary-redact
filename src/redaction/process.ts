import {
  createReviewDerivative,
  requestScreenshotOcr,
  SCREENSHOT_ASSET_FOLDER,
  type RedactionMode,
  type ScreenshotAsset,
  uploadRestrictedScreenshot,
  verifyDirectUpload,
} from '../cloudinary/screenshots.js'
import { extractOcrEvidence } from '../ocr/parser.js'
import { buildRedactionRegions } from '../ocr/regions.js'

async function buildRedactionResult(options: {
  uploaded: ScreenshotAsset
  ocrResponse: unknown
  mode: RedactionMode
}) {
  const { uploaded } = options
  const ocr = extractOcrEvidence(options.ocrResponse)

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

export async function processScreenshot(options: {
  bytes: Uint8Array
  filename: string
  mode: RedactionMode
}) {
  const uploaded = await uploadRestrictedScreenshot(options.bytes, options.filename)
  return buildRedactionResult({
    uploaded,
    ocrResponse: uploaded.raw,
    mode: options.mode,
  })
}

export async function processDirectScreenshot(options: {
  assetId: string
  expectedPublicId: string
  mode: RedactionMode
}) {
  const uploaded = await verifyDirectUpload(
    options.assetId,
    options.expectedPublicId,
  )
  const ocrResponse = await requestScreenshotOcr(uploaded.publicId)
  return buildRedactionResult({
    uploaded,
    ocrResponse,
    mode: options.mode,
  })
}
