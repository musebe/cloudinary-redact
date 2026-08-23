import { createHmac, timingSafeEqual } from 'node:crypto'

type ReviewSession = {
  assetIds: string[]
  expiresAt: number
}

const SESSION_SECONDS = 60 * 60
export const reviewSessionAssetLimit = 4

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function createReviewSession(
  assetIds: string | string[],
  secret: string,
  now = Date.now(),
): string {
  const session: ReviewSession = {
    assetIds: [...new Set(Array.isArray(assetIds) ? assetIds : [assetIds])]
      .filter(Boolean)
      .slice(0, reviewSessionAssetLimit),
    expiresAt: Math.floor(now / 1000) + SESSION_SECONDS,
  }
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url')
  return `${payload}.${sign(payload, secret)}`
}

export function getReviewSessionAssetIds(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): string[] {
  if (!token) return []
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return []

  const expected = Buffer.from(sign(payload, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return []
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<ReviewSession> & { assetId?: unknown }
    if (
      typeof parsed.expiresAt !== 'number' ||
      parsed.expiresAt <= Math.floor(now / 1000)
    ) {
      return []
    }

    const assetIds = Array.isArray(parsed.assetIds)
      ? parsed.assetIds
      : typeof parsed.assetId === 'string'
        ? [parsed.assetId]
        : []

    return [...new Set(assetIds.filter((value): value is string =>
      typeof value === 'string' && value.length > 0,
    ))].slice(0, reviewSessionAssetLimit)
  } catch {
    return []
  }
}

export function verifyReviewSession(
  token: string | undefined,
  assetId: string,
  secret: string,
  now = Date.now(),
): boolean {
  return getReviewSessionAssetIds(token, secret, now).includes(assetId)
}

export const reviewSessionMaxAge = SESSION_SECONDS
