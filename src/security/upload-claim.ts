import { createHmac, timingSafeEqual } from 'node:crypto'

type UploadClaim = {
  publicId: string
  expiresAt: number
}

const CLAIM_SECONDS = 10 * 60

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createUploadClaim(
  publicId: string,
  secret: string,
  now = Date.now(),
): string {
  const claim: UploadClaim = {
    publicId,
    expiresAt: Math.floor(now / 1000) + CLAIM_SECONDS,
  }
  const payload = Buffer.from(JSON.stringify(claim)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifyUploadClaim(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): string | null {
  if (!token) return null
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null
  }

  try {
    const claim = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<UploadClaim>
    if (
      typeof claim.publicId !== 'string' ||
      claim.publicId.length === 0 ||
      typeof claim.expiresAt !== 'number' ||
      claim.expiresAt <= Math.floor(now / 1000)
    ) {
      return null
    }
    return claim.publicId
  } catch {
    return null
  }
}
