# Automatically Redact Sensitive Text From Screenshots With Cloudinary OCR and Hono

You can automatically hide email addresses and account numbers in screenshots by extracting words and bounding boxes with Cloudinary Advanced OCR, classifying sensitive values on the server, and applying Cloudinary blur or pixelation transformations only to the matching coordinates.

In this tutorial, you will build that pipeline as a Hono API. It keeps the original screenshot behind authenticated Cloudinary delivery, returns only masked findings to the browser, creates a targeted redacted derivative, and requires a reviewer to approve or reject the result.

- Live demo: coming soon
- [Explore the complete GitHub repository](https://github.com/musebe/cloudinary-redact)

This is a practical privacy control, not a guarantee that every sensitive value will be found. Optical character recognition (OCR) and pattern matching can both miss content, so ambiguous or consequential screenshots should remain behind a human-review gate.

## What you will build

The application follows this request flow:

```text
Browser
  -> Hono multipart upload route
  -> file size, MIME, and magic-byte validation
  -> authenticated Cloudinary upload with Advanced OCR
  -> OCR words and bounding boxes
  -> sensitive-text classifier
  -> padded redaction rectangles
  -> eager Cloudinary blur or pixelation derivative
  -> signed before-and-after review
  -> approve or reject
```

The API recognizes four categories:

| Category | Detection rule | Example public response |
| --- | --- | --- |
| Email | Email address syntax | `m***@example.test` |
| Phone | 9 to 15 digits with common separators | `••••0182` |
| Account number | Labeled account value or IBAN | `••••9012` |
| API key | AWS, OpenAI-style, or labeled secret shape | `sk-••••7x9z` |

The raw value never appears in the JSON response. Reviewers receive its category, masked form, and rectangle.

## Why support screenshots need a privacy boundary

Support screenshots can capture more than the error a user intended to report. Account pages, billing interfaces, request inspectors, and settings screens may also contain names, contact details, identifiers, account numbers, or credentials.

[NIST Special Publication 800-122](https://csrc.nist.gov/pubs/sp/800/122/final) recommends protecting personally identifiable information from inappropriate access, use, and disclosure. The exact classification and required controls depend on context, so this tutorial treats the detector as an application policy rather than a universal definition of personal information.

Redacting the entire screenshot would reduce its usefulness to a support engineer. The more useful pattern is targeted redaction: preserve the surrounding interface while obscuring only the coordinates that contain a policy match.

## Understand the Cloudinary redaction architecture

Each part of the stack owns a narrow responsibility:

| Layer | Responsibility |
| --- | --- |
| Browser | Select an image and redaction style, then review the result |
| Hono API | Validate the upload, interpret OCR evidence, classify text, and authorize review |
| Cloudinary | Store the authenticated original, run OCR, generate the derivative, and persist review context |

The original and redacted result are not two unrelated uploads. Cloudinary stores one authenticated asset, and the redacted version is an eager derived transformation of that asset. That relationship keeps the source, transformation, and review record together.

## Prerequisites

You need:

- Node.js 22 or later.
- A Cloudinary account.
- The **Text Detection and Extraction** add-on by Google enabled in the Cloudinary Marketplace.
- A Vercel account only if you want to host the finished Hono application.

Cloudinary documents a minimum image resolution of 1024 by 768 pixels for Advanced OCR. OCR accuracy can vary with font, contrast, text angle, compression, and other image characteristics. The demo therefore accepts JPEG, PNG, and WebP screenshots of at least that resolution in the browser.

Clone the completed project and install its dependencies:

```bash
git clone https://github.com/musebe/cloudinary-redact.git
cd cloudinary-redact
npm install
```

## Step 1: Enable Cloudinary Advanced OCR

In the Cloudinary Console:

1. Open **Marketplace**.
2. Select **Text Detection and Extraction** by Google.
3. Choose a plan and confirm registration.
4. Open **Installed Add-ons** and verify that it appears.

This is the add-on used by the `adv_ocr` upload parameter. It is different from AI Content Analysis, AI Vision, or document conversion.

Cloudinary's [OCR Text Detection and Extraction documentation](https://cloudinary.com/documentation/ocr_text_detection_and_extraction_addon) describes two modes. `adv_ocr` is intended for photos or graphics that contain text, while `adv_ocr:document` is optimized for text-heavy scanned documents. This project uses `adv_ocr` because the input is an application screenshot.

## Step 2: Configure the Hono application

Copy the environment template:

```bash
cp .env.example .env
openssl rand -hex 32
```

Add your server credentials and the generated session secret:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
DEMO_SESSION_SECRET=your_64_character_random_value
CLOUDINARY_OCR_MODE=adv_ocr
MAX_UPLOAD_BYTES=4000000
```

All six values stay on the server. Do not add a public prefix to the Cloudinary API secret or review-session secret, and do not commit `.env`.

The complete variable template is available in [`.env.example`](https://github.com/musebe/cloudinary-redact/blob/main/.env.example).

The application uses one default-exported Hono instance for the web page and API routes:

```typescript
const app = new Hono()

app.use('*', secureHeaders())
app.get('/', (context) => context.html(renderHomePage()))
app.get('/api/health', (context) => context.json({
  status: 'ok',
  service: 'cloudinary-redact',
  configuration: getConfigurationStatus(),
}))
app.route('/api/redactions', redactions)

export default app
```

See the complete [`src/index.ts`](https://github.com/musebe/cloudinary-redact/blob/main/src/index.ts). Hono's official [request API](https://hono.dev/docs/api/request) supports multipart fields through `c.req.parseBody()`, and Vercel documents direct support for a default-exported [Hono application](https://vercel.com/docs/frameworks/backend/hono).

## Step 3: Validate screenshots before OCR

Reject malformed input before consuming OCR quota. The route checks the request size, requires an `image` file, and compares the declared MIME type with the file's magic bytes.

```typescript
const body = await context.req.parseBody()
const image = body.image
const mode = body.mode === 'blur' ? 'blur' : 'pixelate'

if (!(image instanceof File)) {
  throw new HttpError(400, 'Add a screenshot using the image field.')
}

const bytes = new Uint8Array(await image.arrayBuffer())
validateScreenshot(image, bytes, config.maxUploadBytes)
```

The validator accepts JPEG, PNG, or WebP and caps uploads at 4 MB. Read the complete [`redaction route`](https://github.com/musebe/cloudinary-redact/blob/main/src/routes/redactions.ts) and [`file validator`](https://github.com/musebe/cloudinary-redact/blob/main/src/security/file.ts).

Magic-byte checking catches simple extension or `Content-Type` mismatches. A higher-risk production service should also consider malware scanning, decompression limits, request rate limits, and image re-encoding.

## Step 4: Upload the original as an authenticated Cloudinary asset

The Hono server streams the bytes to Cloudinary. It assigns a random public ID, places the asset in one Media Library folder, requests OCR, and marks the initial state as processing.

```typescript
const options: UploadApiOptions = {
  resource_type: 'image',
  type: 'authenticated',
  asset_folder: 'screenshot-redaction/uploads',
  public_id: `screenshot-redaction/uploads/${randomUUID()}`,
  overwrite: false,
  ocr: 'adv_ocr',
  tags: ['screenshot-redaction', 'restricted-original'],
  context: { redaction_status: 'processing' },
}
```

See the complete [`uploadRestrictedScreenshot` function](https://github.com/musebe/cloudinary-redact/blob/main/src/cloudinary/screenshots.ts).

The authenticated delivery type matters here. Cloudinary's [media access-control documentation](https://cloudinary.com/documentation/control_access_to_media) states that authenticated originals and derived assets require signed access. The API secret stays in Hono, so the browser cannot create its own upload or delivery signature.

The `asset_folder` determines where the item appears in a dynamic-folder Media Library. The public ID namespace is also set to the same value so records are easy to audit and cleanup can refuse any target outside that prefix. Cloudinary explains the distinction in its [folder modes documentation](https://cloudinary.com/documentation/folder_modes).

## Step 5: Extract words and OCR coordinates

With `ocr: "adv_ocr"`, the upload response includes OCR evidence under `info.ocr.adv_ocr`. Cloudinary returns the detected text plus bounding polygons for individual text elements.

The parser deliberately treats that response as unknown external data:

```typescript
for (const page of asArray(advancedOcr.data)) {
  const annotations = asArray(asRecord(page).textAnnotations)
  const words = annotations.length > 1 ? annotations.slice(1) : []

  for (const rawAnnotation of words) {
    const annotation = asRecord(rawAnnotation)
    const text = typeof annotation.description === 'string'
      ? annotation.description.trim()
      : ''
    const rectangle = readRectangle(annotation)
    if (text && rectangle) tokens.push({ text, rectangle })
  }
}
```

The first text annotation is the full-page summary, so the parser skips it and retains the individual words. Read the complete [`OCR parser`](https://github.com/musebe/cloudinary-redact/blob/main/src/ocr/parser.ts).

## Step 6: Detect sensitive text without returning it

The classifier applies category-specific rules to reconstructed OCR lines. Higher-priority API-key and email matches are selected before overlapping phone or account candidates.

```typescript
const EMAIL_PATTERN =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const ACCOUNT_PATTERN =
  /\b(?:account|acct|a\/c)(?:\s+(?:number|no\.?))?\s*[:#=-]?\s*([A-Z0-9][A-Z0-9 -]{5,24}[A-Z0-9])\b/giu
const API_KEY_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
  /\b(?:api[ _-]?key|secret|token)\s*[:=]\s*([A-Za-z0-9_./+=-]{12,})\b/giu,
]
```

The working phone and IBAN patterns, plausibility checks, overlap handling, and masking functions are in [`detector.ts`](https://github.com/musebe/cloudinary-redact/blob/main/src/redaction/detector.ts).

Context is important. A long number following `Account:` is more likely to be an account number than the same digits in a date, ticket, or software version. The project uses labeled-account rules and length bounds to reduce obvious false positives. Those are demo policy choices, not universal definitions.

The internal match contains the raw OCR value only long enough to map it to its source tokens. The public response removes `value` and keeps `maskedValue`.

## Step 7: Map each match back to a rectangle

OCR engines return word boxes, while a sensitive value may span several tokens. For example, an IBAN can be split at every space. The mapper groups words into visual lines, reconstructs the line text, detects matches, and unions all overlapping token rectangles.

```typescript
for (const match of detectSensitiveText(text)) {
  const matchedTokens = spans.filter(
    (span) => match.start < span.end && match.end > span.start,
  )
  if (matchedTokens.length === 0) continue

  regions.push({
    category: match.category,
    maskedValue: match.maskedValue,
    rectangle: addPadding(
      unionRectangles(matchedTokens.map(({ rectangle }) => rectangle)),
      imageWidth,
      imageHeight,
    ),
  })
}
```

Six pixels of bounded padding reduce the chance that a character edge remains visible. The full line grouping, punctuation joining, rectangle union, and image-boundary logic are in [`regions.ts`](https://github.com/musebe/cloudinary-redact/blob/main/src/ocr/regions.ts).

## Step 8: Create targeted blur or pixelation regions

Each detected rectangle becomes one Cloudinary transformation component:

```typescript
return regions.map(({ rectangle }) => ({
  effect: mode === 'blur'
    ? 'blur_region:1400'
    : 'pixelate_region:18',
  x: rectangle.x,
  y: rectangle.y,
  width: rectangle.width,
  height: rectangle.height,
}))
```

Cloudinary's [transformation reference](https://cloudinary.com/documentation/transformation_reference) defines `blur_region` and `pixelate_region` with `x`, `y`, `width`, and `height` qualifiers. Because the pipeline supplies explicit OCR-derived rectangles, ordinary interface text remains readable.

Blur and pixelation have different visual tradeoffs. Strong pixelation is easier to notice during review, while a strong blur can fit some product interfaces more naturally. Neither strength should be treated as universally sufficient. Test the final derivative at its delivered resolution and account for small text, scaling, and image compression.

## Step 9: Eagerly generate and sign the derivative

Authenticated assets do not permit unrestricted on-the-fly derived images. The server eagerly creates the exact approved transformation and stores enough context to reconstruct the same URL later.

```typescript
const transformationString = cloudinary.utils
  .generate_transformation_string({ transformation })

await cloudinary.uploader.explicit(publicId, {
  resource_type: 'image',
  type: 'authenticated',
  eager: [transformationString],
  context: {
    redaction_status: 'review_required',
    redaction_transform: transformationString,
  },
})
```

The signed original and redacted URL are then generated with `type: "authenticated"` and `sign_url: true`. See the complete [`createReviewDerivative` implementation](https://github.com/musebe/cloudinary-redact/blob/main/src/cloudinary/screenshots.ts).

The application persists the raw transformation string because a derived URL must be reconstructed exactly. Rebuilding a semantically similar transformation with a different serialization can point to a derivative that Cloudinary did not eagerly generate.

A signed delivery URL authorizes access to the protected asset, but the URL can still be shared. For production use cases that require expiration, revocation, IP constraints, or user-specific access, evaluate Cloudinary token or cookie access controls and their current plan requirements.

## Step 10: Require human review

Automatic detection produces `review_required`, never `approved`. A reviewer compares the signed original and derivative, then sends an explicit decision:

```http
PATCH /api/redactions/:assetId/review
Content-Type: application/json

{ "decision": "approve" }
```

The server verifies a signed, HTTP-only review cookie before reading or changing the record. It then writes the decision and review time into Cloudinary context:

```typescript
const context = {
  ...record.context,
  redaction_status: status,
  redaction_reviewed_at: new Date().toISOString(),
}

await cloudinary.uploader.explicit(record.publicId, {
  resource_type: 'image',
  type: 'authenticated',
  context,
})
```

The cookie contains at most four immutable Cloudinary asset IDs and expires after one hour. It is HMAC-signed, `HttpOnly`, `SameSite=Strict`, and secure in production. Review the full [`session implementation`](https://github.com/musebe/cloudinary-redact/blob/main/src/security/session.ts) and [`review endpoint`](https://github.com/musebe/cloudinary-redact/blob/main/src/routes/redactions.ts).

This cookie demonstrates scoped authorization, but it does not identify a person. A production workflow should integrate real identity, roles, audit events, and revocation.

## Step 11: Read the before-and-after gallery from Cloudinary

The compact gallery does not expose every asset in the account. `GET /api/redactions` verifies the cookie, reads only its four asset IDs through the Cloudinary Admin API, and returns signed comparison URLs.

```typescript
const response = await cloudinary.api.resources_by_asset_ids(assetIds, {
  resource_type: 'image',
  type: 'authenticated',
  context: true,
})
```

The readback proves that folder placement, transformation metadata, review status, and signed delivery remain available after the upload request ends. The newest comparison appears first, and unrelated authenticated originals never enter the response.

Admin API operations are rate-limited, so larger systems should cache appropriate read models, avoid account-wide scans, and design around current product-environment limits.

## Step 12: Test with synthetic screenshots

The repository includes 20 deterministic screenshots at 1200 by 900 pixels. They contain 16 labeled findings across email, phone, account-number, and API-key categories, plus negative cases such as dates, order IDs, versions, URLs, and ticket numbers.

All values are synthetic. Email addresses use the reserved `.test` suffix, and no live credential is embedded in the dataset.

Run the classifier baseline:

```bash
npm run benchmark:classifier
```

The source-text result is:

| Metric | Result |
| --- | ---: |
| Cases | 20 |
| Labeled findings | 16 |
| Precision | 100% |
| Recall | 100% |
| F1 | 100% |

This result proves only that the deterministic rules match the clean source labels. It does not measure whether Cloudinary OCR reads every value from the rendered screenshots.

Run the complete image pipeline separately:

```bash
npm run benchmark:ocr
```

That command uploads one fixture at a time as an authenticated asset, parses real Cloudinary OCR output, scores category-and-value matches, and deletes the fixture in a `finally` block. The complete 20-image OCR result is pending and must be reported separately before publication.

Read the [benchmark protocol](https://github.com/musebe/cloudinary-redact/blob/main/docs/benchmark.md), [dataset manifest](https://github.com/musebe/cloudinary-redact/blob/main/benchmarks/synthetic-screenshots-v1.json), and [OCR benchmark runner](https://github.com/musebe/cloudinary-redact/blob/main/scripts/run-ocr-benchmark.ts).

Precision and recall answer different operational questions:

| Metric | Operational meaning |
| --- | --- |
| Precision | Of the values redacted, how many were labeled sensitive? |
| Recall | Of the labeled sensitive values, how many were redacted? |
| F1 | What is the harmonic balance between precision and recall? |

For privacy redaction, a false negative can expose information, while a false positive can hide diagnostic context. Human review remains useful even when an aggregate score looks strong.

## Verify the end-to-end result

Start the application:

```bash
npm run dev
```

Then open the local application in your browser on port 3000 and use one of the screenshots in [`demo-assets/screenshots`](https://github.com/musebe/cloudinary-redact/tree/main/demo-assets/screenshots).

Verify the following:

1. The original appears under `screenshot-redaction/uploads` in the Cloudinary Media Library.
2. Its delivery type is authenticated.
3. The API returns masked findings rather than raw detected values.
4. Only matching text regions are blurred or pixelated.
5. The before-and-after pair can be read after refreshing the page.
6. Approve or reject updates the persisted Cloudinary context.
7. An asset outside the signed review session cannot be read or changed through the API.

You can also check service configuration without exposing secrets:

```bash
curl http://localhost:3000/api/health
```

The verified project currently passes TypeScript validation and 20 automated tests. A live Cloudinary test also confirmed authenticated upload, email detection, targeted pixelation, signed original and derivative delivery, and Admin API gallery readback.

## Security limitations and production hardening

| Limitation | Production control to consider |
| --- | --- |
| OCR can miss small, rotated, low-contrast, compressed, or unsupported text | Normalize inputs, benchmark representative screenshots, and require manual inspection |
| Regular expressions do not understand every organization-specific identifier | Add configurable detectors, allowlists, checksums, and reviewed policy versions |
| Pixelation or blur strength may be insufficient at another size | Test final delivery variants or use opaque overlays for irreversible masking |
| A signed URL can be shared | Add expiring token or cookie access, or serve through an authenticated proxy |
| A one-hour HMAC cookie is not user identity | Add authentication, authorization, audit logs, and reviewer attribution |
| OCR text and originals remain sensitive evidence | Define retention, deletion, encryption, logging, and incident-response policies |
| A clean synthetic benchmark is not production accuracy | Expand the dataset across layouts, languages, compression, fonts, and difficult negatives |

Do not log OCR text, raw matches, Cloudinary credentials, signed URLs, or uploaded screenshots. Return generic server errors to the browser and keep detailed operational diagnostics free of sensitive values.

## Frequently asked questions

### How can I automatically hide email addresses and account numbers in uploaded screenshots?

Upload the screenshot to an authenticated Cloudinary asset with `ocr: "adv_ocr"`, classify the returned OCR text on the server, map each match to its OCR word coordinates, and eagerly generate a signed `blur_region` or `pixelate_region` derivative. Require review before treating that derivative as approved.

### Can Cloudinary OCR redact only sensitive text?

Cloudinary can return text and bounding coordinates, and it can blur or pixelate regions. Your application decides which detected words are sensitive. In this project, Hono applies email, phone, account-number, and API-key rules before building the coordinate transformations.

### Why not pixelate all text in the screenshot?

Support teams often need surrounding labels, error messages, and interface state. Targeted redaction preserves that diagnostic context while hiding values that match the policy.

### Are authenticated Cloudinary assets public?

No. Cloudinary requires signed access to authenticated originals and their derived assets. However, a valid signed URL can be shared, so use expiring authorization controls when link lifetime and revocation matter.

### Does the API store a second redacted image?

No. Cloudinary stores the restricted original as one asset and generates the redacted result as an eager derived transformation. The transformation and review state are persisted in that asset's context.

### Does 100% classifier precision and recall mean every screenshot is safe?

No. That score applies only to the deterministic classifier using clean source text from a small synthetic dataset. It excludes OCR errors and does not represent arbitrary production screenshots. The complete OCR benchmark and human review are separate controls.

## Conclusion

Screenshot redaction works best as a traceable media pipeline, not a single regular expression. Hono validates and classifies the request, Cloudinary keeps the original behind authenticated delivery, Advanced OCR supplies the words and coordinates, and targeted transformations create a reviewable derivative without hiding the entire interface.

The critical design choice is the review boundary. A detected region is evidence, not proof that every sensitive value was found. Keeping the original restricted, masking API output, measuring the complete OCR pipeline, and requiring approval turns a convenient image transformation into a more defensible operational control.
