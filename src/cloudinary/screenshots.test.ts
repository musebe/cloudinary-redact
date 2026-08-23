import { afterEach, describe, expect, test, vi } from 'vitest'
import { v2 as cloudinary } from 'cloudinary'

import {
  buildRedactionTransformation,
  createDirectUploadAuthorization,
  SCREENSHOT_ASSET_FOLDER,
  SCREENSHOT_PUBLIC_ID_PREFIX,
} from './screenshots.js'

afterEach(() => vi.unstubAllEnvs())

describe('targeted Cloudinary transformations', () => {
  test('uses one matching Cloudinary asset folder and public ID namespace', () => {
    expect(SCREENSHOT_ASSET_FOLDER).toBe('screenshot-redaction/uploads')
    expect(SCREENSHOT_PUBLIC_ID_PREFIX).toBe(
      `${SCREENSHOT_ASSET_FOLDER}/`,
    )
  })

  test('signs a restricted direct upload without exposing the API secret', () => {
    vi.stubEnv('CLOUDINARY_CLOUD_NAME', 'demo-cloud')
    vi.stubEnv('CLOUDINARY_API_KEY', 'demo-key')
    vi.stubEnv('CLOUDINARY_API_SECRET', 'server-only-secret')
    vi.stubEnv('DEMO_SESSION_SECRET', 'a-review-secret-that-is-long-enough')

    const authorization = createDirectUploadAuthorization('support screen.png')

    expect(authorization.uploadUrl).toBe(
      'https://api.cloudinary.com/v1_1/demo-cloud/image/upload',
    )
    expect(authorization.parameters).toMatchObject({
      asset_folder: SCREENSHOT_ASSET_FOLDER,
      overwrite: 'false',
      type: 'authenticated',
    })
    expect(authorization.parameters).not.toHaveProperty('ocr')
    expect(JSON.stringify(authorization)).not.toContain('server-only-secret')
  })

  test('replays persisted transformation syntax as a raw transformation', () => {
    const persisted = 'e_pixelate_region:18,h_28,w_188,x_1232,y_216'

    expect(
      cloudinary.utils.generate_transformation_string({
        raw_transformation: persisted,
      }),
    ).toBe(persisted)
    expect(
      cloudinary.utils.generate_transformation_string({
        transformation: persisted,
      }),
    ).toBe(`t_${persisted}`)
  })

  test('builds one pixelation operation per sensitive region', () => {
    const transformation = buildRedactionTransformation(
      [
        {
          category: 'email',
          maskedValue: 'a***@example.com',
          finding: {
            category: 'email',
            value: 'alex@example.com',
            maskedValue: 'a***@example.com',
            start: 0,
            end: 16,
          },
          rectangle: { x: 10, y: 20, width: 200, height: 40 },
        },
      ],
      'pixelate',
    )

    expect(transformation).toEqual([
      {
        effect: 'pixelate_region:18',
        x: 10,
        y: 20,
        width: 200,
        height: 40,
      },
    ])
  })
})
