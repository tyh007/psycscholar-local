import type { Paper } from './database'

const coreFields = new Set([
  'background', 'theory', 'methodology', 'measures',
  'results', 'implications', 'limitations'
])

export function exportFieldValue(paper: Pick<Paper, 'extractedData'>, fieldId: string): string {
  const fields = paper.extractedData
  if (!fields) return ''
  if (coreFields.has(fieldId)) {
    return String((fields as unknown as Record<string, unknown>)[fieldId] ?? '')
  }
  return String(fields.customFields?.[fieldId] ?? '')
}
