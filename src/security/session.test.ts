import { describe, expect, test } from 'vitest'

import { createReviewSession, verifyReviewSession } from './session.js'

const secret = 'a-test-secret-that-is-longer-than-32-characters'

describe('review session', () => {
  test('allows only the matching asset before expiry', () => {
    const now = Date.UTC(2026, 8, 6)
    const token = createReviewSession('asset-one', secret, now)

    expect(verifyReviewSession(token, 'asset-one', secret, now)).toBe(true)
    expect(verifyReviewSession(token, 'asset-two', secret, now)).toBe(false)
    expect(verifyReviewSession(token, 'asset-one', secret, now + 3_700_000)).toBe(
      false,
    )
  })

  test('rejects a modified signature', () => {
    const token = createReviewSession('asset-one', secret)
    expect(verifyReviewSession(`${token}x`, 'asset-one', secret)).toBe(false)
  })
})
