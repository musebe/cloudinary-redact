# Automatically Redact Sensitive Text From Screenshots With Cloudinary OCR and Hono

You can automatically hide email addresses and account numbers in screenshots by extracting words and bounding boxes with Cloudinary Advanced OCR, classifying sensitive values on the server, and applying Cloudinary blur or pixelation transformations only to the matching coordinates.

In this tutorial, you will build that pipeline as a Hono API. It keeps the original screenshot behind authenticated Cloudinary delivery, returns only masked findings to the browser, creates a targeted redacted derivative, and requires a reviewer to approve or reject the result.

- [Try the live Cloudinary Redact demo](https://cloudinary-redact.vercel.app/)
- [Explore the complete GitHub repository](https://github.com/musebe/cloudinary-redact)

This is a practical privacy control, not a guarantee that every sensitive value will be found. Optical character recognition (OCR) and pattern matching can both miss content, so ambiguous or consequential screenshots should remain behind a human-review gate.

## What you will build

The application follows this request flow:

```text
Browser
  -> local file policy check
  -> Hono signed-upload authorization
  -> direct authenticated Cloudinary upload
  -> Hono asset readback and upload-claim verification
  -> server-side Advanced OCR request
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
| Browser | Validate basic file properties, upload directly to Cloudinary, and review the result |
| Hono API | Sign constrained uploads, verify the stored asset, interpret OCR evidence, and authorize review |
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

## Prepare Cloudinary and Hono

The setup phase enables the OCR capability and keeps every credential in the Hono runtime.

### Enable Cloudinary Advanced OCR

In the Cloudinary Console:

1. Open **Marketplace**.
2. Select **Text Detection and Extraction** by Google.
3. Choose a plan and confirm registration.
4. Open **Installed Add-ons** and verify that it appears.

This is the add-on used by the `adv_ocr` upload parameter. It is different from AI Content Analysis, AI Vision, or document conversion.

Cloudinary's [OCR Text Detection and Extraction documentation](https://cloudinary.com/documentation/ocr_text_detection_and_extraction_addon) describes two modes. `adv_ocr` is intended for photos or graphics that contain text, while `adv_ocr:document` is optimized for text-heavy scanned documents. This project uses `adv_ocr` because the input is an application screenshot.

### Configure the Hono application

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

See the complete [`src/index.ts`](https://github.com/musebe/cloudinary-redact/blob/main/src/index.ts). Hono's official [request API](https://hono.dev/docs/api/request) supports the JSON authorization and finalization requests used here, and Vercel documents direct support for a default-exported [Hono application](https://vercel.com/docs/frameworks/backend/hono).

## Create a secure screenshot-ingestion boundary

The browser sends image bytes directly to Cloudinary, while Hono controls what may be uploaded and verifies the stored result before OCR begins. This avoids forwarding a multi-megabyte screenshot through a Vercel Function request body.

### Validate the upload intent

The browser rejects unsupported media types, files over 4 MB, and images smaller than 1024 by 768 pixels. It sends only the filename, MIME type, byte size, and decoded dimensions to Hono.

```typescript
if (
  typeof body?.filename !== 'string' ||
  !validMimeTypes.includes(body.mimeType) ||
  typeof body.size !== 'number' ||
  body.size > config.maxUploadBytes ||
  typeof body.width !== 'number' ||
  body.width < 1024 ||
  typeof body.height !== 'number' ||
  body.height < 768
) {
  throw new HttpError(400, 'The screenshot does not satisfy the upload policy.')
}
```

These client-supplied properties improve feedback but are not the security boundary. Hono repeats the important checks against Cloudinary's decoded asset record after upload. Read the complete [`redaction routes`](https://github.com/musebe/cloudinary-redact/blob/main/src/routes/redactions.ts).

### Authorize a constrained direct upload

Hono generates a random public ID and signs a fixed set of Cloudinary upload parameters. The signature allows the browser to perform this upload without receiving the Cloudinary API secret.

```typescript
const parameters = {
  allowed_formats: 'jpg,jpeg,png,webp',
  asset_folder: SCREENSHOT_ASSET_FOLDER,
  context: `original_filename=${safeFilename(filename)}|redaction_status=uploaded`,
  overwrite: 'false',
  public_id: publicId,
  tags: 'screenshot-redaction,restricted-original,review-required',
  timestamp,
  type: 'authenticated',
}

const signature = cloudinary.utils.api_sign_request(
  parameters,
  config.apiSecret,
)
```

The browser posts the file and signed parameters directly to Cloudinary's Upload API. The 4 MB limit is an application policy, not a Cloudinary platform limit. Cloudinary recommends direct browser uploads for large files, while [Vercel recommends client uploads](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions) when a request could exceed a Function body limit.

The upload deliberately omits `ocr`. Raw OCR output therefore does not return to the browser. See the complete [`createDirectUploadAuthorization` implementation](https://github.com/musebe/cloudinary-redact/blob/main/src/cloudinary/screenshots.ts) and [browser upload client](https://github.com/musebe/cloudinary-redact/blob/main/public/app.js).

The authenticated delivery type matters here. Cloudinary's [media access-control documentation](https://cloudinary.com/documentation/control_access_to_media) states that authenticated originals and derived assets require signed access. The `asset_folder` controls Media Library organization in dynamic-folder environments, while the generated public ID provides a namespace the application can verify and clean up safely.

### Verify the stored asset before OCR

The signing response includes a short-lived, Hash-based Message Authentication Code (HMAC) upload claim bound to the generated public ID. After upload, the browser returns that claim and Cloudinary's immutable `asset_id` to Hono. The server reads the asset through the Admin API and verifies its identity and decoded properties.

```typescript
const response = await cloudinary.api.resources_by_asset_ids([assetId], {
  resource_type: 'image',
  type: 'authenticated',
  context: true,
})

const asset = response.resources?.[0]
const allowed =
  asset?.public_id === expectedPublicId &&
  asset?.type === 'authenticated' &&
  allowedFormats.includes(asset?.format) &&
  asset?.width >= 1024 && asset?.height >= 768 &&
  asset?.bytes <= config.maxUploadBytes
```

An asset that fails readback never reaches OCR. The implementation also deletes an invalid asset when it is safely inside the generated redaction namespace. Read [`verifyDirectUpload`](https://github.com/musebe/cloudinary-redact/blob/main/src/cloudinary/screenshots.ts) and the [`upload-claim implementation`](https://github.com/musebe/cloudinary-redact/blob/main/src/security/upload-claim.ts).

## Convert OCR evidence into redaction regions

Once Cloudinary confirms the asset, Hono requests Advanced OCR on the authenticated original and keeps the returned text on the server.

### Extract words and OCR coordinates

Hono invokes OCR with an authenticated Admin API `update` operation. Cloudinary documents that an `upload` or `update` request with `ocr: "adv_ocr"` returns evidence under `info.ocr.adv_ocr`, including detected text and bounding polygons.

```typescript
const ocrResult = await cloudinary.api.update(publicId, {
  resource_type: 'image',
  type: 'authenticated',
  ocr: config.ocrMode,
})
```

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

### Detect sensitive text without returning it

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

### Map each match back to a rectangle

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

### Create targeted blur or pixelation regions

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

## Generate reviewable media and persist decisions

Cloudinary now turns the selected rectangles into a protected derivative, while Hono keeps approval as a separate human decision.

### Eagerly generate and sign the derivative

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

### Require human review

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

### Read the before-and-after gallery from Cloudinary

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

## Measure the detector with synthetic screenshots

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

Start the application locally:

```bash
npm run dev
```

Then open the local application in your browser on port 3000 and use one of the screenshots in [`demo-assets/screenshots`](https://github.com/musebe/cloudinary-redact/tree/main/demo-assets/screenshots). You can also test the same workflow in the [live Cloudinary Redact demo](https://cloudinary-redact.vercel.app/).

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

The verified project currently passes TypeScript validation and 25 automated tests. The tests cover upload-signature constraints, short-lived claim validation, OCR readback, sensitive-value detection, redaction geometry, browser behavior, and review authorization. A live Cloudinary test also confirmed authenticated upload, email detection, targeted pixelation, signed original and derivative delivery, and Admin API gallery readback.

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

Authorize a constrained authenticated upload, send the screenshot directly from the browser to Cloudinary, and verify the stored asset through Hono. Then request `adv_ocr` on the server, classify its text, map each match to OCR coordinates, and eagerly generate a signed `blur_region` or `pixelate_region` derivative. Require review before treating that derivative as approved.

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

Screenshot redaction works best as a traceable media pipeline, not a single regular expression. Hono signs a constrained upload and verifies the stored asset, Cloudinary keeps the original behind authenticated delivery, Advanced OCR supplies the words and coordinates, and targeted transformations create a reviewable derivative without hiding the entire interface.

The critical design choice is the review boundary. A detected region is evidence, not proof that every sensitive value was found. Keeping the original restricted, masking API output, measuring the complete OCR pipeline, and requiring approval turns a convenient image transformation into a more defensible operational control.
