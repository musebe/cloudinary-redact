import type {
  PublicSensitiveMatch,
  SensitiveCategory,
  SensitiveMatch,
} from './types.js'

type Candidate = Omit<SensitiveMatch, 'maskedValue'> & { priority: number }

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu
const PHONE_PATTERN = /(?<!\w)(?:\+\d{1,3}[ .-]?)?(?:\(?\d{2,4}\)?[ .-])\d{3,4}[ .-]\d{3,4}(?!\w)/gu
const ACCOUNT_PATTERN = /\b(?:account|acct|a\/c)(?:\s+(?:number|no\.?))?\s*[:#=-]?\s*([A-Z0-9][A-Z0-9 -]{5,24}[A-Z0-9])\b/giu
const IBAN_PATTERN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b/gu
const API_KEY_PATTERNS = [
  /\bAKIA[0-9A-Z]{16}\b/gu,
  /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
  /\b(?:api[ _-]?key|secret|token)\s*[:=]\s*([A-Za-z0-9_./+=-]{12,})\b/giu,
]

function maskValue(category: SensitiveCategory, value: string): string {
  if (category === 'email') {
    const [localPart, domain] = value.split('@')
    return `${localPart?.slice(0, 1) || '*'}***@${domain || 'hidden'}`
  }

  const suffix = value.replace(/\s/g, '').slice(-4)
  if (category === 'api_key') {
    const prefix = value.startsWith('sk-') ? 'sk-' : ''
    return `${prefix}••••${suffix}`
  }

  return `••••${suffix}`
}

function addFullMatches(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  category: SensitiveCategory,
  priority: number,
) {
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined) continue
    const value = match[0]
    candidates.push({
      category,
      value,
      start: match.index,
      end: match.index + value.length,
      priority,
    })
  }
}

function addCapturedMatches(
  candidates: Candidate[],
  text: string,
  pattern: RegExp,
  category: SensitiveCategory,
  priority: number,
) {
  for (const match of text.matchAll(pattern)) {
    if (match.index === undefined || !match[1]) continue
    const relativeStart = match[0].lastIndexOf(match[1])
    const start = match.index + relativeStart
    candidates.push({
      category,
      value: match[1],
      start,
      end: start + match[1].length,
      priority,
    })
  }
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

function isPlausiblePhone(value: string): boolean {
  const digitCount = digitsOnly(value).length
  return digitCount >= 9 && digitCount <= 15
}

function isPlausibleLabeledAccount(value: string): boolean {
  return digitsOnly(value).length >= 6
}

function removeOverlaps(candidates: Candidate[]): Candidate[] {
  const ordered = [...candidates].sort(
    (left, right) =>
      left.start - right.start || right.priority - left.priority || right.end - left.end,
  )
  const selected: Candidate[] = []

  for (const candidate of ordered) {
    const overlaps = selected.some(
      (existing) => candidate.start < existing.end && candidate.end > existing.start,
    )
    if (!overlaps) selected.push(candidate)
  }

  return selected.sort((left, right) => left.start - right.start)
}

export function detectSensitiveText(text: string): SensitiveMatch[] {
  const candidates: Candidate[] = []

  for (const pattern of API_KEY_PATTERNS) {
    if (pattern.source.includes('api[ _-]?key')) {
      addCapturedMatches(candidates, text, pattern, 'api_key', 40)
    } else {
      addFullMatches(candidates, text, pattern, 'api_key', 40)
    }
  }

  addFullMatches(candidates, text, EMAIL_PATTERN, 'email', 30)
  const accountCandidates: Candidate[] = []
  addCapturedMatches(accountCandidates, text, ACCOUNT_PATTERN, 'account_number', 20)
  candidates.push(
    ...accountCandidates.filter(({ value }) => isPlausibleLabeledAccount(value)),
  )
  addFullMatches(candidates, text, IBAN_PATTERN, 'account_number', 20)

  const phoneCandidates: Candidate[] = []
  addFullMatches(phoneCandidates, text, PHONE_PATTERN, 'phone', 10)
  candidates.push(...phoneCandidates.filter(({ value }) => isPlausiblePhone(value)))

  return removeOverlaps(candidates).map(({ priority: _priority, ...match }) => ({
    ...match,
    maskedValue: maskValue(match.category, match.value),
  }))
}

export function toPublicSensitiveMatch(
  match: SensitiveMatch,
): PublicSensitiveMatch {
  const { value: _value, ...publicMatch } = match
  return publicMatch
}
