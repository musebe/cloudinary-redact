import 'dotenv/config'

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'

import app from './index.js'

const port = Number(process.env.PORT || 3000)
const localApp = new Hono()

localApp.use('/styles.css', serveStatic({ path: './public/styles.css' }))
localApp.route('/', app)

serve({ fetch: localApp.fetch, port }, (info) => {
  console.log(`Cloudinary Redact is running at http://localhost:${info.port}`)
})
