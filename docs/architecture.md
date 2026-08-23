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

## Hosting decision

The project uses one Vercel deployment. Vercel recognizes `src/index.ts` as a Hono entry point, turns server routes into Vercel Functions, and serves `public/` files from its CDN.
