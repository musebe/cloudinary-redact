import { randomUUID } from 'node:crypto'
import type { UploadApiOptions, UploadApiResponse } from 'cloudinary'

import { getRuntimeConfig } from '../config/env.js'
import type { RedactionRegion } from '../ocr/types.js'
import { getCloudinary } from './client.js'

export type RedactionMode = 'blur' | 'pixelate'

export type UploadedScreenshot = {
  raw: UploadApiResponse
  assetId: string
  publicId: string
  width: number
  height: number
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export async function uploadRestrictedScreenshot(
  bytes: Uint8Array,
  filename: string,
): Promise<UploadedScreenshot> {
  const cloudinary = getCloudinary()
  const { ocrMode } = getRuntimeConfig()
  const options: UploadApiOptions = {
    resource_type: 'image',
    type: 'authenticated',
    public_id: `screenshot-redaction/originals/${randomUUID()}`,
    overwrite: false,
    ocr: ocrMode,
    tags: ['screenshot-redaction', 'restricted-original', 'review-required'],
    context: {
      original_filename: safeFilename(filename),
      redaction_status: 'processing',
    },
  }

  const raw = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error || !result) reject(error || new Error('Cloudinary upload failed.'))
      else resolve(result)
    })
    stream.end(Buffer.from(bytes))
  })

  if (!raw.asset_id || !raw.public_id || !raw.width || !raw.height) {
    throw new Error('Cloudinary returned an incomplete screenshot record.')
  }

  return {
    raw,
    assetId: raw.asset_id,
    publicId: raw.public_id,
    width: raw.width,
    height: raw.height,
  }
}

export function buildRedactionTransformation(
  regions: RedactionRegion[],
  mode: RedactionMode,
) {
  if (regions.length === 0) return [{ quality: 'auto' }]

  return regions.map(({ rectangle }) => ({
    effect: mode === 'blur' ? 'blur_region:1400' : 'pixelate_region:18',
    x: rectangle.x,
    y: rectangle.y,
    width: rectangle.width,
    height: rectangle.height,
  }))
}

export async function createReviewDerivative(options: {
  publicId: string
  regions: RedactionRegion[]
  mode: RedactionMode
}) {
  const { publicId, regions, mode } = options
  const cloudinary = getCloudinary()
  const transformation = buildRedactionTransformation(regions, mode)
  const transformationString = cloudinary.utils.generate_transformation_string({
    transformation,
  })
  const categories = [...new Set(regions.map(({ category }) => category))]

  await cloudinary.uploader.explicit(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    eager: [transformationString],
    context: {
      redaction_status: 'review_required',
      redaction_mode: mode,
      redaction_count: String(regions.length),
      redaction_categories: categories.join(','),
      detector_version: '2026-09-06.1',
    },
  })

  return {
    originalUrl: cloudinary.url(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      secure: true,
      sign_url: true,
    }),
    redactedUrl: cloudinary.url(publicId, {
      resource_type: 'image',
      type: 'authenticated',
      secure: true,
      sign_url: true,
      transformation,
    }),
    transformation: transformationString,
  }
}
