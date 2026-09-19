// Official T01 错词 + 文章定位 on the project's own local web/dev.
// Isolated Chromium profile. Not dest. Not a production site or login.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  isMaskedPracticeLetterText,
  isVisiblePracticeWord,
  resolveInstalledPracticeWord,
} from './native-local-practice-word.mjs'
import {
  OFFICIAL_T01_BUILTIN_ARTICLE_BOOK,
  OFFICIAL_T01_BUILTIN_WORD_BOOK,
  OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM,
} from './native-local-practice-matrix-spec.mjs'
import {
  OFFICIAL_T01_ARTICLE_CACHE_KEY,
  OFFICIAL_T01_PLAN_PASS,
  OFFICIAL_T01_PLAN_SCENE,
  OFFICIAL_T01_WRONG_BOOK,
  articleCursorsEqual,
  isDomMidArticle,
  isOfficialWrongBook,
  isOriginArticleCursor,
  parseArticleCachePosition,
  sessionHasWrongWord,
  wrongBookHasWord,
  wrongBookWords,
  wrongLetterForWord,
} from './native-local-practice-wrong-locate-spec.mjs'

const evidence = resolve(process.argv[2] || '')
assert.ok(process.argv[2], 'Supply an evidence directory for web-wrong-locate.json')
assert.ok(process.env.TYPEWORDS_PLAYWRIGHT_MODULE, 'Set TYPEWORDS_PLAYWRIGHT_MODULE')
const origin = (process.env.TYPEWORDS_WEB_ORIGIN || 'http://127.0.0.1:5567').replace(/\/$/, '')
assert.match(origin, /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i)
assert.doesNotMatch(origin, /tauri\.localhost/i)

const { chromium } = await import(pathToFileURL(process.env.TYPEWORDS_PLAYWRIGHT_MODULE).href)
const browser = await chromium.launch({
  channel: process.env.TYPEWORDS_BROWSER_CHANNEL || 'msedge',
  headless: true,
})
const context = await browser.newContext()
const page = await context.newPage()
mkdirSync(evidence, { recursive: true })

const report = {
  origin,
  plan: {
    scene: OFFICIAL_T01_PLAN_SCENE,
    pass: OFFICIAL_T01_PLAN_PASS,
    note: 'Local web/dev official T01 错词 + 文章定位. Not dest and not a production login.',
    wordBook: OFFICIAL_T01_BUILTIN_WORD_BOOK,
    articleBook: OFFICIAL_T01_BUILTIN_ARTICLE_BOOK,
    wrongBook: OFFICIAL_T01_WRONG_BOOK,
  },
  errors: [],
  external: [],
  passed: false,
}
page.on('pageerror', error => report.errors.push(error.message))
await context.route(/^https:\/\//, route => {
  const url = route.request().url()
  report.external.push(url)
  if (/fonts\.gstatic\.com|fonts\.googleapis\.com/.test(url)) return route.continue()
  return route.abort()
})

const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms))

async function focusPractice() {
  const box = await page.locator('.typing-word, #PracticeArea, .typing-article').first()
  if ((await box.count()) > 0) await box.click({ force: true }).catch(() => {})
  await page.evaluate(() => document.querySelector('#typing-listener')?.focus?.())
  await pause(250)
}

async function ready() {
  const deadline = Date.now() + 45000
  let last = null
  while (Date.now() < deadline) {
    last = await page.evaluate(() => {
      const root = document.querySelector('#__nuxt')
      const pinia = root?.__vue_app__?.config.globalProperties.$pinia
      return {
        href: location.href,
        title: document.title,
        hasNuxt: !!root,
        hasApp: !!root?.__vue_app__,
        hasPinia: !!pinia,
        baseLoad: pinia?._s.get('base')?.load ?? null,
        settingLoad: pinia?._s.get('setting')?.load ?? null,
        body: (document.body?.innerText || '').slice(0, 180),
      }
    })
    if (last.baseLoad && last.settingLoad) return last
    await pause(250)
  }
  throw new Error(`Pinia did not become ready on local web/dev: ${JSON.stringify(last)}`)
}

