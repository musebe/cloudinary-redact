import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

describe('browser upload form', () => {
  test('uploads image bytes directly to a server-signed Cloudinary URL', async () => {
    const source = await readFile(
      new URL('../../public/app.js', import.meta.url),
      'utf8',
    )

    expect(source).toContain("fetch('/api/redactions/sign'")
    expect(source).toContain('fetch(authorization.uploadUrl')
    expect(source).toContain("fetch('/api/redactions/finalize'")
    expect(source).toContain('uploadClaim: signaturePayload.data.uploadClaim')
  })

  test('handles non-JSON platform responses without parsing their body', async () => {
    const source = await readFile(
      new URL('../../public/app.js', import.meta.url),
      'utf8',
    )

    expect(source).toContain("contentType.includes('application/json')")
    expect(source).toContain("response.headers.get('x-vercel-id')")
  })
})
