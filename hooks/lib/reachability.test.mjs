import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'register.mjs')
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\bimport\s+)['"]([^'"]+)['"]/g

function reachable(entry) {
  const seen = new Map()
  const queue = [entry]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    const src = readFileSync(file, 'utf-8')
    const specs = [...src.matchAll(SPECIFIER)].map((m) => m[1])
    seen.set(file, specs)
    for (const s of specs) if (s.startsWith('.')) queue.push(resolve(dirname(file), s))
  }
  return seen
}

test('register.mjs reaches lib files, so the walk is not vacuous', () => {
  const files = [...reachable(ENTRY).keys()].map((f) => f.replaceAll('\\', '/'))
  assert.ok(files.some((f) => f.endsWith('/hooks/lib/ledger.mjs')))
  assert.ok(files.some((f) => f.endsWith('/hooks/lib/config-core.mjs')))
})

test('no file reachable from register.mjs imports a node: module', () => {
  for (const [file, specs] of reachable(ENTRY)) {
    assert.deepEqual(specs.filter((s) => s.startsWith('node:')), [], `${file} imports a node: module`)
  }
})

test('the node: check catches static, dynamic and bare imports', () => {
  const found = (src) => [...src.matchAll(SPECIFIER)].map((m) => m[1])
  assert.deepEqual(found("import { x } from 'node:fs'"), ['node:fs'])
  assert.deepEqual(found("import 'node:fs'"), ['node:fs'])
  assert.deepEqual(found("await import('node:os')"), ['node:os'])
})