async function dismissOverlays() {
  await page.evaluate(() => {
    localStorage.setItem('showConflictNotice', '1')
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    const setting = pinia?._s.get('setting')
    if (setting) {
      setting.showUsageTips = false
      setting.showPanel = false
      setting.conflictNotice = false
      setting.wordPracticeMode = 0
      setting.practiceSentence = false
      setting.autoNextWord = false
    }
  })
  const collected = page.getByText('我已收藏', { exact: true })
  if ((await collected.count()) > 0) {
    await collected.first().click()
    await pause(200)
  }
  const notice = page.locator('#dialog-ok')
  if ((await notice.count()) > 0) {
    await notice.first().click({ force: true }).catch(() => {})
    await pause(200)
  }
  await pause(200)
}

async function snapshotState() {
  return page.evaluate(async () => {
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    const keys = ['typing-word-dict', 'typing-word-setting', 'PracticeSaveWord', 'PracticeSaveArticle']
    const disk = {}
    try {
      const tx = db.transaction('keyval', 'readonly')
      await Promise.all(
        keys.map(
          key =>
            new Promise((resolveKey, reject) => {
              const get = tx.objectStore('keyval').get(key)
              get.onsuccess = () => {
                disk[key] = get.result ?? null
                resolveKey()
              }
              get.onerror = () => reject(get.error)
            })
        )
      )
    } finally {
      db.close()
    }
    const parseRecord = raw => {
      if (raw == null) return null
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    }
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const base = pinia._s.get('base')
    const setting = pinia._s.get('setting')
    const cet4 = (base.word?.bookList || []).find(book => String(book.id) === '1' || book.enName === 'cet4')
    const nce1 = (base.article?.bookList || []).find(book => String(book.id) === '246' || book.enName === 'nce1')
    const wrong = (base.word?.bookList || []).find(
      book => String(book.id) === 'wordWrong' || book.enName === 'wordWrong'
    )
    const wordVal = parseRecord(disk.PracticeSaveWord)
    const articleVal = parseRecord(disk.PracticeSaveArticle)
    const dictVal = parseRecord(disk['typing-word-dict'])
    const diskWrong = ((dictVal?.val || dictVal)?.word?.bookList || []).find(
      book => String(book.id) === 'wordWrong' || book.enName === 'wordWrong'
    )
    return {
      href: location.href,
      isDesktop: pinia._s.get('runtime')?.isDesktop ?? null,
      wordPracticeMode: setting.wordPracticeMode,
      translate: setting.translate,
      cet4: {
        id: cet4?.id,
        enName: cet4?.enName,
        custom: cet4?.custom,
        wordCount: cet4?.words?.length ?? 0,
        lastLearnIndex: cet4?.lastLearnIndex,
      },
      nce1: {
        id: nce1?.id,
        enName: nce1?.enName,
        custom: nce1?.custom,
        articleCount: nce1?.articles?.length ?? 0,
        firstTitle: nce1?.articles?.[0]?.title || '',
      },
      wrongBook: {
        id: wrong?.id,
        enName: wrong?.enName,
        name: wrong?.name,
        words: (wrong?.words || []).map(item => item.word),
      },
      diskWrongBook: {
        id: diskWrong?.id,
        words: (diskWrong?.words || []).map(item => item.word || item),
      },
      sessionWrongWords: (wordVal?.val || wordVal)?.practiceData?.wrongWordsStr || [],
      articleCache: (articleVal?.val || articleVal)?.practiceData || null,
    }
  })
}

