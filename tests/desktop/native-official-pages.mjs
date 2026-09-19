// Visit official installed pages and collect pageerrors. Not the dest lifecycle suite.
// Honesty-only T05/R4 dest lock (V106). Do not rematrix dest. Do not add dest UI.
// Listen/Youdao dest proof on 99948E67C19B6C66501AE23D4DA643D31D4EE46B358F9063E5A9AFE972D77D72
// is pre-leftover-fix. Dest SHA does not contain leftover-fix
// (isDictIdMatch / changeDict leftover-20 / 错词 in-place).
// Dest proof does not close T05 human-ear. Human-ear remains user-blocked.
// Dest proof does not close T04 NIC-off. Ethernet-off remains user-blocked.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const evidence = resolve(process.argv[2] || '')
assert.ok(process.argv[2], 'Supply an evidence directory with launch.json')
const launch = JSON.parse(readFileSync(resolve(evidence, 'launch.json'), 'utf8').replace(/^\uFEFF/, ''))
assert.ok(process.env.TYPEWORDS_PLAYWRIGHT_MODULE, 'Set TYPEWORDS_PLAYWRIGHT_MODULE')
assert.equal(resolve(launch.profile), resolve(evidence, 'isolated-profile'))
assert.equal(createHash('sha256').update(readFileSync(launch.exe)).digest('hex'), launch.sha256.toLowerCase())

const routes = [
  '/',
  '/words',
  '/articles',
  '/setting',
  '/about',
  '/help',
  '/doc',
  '/feedback',
  '/dict-list',
  '/book-list',
  '/practice-words/backup-custom',
  '/practice-articles/backup-articles',
]
const wordPracticePath = '/practice-words/backup-custom'
const articlePracticePath = '/practice-articles/backup-articles'
const wordsHref = 'http://tauri.localhost/words'
const wordPracticeHref = `http://tauri.localhost${wordPracticePath}`
const articlePracticeHref = `http://tauri.localhost${articlePracticePath}`
// Official empty-task / completed leftover book: practice-words/[id].vue
// toast「没有可学习的单词！」then router.push('/words'). That is product
// route strategy, not a Tauri 404. History walk uses leftover article
// practice, which stays on its URL so back/forward/reload still prove T03.
// Official T01/T03 dest-runner honesty:
// Leftover dest SHA 99948E67 is pre-fix. Old dest lacks leftover id-match /
// lastLearnIndex keep source fixes (V102/V104). Do not claim dest-green
// for leftover id-match / lastLearnIndex keep on SHA 99948E67.
// complete-20 → /words is official empty-task, not leftover-20 dest-green.
// Do not treat old dest list-page navigation (/words /dict /articles)
// as leftover-20 proof.

const { chromium } = await import(pathToFileURL(process.env.TYPEWORDS_PLAYWRIGHT_MODULE).href)
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${launch.port}`)
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().startsWith('http://tauri.localhost'))
assert.ok(page, 'Expected a production Tauri page')

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function snapshotPage() {
  return page.evaluate(() => {
    const root = document.querySelector('#__nuxt')
    const pinia = root?.__vue_app__?.config.globalProperties.$pinia
    const bodyText = document.body?.innerText || ''
    return {
      href: location.href,
      title: document.title,
      hasNuxt: !!root,
      piniaLoad: !!(pinia?._s.get('base')?.load && pinia?._s.get('setting')?.load),
      wordSoundVolume: pinia?._s.get('setting')?.wordSoundVolume ?? null,
      looks404: /404|page not found|页面不存在/i.test(bodyText) && !root,
    }
  })
}
async function collect(step, action) {
  const pageerrors = []
  const onError = error => pageerrors.push(error.message)
  page.on('pageerror', onError)
  await action()
  await pause(800)
  const info = await snapshotPage()
  page.off('pageerror', onError)
  return { step, ...info, pageerrors }
}

const pages = []
for (const path of routes) {
  const row = await collect(path, () => page.goto(`http://tauri.localhost${path}`, { waitUntil: 'domcontentloaded' }))
  pages.push({ path, ...row })
}
const wordPracticePage = pages.find(item => item.path === wordPracticePath)
const articlePracticePage = pages.find(item => item.path === articlePracticePath)
assert.ok(wordPracticePage, 'official word practice route missing')
assert.ok(articlePracticePage, 'official article practice route missing')
const completedWordPracticeRedirect = wordPracticePage.href === wordsHref
const wordPracticeHrefAccepted = wordPracticePage.href === wordPracticeHref || completedWordPracticeRedirect

