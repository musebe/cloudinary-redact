# Cloudinary Redact

A focused Hono API and review interface for detecting sensitive text in support screenshots and creating reviewable Cloudinary redactions.

## Planned proof

The completed demo will:

1. Keep the original screenshot in restricted Cloudinary storage.
2. Extract text and word coordinates with Cloudinary Advanced OCR.
3. Detect email addresses, phone numbers, account numbers, and API-key patterns.
4. Generate targeted blur or pixelation regions.
5. Require a human review before the redacted derivative is released.
6. Show the four newest before-and-after comparisons from the signed review session.
7. Measure precision and recall against a versioned synthetic screenshot dataset.

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
| `npm run benchmark:render` | Rebuild the 20 synthetic 1200 × 900 screenshots |
| `npm run benchmark:classifier` | Measure the source-text classifier baseline |
| `npm run benchmark:ocr` | Measure real Cloudinary OCR precision and recall, then delete benchmark uploads |
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

The route validates the file signature and size, uploads the original as an authenticated Cloudinary asset in `screenshot-redaction/uploads`, runs Advanced OCR, maps sensitive matches to OCR rectangles, eagerly creates a signed targeted redaction, and returns masked findings for review. The original and its derived redaction stay attached to one Cloudinary asset. A compact gallery reads back only the four immutable asset IDs stored in the signed reviewer session.

## Hosting

The application is designed for one Vercel project. Vercel officially supports Hono with zero-configuration app detection. Cloudinary remains the source of truth for the restricted original, OCR evidence, derived redaction, and review state.

## Current checkpoint

The Hono/Vercel foundation, sensitive-text classifier, restricted Cloudinary upload engine, OCR parser, coordinate mapper, targeted transformation builder, signed review session, approval API, responsive comparison UI, and four-item session gallery are complete. Twenty automated tests pass. A live Cloudinary check placed the original in `screenshot-redaction/uploads`, detected the synthetic email, generated the pixelated derivative, and read the pair back through the authenticated gallery. The repository also includes 20 rendered synthetic benchmark screenshots; the complete 20-image OCR score remains pending.