async function collectWrongLive() {
  return page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    const base = pinia?._s.get('base')
    const wrong = (base?.word?.bookList || []).find(
      book => String(book.id) === 'wordWrong' || book.enName === 'wordWrong'
    )
    const seen = new Set()
    const stack = [document.querySelector('#__nuxt')?.__vue_app__?._instance]
    const pushChild = node => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach(pushChild)
        return
      }
      if (node.component) stack.push(node.component)
      if (node.children) pushChild(node.children)
    }
    let practiceWrong = []
    let currentSessionWord = ''
    let practiceType = null
    while (stack.length) {
      const inst = stack.pop()
      if (!inst || seen.has(inst)) continue
      seen.add(inst)
      if (typeof inst.props?.practiceType === 'number') practiceType = inst.props.practiceType
      const raw = inst.provides?.practiceData
      const data = raw?.wrongWords || raw?.words ? raw : raw?.value
      if (data?.wrongWords) practiceWrong = data.wrongWords.map(item => item.word || item)
      if (data?.words?.[data.index]?.word) currentSessionWord = data.words[data.index].word
      if (inst.subTree?.component) stack.push(inst.subTree.component)
      pushChild(inst.subTree?.children)
    }
    return {
      href: location.href,
      practiceType,
      currentSessionWord,
      wrongBook: { id: wrong?.id, name: wrong?.name, words: (wrong?.words || []).map(item => item.word) },
      sessionWrongWords: practiceWrong,
      wrongDom: document.querySelector('.typing-word .wrong, .typing-core .wrong')?.textContent || '',
      inputDom: document.querySelector('.typing-word .input, .typing-core .input')?.textContent || '',
    }
  })
}

async function collectPracticeWordSources() {
  return page.evaluate(() => {
    const letterText = document.querySelector('.typing-word .letter, .typing-core .letter')?.textContent?.trim() || ''
    let propWord = ''
    let providedWord = ''
    let practiceType = null
    const seen = new Set()
    const stack = [document.querySelector('#__nuxt')?.__vue_app__?._instance]
    const pushChild = node => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach(pushChild)
        return
      }
      if (node.component) stack.push(node.component)
      if (node.children) pushChild(node.children)
    }
    while (stack.length) {
      const inst = stack.pop()
      if (!inst || seen.has(inst)) continue
      seen.add(inst)
      if (!propWord && typeof inst.props?.word?.word === 'string') propWord = inst.props.word.word
      if (typeof inst.props?.practiceType === 'number' && inst.props?.word) practiceType = inst.props.practiceType
      const raw = inst.provides?.practiceData
      const data = raw?.wrongWords || raw?.words ? raw : raw?.value
      if (!providedWord && data?.words?.[data.index]?.word) providedWord = data.words[data.index].word
      if (inst.subTree?.component) stack.push(inst.subTree.component)
      pushChild(inst.subTree?.children)
    }
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    const setting = pinia?._s.get('setting')
    const base = pinia?._s.get('base')
    const bodyText = document.body?.innerText || ''
    return {
      letterText,
      propWord,
      providedWord,
      practiceType,
      showWordShortcut: setting?.shortcutKeyMap?.ShowWord || 'Escape',
      wordPracticeMode: setting?.wordPracticeMode,
      dictId: base?.sdict?.id,
      dictName: base?.sdict?.name,
      custom: base?.sdict?.custom,
      wordCount: base?.sdict?.words?.length ?? 0,
      lastLearnIndex: base?.sdict?.lastLearnIndex,
      hasTyping: !!document.querySelector('.typing-word, .typing-core'),
      statistics: !!document.querySelector('.statistics') || bodyText.includes('今日任务完成'),
      missToast: bodyText.includes('词库资源无法加载') || bodyText.includes('没有单词可学习！'),
      href: location.href,
    }
  })
}

async function resolveCurrentPracticeWord() {
  let sources = await collectPracticeWordSources()
  if (sources.statistics) return { word: '', sources }
  let word = resolveInstalledPracticeWord(sources)
  if (!word && isMaskedPracticeLetterText(sources.letterText)) {
    await page.keyboard.press(sources.showWordShortcut || 'Escape')
    await pause(300)
    sources = await collectPracticeWordSources()
    sources.revealedLetterText = sources.letterText
    word = resolveInstalledPracticeWord(sources)
  }
  assert.ok(word, `Expected a practice word, got ${JSON.stringify(sources)}`)
  return { word, sources }
}

