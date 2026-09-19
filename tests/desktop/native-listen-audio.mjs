// Isolated WebView listen check. Not part of the default Node suite.
// Official T05 machine-side cells on leftover dest CET-4 + leftover custom article blob.
// Does not depend on leftover-complete backup-custom / fixture.
// Forces Youdao failure with route.fulfill only. Does not claim a human heard English.
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
import { OFFICIAL_T01_BUILTIN_WORD_BOOK } from './native-local-practice-matrix-spec.mjs'
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
const wordPracticeHref = `http://tauri.localhost/practice-words/${OFFICIAL_T01_BUILTIN_WORD_BOOK.id}`
const youdaoInterceptBody = 'typewords-forced-youdao-failure'
const report = {
  sha256: launch.sha256,
  productVersion: launch.productVersion,
  pid: launch.pid,
  port: launch.port,
  wordBook: OFFICIAL_T01_BUILTIN_WORD_BOOK,
  wordPracticeHref,
  errors: [],
  requests: [],
  youdaoResponses: [],
  youdaoFailures: [],
  humanListenClaim: false,
  cells: {
    usYoudao: { status: 'pending' },
    ukYoudao: { status: 'pending' },
    playbackRate: { status: 'pending' },
    consecutive20: { status: 'pending' },
    pageCancel: { status: 'pending' },
    ttsFallback: { status: 'pending' },
  },
  note: 'Machine-side decode and media events only; not a human-ear English acceptance. Youdao uses leftover CET-4, not leftover-complete backup-custom/fixture. Youdao failure uses route.fulfill, not a host NIC change.',
}
page.on('pageerror', error => report.errors.push(error.message))
page.on('request', request => {
  const url = request.url()
  if (/^https:\/\//i.test(url)) report.requests.push(url)
})
page.on('response', response => {
  const url = response.url()
  if (/dict\.youdao\.com\/dictvoice/i.test(url)) {
    report.youdaoResponses.push({ url, status: response.status() })
  }
})
page.on('requestfailed', request => {
  const url = request.url()
  if (/dict\.youdao\.com\/dictvoice/i.test(url)) {
    report.youdaoFailures.push({ url, error: request.failure()?.errorText || 'failed' })
  }
})

async function ready() {
  await page.waitForFunction(() => {
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    return pinia?._s.get('base')?.load && pinia?._s.get('setting')?.load
  })
}

async function snapshotSound() {
  return page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const setting = pinia._s.get('setting')
    return {
      origin: location.origin,
      href: location.href,
      wordSound: setting.wordSound,
      wordSoundVolume: setting.wordSoundVolume,
      wordSoundSpeed: setting.wordSoundSpeed,
      articleSound: setting.articleSound,
      articleSoundVolume: setting.articleSoundVolume,
      articleSoundSpeed: setting.articleSoundSpeed,
      soundType: setting.soundType,
    }
  })
}

async function snapshotLeftover() {
  return page.evaluate(async () => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const base = pinia._s.get('base')
    const setting = pinia._s.get('setting')
    const custom = (base.word?.bookList || []).find(book => book.id === 'backup-custom')
    const articles = (base.article?.bookList || []).find(book => book.id === 'backup-articles')
    const cet4 = (base.word?.bookList || []).find(book => String(book.id) === '1' || book.enName === 'cet4')
    const wrong = (base.word?.bookList || []).find(
      book => String(book.id) === 'wordWrong' || book.enName === 'wordWrong'
    )
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    let articleCache = null
    let audioBytes = 0
    try {
      const raw = await new Promise((resolveKey, reject) => {
        const get = db.transaction('keyval', 'readonly').objectStore('keyval').get('PracticeSaveArticle')
        get.onsuccess = () => resolveKey(get.result ?? null)
        get.onerror = () => reject(get.error)
      })
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      articleCache = (parsed?.val || parsed)?.practiceData || null
      const files = await new Promise((resolveKey, reject) => {
        const get = db.transaction('keyval', 'readonly').objectStore('keyval').get('typing-word-files')
        get.onsuccess = () => resolveKey(get.result ?? [])
        get.onerror = () => reject(get.error)
      })
      if (files[0]?.file) audioBytes = (await files[0].file.arrayBuffer()).byteLength
    } finally {
      db.close()
    }
    return {
      href: location.href,
      volume: setting.wordSoundVolume,
      soundType: setting.soundType,
      translate: setting.translate,
      wordPracticeMode: setting.wordPracticeMode,
      note: base.noteData?.fixture,
      customCount: (custom?.words || []).length,
      customLastLearnIndex: custom?.lastLearnIndex,
      articleCache,
      articleAudioId: articles?.articles?.[0]?.audioFileId,
      audioBytes,
      cet4LastLearnIndex: cet4?.lastLearnIndex,
      possess: (wrong?.words || []).some(item => item.word === 'possess'),
    }
  })
}

