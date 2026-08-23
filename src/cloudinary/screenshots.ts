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

export type ReviewStatus = 'review_required' | 'approved' | 'rejected'

export const SCREENSHOT_ASSET_FOLDER = 'screenshot-redaction/uploads'
export const SCREENSHOT_PUBLIC_ID_PREFIX = `${SCREENSHOT_ASSET_FOLDER}/`

type ContextValues = Record<string, string>

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readContextValues(value: unknown): ContextValues {
  const custom = asRecord(asRecord(value).custom)
  return Object.fromEntries(
    Object.entries(custom).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

function safeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

function parseRedactionRecord(assetValue: unknown) {
  const asset = asRecord(assetValue)
  if (
    typeof asset.asset_id !== 'string' ||
    typeof asset.public_id !== 'string' ||
    !asset.public_id.startsWith(SCREENSHOT_PUBLIC_ID_PREFIX)
  ) {
    return null
  }

  const context = readContextValues(asset.context)
  const transformation = context.redaction_transform
  if (!transformation) return null

  const cloudinary = getCloudinary()
  return {
    assetId: asset.asset_id,
    publicId: asset.public_id,
    assetFolder:
      typeof asset.asset_folder === 'string'
        ? asset.asset_folder
        : SCREENSHOT_ASSET_FOLDER,
    status: (context.redaction_status || 'review_required') as ReviewStatus,
    mode: context.redaction_mode || 'pixelate',
    findingCount: Number(context.redaction_count || 0),
    categories: context.redaction_categories
      ? context.redaction_categories.split(',').filter(Boolean)
      : [],
    originalUrl: cloudinary.url(asset.public_id, {
      resource_type: 'image',
      type: 'authenticated',
      secure: true,
      sign_url: true,
    }),
    redactedUrl: cloudinary.url(asset.public_id, {
      resource_type: 'image',
      type: 'authenticated',
      secure: true,
      sign_url: true,
      raw_transformation: transformation,
    }),
    context,
  }
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
    asset_folder: SCREENSHOT_ASSET_FOLDER,
    public_id: `${SCREENSHOT_PUBLIC_ID_PREFIX}${randomUUID()}`,
    display_name: safeFilename(filename),
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
      redaction_transform: transformationString,
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
      raw_transformation: transformationString,
    }),
    transformation: transformationString,
  }
}

export async function readRedactionRecord(assetId: string) {
  const records = await readRedactionRecords([assetId])
  const record = records[0]
  if (!record) throw new Error('The redaction record could not be found.')
  return record
}

export async function readRedactionRecords(assetIds: string[]) {
  if (assetIds.length === 0) return []
  const cloudinary = getCloudinary()
  const response = await cloudinary.api.resources_by_asset_ids(assetIds, {
    resource_type: 'image',
    type: 'authenticated',
    context: true,
  })
  const records = (response.resources || [])
    .map(parseRedactionRecord)
    .filter((record): record is NonNullable<typeof record> => record !== null)
  const byAssetId = new Map(records.map((record) => [record.assetId, record]))
  return assetIds.flatMap((assetId) => {
    const record = byAssetId.get(assetId)
    return record ? [record] : []
  })
}

export async function setReviewDecision(
  assetId: string,
  decision: 'approve' | 'reject',
) {
  const record = await readRedactionRecord(assetId)
  const status: ReviewStatus = decision === 'approve' ? 'approved' : 'rejected'
  const context = {
    ...record.context,
    redaction_status: status,
    redaction_reviewed_at: new Date().toISOString(),
  }

  await getCloudinary().uploader.explicit(record.publicId, {
    resource_type: 'image',
    type: 'authenticated',
    context,
  })

  return { ...record, status }
}

export async function deleteRestrictedScreenshot(publicId: string) {
  if (!publicId.startsWith(SCREENSHOT_PUBLIC_ID_PREFIX)) {
    throw new Error('Refusing to delete an asset outside the redaction namespace.')
  }

  await getCloudinary().uploader.destroy(publicId, {
    resource_type: 'image',
    type: 'authenticated',
    invalidate: true,
  })
}
