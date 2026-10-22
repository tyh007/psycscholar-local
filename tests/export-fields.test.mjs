import test from 'node:test'
import assert from 'node:assert/strict'
import { exportFieldValue } from '../src/lib/export-fields.ts'

const paper = { extractedData: {
  background: 'Reviewed background', theory: '', methodology: '', measures: '',
  results: 'Reviewed results', implications: '', limitations: '',
  customFields: { sample: 'Example sample description', empty: '' }
} }

test('exports resolve both core fields and nested custom fields', () => {
  assert.equal(exportFieldValue(paper, 'background'), 'Reviewed background')
  assert.equal(exportFieldValue(paper, 'sample'), 'Example sample description')
})

test('missing extraction or fields export an empty cell', () => {
  assert.equal(exportFieldValue({}, 'background'), '')
  assert.equal(exportFieldValue(paper, 'unknown'), '')
  assert.equal(exportFieldValue(paper, 'empty'), '')
})