function assertLeftover(snapshot, label) {
  assert.equal(snapshot.volume, 37, `${label}: leftover volume must stay 37`)
  assert.equal(snapshot.customCount, 20, `${label}: leftover custom-20 must stay`)
  assert.equal(snapshot.customLastLearnIndex, 20, `${label}: leftover custom lastLearnIndex must stay 20`)
  assert.equal(snapshot.articleCache?.sectionIndex, 6, `${label}: leftover article section must stay 6`)
  assert.equal(snapshot.articleCache?.sentenceIndex, 0, `${label}: leftover article sentence must stay 0`)
  assert.equal(snapshot.articleCache?.wordIndex, 3, `${label}: leftover article word must stay 3`)
  assert.equal(snapshot.audioBytes, 2943, `${label}: leftover backup-tone bytes must stay 2943`)
  assert.equal(snapshot.cet4LastLearnIndex, 20, `${label}: leftover CET-4 lastLearnIndex must stay 20`)
  assert.equal(snapshot.possess, true, `${label}: leftover 错词 possess must stay`)
  assert.equal(snapshot.note, 'ZIP semantic round-trip', `${label}: leftover note must stay`)
}

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
    const base = pinia._s.get('base')
    const setting = pinia._s.get('setting')
    return {
      letterText,
      propWord,
      providedWord,
      cacheWord,
      showWordShortcut: setting?.shortcutKeyMap?.ShowWord || 'Escape',
      href: location.href,
      dictId: base?.sdict?.id,
      dictName: base?.sdict?.name,
      dictEnName: base?.sdict?.enName,
      wordCount: base?.sdict?.words?.length ?? 0,
      lastLearnIndex: base?.sdict?.lastLearnIndex,
    }
  })
}

async function resolveCurrentPracticeWord() {
  let sources = await collectPracticeWordSources()
  let word = resolveInstalledPracticeWord(sources)
  if (!word && isMaskedPracticeLetterText(sources.letterText)) {
    await page.keyboard.press(sources.showWordShortcut || 'Escape')
    await page.waitForTimeout(300)
    sources = await collectPracticeWordSources()
    sources.revealedLetterText = sources.letterText
    word = resolveInstalledPracticeWord(sources)
  }
  return { word, sources }
}

function youdaoSrcFor(word, type) {
  const encoded = encodeURIComponent(word)
  return record => {
    const src = `${record.src || ''}\n${record.assignedSrc || ''}\n${record.currentSrc || ''}`
    return (
      /dict\.youdao\.com\/dictvoice/.test(src) &&
      (src.includes(`audio=${word}`) || src.includes(`audio=${encoded}`)) &&
      (type == null || src.includes(`type=${type}`))
    )
  }
}

function isEnded(record) {
  return record?.events?.some(event => event.type === 'ended' && event.duration > 0 && event.time > 0)
}

function isError(record) {
  return record?.events?.some(event => event.type === 'error')
}

