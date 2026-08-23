# Cloudinary Redact

A focused Hono API and review interface for detecting sensitive text in support screenshots and creating safe Cloudinary redactions.

## Planned proof

The completed demo will:

1. Keep the original screenshot in restricted Cloudinary storage.
2. Extract text and word coordinates with Cloudinary Advanced OCR.
3. Detect email addresses, phone numbers, account numbers, and API-key patterns.
4. Generate targeted blur or pixelation regions.
5. Require a human review before the redacted derivative is released.
6. Measure precision and recall against a versioned synthetic screenshot dataset.

## Why one Vercel project works

Vercel supports Hono applications directly. `src/index.ts` exports the Hono app, API routes run as Vercel Functions, and `public/` assets are served from Vercel's CDN. The project does not need a separate frontend host.

## Local setup

Install dependencies and copy the environment template:

```bash
npm install
cp .env.example .env
```

Add server-only Cloudinary credentials to `.env`, then start the local Hono server:

```bash
openssl rand -hex 32
npm run dev
```

Use the generated value for `DEMO_SESSION_SECRET`. It signs an HTTP-only review cookie scoped to the uploaded asset.

Open the application on port `3000`. The health response is available at `/api/health` and never returns credential values.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Hono locally with file watching |
| `npm run dev:vercel` | Run through the Vercel CLI after it is installed and linked |
| `npm run typecheck` | Validate TypeScript |
| `npm test` | Run Vitest |
| `npm run check` | Run type checking and tests |

## Redaction endpoint

With Cloudinary credentials configured and the OCR add-on enabled, send a JPEG, PNG, or WebP screenshot to the Hono API:

```bash
curl -X POST http://localhost:3000/api/redactions \
  -F image=@support-screenshot.png \
  -F mode=pixelate
```

The route validates the file signature and size, uploads the original as an authenticated Cloudinary asset, runs Advanced OCR, maps sensitive matches to OCR rectangles, eagerly creates a signed targeted redaction, and returns masked findings for review.

## Hosting

The application is designed for one Vercel project. Vercel officially supports Hono with zero-configuration app detection. Cloudinary remains the source of truth for the restricted original, OCR evidence, derived redaction, and review state.

## Current checkpoint

The Hono/Vercel foundation, sensitive-text classifier, restricted Cloudinary upload engine, OCR parser, coordinate mapper, targeted transformation builder, signed review session, approval API, and responsive comparison UI are complete. Fourteen automated tests pass. The source-text baseline contains 20 synthetic screenshot cases and 16 labeled findings with 100% precision and recall. A credentialed Cloudinary run and end-to-end image benchmark remain.
