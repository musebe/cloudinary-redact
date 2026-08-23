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

          <section class="workspace" aria-labelledby="workspace-title">
            <form id="redaction-form" class="upload-card">
              <div>
                <p class="eyebrow">Restricted upload</p>
                <h2 id="workspace-title">Choose a support screenshot</h2>
                <p class="helper">
                  JPEG, PNG, or WebP. Maximum 4 MB and minimum 1024 × 768.
                </p>
              </div>

              <label class="file-field">
                <span>Screenshot</span>
                <input
                  id="image"
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
              </label>

              <fieldset>
                <legend>Redaction style</legend>
                <label><input type="radio" name="mode" value="pixelate" checked /> Pixelate</label>
                <label><input type="radio" name="mode" value="blur" /> Blur</label>
              </fieldset>

              <button class="button" type="submit">Detect and redact</button>
              <p id="request-status" class="request-status" role="status" aria-live="polite"></p>
            </form>

            <section id="result" class="result" aria-labelledby="result-title" hidden>
              <div class="result-heading">
                <div>
                  <p class="eyebrow">Human review</p>
                  <h2 id="result-title">Compare before approving</h2>
                </div>
                <span id="review-status" class="review-badge">Review required</span>
              </div>

              <div class="comparison">
                <figure>
                  <figcaption>Restricted original</figcaption>
                  <img id="original-image" alt="Restricted original screenshot for review" />
                </figure>
                <figure>
                  <figcaption>Redacted derivative</figcaption>
                  <img id="redacted-image" alt="Screenshot with detected sensitive text redacted" />
                </figure>
              </div>

              <div class="findings-panel">
                <h3>Masked findings</h3>
                <ul id="findings"></ul>
              </div>

              <div class="review-actions">
                <button id="reject-button" class="button button-secondary" type="button">Reject</button>
                <button id="approve-button" class="button" type="button">Approve safe version</button>
              </div>
            </section>
          </section>

          <ol class="steps" aria-label="Redaction pipeline">
            <li><strong>1. Upload</strong><span>Restricted original</span></li>
            <li><strong>2. Detect</strong><span>OCR coordinates</span></li>
            <li><strong>3. Redact</strong><span>Targeted regions</span></li>
            <li><strong>4. Review</strong><span>Approve or reject</span></li>
          </ol>
        </main>
        <script src="/app.js" defer></script>
      </body>
    </html>`
}
