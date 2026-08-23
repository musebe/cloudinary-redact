import { Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'

import {
  readRedactionRecord,
  readRedactionRecords,
  setReviewDecision,
} from '../cloudinary/screenshots.js'
import { getRuntimeConfig } from '../config/env.js'
import { HttpError } from '../http/errors.js'
import { processScreenshot } from '../redaction/process.js'
import { validateScreenshot } from '../security/file.js'
import {
  createReviewSession,
  getReviewSessionAssetIds,
  reviewSessionMaxAge,
  verifyReviewSession,
} from '../security/session.js'

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

  const existingAssetIds = getReviewSessionAssetIds(
    getCookie(context, 'redaction_review'),
    config.sessionSecret,
  )
  setCookie(
    context,
    'redaction_review',
    createReviewSession(
      [result.assetId, ...existingAssetIds],
      config.sessionSecret,
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      path: '/api/redactions',
      maxAge: reviewSessionMaxAge,
    },
  )

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