async function installMediaHook() {
  await page.evaluate(() => {
    if (window.__listenHook?.originalPlay) {
      HTMLMediaElement.prototype.play = window.__listenHook.originalPlay
    }
    const original = HTMLMediaElement.prototype.play
    window.__listenHook = { originalPlay: original, records: [], errors: [] }
    const rejection = event => window.__listenHook.errors.push(String(event.reason))
    addEventListener('unhandledrejection', rejection)
    window.__listenHook.removeRejection = () => removeEventListener('unhandledrejection', rejection)
    HTMLMediaElement.prototype.play = function playHook() {
      const record = {
        src: this.src || this.currentSrc,
        assignedSrc: this.src,
        currentSrc: this.currentSrc,
        rate: this.playbackRate,
        volume: this.volume,
        events: [],
      }
      window.__listenHook.records.push(record)
      for (const name of ['playing', 'ended', 'error', 'abort']) {
        this.addEventListener(
          name,
          () => {
            record.src = this.src || this.currentSrc || record.src
            record.assignedSrc = this.src || record.assignedSrc
            record.currentSrc = this.currentSrc
            record.events.push({
              type: name,
              time: this.currentTime,
              duration: this.duration,
              error: this.error?.code ?? null,
              href: location.href,
            })
          },
          { once: true }
        )
      }
      return original.call(this)
    }
  })
}

async function uninstallMediaHook() {
  return page.evaluate(() => {
    const hook = window.__listenHook
    if (!hook) return { records: [], errors: [] }
    HTMLMediaElement.prototype.play = hook.originalPlay
    hook.removeRejection?.()
    const result = { records: hook.records, errors: hook.errors }
    delete window.__listenHook
    return result
  })
}

async function readHook() {
  return page.evaluate(() => window.__listenHook || { records: [], errors: [] })
}

async function countEnded(predicate) {
  const hook = await readHook()
  return hook.records.filter(record => predicate(record) && isEnded(record)).length
}

async function waitForNewEnded(predicate, previousCount, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const hook = await readHook()
    const ended = hook.records.filter(record => predicate(record) && isEnded(record))
    if (ended.length > previousCount) {
      return { hook, match: ended[ended.length - 1], count: ended.length }
    }
    if (hook.records.some(record => predicate(record) && isError(record))) {
      return { hook, match: hook.records.find(record => predicate(record) && isError(record)), failed: 'error' }
    }
    await page.waitForTimeout(150)
  }
  return { hook: await readHook(), failed: 'timeout' }
}

async function installTtsHook() {
  await page.evaluate(() => {
    const synth = window.speechSynthesis
    if (!synth) {
      window.__ttsHook = { spoken: [], events: [], voices: [], available: false }
      return
    }
    if (window.__ttsHook?.restore) window.__ttsHook.restore()
    const originalSpeak = synth.speak.bind(synth)
    window.__ttsHook = {
      spoken: [],
      events: [],
      available: true,
      voices: (synth.getVoices() || []).map(voice => ({ name: voice.name, lang: voice.lang })),
      restore() {
        synth.speak = originalSpeak
      },
    }
    synth.speak = function speakHook(msg) {
      window.__ttsHook.spoken.push({
        text: msg.text,
        rate: msg.rate,
        lang: msg.lang,
        at: Date.now(),
      })
      msg.addEventListener('start', () => window.__ttsHook.events.push('start'))
      msg.addEventListener('end', () => window.__ttsHook.events.push('end'))
      msg.addEventListener('error', event => window.__ttsHook.events.push(`error:${event.error || ''}`))
      return originalSpeak(msg)
    }
  })
}

async function readTtsHook() {
  return page.evaluate(() => window.__ttsHook || { spoken: [], events: [], voices: [], available: false })
}

async function uninstallTtsHook() {
  return page.evaluate(() => {
    const hook = window.__ttsHook
    hook?.restore?.()
    delete window.__ttsHook
    return hook || { spoken: [], events: [], voices: [], available: false }
  })
}

async function visibleToasts() {
  return page.evaluate(() =>
    [...document.querySelectorAll('.message-text')].map(el => (el.textContent || '').trim()).filter(Boolean)
  )
}

