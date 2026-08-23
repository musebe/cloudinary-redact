# Screenshot redaction architecture

## Verifiable proof

An uploaded screenshot remains restricted, Cloudinary OCR returns its text coordinates, the policy identifies only sensitive matches, and the API creates a reviewable targeted redaction with measurable precision and recall.

## Trust boundaries

| Surface | Responsibility |
| --- | --- |
| Browser | Select a screenshot, choose blur or pixelation, inspect masked findings, and approve or reject the derivative |
| Hono on Vercel | Validate requests, hold Cloudinary credentials, classify OCR tokens, sign access, and enforce review state |
| Cloudinary | Store restricted originals, run Advanced OCR, generate targeted transformations, retain review metadata, and deliver signed media |

## Planned request flow

```text
Browser
  -> Hono upload endpoint
  -> file size, format, and signature validation
  -> authenticated Cloudinary upload with adv_ocr
  -> OCR word text and bounding polygons
  -> sensitive-pattern classifier
  -> rectangles with padding and overlap merging
  -> signed Cloudinary blur or pixelation derivative
  -> human review
       -> approve: mark safe derivative approved
       -> reject: keep delivery restricted
```

Every original is placed in the Cloudinary Media Library asset folder `screenshot-redaction/uploads`. Its public ID uses the same namespace, while the safe before-and-after output is stored as a derived transformation of that restricted asset.

The compact gallery is session-scoped rather than account-wide. Its signed, HTTP-only cookie stores at most four immutable Cloudinary asset IDs. `GET /api/redactions` verifies that cookie, fetches those records from Cloudinary in one Admin API request, and returns signed before-and-after URLs without exposing the API secret or unrelated restricted originals.

## Initial security decisions

- Originals use authenticated Cloudinary delivery and never receive an ordinary public URL.
- Cloudinary API credentials exist only in Vercel environment variables and local `.env`.
- The API will accept JPEG, PNG, or WebP screenshots only.
- The initial upload limit is 4 MB so request handling stays below the hosting boundary.
- OCR text is untrusted and will not be written to logs.
- API responses will mask detected values and expose only the category, confidence, and location needed for review.
- Incomplete OCR or transformation processing fails closed and never marks an asset safe.
- Benchmark screenshots contain synthetic identifiers only.

## Cloudinary requirements

- Register the **Text Detection and Extraction** add-on by Google in the Cloudinary Marketplace.
- Use `ocr: "adv_ocr"` for support screenshots and graphics.
- Use screenshots of at least 1024 by 768 pixels, the documented minimum for Advanced OCR.
- Keep OCR add-on transformations signed or eagerly generated.
- Use coordinate-based `blur_region` or `pixelate_region` transformations so nonsensitive text remains readable.

## Classifier baseline

`benchmarks/synthetic-screenshots-v1.json` defines 20 synthetic support screens with 16 labeled emails, phone numbers, account numbers, and API keys. The deterministic classifier currently reaches 100% precision and 100% recall on the source text. This does not measure OCR accuracy; the final benchmark must render the cases as images and score the complete Cloudinary OCR pipeline.

The corresponding 1200 by 900 PNG files are committed in `benchmarks/images/`. `npm run benchmark:ocr` uploads each fixture as an authenticated temporary asset, parses Cloudinary's real OCR result, scores exact category-and-value matches, and deletes that fixture in a `finally` block. Cleanup refuses to delete anything outside `screenshot-redaction/uploads/`. Results must be reported separately from the source-text baseline.

## Hosting decision

The project uses one Vercel deployment. Vercel recognizes the default-exported Hono app in `src/index.ts`, turns server routes into Vercel Functions, and serves `public/` files from its CDN.

## Implementation status

`POST /api/redactions` validates JPEG, PNG, and WebP signatures, enforces the 4 MB boundary, uploads the original with authenticated delivery, requests `adv_ocr`, maps masked sensitive findings to padded OCR rectangles, and eagerly creates a signed blur or pixelation derivative. It issues an HTTP-only HMAC-signed review cookie bound to at most four immutable asset IDs. The read and approval routes require that session, read the current Cloudinary record, and persist approved or rejected status in asset context.

A credentialed end-to-end check verified asset-folder placement, Advanced OCR completion, email classification, targeted pixelation, signed delivery for the original and derivative, and Admin API gallery readback. TypeScript validation and 20 automated tests pass. The full 20-image Cloudinary OCR benchmark remains pending and must not be confused with the 100% source-text classifier baseline.
