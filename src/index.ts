import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { getConfigurationStatus } from './config/env.js'
import { renderHomePage } from './ui/home.js'

const app = new Hono()

app.use('*', secureHeaders())

app.get('/', (context) => context.html(renderHomePage()))

app.get('/api/health', (context) => {
  return context.json({
    status: 'ok',
    service: 'cloudinary-redact',
    configuration: getConfigurationStatus(),
  })
})

app.notFound((context) => {
  return context.json(
    {
      success: false,
      error: 'Route not found.',
    },
    404,
  )
})

app.onError((error, context) => {
  console.error('[request-error]', { name: error.name })
  return context.json(
    {
      success: false,
      error: 'The request could not be completed.',
    },
    500,
  )
})

export default app