async function collectArticleCursor() {
  return page.evaluate(() => {
    const seen = new Set()
    const stack = [document.querySelector('#__nuxt')?.__vue_app__?._instance]
    const pushChild = node => {
      if (!node) return
      if (Array.isArray(node)) {
        node.forEach(pushChild)
        return
      }
      if (node.component) stack.push(node.component)
      if (node.children) pushChild(node.children)
    }
    let cursor = null
    let article = null
    while (stack.length) {
      const inst = stack.pop()
      if (!inst || seen.has(inst)) continue
      seen.add(inst)
      if (typeof inst.exposed?.getIndex === 'function' && inst.props?.article?.sections) {
        cursor = inst.exposed.getIndex()
        article = inst.props.article
      }
      if (inst.subTree?.component) stack.push(inst.subTree.component)
      pushChild(inst.subTree?.children)
    }
    const sentence = article?.sections?.[cursor?.sectionIndex]?.[cursor?.sentenceIndex]
    const token = sentence?.words?.[cursor?.wordIndex]
    const currentDom = document.querySelector('.typing-article .word:not(.wrote)')
    return {
      cursor,
      word: token?.word || currentDom?.textContent?.trim() || '',
      type: token?.type,
      nextSpace: token?.nextSpace,
      sentenceText: sentence?.text || '',
      title: article?.title || '',
      sentenceCount: article?.sections?.reduce((count, section) => count + (section?.length || 0), 0) || 0,
      wroteCount: document.querySelectorAll('.typing-article .word.wrote').length,
      finishedDomSentences: [...document.querySelectorAll('.typing-article .sentence')].filter(node => {
        const words = [...node.querySelectorAll('.word')]
        return words.length > 0 && words.every(word => word.classList.contains('wrote'))
      }).length,
      isEnd: cursor ? !article?.sections?.[cursor.sectionIndex]?.[cursor.sentenceIndex] : !currentDom,
    }
  })
}

async function waitForWrongBookWord(word, ms = 2500) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await snapshotState()
    if (wrongBookHasWord(last.wrongBook, word)) return last
    await pause(200)
  }
  return last
}

async function openPath(path) {
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' })
  await ready().catch(() => {})
  await dismissOverlays()
}

async function typeCurrentArticleToken(cursor) {
  const token = cursor.word
  assert.ok(isVisiblePracticeWord(token) || cursor.type === 0 || cursor.type === 1, JSON.stringify(cursor))
  if (cursor.type === 0 || cursor.type === 1) {
    await page.keyboard.press('Space')
    await pause(200)
    return { skipped: true, token }
  }
  await page.keyboard.type(String(token).replace(/[^A-Za-z]/g, ''), { delay: 40 })
  if (cursor.nextSpace !== false) await page.keyboard.press('Space')
  await pause(220)
  return { skipped: false, token }
}

async function typeUntilMidArticle(minAdvance = 2) {
  let typedWords = 0
  let last = await collectArticleCursor()
  for (let guard = 0; guard < 40; guard++) {
    if (last.isEnd) break
    const typed = await typeCurrentArticleToken(last)
    last = await collectArticleCursor()
    if (!typed.skipped) typedWords += 1
    if (typedWords >= minAdvance && isDomMidArticle(last)) return { last, typedWords }
  }
  return { last, typedWords }
}

