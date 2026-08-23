const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value)
}

export function detectImageMimeType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export function validateScreenshot(
  file: File,
  bytes: Uint8Array,
  maxUploadBytes: number,
) {
  if (file.size === 0) throw new Error('Choose a non-empty screenshot.')
  if (file.size > maxUploadBytes) {
    throw new Error(`The screenshot exceeds the ${maxUploadBytes}-byte limit.`)
  }
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error('Use a JPEG, PNG, or WebP screenshot.')
  }

  const detectedType = detectImageMimeType(bytes)
  if (!detectedType || detectedType !== file.type) {
    throw new Error('The screenshot contents do not match its declared type.')
  }
}
