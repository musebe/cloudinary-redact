import { describe, expect, test } from 'vitest'

import { createUploadClaim, verifyUploadClaim } from './upload-claim.js'

const secret = 'a-secure-demo-secret-that-is-long-enough'

describe('direct-upload claims', () => {
  test('binds a short-lived claim to one generated public ID', () => {
    const now = Date.UTC(2026, 8, 6)
    const token = createUploadClaim('screenshot-redaction/uploads/test', secret, now)

    expect(verifyUploadClaim(token, secret, now)).toBe(
      'screenshot-redaction/uploads/test',
    )
  })

  test('rejects tampered and expired claims', () => {
    const now = Date.UTC(2026, 8, 6)
    const token = createUploadClaim('screenshot-redaction/uploads/test', secret, now)

    expect(verifyUploadClaim(`${token}x`, secret, now)).toBeNull()
    expect(verifyUploadClaim(token, secret, now + 11 * 60 * 1000)).toBeNull()
  })
})