async function typeArticleWrongOnFreshWord(already) {
  let cursor = await collectArticleCursor()
  for (let guard = 0; guard < 24; guard++) {
    const usable =
      (cursor.type === 2 || cursor.type == null) &&
      isVisiblePracticeWord(cursor.word) &&
      !already.some(item => String(item).toLowerCase() === String(cursor.word).toLowerCase())
    if (usable) {
      const letter = wrongLetterForWord(cursor.word)
      await hideOrFocus()
      await page.locator('.typing-article .word:not(.wrote)').first().click({ force: true }).catch(() => {})
      await page.keyboard.press(letter)
      await pause(400)
      const live = await collectWrongLive()
      const after = await waitForWrongBookWord(cursor.word, 4000)
      return {
        word: cursor.word,
        letter,
        judgment: live.wrongDom === letter || live.wrongDom.includes(letter) || after?.wrongBook?.words?.length > 0,
        recorded: wrongBookHasWord(after.wrongBook, cursor.word),
        live,
        after,
        cursor,
      }
    }
    await typeCurrentArticleToken(cursor)
    cursor = await collectArticleCursor()
  }
  throw new Error('No unused official article word for web 错词')
}

try {
  report.homeReady = await openPath('/words')
  report.home = await snapshotState()

  await openPath(`/practice-words/${OFFICIAL_T01_BUILTIN_WORD_BOOK.id}`)
  const wordDeadline = Date.now() + 30000
  let wordOpen = null
  while (Date.now() < wordDeadline) {
    wordOpen = await collectPracticeWordSources()
    if (wordOpen.hasTyping) break
    if (wordOpen.missToast || /\/words\/?$/.test(new URL(wordOpen.href).pathname)) break
    await pause(250)
  }
  report.wordOpen = wordOpen
  if (!wordOpen?.hasTyping) {
    throw new Error(`CET-4 did not start on local web: ${JSON.stringify(wordOpen)}`)
  }
  await page.waitForSelector('.typing-word, .typing-core', { timeout: 20000 })
  await hideOrFocus()
  const cet4Word = await resolveCurrentPracticeWord()
  const cet4Letter = wrongLetterForWord(cet4Word.word)
  report.cet4WrongAttempt = {
    word: cet4Word.word,
    letter: cet4Letter,
    practiceType: cet4Word.sources.practiceType,
    dictId: cet4Word.sources.dictId,
    custom: cet4Word.sources.custom,
    lastLearnIndex: cet4Word.sources.lastLearnIndex,
    wordPracticeMode: cet4Word.sources.wordPracticeMode,
  }
  await focusPractice()
  await page.keyboard.press(cet4Letter)
  await pause(400)
  report.cet4WrongAttempt.live = await collectWrongLive()
  report.cet4WrongAttempt.after = await waitForWrongBookWord(cet4Word.word)
  report.cet4WrongAttempt.judgment =
    report.cet4WrongAttempt.live.wrongDom === cet4Letter ||
    report.cet4WrongAttempt.live.wrongDom.includes(cet4Letter)
  report.cet4WrongAttempt.recorded =
    sessionHasWrongWord(report.cet4WrongAttempt.live.sessionWrongWords, cet4Word.word) ||
    wrongBookHasWord(report.cet4WrongAttempt.after.wrongBook, cet4Word.word)
  report.cet4WrongAttempt.progress = {
    lastLearnIndex: report.cet4WrongAttempt.after.cet4?.lastLearnIndex,
    href: report.cet4WrongAttempt.after.href,
  }
  await page.screenshot({ path: resolve(evidence, 'web-wrong-locate-cet4.png') })

  await openPath(`/practice-articles/${OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.id}`)
  const articleDeadline = Date.now() + 20000
  let articleOpen = null
  while (Date.now() < articleDeadline) {
    articleOpen = await page.evaluate(() => ({
      href: location.href,
      hasArticle: !!document.querySelector('.typing-article'),
      articleCount:
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia?._s.get('base')?.sbook?.articles
          ?.length ?? 0,
    }))
    if (articleOpen.hasArticle && articleOpen.articleCount > 0) break
    await pause(250)
  }
  report.articleOpen = articleOpen
  if (!articleOpen?.hasArticle) {
    throw new Error(`NCE1 did not start on local web: ${JSON.stringify(articleOpen)}`)
  }
  const articleReadyDeadline = Date.now() + 20000
  let articleReady = null
  while (Date.now() < articleReadyDeadline) {
    await hideOrFocus()
    articleReady = await collectArticleCursor()
    if (articleReady.word && (articleReady.cursor || articleReady.sentenceCount > 0 || articleReady.wroteCount >= 0)) {
      if (articleReady.word) break
    }
    await pause(250)
  }
  report.articleReady = articleReady
  await page.waitForSelector('.typing-article .word', { timeout: 20000 })
  await hideOrFocus()
  const alreadyWrong = wrongBookWords((await snapshotState()).wrongBook)
  const articleWrong = await typeArticleWrongOnFreshWord(alreadyWrong)
  report.articleWrong = articleWrong
  assert.equal(articleWrong.recorded, true, `Web article 错词 missing ${articleWrong.word}`)
  assert.ok(isOfficialWrongBook(articleWrong.after.wrongBook))
  await page.keyboard.press('Backspace')
  await pause(150)
  const advanced = await typeUntilMidArticle(2)
  report.articleTyped = { typedWords: advanced.typedWords, last: advanced.last }
  assert.ok(advanced.typedWords >= 1, `Need real article words: ${JSON.stringify(advanced)}`)
  assert.ok(isDomMidArticle(advanced.last), `Web 文章定位 must stop mid-article: ${JSON.stringify(advanced.last)}`)
  await pause(1800)
  report.articleSaved = await snapshotState()
  report.articleSavedCursor = parseArticleCachePosition({ val: { practiceData: report.articleSaved.articleCache } })
  assert.ok(report.articleSavedCursor, 'Web PracticeSaveArticle missing')
  await page.screenshot({ path: resolve(evidence, 'web-wrong-locate-article.png') })

  await openPath('/setting?index=5')
  await openPath(`/practice-articles/${OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.id}`)
  await page.waitForSelector('.typing-article', { timeout: 20000 })
  await hideOrFocus()
  await pause(600)
  const resumed = await collectArticleCursor()
  report.articleResumed = resumed
  report.articleResumedDisk = parseArticleCachePosition({ val: { practiceData: (await snapshotState()).articleCache } })
  const cursorMatched = articleCursorsEqual(resumed.cursor || report.articleResumedDisk, report.articleSavedCursor)
  const domMatched =
    isDomMidArticle(resumed) &&
    Number(resumed.finishedDomSentences || 0) === Number(report.articleTyped?.last?.finishedDomSentences || -1)
  assert.ok(
    cursorMatched || domMatched,
    `Web 文章定位 did not resume: saved=${JSON.stringify(report.articleSavedCursor)} resumed=${JSON.stringify(resumed)}`
  )
  assert.ok(!isOriginArticleCursor(report.articleSavedCursor))
  await page.screenshot({ path: resolve(evidence, 'web-wrong-locate-article-resume.png') })

  await openPath(`/practice-words/${OFFICIAL_T01_WRONG_BOOK.id}`)
  await pause(800)
  report.wrongBookOpen = await collectWrongLive()
  assert.ok(
    wrongBookWords(report.wrongBookOpen.wrongBook).includes(report.articleWrong.word),
    `Web 错词 book missing ${report.articleWrong.word}`
  )
  report.after = await snapshotState()
  report.passed = true
  console.log(
    JSON.stringify(
      {
        passed: true,
        origin,
        cet4Word: report.cet4WrongAttempt.word,
        cet4Letter: report.cet4WrongAttempt.letter,
        cet4Judgment: report.cet4WrongAttempt.judgment,
        cet4Recorded: report.cet4WrongAttempt.recorded,
        articleWrong: report.articleWrong.word,
        articleCursor: report.articleResumed?.cursor,
      },
      null,
      2
    )
  )
} finally {
  writeFileSync(resolve(evidence, 'web-wrong-locate.json'), JSON.stringify(report, null, 2))
  await browser.close()
}

async function hideOrFocus() {
  await dismissOverlays()
  await focusPractice()
}
