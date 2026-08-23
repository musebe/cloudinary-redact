import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { getConfigurationStatus } from './config/env.js'
import { HttpError } from './http/errors.js'
import { redactions } from './routes/redactions.js'
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

app.route('/api/redactions', redactions)

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
  if (error instanceof HttpError) {
    return context.json(
      {
        success: false,
        error: error.message,
      },
      error.status,
    )
  }

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
