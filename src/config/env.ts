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
    ocrMode: process.env.CLOUDINARY_OCR_MODE || DEFAULT_OCR_MODE,
    maxUploadBytes: readPositiveInteger(
      process.env.MAX_UPLOAD_BYTES,
      DEFAULT_MAX_UPLOAD_BYTES,
    ),
  }
}
