import { readFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'

describe('browser upload form', () => {
  test('captures FormData before disabling the selected file input', async () => {
    const source = await readFile(
      new URL('../../public/app.js', import.meta.url),
      'utf8',
    )
    const captureIndex = source.indexOf('const formData = new FormData(form)')
    const disableIndex = source.indexOf('setBusy(true)', captureIndex)

    expect(captureIndex).toBeGreaterThan(-1)
    expect(disableIndex).toBeGreaterThan(captureIndex)
    expect(source).toContain('body: formData')
  })
})
