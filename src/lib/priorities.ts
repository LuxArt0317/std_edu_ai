/** Translate the human-facing “normal” label into the canonical database enum. */
export function toDatabasePriority(value: string): 'low' | 'medium' | 'high' | 'urgent' {
  if (value === 'normal') return 'medium'
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'urgent') return value
  throw new Error('Choose a valid priority before saving.')
}
