const DEFAULT_OCR_MODE = 'adv_ocr'
const DEFAULT_MAX_UPLOAD_BYTES = 4_000_000

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function getConfigurationStatus() {
  const cloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  )

  return {
    cloudinaryConfigured,
    reviewSessionConfigured: Boolean(
      process.env.DEMO_SESSION_SECRET &&
        process.env.DEMO_SESSION_SECRET.length >= 32,
    ),
    ocrMode: process.env.CLOUDINARY_OCR_MODE || DEFAULT_OCR_MODE,
    maxUploadBytes: readPositiveInteger(
      process.env.MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
  }
}

export function getRuntimeConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  const sessionSecret = process.env.DEMO_SESSION_SECRET

  if (!cloudName || !apiKey || !apiSecret || !sessionSecret) {
    throw new Error('Server processing is not configured.')
  }
  if (sessionSecret.length < 32) {
    throw new Error('The review-session secret must be at least 32 characters.')
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    sessionSecret,
    ocrMode: process.env.CLOUDINARY_OCR_MODE || DEFAULT_OCR_MODE,
    maxUploadBytes: readPositiveInteger(
      process.env.MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
  }
}
