// Explicit installed-WebView practice check. Not part of the default Node suite.
// Official T01/T03 dest-runner honesty:
// Leftover dest SHA 99948E67 is pre-fix. Old dest lacks leftover id-match /
// lastLearnIndex keep source fixes (V102/V104). Do not claim dest-green
// for leftover id-match / lastLearnIndex keep on SHA 99948E67.
// complete-20 → /words is official empty-task, not leftover-20 dest-green.
// Opening /words here starts practice. Do not treat old dest list-page navigation
// (/words /dict /articles) as leftover-20 proof.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isMaskedPracticeLetterText, resolveInstalledPracticeWord } from './native-local-practice-word.mjs'

const evidence = resolve(process.argv[2] || '')
assert.ok(process.argv[2], 'Supply an evidence directory with an isolated launch.json')
const launch = JSON.parse(readFileSync(resolve(evidence, 'launch.json'), 'utf8').replace(/^\uFEFF/, ''))
assert.equal(resolve(launch.profile), resolve(evidence, 'isolated-profile'))
assert.equal(createHash('sha256').update(readFileSync(launch.exe)).digest('hex'), launch.sha256.toLowerCase())
assert.ok(process.env.TYPEWORDS_PLAYWRIGHT_MODULE, 'Set TYPEWORDS_PLAYWRIGHT_MODULE')
const { chromium } = await import(pathToFileURL(process.env.TYPEWORDS_PLAYWRIGHT_MODULE).href)
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${launch.port}`)
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().startsWith('http://tauri.localhost'))
assert.ok(page, 'Expected a production Tauri page')
const report = { sha256: launch.sha256, errors: [], external: [] }
page.on('pageerror', error => report.errors.push(error.message))
await context.route(/^https:\/\//, route => {
  report.external.push(route.request().url())
  return route.abort()
})

async function ready() {
  await page.waitForFunction(() => {
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    return pinia?._s.get('base')?.load && pinia?._s.get('setting')?.load
  })
}

const snapshotPractice = () =>
  page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const base = pinia._s.get('base')
    const practice = pinia._s.get('practice')
    return {
      origin: location.origin,
      href: location.href,
      dictId: base.sdict?.id,
      dictName: base.sdict?.name,
      wordCount: base.sdict?.words?.length ?? 0,
      lastLearnIndex: base.sdict?.lastLearnIndex,
      letterText: document.querySelector('.typing-word .letter')?.textContent?.trim() || '',
      currentWord: document.querySelector('.typing-word .letter')?.textContent?.trim() || '',
      practiceIndex: (() => {
        const data = document.querySelector('.typing-word')
        return data ? true : false
      })(),
      inputWordNumber: practice?.inputWordNumber,
      spend: practice?.spend,
    }
  })

try {
  await page.goto('http://tauri.localhost/words')
  await ready()
  const before = await snapshotPractice()
  report.before = before
  assert.equal(before.origin, 'http://tauri.localhost')
  assert.ok(before.wordCount > 0, 'Installed profile must have a dictionary with words')
  const start = page.getByText(/^(开始学习|继续学习|开始系统练习|开始自由练习|开始自定义练习|继续自定义练习)/)
  await start.first().click()
  await page.waitForURL(/\/practice-words\//, { timeout: 15000 })
  await ready()
  await page.waitForSelector('.typing-word', { timeout: 15000 })
  const started = await snapshotPractice()
  report.started = started
  await page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const setting = pinia._s.get('setting')
    if (setting) setting.showPanel = false
  })
  await page.waitForTimeout(200)
  async function collectPracticeWordSources() {
    return page.evaluate(async () => {
      const letterText = document.querySelector('.typing-word .letter')?.textContent?.trim() || ''
      let propWord = ''
      let providedWord = ''
      const seen = new Set()
      const stack = [document.querySelector('#__nuxt')?.__vue_app__?._instance]
      while (stack.length) {
        const inst = stack.pop()
        if (!inst || seen.has(inst)) continue
        seen.add(inst)
        const word = inst.props?.word
        if (!propWord && typeof word?.word === 'string') propWord = word.word
        const data = inst.provides?.practiceData
        if (!providedWord && data?.words?.[data.index]?.word) providedWord = data.words[data.index].word
        if (inst.subTree?.component) stack.push(inst.subTree.component)
        const children = inst.subTree?.children
        if (Array.isArray(children)) {
          for (const child of children) {
            if (child?.component) stack.push(child.component)
          }
        }
      }
      const request = indexedDB.open('keyval-store')
      const db = await new Promise((resolveDb, reject) => {
        request.onsuccess = () => resolveDb(request.result)
        request.onerror = () => reject(request.error)
      })
      let cacheWord = ''
      try {
        const raw = await new Promise((resolveKey, reject) => {
          const get = db.transaction('keyval', 'readonly').objectStore('keyval').get('PracticeSaveWord')
          get.onsuccess = () => resolveKey(get.result ?? null)
          get.onerror = () => reject(get.error)
        })
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        const val = parsed?.val || parsed
        const data = val?.practiceData
        cacheWord = data?.words?.[data.index]?.word || data?.wordsStr?.[data.index] || ''
      } finally {
        db.close()
      }
      const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
      return {
        letterText,
        propWord,
        providedWord,
        cacheWord,
        showWordShortcut: pinia._s.get('setting')?.shortcutKeyMap?.ShowWord || 'Escape',
      }
    })
  }
  let sources = await collectPracticeWordSources()
  report.wordSources = sources
  let word = resolveInstalledPracticeWord(sources)
  if (!word && isMaskedPracticeLetterText(sources.letterText)) {
    await page.keyboard.press(sources.showWordShortcut || 'Escape')
    await page.waitForTimeout(300)
    sources = await collectPracticeWordSources()
    sources.revealedLetterText = sources.letterText
    report.wordSourcesAfterReveal = sources
    word = resolveInstalledPracticeWord(sources)
  }
  assert.ok(word, `Expected a practice word, got ${JSON.stringify(sources.letterText)}`)
  report.typed = word
  await page.keyboard.type(word.replace(/[^A-Za-z]/g, ''), { delay: 50 })
  await page.keyboard.press('Space')
  await page.waitForTimeout(800)
  const after = await snapshotPractice()
  report.after = after
  assert.ok(
    after.inputWordNumber > (started.inputWordNumber ?? 0) ||
      (await page.locator('.statistics, .stat, text=练习报告, text=再来一次').count()) > 0,
    'Typing the current word must advance practice or finish the session'
  )
  assert.deepEqual(report.errors, [])
  await page.screenshot({ path: resolve(evidence, 'native-local-practice.png') })
  report.passed = true
  console.log(
    `PASS: installed ${launch.productVersion} typed ${word} in ${started.dictName || started.dictId}; no page errors.`
  )
} finally {
  writeFileSync(resolve(evidence, 'native-local-practice.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
