# Synthetic screenshot benchmark

## Goal

Measure whether the complete Cloudinary OCR and sensitive-text classifier finds the labeled private values in screenshots without redacting ordinary support text.

## Dataset

- Version: `synthetic-screenshots-v1`
- Cases: 20
- Resolution: 1200 by 900 pixels
- Labeled findings: 16
- Categories: email, phone, account number, and API key
- Negative cases: tickets, dates, times, order IDs, version numbers, URLs, and ordinary account-setting text
- Safety: every identifier is synthetic; email domains use the reserved `.test` suffix

The JSON manifest is the label source. `npm run benchmark:render` deterministically regenerates every PNG from that manifest.

## Metrics

| Metric | Definition |
| --- | --- |
| Precision | True detected findings divided by all detected findings |
| Recall | True detected findings divided by all labeled findings |
| F1 | Harmonic mean of precision and recall |

A finding is correct only when its normalized category and value match a label. Source-text and OCR results must be reported separately.

## Commands

```bash
npm run benchmark:classifier
npm run benchmark:ocr
```

The classifier baseline currently reports 100% precision, recall, and F1 on source text. No OCR score should be reported until the credentialed command completes against Cloudinary Advanced OCR.

The OCR command uploads one authenticated fixture at a time and deletes it in a `finally` block. If cleanup fails, remove only assets under `screenshot-redaction/originals/` that correspond to the benchmark run.

## Limitations

The dataset is synthetic, visually clean, Latin-script only, and deliberately small. It does not establish accuracy for low contrast, compression artifacts, rotated text, handwriting, multilingual text, or production-specific identifier formats.
