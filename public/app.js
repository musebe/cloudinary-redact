const form = document.querySelector('#redaction-form')
const fileInput = document.querySelector('#image')
const requestStatus = document.querySelector('#request-status')
const result = document.querySelector('#result')
const originalImage = document.querySelector('#original-image')
const redactedImage = document.querySelector('#redacted-image')
const findingsList = document.querySelector('#findings')
const reviewStatus = document.querySelector('#review-status')
const approveButton = document.querySelector('#approve-button')
const rejectButton = document.querySelector('#reject-button')
const gallery = document.querySelector('#session-gallery')
const galleryGrid = document.querySelector('#gallery-grid')
const galleryStatus = document.querySelector('#gallery-status')

let activeAssetId = null

function setBusy(isBusy) {
  form.querySelector('button[type="submit"]').disabled = isBusy
  fileInput.disabled = isBusy
}

async function readImageDimensions(file) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function validateFile(file) {
  if (!file) throw new Error('Choose a screenshot first.')
  if (file.size > 4_000_000) throw new Error('The screenshot must be 4 MB or smaller.')
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Use a JPEG, PNG, or WebP screenshot.')
  }

  const dimensions = await readImageDimensions(file)
  if (dimensions.width < 1024 || dimensions.height < 768) {
    throw new Error('Cloudinary OCR requires a screenshot of at least 1024 × 768.')
  }
}

function renderFindings(findings) {
  findingsList.replaceChildren()
  if (findings.length === 0) {
    const item = document.createElement('li')
    item.textContent = 'No supported sensitive patterns detected'
    findingsList.append(item)
    return
  }

  for (const finding of findings) {
    const item = document.createElement('li')
    item.textContent = `${finding.category.replace('_', ' ')}: ${finding.maskedValue}`
    findingsList.append(item)
  }
}

function renderResult(data) {
  activeAssetId = data.assetId
  originalImage.src = data.originalUrl
  redactedImage.src = data.redactedUrl
  reviewStatus.textContent = 'Review required'
  approveButton.disabled = false
  rejectButton.disabled = false
  renderFindings(data.findings)
  result.hidden = false
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  result.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
}

function createPreview(url, caption, alt) {
  const figure = document.createElement('figure')
  const label = document.createElement('figcaption')
  const image = document.createElement('img')
  label.textContent = caption
  image.src = url
  image.alt = alt
  image.loading = 'lazy'
  image.width = 480
  image.height = 320
  figure.append(label, image)
  return figure
}

function renderGallery(records) {
  galleryGrid.replaceChildren()
  gallery.hidden = records.length === 0
  if (records.length === 0) return

  for (const [index, record] of records.entries()) {
    const card = document.createElement('article')
    card.className = 'gallery-card'

    const heading = document.createElement('div')
    heading.className = 'gallery-card-heading'
    const title = document.createElement('h3')
    title.textContent = `Comparison ${index + 1}`
    const badge = document.createElement('span')
    badge.className = `review-badge review-badge-${record.status}`
    badge.textContent = record.status.replace('_', ' ')
    heading.append(title, badge)

    const meta = document.createElement('p')
    meta.className = 'gallery-meta'
    const findingLabel = record.findingCount === 1 ? 'finding' : 'findings'
    meta.textContent = `${record.findingCount} ${findingLabel} · ${record.mode}`

    const pair = document.createElement('div')
    pair.className = 'gallery-pair'
    pair.append(
      createPreview(
        record.originalUrl,
        'Before',
        'Restricted original screenshot from this review session',
      ),
      createPreview(
        record.redactedUrl,
        'After',
        'Cloudinary derivative with sensitive text redacted',
      ),
    )

    card.append(heading, meta, pair)
    galleryGrid.append(card)
  }
}

async function loadGallery() {
  try {
    const response = await fetch('/api/redactions')
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'Gallery unavailable.')
    renderGallery(payload.data)
    galleryStatus.textContent = ''
  } catch {
    galleryStatus.textContent = 'Recent comparisons could not be loaded.'
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  const file = fileInput.files[0]
  requestStatus.textContent = ''
  result.hidden = true

  try {
    await validateFile(file)
    setBusy(true)
    requestStatus.textContent = 'Uploading securely and running Cloudinary OCR…'
    const response = await fetch('/api/redactions', {
      method: 'POST',
      body: new FormData(form),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'The screenshot could not be processed.')

    renderResult(payload.data)
    await loadGallery()
    requestStatus.textContent = 'Redaction ready for human review.'
  } catch (error) {
    requestStatus.textContent = error instanceof Error
      ? error.message
      : 'The screenshot could not be processed.'
  } finally {
    setBusy(false)
  }
})

async function submitReview(decision) {
  if (!activeAssetId) return
  approveButton.disabled = true
  rejectButton.disabled = true
  requestStatus.textContent = `Saving ${decision} decision…`

  try {
    const response = await fetch(`/api/redactions/${activeAssetId}/review`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || 'The review could not be saved.')

    reviewStatus.textContent = payload.data.status === 'approved' ? 'Approved' : 'Rejected'
    requestStatus.textContent = 'Review decision saved to the Cloudinary asset.'
    await loadGallery()
  } catch (error) {
    approveButton.disabled = false
    rejectButton.disabled = false
    requestStatus.textContent = error instanceof Error
      ? error.message
      : 'The review could not be saved.'
  }
}

approveButton.addEventListener('click', () => submitReview('approve'))
rejectButton.addEventListener('click', () => submitReview('reject'))
loadGallery()