const history = []
history.push(await collect('root', () => page.goto('http://tauri.localhost/', { waitUntil: 'domcontentloaded' })))
history.push(await collect('words', () => page.goto('http://tauri.localhost/words', { waitUntil: 'domcontentloaded' })))
history.push(await collect('practice', () => page.goto(articlePracticeHref, { waitUntil: 'domcontentloaded' })))
history.push(
  await collect('setting', () => page.goto('http://tauri.localhost/setting', { waitUntil: 'domcontentloaded' }))
)
history.push(await collect('reload-setting', () => page.reload({ waitUntil: 'domcontentloaded' })))
history.push(await collect('back-practice', () => page.goBack({ waitUntil: 'domcontentloaded' })))
history.push(await collect('back-words', () => page.goBack({ waitUntil: 'domcontentloaded' })))
history.push(await collect('back-root', () => page.goBack({ waitUntil: 'domcontentloaded' })))
history.push(await collect('forward-words', () => page.goForward({ waitUntil: 'domcontentloaded' })))
history.push(await collect('forward-practice', () => page.goForward({ waitUntil: 'domcontentloaded' })))
history.push(await collect('forward-setting', () => page.goForward({ waitUntil: 'domcontentloaded' })))
history.push(
  await collect('reload-words', async () => {
    await page.goto('http://tauri.localhost/words', { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
  })
)
history.push(
  await collect('reload-practice', async () => {
    await page.goto(articlePracticeHref, { waitUntil: 'domcontentloaded' })
    await page.reload({ waitUntil: 'domcontentloaded' })
  })
)

const expectHref = {
  root: 'http://tauri.localhost/',
  words: wordsHref,
  practice: articlePracticeHref,
  setting: 'http://tauri.localhost/setting',
  'reload-setting': 'http://tauri.localhost/setting',
  'back-practice': articlePracticeHref,
  'back-words': wordsHref,
  'back-root': 'http://tauri.localhost/',
  'forward-words': wordsHref,
  'forward-practice': articlePracticeHref,
  'forward-setting': 'http://tauri.localhost/setting',
  'reload-words': wordsHref,
  'reload-practice': articlePracticeHref,
}
const historyHrefMismatch = history.filter(item => item.href !== expectHref[item.step]).map(item => item.step)
const rootSteps = new Set(['root', 'back-root'])
const historyPiniaUnexpected = history
  .filter(item => (rootSteps.has(item.step) ? item.piniaLoad : !item.piniaLoad))
  .map(item => item.step)

const report = {
  sha256: launch.sha256,
  productVersion: launch.productVersion,
  pid: launch.pid,
  port: launch.port,
  pages,
  pageerrorCount: pages.reduce((sum, item) => sum + item.pageerrors.length, 0),
  missingNuxt: pages.filter(item => !item.hasNuxt).map(item => item.path || item.step),
  looks404: pages.filter(item => item.looks404).map(item => item.path || item.step),
  history,
  historyPageerrorCount: history.reduce((sum, item) => sum + item.pageerrors.length, 0),
  historyMissingNuxt: history.filter(item => !item.hasNuxt).map(item => item.step),
  historyLooks404: history.filter(item => item.looks404).map(item => item.step),
  historyHrefMismatch,
  historyPiniaUnexpected,
  completedWordPracticeRedirect,
  wordPracticeHref: wordPracticePage.href,
  historyPracticePath: articlePracticePath,
  routeStrategy:
    'empty-task /practice-words/backup-custom -> /words; history walk uses leftover /practice-articles/backup-articles',
}
writeFileSync(resolve(evidence, 'official-pages.json'), JSON.stringify(report, null, 2))
await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
await pause(600)
await page.screenshot({ path: resolve(evidence, 'official-pages.png'), fullPage: false })
console.log(
  JSON.stringify(
    {
      pageerrorCount: report.pageerrorCount,
      missingNuxt: report.missingNuxt,
      looks404: report.looks404,
      historyPageerrorCount: report.historyPageerrorCount,
      historyHrefMismatch: report.historyHrefMismatch,
      historyPiniaUnexpected: report.historyPiniaUnexpected,
      completedWordPracticeRedirect: report.completedWordPracticeRedirect,
      wordPracticeHref: report.wordPracticeHref,
      historyPracticePath: report.historyPracticePath,
      last: pages.at(-1)?.href,
    },
    null,
    2
  )
)
assert.equal(report.pageerrorCount, 0, `pageerrors: ${JSON.stringify(pages.filter(item => item.pageerrors.length))}`)
assert.deepEqual(report.missingNuxt, [])
assert.deepEqual(report.looks404, [])
assert.ok(wordPracticeHrefAccepted, `unexpected leftover word practice href: ${wordPracticePage.href}`)
assert.equal(articlePracticePage.href, articlePracticeHref)
assert.equal(
  report.historyPageerrorCount,
  0,
  `history pageerrors: ${JSON.stringify(history.filter(item => item.pageerrors.length))}`
)
assert.deepEqual(report.historyMissingNuxt, [])
assert.deepEqual(report.historyLooks404, [])
assert.deepEqual(report.historyHrefMismatch, [])
assert.deepEqual(report.historyPiniaUnexpected, [])
await browser.close()
