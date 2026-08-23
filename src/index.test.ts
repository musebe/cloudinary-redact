import { describe, expect, test } from 'vitest'

import app from './index.js'

describe('application shell', () => {
  test('renders the focused screenshot-redaction page', async () => {
    const response = await app.request('/')
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(body).toContain('Hide sensitive screenshot text before sharing.')
  })

  test('reports configuration without returning secret values', async () => {
    const response = await app.request('/api/health')
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: 'ok',
      service: 'cloudinary-redact',
    })
    expect(JSON.stringify(body)).not.toContain('API_SECRET')
  })
})