async function setWordVolumeIgnored(volume) {
  return page.evaluate(next => {
    const setting = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('setting')
    const previous = setting.wordSoundVolume
    setting._ignoreWatch = true
    setting.wordSoundVolume = next
    return { previous, current: setting.wordSoundVolume, ignoreWatch: setting._ignoreWatch }
  }, volume)
}

async function setSoundTypeIgnored(next) {
  return page.evaluate(value => {
    const setting = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('setting')
    const previous = setting.soundType
    setting._ignoreWatch = true
    setting.soundType = value
    return { previous, current: setting.soundType }
  }, next)
}

async function ensureSoundType(next) {
  const result = await page.evaluate(value => {
    const setting = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('setting')
    const previous = setting.soundType
    setting.soundType = value
    return { previous, current: setting.soundType }
  }, next)
  assert.equal(result.current, next, `soundType must be ${next} on the current page`)
  return result
}

async function waitForQuietYoudao(word, timeoutMs = 4000) {
  const started = Date.now()
  let last = await countEnded(youdaoSrcFor(word))
  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(250)
    const next = await countEnded(youdaoSrcFor(word))
    if (next === last) return { last, quietMs: Date.now() - started }
    last = next
  }
  return { last, quietMs: Date.now() - started }
}

function playEvent(match, type) {
  return match?.events?.find(event => event.type === type) || null
}

async function hidePanel() {
  await page.evaluate(() => {
    const setting = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('setting')
    if (setting) setting.showPanel = false
  })
}

async function openCet4Practice() {
  await page.goto(wordPracticeHref)
  await ready()
  await page.waitForTimeout(400)
  report.wordPracticeAfterGoto = page.url()
  assert.match(
    report.wordPracticeAfterGoto,
    /\/practice-words\/1(?:\?|$)/,
    'CET-4 must stay on a practice task; leftover-complete backup-custom is not the listen path'
  )
  await page.waitForSelector('.typing-word .letter, .typing-word', { timeout: 15000 })
  await hidePanel()
  const resolved = await resolveCurrentPracticeWord()
  const word = resolved.word
  assert.ok(word, `Expected a CET-4 session word, got ${JSON.stringify(resolved.sources.letterText)}`)
  assert.notEqual(word.replace(/[_ \u00a0]/g, ''), '', 'Refusing masked practice letters')
  assert.ok(!isMaskedPracticeLetterText(word), 'Refusing leftover mask _______ as the listen word')
  assert.notEqual(word, '_______')
  assert.ok(
    String(resolved.sources.dictId) === String(OFFICIAL_T01_BUILTIN_WORD_BOOK.id) ||
      resolved.sources.dictEnName === OFFICIAL_T01_BUILTIN_WORD_BOOK.enName
  )
  assert.ok((resolved.sources.wordCount || 0) >= OFFICIAL_T01_BUILTIN_WORD_BOOK.length)
  return resolved
}

async function clickSpeaker() {
  const speaker = page.locator('.typing-word .icon-wrapper').first()
  assert.equal(await speaker.count(), 1)
  await speaker.click()
}

