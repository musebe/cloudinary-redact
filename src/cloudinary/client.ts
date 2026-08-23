import { v2 as cloudinary } from 'cloudinary'

import { getRuntimeConfig } from '../config/env.js'

let configured = false

export function getCloudinary() {
  if (!configured) {
    const config = getRuntimeConfig()
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    })
    configured = true
  }

  return cloudinary
}
