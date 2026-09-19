import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = resolve(process.env.TYPEWORDS_TEST_ROOT || fileURLToPath(new URL('../../', import.meta.url)))
const require = createRequire(import.meta.url)

function vendorSource() {
  const pkgRoot = dirname(require.resolve('unplugin-vue-components/package.json'))
  const dist = resolve(pkgRoot, 'dist')
  return readdirSync(dist, { recursive: true })
    .filter(name => typeof name === 'string' && name.endsWith('.js'))
    .map(name => readFileSync(join(dist, name), 'utf8'))
    .join('\n')
}

test('unplugin-vue-components skips dts writes when dts is disabled and does not await the write', () => {
  const source = vendorSource()
  assert.match(source, /_generateDeclaration[\s\S]*if\s*\(\s*!this\.options\.dts\s*\)\s*return/)
  assert.match(source, /generateDeclaration[\s\S]*this\._generateDeclaration\([^)]*\)\s*;/)
  assert.match(source, /async function writeDeclaration/)
  assert.doesNotMatch(source, /await this\._generateDeclaration/)
})

test('desktop frontend config is the only caller that turns that dts write off', () => {
  const source = readFileSync(resolve(root, 'nuxt.config.ts'), 'utf8')
  assert.match(source, /dts:\s*!isDesktop/)
  assert.match(source, /unhandledRejection/)
  assert.match(source, /components\.d\.ts/)
})
