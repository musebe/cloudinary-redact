import { Hono } from 'hono'

import { getRuntimeConfig } from '../config/env.js'
import { HttpError } from '../http/errors.js'
import { processScreenshot } from '../redaction/process.js'
import { validateScreenshot } from '../security/file.js'

export const redactions = new Hono()

redactions.post('/', async (context) => {
  let config: ReturnType<typeof getRuntimeConfig>
  try {
    config = getRuntimeConfig()
  } catch {
    throw new HttpError(503, 'Cloudinary processing is not configured.')
  }

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

  return context.json({ success: true, data: result }, 201)
})
