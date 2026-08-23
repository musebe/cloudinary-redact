import { createHmac, timingSafeEqual } from 'node:crypto'

type ReviewSession = {
  assetId: string
  expiresAt: number
}

const SESSION_SECONDS = 60 * 60

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createReviewSession(
  assetId: string,
  secret: string,
  now = Date.now(),
): string {
  const session: ReviewSession = {
    assetId,
    expiresAt: Math.floor(now / 1000) + SESSION_SECONDS,
  }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function verifyReviewSession(
  token: string | undefined,
  assetId: string,
  secret: string,
  now = Date.now(),
): boolean {
  if (!token) return false
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return false

  const expected = Buffer.from(sign(payload, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return false
  }

  try {
    const session = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as ReviewSession
    return session.assetId === assetId && session.expiresAt > Math.floor(now / 1000)
  } catch {
    return false
  }
}

export const reviewSessionMaxAge = SESSION_SECONDS
