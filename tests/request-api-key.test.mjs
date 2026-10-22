import test from 'node:test'
import assert from 'node:assert/strict'
import { getRequestApiKey, withUserApiKey } from '../src/lib/server/request-api-key.ts'

test('overlapping extractions retain their own credential across awaits', async () => {
  let releaseFirst
  const gate = new Promise(resolve => { releaseFirst = resolve })
  const first = withUserApiKey('first-test-key', async () => {
    await gate
    assert.equal(getRequestApiKey(), 'first-test-key')
  })
  await withUserApiKey('second-test-key', async () => {
    await Promise.resolve()
    assert.equal(getRequestApiKey(), 'second-test-key')
    releaseFirst()
  })
  await first
  assert.equal(getRequestApiKey(), null)
})

test('a request without a supplied key cannot inherit another request key', async () => {
  await withUserApiKey('outer-test-key', async () => {
    await withUserApiKey(undefined, async () => {
      await Promise.resolve()
      assert.equal(getRequestApiKey(), null)
    })
    assert.equal(getRequestApiKey(), 'outer-test-key')
  })
  assert.equal(getRequestApiKey(), null)
})
