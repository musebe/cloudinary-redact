import { html } from 'hono/html'

export function renderHomePage() {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Detect and redact sensitive text from screenshots with Cloudinary OCR and Hono."
        />
        <title>Cloudinary Redact</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <main class="shell">
          <header class="topbar">
            <a class="brand" href="/" aria-label="Cloudinary Redact home">
              <span class="brand-mark" aria-hidden="true">R</span>
              Cloudinary Redact
            </a>
            <span class="stack">Hono + Cloudinary</span>
          </header>

          <section class="hero" aria-labelledby="page-title">
            <p class="eyebrow">Privacy operations demo</p>
            <h1 id="page-title">Hide sensitive screenshot text before sharing.</h1>
            <p class="intro">
              Upload a support screenshot, detect private text with Cloudinary
              OCR, and create a reviewable redacted version without exposing the
              original publicly.
            </p>
          </section>

          <section class="proof" aria-labelledby="proof-title">
            <div>
              <p class="eyebrow">Project foundation</p>
              <h2 id="proof-title">One focused redaction pipeline</h2>
            </div>
            <ol class="steps">
              <li><strong>1. Upload</strong><span>Restricted screenshot</span></li>
              <li><strong>2. Detect</strong><span>OCR text and coordinates</span></li>
              <li><strong>3. Classify</strong><span>Email, phone, account, key</span></li>
              <li><strong>4. Redact</strong><span>Targeted blur or pixelation</span></li>
              <li><strong>5. Review</strong><span>Approve the safe derivative</span></li>
            </ol>
          </section>

          <section class="status" aria-labelledby="status-title">
            <div>
              <p class="eyebrow">API status</p>
              <h2 id="status-title">The Hono and Vercel shell is ready.</h2>
              <p>The upload and OCR engine will be added in the next checkpoint.</p>
            </div>
            <a class="button" href="/api/health">Open health response</a>
          </section>
        </main>
      </body>
    </html>`
}
