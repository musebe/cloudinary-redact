export const sensitiveCategories = [
  'email',
  'phone',
  'account_number',
  'api_key',
] as const

export type SensitiveCategory = (typeof sensitiveCategories)[number]

export type SensitiveMatch = {
  category: SensitiveCategory
  value: string
  start: number
  end: number
  maskedValue: string
}

export type PublicSensitiveMatch = Omit<SensitiveMatch, 'value'>
