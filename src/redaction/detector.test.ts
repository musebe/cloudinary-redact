import { describe, expect, test } from 'vitest'

import { detectSensitiveText, toPublicSensitiveMatch } from './detector.js'

describe('sensitive text detector', () => {
  test('detects the four supported categories', () => {
    const text = [
      'Email: alex@example.com',
      'Phone: +254 712 345 678',
      'Account number: 9988 7766 5544',
      'API key: sk-test_1234567890abcdefghij',
    ].join('\n')

    const findings = detectSensitiveText(text)

    expect(findings.map(({ category }) => category)).toEqual([
      'email',
      'phone',
      'account_number',
      'api_key',
    ])
  })

  test('does not classify ordinary support text', () => {
    const findings = detectSensitiveText(
      'Ticket 4821 is open. Account settings opened at 10:30 on 2026-09-02.',
    )

    expect(findings).toEqual([])
  })

  test('removes raw values from public findings', () => {
    const [finding] = detectSensitiveText('Email: person@example.com')

    expect(finding).toBeDefined()
    const publicFinding = toPublicSensitiveMatch(finding!)
    expect(publicFinding).not.toHaveProperty('value')
    expect(publicFinding.maskedValue).toBe('p***@example.com')
  })
})
