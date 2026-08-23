import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

import {
  createDirectUploadAuthorization,
  readRedactionRecord,
  readRedactionRecords,
  setReviewDecision,
} from '../cloudinary/screenshots.js'
import { getRuntimeConfig } from '../config/env.js'
import { HttpError } from '../http/errors.js'
import {
  processDirectScreenshot,
  processScreenshot,
} from '../redaction/process.js'
import { validateScreenshot } from '../security/file.js'
import {
  createReviewSession,
  getReviewSessionAssetIds,
  reviewSessionMaxAge,
  verifyReviewSession,
} from '../security/session.js'
import { createUploadClaim, verifyUploadClaim } from '../security/upload-claim.js'

export const redactions = new Hono()

function requireRuntimeConfig() {
  try {
    return getRuntimeConfig()
  } catch {
    throw new HttpError(503, 'Cloudinary processing is not configured.')
  }
}

function requireReviewSession(context: Parameters<typeof getCookie>[0], assetId: string) {
  const { sessionSecret } = requireRuntimeConfig()
  const token = getCookie(context, 'redaction_review')
  if (!verifyReviewSession(token, assetId, sessionSecret)) {
    throw new HttpError(403, 'The review session is missing or expired.')
  }
}

function rememberReviewAsset(
  context: Parameters<typeof getCookie>[0],
  assetId: string,
  config: ReturnType<typeof getRuntimeConfig>,
) {
  const existingAssetIds = getReviewSessionAssetIds(
    getCookie(context, 'redaction_review'),
    config.sessionSecret,
  )
  setCookie(
    context,
    'redaction_review',
    createReviewSession([assetId, ...existingAssetIds], config.sessionSecret),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/api/redactions',
      maxAge: reviewSessionMaxAge,
    },
  )
}

redactions.post('/sign', async (context) => {
  const config = requireRuntimeConfig()
  const body = await context.req.json().catch(() => null) as {
    filename?: unknown
    mimeType?: unknown
    size?: unknown
    width?: unknown
    height?: unknown
  } | null
  const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp']

  if (
    typeof body?.filename !== 'string' ||
    body.filename.length === 0 ||
    typeof body.mimeType !== 'string' ||
    !validMimeTypes.includes(body.mimeType) ||
    typeof body.size !== 'number' ||
    body.size <= 0 ||
    body.size > config.maxUploadBytes ||
    typeof body.width !== 'number' ||
    body.width < 1024 ||
    typeof body.height !== 'number' ||
    body.height < 768
  ) {
    throw new HttpError(400, 'The screenshot does not satisfy the upload policy.')
  }

  const authorization = createDirectUploadAuthorization(body.filename)
  return context.json({
    success: true,
    data: {
      ...authorization,
      uploadClaim: createUploadClaim(
        authorization.publicId,
        config.sessionSecret,
      ),
    },
  })
})

redactions.post('/finalize', async (context) => {
  const config = requireRuntimeConfig()
  const body = await context.req.json().catch(() => null) as {
    assetId?: unknown
    uploadClaim?: unknown
    mode?: unknown
  } | null
  const expectedPublicId = verifyUploadClaim(
    typeof body?.uploadClaim === 'string' ? body.uploadClaim : undefined,
    config.sessionSecret,
  )

  if (typeof body?.assetId !== 'string' || !expectedPublicId) {
    throw new HttpError(403, 'The direct-upload claim is missing or expired.')
  }

  const result = await processDirectScreenshot({
    assetId: body.assetId,
    expectedPublicId,
    mode: body.mode === 'blur' ? 'blur' : 'pixelate',
  })
  rememberReviewAsset(context, result.assetId, config)
  return context.json({ success: true, data: result }, 201)
})

redactions.post('/', async (context) => {
  const config = requireRuntimeConfig()

  const contentLength = Number(context.req.header('content-length') || 0)
  if (contentLength > config.maxUploadBytes + 256_000) {
    throw new HttpError(413, 'The upload request is too large.')
  }

  const body = await context.req.parseBody()
  const image = body.image
  const mode = body.mode === 'blur' ? 'blur' : 'pixelate'
  if (!(image instanceof File)) {
    throw new HttpError(400, 'Add a screenshot using the image field.')
  }

  const bytes = new Uint8Array(await image.arrayBuffer())
  try {
    validateScreenshot(image, bytes, config.maxUploadBytes)
  } catch (error) {
    throw new HttpError(
      image.size > config.maxUploadBytes ? 413 : 400,
      error instanceof Error ? error.message : 'The screenshot is invalid.',
    )
  }

  const result = await processScreenshot({
    bytes,
    filename: image.name,
    mode,
  })

  rememberReviewAsset(context, result.assetId, config)

  return context.json({ success: true, data: result }, 201)
})

redactions.get('/', async (context) => {
  const { sessionSecret } = requireRuntimeConfig()
  const assetIds = getReviewSessionAssetIds(
    getCookie(context, 'redaction_review'),
    sessionSecret,
  )
  if (assetIds.length === 0) {
    return context.json({ success: true, data: [] })
  }

  const records = await readRedactionRecords(assetIds)
  return context.json({
    success: true,
    data: records.map(({ context: _context, ...record }) => record),
  })
})

redactions.get('/:assetId', async (context) => {
  const assetId = context.req.param('assetId')
  requireReviewSession(context, assetId)
  const record = await readRedactionRecord(assetId)
  const { context: _context, ...publicRecord } = record
  return context.json({ success: true, data: publicRecord })
})

redactions.patch('/:assetId/review', async (context) => {
  const assetId = context.req.param('assetId')
  requireReviewSession(context, assetId)
  const body = await context.req.json().catch(() => null) as {
    decision?: unknown
  } | null

  if (body?.decision !== 'approve' && body?.decision !== 'reject') {
    throw new HttpError(400, 'Choose approve or reject.')
  }

  const record = await setReviewDecision(assetId, body.decision)
  const { context: _context, ...publicRecord } = record
  return context.json({ success: true, data: publicRecord })
})
