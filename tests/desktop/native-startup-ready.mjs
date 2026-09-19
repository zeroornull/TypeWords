// Wait until the isolated production page can accept practice input.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const evidence = resolve(process.argv[2] || '')
const outName = process.argv[3] || 'startup-ready.json'
assert.ok(process.argv[2], 'Supply an evidence directory with launch.json')
const launch = JSON.parse(readFileSync(resolve(evidence, 'launch.json'), 'utf8').replace(/^\uFEFF/, ''))
assert.ok(process.env.TYPEWORDS_PLAYWRIGHT_MODULE, 'Set TYPEWORDS_PLAYWRIGHT_MODULE')
const started = Date.now()
const { chromium } = await import(pathToFileURL(process.env.TYPEWORDS_PLAYWRIGHT_MODULE).href)
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${launch.port}`)
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().startsWith('http://tauri.localhost'))
assert.ok(page, 'Expected a production Tauri page')
await page.goto('http://tauri.localhost/practice-words/backup-custom')
await page.waitForFunction(() => {
  const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
  return pinia?._s.get('base')?.load && pinia?._s.get('setting')?.load
})
await page.waitForSelector('.typing-word', { timeout: 20000 })
const info = await page.evaluate(() => {
  const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
  return {
    href: location.href,
    origin: location.origin,
    word: pinia._s.get('base')?.sdict?.words?.[0]?.word || '',
    volume: pinia._s.get('setting')?.wordSoundVolume,
  }
})
const report = {
  ...info,
  readyMsFromConnect: Date.now() - started,
}
writeFileSync(resolve(evidence, outName), JSON.stringify(report, null, 2))
console.log(`READY ${info.href} word=${info.word} connectMs=${report.readyMsFromConnect}`)
await browser.close()