try {
  await page.goto('http://tauri.localhost/setting?index=5')
  await ready()
  report.before = await snapshotSound()
  if (report.before.soundType !== 'us') {
    report.restoredPollutedSoundType = report.before.soundType
    await page.evaluate(() => {
      const setting = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia._s.get('setting')
      setting.soundType = 'us'
    })
    await page.waitForTimeout(200)
    report.before = await snapshotSound()
  }
  report.beforeLeftover = await snapshotLeftover()
  assert.equal(report.before.origin, 'http://tauri.localhost')
  assert.equal(report.before.wordSound, true)
  assert.equal(report.before.soundType, 'us')
  assertLeftover(report.beforeLeftover, 'before')

  const resolved = await openCet4Practice()
  report.wordSources = resolved.sources
  const word = resolved.word
  report.word = word
  report.storedWordVolume = report.before.wordSoundVolume
  report.elementVolumeIfUnchanged = report.storedWordVolume / 100

  await installMediaHook()
  const volumeChange = await setWordVolumeIgnored(37)
  report.temporaryHearableVolume = volumeChange
  assert.equal(volumeChange.current, 37)
  report.usSoundType = await ensureSoundType('us')
  report.usQuiet = await waitForQuietYoudao(word)

  const usBefore = await countEnded(youdaoSrcFor(word, 2))
  await clickSpeaker()
  const wordPlay = await waitForNewEnded(youdaoSrcFor(word, 2), usBefore)
  report.wordPlay = wordPlay
  report.wordPlayTiming = {
    playing: playEvent(wordPlay.match, 'playing'),
    ended: playEvent(wordPlay.match, 'ended'),
  }
  assert.notEqual(wordPlay.failed, 'error', 'Youdao US word audio reported a media error')
  assert.notEqual(wordPlay.failed, 'timeout', 'Youdao US word audio did not reach ended')
  assert.match(wordPlay.match.assignedSrc || wordPlay.match.src, /type=2/)
  assert.ok(wordPlay.match.events.some(event => event.type === 'playing'))
  assert.ok(wordPlay.match.volume > 0.2, `expected hearable element volume, got ${wordPlay.match.volume}`)
  assert.ok(
    report.requests.some(
      url => /dict\.youdao\.com\/dictvoice/.test(url) && url.includes(`audio=${word}`) && /type=2/.test(url)
    ),
    'expected a real Youdao dictvoice request for the CET-4 session word US type=2'
  )
  assert.ok(
    report.youdaoResponses.some(
      item => item.url.includes(`audio=${word}`) && /type=2/.test(item.url) && item.status >= 200 && item.status < 400
    ),
    'US Youdao HTTPS must complete, not be cancelled'
  )
  report.cells.usYoudao = {
    status: 'passed',
    src: wordPlay.match.src,
    duration: playEvent(wordPlay.match, 'ended')?.duration ?? null,
    volume: wordPlay.match.volume,
  }

  const ukChange = await ensureSoundType('uk')
  report.ukSoundType = ukChange
  assert.equal(ukChange.current, 'uk')
  report.ukQuiet = await waitForQuietYoudao(word)
  const ukBefore = await countEnded(youdaoSrcFor(word, 1))
  await clickSpeaker()
  const ukPlay = await waitForNewEnded(youdaoSrcFor(word, 1), ukBefore)
  report.ukPlay = ukPlay
  report.ukPlayTiming = {
    playing: playEvent(ukPlay.match, 'playing'),
    ended: playEvent(ukPlay.match, 'ended'),
  }
  assert.notEqual(ukPlay.failed, 'error', 'Youdao UK word audio reported a media error')
  assert.notEqual(ukPlay.failed, 'timeout', 'Youdao UK word audio did not reach ended')
  assert.match(ukPlay.match.assignedSrc || ukPlay.match.src, /type=1/)
  assert.ok(ukPlay.match.events.some(event => event.type === 'playing'))
  assert.ok(
    report.requests.some(
      url => /dict\.youdao\.com\/dictvoice/.test(url) && url.includes(`audio=${word}`) && /type=1/.test(url)
    ),
    'expected a real Youdao dictvoice request for the CET-4 session word UK type=1'
  )
  assert.ok(
    report.youdaoResponses.some(
      item => item.url.includes(`audio=${word}`) && /type=1/.test(item.url) && item.status >= 200 && item.status < 400
    ),
    'UK Youdao HTTPS must complete, not be cancelled'
  )
  const restoredType = await ensureSoundType('us')
  report.restoredSoundType = restoredType.current
  assert.equal(restoredType.current, 'us')
  report.cells.ukYoudao = {
    status: 'passed',
    src: ukPlay.match.src,
    duration: playEvent(ukPlay.match, 'ended')?.duration ?? null,
  }

  const consecutive = []
  let previousEnded = await countEnded(youdaoSrcFor(word, 2))
  const leftoverBefore20 = await snapshotLeftover()
  for (let index = 1; index <= 20; index++) {
    const started = Date.now()
    await clickSpeaker()
    const play = await waitForNewEnded(youdaoSrcFor(word, 2), previousEnded, 15000)
    assert.notEqual(play.failed, 'error', `consecutive play ${index} reported a media error`)
    assert.notEqual(play.failed, 'timeout', `consecutive play ${index} did not reach ended`)
    assert.ok(play.match.events.some(event => event.type === 'playing'))
    previousEnded = play.count
    consecutive.push({
      index,
      src: play.match.src,
      rate: play.match.rate,
      duration: playEvent(play.match, 'ended')?.duration ?? null,
      elapsedMs: Date.now() - started,
    })
  }
  const leftoverAfter20 = await snapshotLeftover()
  const wordAfter20 = await resolveCurrentPracticeWord()
  assert.equal(wordAfter20.word, word, '20 consecutive plays must not 误切词')
  assert.equal(
    leftoverAfter20.cet4LastLearnIndex,
    leftoverBefore20.cet4LastLearnIndex,
    '20 plays must not advance CET-4 lastLearnIndex'
  )
  assertLeftover(leftoverAfter20, 'after-20')
  report.consecutive20 = consecutive
  report.cells.consecutive20 = {
    status: 'passed',
    count: consecutive.length,
    word: wordAfter20.word,
    lastLearnIndex: leftoverAfter20.cet4LastLearnIndex,
    maxElapsedMs: Math.max(...consecutive.map(item => item.elapsedMs)),
  }

  const leftoverBeforeCancel = await snapshotLeftover()
  const wordBeforeCancel = await resolveCurrentPracticeWord()
  const cancelHrefBefore = page.url()
  const endedBeforeCancel = await countEnded(youdaoSrcFor(word, 2))
  await clickSpeaker()
  await page.waitForTimeout(120)
  const hookDuringCancel = await readHook()
  const startedBeforeNavigate = hookDuringCancel.records.some(
    record =>
      youdaoSrcFor(word, 2)(record) && record.events.some(event => event.type === 'playing' || event.type === 'ended')
  )
  await page.goto('http://tauri.localhost/setting?index=5')
  await ready()
  const cancelHrefAfter = page.url()
  await page.waitForTimeout(2500)
  const leftoverAfterCancel = await snapshotLeftover()
  const lateEnded = (await readHook()).records.filter(record => youdaoSrcFor(word, 2)(record) && isEnded(record))
  const lateEndedAfterNavigate = lateEnded.filter(record =>
    record.events.some(event => event.type === 'ended' && /\/setting/.test(event.href || ''))
  )
  assert.match(cancelHrefAfter, /\/setting/)
  assert.notEqual(cancelHrefAfter, cancelHrefBefore)
  assert.equal(
    leftoverAfterCancel.cet4LastLearnIndex,
    leftoverBeforeCancel.cet4LastLearnIndex,
    'page cancel must not 误切词 via lastLearnIndex'
  )
  assertLeftover(leftoverAfterCancel, 'after-page-cancel')
  const backAfterCancel = await openCet4Practice()
  assert.equal(backAfterCancel.word, wordBeforeCancel.word, 'page cancel must not 误切词')
  assert.equal(backAfterCancel.sources.lastLearnIndex, leftoverBeforeCancel.cet4LastLearnIndex)
  report.pageCancel = {
    hrefBefore: cancelHrefBefore,
    hrefAfter: cancelHrefAfter,
    startedBeforeNavigate,
    endedBeforeCancel,
    lateEndedAfterNavigate: lateEndedAfterNavigate.length,
    wordBefore: wordBeforeCancel.word,
    wordAfter: backAfterCancel.word,
    lastLearnIndex: leftoverAfterCancel.cet4LastLearnIndex,
  }
  report.cells.pageCancel = {
    status: 'passed',
    wordUnchanged: backAfterCancel.word === wordBeforeCancel.word,
    lastLearnIndexUnchanged: leftoverAfterCancel.cet4LastLearnIndex === leftoverBeforeCancel.cet4LastLearnIndex,
    lateEndedAfterNavigate: lateEndedAfterNavigate.length,
  }

  await page.goto('http://tauri.localhost/practice-articles/backup-articles')
  await ready()
  await page.waitForSelector('.play-button', { timeout: 15000 })
  await installMediaHook()
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio')
    return audio && /^blob:/.test(audio.currentSrc || audio.src)
  })
  const articleBefore = await page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const base = pinia._s.get('base')
    const audio = document.querySelector('audio')
    return {
      bookId: base.sbook?.id,
      bookName: base.sbook?.name,
      title: base.sbook?.articles?.[0]?.title || '',
      audioFileId: base.sbook?.articles?.[0]?.audioFileId || '',
      src: audio?.currentSrc || audio?.src || '',
      rate: audio?.playbackRate,
    }
  })
  report.article = articleBefore
  assert.equal(articleBefore.bookId, 'backup-articles')
  assert.equal(articleBefore.audioFileId, 'backup-tone')
  assert.match(articleBefore.src, /^blob:/)
  const playButton = page.locator('.play-button').first()
  await playButton.scrollIntoViewIfNeeded()
  await page.waitForFunction(() => {
    const button = document.querySelector('.play-button')
    const audio = document.querySelector('audio')
    return (
      button &&
      audio &&
      button.getAttribute('aria-label') === '播放' &&
      audio.paused &&
      /^blob:/.test(audio.currentSrc || audio.src)
    )
  })
  const blobBefore = await countEnded(record => /^blob:/.test(record.src))
  await playButton.click()
  const articlePlay = await waitForNewEnded(record => /^blob:/.test(record.src), blobBefore)
  report.articlePlay = articlePlay
  report.articlePlayTiming = {
    playing: playEvent(articlePlay.match, 'playing'),
    ended: playEvent(articlePlay.match, 'ended'),
  }
  assert.notEqual(articlePlay.failed, 'error', 'Custom article audio reported a media error')
  assert.notEqual(articlePlay.failed, 'timeout', 'Custom article audio did not reach ended')
  assert.ok(articlePlay.match.events.some(event => event.type === 'playing'))
  assert.ok(articlePlay.match.volume > 0.5)
  assert.equal(Number(articlePlay.match.rate), 1.25, 'custom leftover 倍速 must stay 1.25')
  report.cells.playbackRate = {
    status: 'passed',
    articleRate: articlePlay.match.rate,
    duration: playEvent(articlePlay.match, 'ended')?.duration ?? null,
  }

  const ttsResolved = await openCet4Practice()
  assert.equal(ttsResolved.word, word)
  await installMediaHook()
  await installTtsHook()
  const youdaoFilter = /dict\.youdao\.com\/dictvoice/i
  await page.route(youdaoFilter, route =>
    route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: youdaoInterceptBody,
    })
  )
  const ttsStarted = Date.now()
  const mediaBeforeTts = (await readHook()).records.length
  await clickSpeaker()
  let ttsResult = { spoken: [], events: [], toasts: [], failed: 'timeout' }
  const ttsDeadline = Date.now() + 12000
  while (Date.now() < ttsDeadline) {
    const tts = await readTtsHook()
    const toasts = await visibleToasts()
    const hook = await readHook()
    const newRecords = hook.records.slice(mediaBeforeTts)
    const fallbackToast = toasts.some(text => /暂无可用语音|请继续手动练习/.test(text))
    if (tts.spoken.length || tts.events.includes('start') || fallbackToast) {
      ttsResult = {
        spoken: tts.spoken,
        events: tts.events,
        voices: tts.voices,
        available: tts.available,
        toasts,
        newRecords,
        failed: null,
        elapsedMs: Date.now() - ttsStarted,
      }
      break
    }
    if (newRecords.some(isError) && Date.now() - ttsStarted > 2000 && !tts.spoken.length && !fallbackToast) {
      ttsResult = {
        spoken: tts.spoken,
        events: tts.events,
        voices: tts.voices,
        available: tts.available,
        toasts,
        newRecords,
        failed: 'no-fallback',
        elapsedMs: Date.now() - ttsStarted,
      }
      break
    }
    await page.waitForTimeout(150)
  }
  await page.unroute(youdaoFilter)
  report.ttsFallback = ttsResult
  assert.notEqual(ttsResult.failed, 'timeout', 'Youdao failure fallback hung waiting')
  assert.notEqual(ttsResult.failed, 'no-fallback', 'Youdao failure did not enter TTS/fallback and did not settle')
  assert.ok(ttsResult.elapsedMs <= 12000, `fallback hung: ${ttsResult.elapsedMs}ms`)
  assert.ok(
    ttsResult.spoken.length > 0 || ttsResult.toasts.some(text => /暂无可用语音|请继续手动练习/.test(text)),
    'expected TTS speak or an explicit no-voice settle after Youdao failure'
  )
  assert.ok(
    report.youdaoResponses.some(item => item.url.includes(`audio=${word}`) && item.status === 404),
    'Youdao failure must be a fulfilled 404 intercept, not a host network disable'
  )
  const leftoverAfterTts = await snapshotLeftover()
  const wordAfterTts = await resolveCurrentPracticeWord()
  assert.equal(wordAfterTts.word, word, 'TTS fallback must not 误切词')
  assertLeftover(leftoverAfterTts, 'after-tts')
  report.cells.ttsFallback = {
    status: 'passed',
    spoken: ttsResult.spoken.length,
    toasts: ttsResult.toasts,
    elapsedMs: ttsResult.elapsedMs,
    interceptStatus: 404,
    word: wordAfterTts.word,
  }

  const hook = await uninstallMediaHook()
  report.hookErrors = hook.errors
  const ttsHook = await uninstallTtsHook()
  report.ttsHookFinal = { spoken: ttsHook.spoken, events: ttsHook.events, voices: ttsHook.voices }
  const restored = await setWordVolumeIgnored(report.storedWordVolume)
  report.restoredWordVolume = restored.current
  assert.equal(restored.current, report.storedWordVolume)
  await ensureSoundType('us')

  await page.goto('http://tauri.localhost/setting?index=5')
  await ready()
  report.after = await snapshotSound()
  report.afterLeftover = await snapshotLeftover()
  assert.equal(report.after.wordSoundVolume, report.storedWordVolume)
  assert.equal(report.after.soundType, 'us')
  assert.equal(
    Number(articlePlay.match.volume.toFixed(2)),
    Number((report.after.articleSoundVolume / 100).toFixed(2)),
    'custom article element volume must match stored articleSoundVolume'
  )
  assertLeftover(report.afterLeftover, 'after')
  report.articleVolumeError = report.errors.filter(message =>
    /Cannot set properties of undefined \(setting 'volume'\)/.test(message)
  )
  assert.deepEqual(report.articleVolumeError, [], 'initAudio must not set volume on an unmounted custom-audio player')
  assert.deepEqual(report.errors, [])
  assert.deepEqual(report.hookErrors, [])
  assert.equal(report.humanListenClaim, false)
  await page.screenshot({ path: resolve(evidence, 'native-listen-audio.png') })
  report.passed = true
  console.log(
    `PASS: T05 machine cells on leftover dest CET-4 ${word} US+UK ended, 20 plays, page-cancel no 误切词, TTS fulfill-404 fallback, custom 1.25; no human-ear claim`
  )
} finally {
  try {
    await page.unroute(/dict\.youdao\.com\/dictvoice/i)
  } catch {}
  try {
    await uninstallTtsHook()
  } catch {}
  try {
    await uninstallMediaHook()
  } catch {}
  writeFileSync(resolve(evidence, 'native-listen-audio.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
