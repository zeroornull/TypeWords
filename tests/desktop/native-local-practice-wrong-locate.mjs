// Official T01 错词 + 文章定位 on an isolated dest.
// Not a count-only substitute for the V075 20-word / 5-sentence matrix.
// Not part of the default Node suite. Does not use the default identifier dir.
// Official T01/T03 dest-runner honesty:
// Leftover dest SHA 99948E67 is pre-fix. Old dest lacks leftover id-match /
// lastLearnIndex keep source fixes (V102/V104). Do not claim dest-green
// for leftover id-match / lastLearnIndex keep on SHA 99948E67.
// complete-20 → /words is official empty-task, not leftover-20 dest-green.
// Do not treat old dest list-page navigation (/words /dict /articles)
// as leftover-20 proof.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
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
  OFFICIAL_T01_PRACTICE_TYPE,
  OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM,
  uniqueNonEmptyWords,
} from './native-local-practice-matrix-spec.mjs'
import {
  OFFICIAL_T01_ARTICLE_CACHE_KEY,
  OFFICIAL_T01_PLAN_PASS,
  OFFICIAL_T01_PLAN_SCENE,
  OFFICIAL_T01_WRONG_BOOK,
  OFFICIAL_T01_WRONG_CLEAR_TOAST,
  articleCursorsEqual,
  isDomMidArticle,
  isMidArticlePosition,
  isOfficialWrongBook,
  isOriginArticleCursor,
  parseArticleCachePosition,
  sessionHasWrongWord,
  sessionWrongWordKeys,
  wrongBookHasWord,
  wrongBookWords,
  wrongLetterForWord,
} from './native-local-practice-wrong-locate-spec.mjs'

const evidence = resolve(process.argv[2] || '')
assert.ok(process.argv[2], 'Supply an evidence directory with an isolated launch.json')
const launch = JSON.parse(readFileSync(resolve(evidence, 'launch.json'), 'utf8').replace(/^\uFEFF/, ''))
assert.equal(resolve(launch.profile), resolve(evidence, 'isolated-profile'))
assert.equal(createHash('sha256').update(readFileSync(launch.exe)).digest('hex'), launch.sha256.toLowerCase())
assert.ok(process.env.TYPEWORDS_PLAYWRIGHT_MODULE, 'Set TYPEWORDS_PLAYWRIGHT_MODULE')
assert.doesNotMatch(resolve(launch.profile), /io\.github\.zyronon\.typewords$/i)

const { chromium } = await import(pathToFileURL(process.env.TYPEWORDS_PLAYWRIGHT_MODULE).href)
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${launch.port}`)
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().startsWith('http://tauri.localhost'))
assert.ok(page, 'Expected a production Tauri page')

const report = {
  sha256: launch.sha256,
  productVersion: launch.productVersion,
  pid: launch.pid,
  port: launch.port,
  plan: {
    scene: OFFICIAL_T01_PLAN_SCENE,
    pass: OFFICIAL_T01_PLAN_PASS,
    note: 'This runner is 错词 + 文章定位, not a count-only 20/5 rematrix.',
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
  report.external.push(route.request().url())
  return route.abort()
})

const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms))

function pushVueNode(stack, node) {
  if (!node) return
  if (Array.isArray(node)) {
    for (const item of node) pushVueNode(stack, item)
    return
  }
  if (node.component) stack.push(node.component)
  if (node.children && node.children !== node) pushVueNode(stack, node.children)
}

async function focusPractice() {
  await page.bringToFront().catch(() => {})
  const box = await page.locator('.typing-word, #PracticeArea, .typing-article').first()
  if ((await box.count()) > 0) {
    await box.click({ force: true }).catch(() => {})
  }
  await page.evaluate(() => {
    const input = document.querySelector('#typing-listener')
    if (input && typeof input.focus === 'function') input.focus()
  })
  await pause(250)
}

async function ready() {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => {
      const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
      return !!(pinia?._s.get('base')?.load && pinia?._s.get('setting')?.load)
    })
    if (ok) return
    await pause(150)
  }
  throw new Error('Pinia did not become ready')
}

async function dismissOverlays() {
  await page.evaluate(() => {
    localStorage.setItem('showConflictNotice', '1')
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    const setting = pinia?._s.get('setting')
    if (setting) {
      setting.showUsageTips = false
      setting.showPanel = false
    }
  })
  const collected = page.getByText('我已收藏', { exact: true })
  if ((await collected.count()) > 0) {
    await collected.first().click()
    await pause(200)
    const closer = page.locator('.CollectNotice .close-wrapper, .CollectNotice [title=关闭]').first()
    if (await closer.count()) await closer.click().catch(() => {})
  }
  await pause(200)
}

async function hidePanel() {
  await page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const setting = pinia._s.get('setting')
    if (setting) setting.showPanel = false
  })
  await pause(200)
}

async function snapshotState() {
  return page.evaluate(async () => {
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    const keys = [
      'typing-word-dict',
      'typing-word-setting',
      'PracticeSaveWord',
      'PracticeSaveArticle',
      'typing-word-files',
    ]
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
    const files = disk['typing-word-files'] || []
    let audioBytes = 0
    if (files[0]?.file) audioBytes = (await files[0].file.arrayBuffer()).byteLength
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const base = pinia._s.get('base')
    const setting = pinia._s.get('setting')
    const custom = (base.word?.bookList || []).find(book => book.id === 'backup-custom')
    const articles = (base.article?.bookList || []).find(book => book.id === 'backup-articles')
    const cet4 = (base.word?.bookList || []).find(book => String(book.id) === '1' || book.enName === 'cet4')
    const nce1 = (base.article?.bookList || []).find(book => String(book.id) === '246' || book.enName === 'nce1')
    const wrong = (base.word?.bookList || []).find(
      book => String(book.id) === 'wordWrong' || book.enName === 'wordWrong'
    )
    const parseRecord = raw => {
      if (raw == null) return null
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    }
    const wordCache = parseRecord(disk.PracticeSaveWord)
    const wordVal = wordCache?.val || wordCache
    const articleCache = parseRecord(disk.PracticeSaveArticle)
    const articleVal = articleCache?.val || articleCache
    const dictRecord = parseRecord(disk['typing-word-dict'])
    const dictVal = dictRecord?.val || dictRecord
    const diskWrong = (dictVal?.word?.bookList || []).find(
      book => String(book.id) === 'wordWrong' || book.enName === 'wordWrong'
    )
    return {
      href: location.href,
      volume: setting.wordSoundVolume,
      translate: setting.translate,
      wordPracticeMode: setting.wordPracticeMode,
      note: base.noteData?.fixture,
      fiveKeys: keys.filter(key => disk[key] != null),
      audioIds: files.map(item => item.id),
      audioBytes,
      customWords: (custom?.words || []).map(item => item.word),
      customLastLearnIndex: custom?.lastLearnIndex,
      articleText: articles?.articles?.[0]?.text || '',
      articleAudioId: articles?.articles?.[0]?.audioFileId,
      inputWordNumber: pinia._s.get('practice')?.inputWordNumber ?? null,
      cet4: {
        id: cet4?.id,
        enName: cet4?.enName,
        custom: cet4?.custom,
        wordCount: cet4?.words?.length ?? 0,
        lastLearnIndex: cet4?.lastLearnIndex,
        perDay: cet4?.perDayStudyNumber,
        complete: cet4?.complete,
      },
      nce1: {
        id: nce1?.id,
        enName: nce1?.enName,
        custom: nce1?.custom,
        articleCount: nce1?.articles?.length ?? 0,
        lastLearnIndex: nce1?.lastLearnIndex,
        firstTitle: nce1?.articles?.[0]?.title || '',
      },
      wrongBook: {
        id: wrong?.id,
        enName: wrong?.enName,
        name: wrong?.name,
        words: (wrong?.words || []).map(item => item.word),
        length: wrong?.length ?? wrong?.words?.length ?? 0,
      },
      diskWrongBook: {
        id: diskWrong?.id,
        words: (diskWrong?.words || []).map(item => item.word || item),
        length: diskWrong?.length ?? diskWrong?.words?.length ?? 0,
      },
      sessionWrongWords: wordVal?.practiceData?.wrongWordsStr || [],
      sessionAllWrongWords: wordVal?.practiceData?.allWrongWords || [],
      articleCache: articleVal?.practiceData || null,
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
    let allWrong = []
    let cursor = null
    let currentSessionWord = ''
    let sessionWordCount = 0
    while (stack.length) {
      const inst = stack.pop()
      if (!inst || seen.has(inst)) continue
      seen.add(inst)
      const raw = inst.provides?.practiceData
      const data = raw?.wrongWords || raw?.words ? raw : raw?.value
      if (data?.wrongWords) practiceWrong = data.wrongWords.map(item => item.word || item)
      if (data?.allWrongWords) allWrong = [...data.allWrongWords]
      if (data?.words) {
        sessionWordCount = data.words.length
        currentSessionWord = data.words[data.index]?.word || ''
      }
      const liveCursor = inst.setupState?.activeCursor
      if (!cursor && liveCursor) cursor = liveCursor.value ?? liveCursor
      if (inst.subTree?.component) stack.push(inst.subTree.component)
      pushChild(inst.subTree?.children)
    }
    const bodyText = document.body?.innerText || ''
    return {
      href: location.href,
      wrongBook: {
        id: wrong?.id,
        name: wrong?.name,
        words: (wrong?.words || []).map(item => item.word),
      },
      sessionWrongWords: practiceWrong,
      allWrongWords: allWrong,
      currentSessionWord,
      sessionWordCount,
      cursor,
      toast: bodyText.includes('还有错词，继续巩固一下吧'),
      statistics: !!document.querySelector('.statistics') || bodyText.includes('今日任务完成'),
      footerWrong: document.querySelector('.color-red')?.textContent?.trim() || '',
      wrongDom: document.querySelector('.typing-word .wrong')?.textContent || '',
      inputDom: document.querySelector('.typing-word .input')?.textContent || '',
      listenerFocused: document.activeElement?.id === 'typing-listener',
    }
  })
}

async function collectPracticeWordSources() {
  return page.evaluate(async () => {
    const letterText = document.querySelector('.typing-word .letter')?.textContent?.trim() || ''
    const bodyText = document.body?.innerText || ''
    let propWord = ''
    let providedWord = ''
    let practiceType = null
    let cursorFromVue = null
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
      const word = inst.props?.word
      if (!propWord && typeof word?.word === 'string') propWord = word.word
      if (typeof inst.props?.practiceType === 'number' && inst.props?.word) {
        practiceType = inst.props.practiceType
      }
      const liveCursor = inst.setupState?.activeCursor
      if (!cursorFromVue && liveCursor) cursorFromVue = liveCursor.value ?? liveCursor
      const raw = inst.provides?.practiceData
      const data = raw?.wrongWords || raw?.words ? raw : raw?.value
      if (!providedWord && data?.words?.[data.index]?.word) providedWord = data.words[data.index].word
      if (inst.subTree?.component) stack.push(inst.subTree.component)
      pushChild(inst.subTree?.children)
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
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    const setting = pinia?._s.get('setting')
    const base = pinia?._s.get('base')
    return {
      letterText,
      propWord,
      providedWord,
      cacheWord,
      practiceType,
      cursor: cursorFromVue,
      showWordShortcut: setting?.shortcutKeyMap?.ShowWord || 'Escape',
      inputWordNumber: pinia?._s.get('practice')?.inputWordNumber ?? null,
      wordPracticeMode: setting?.wordPracticeMode,
      dictId: base?.sdict?.id,
      dictName: base?.sdict?.name,
      dictEnName: base?.sdict?.enName,
      custom: base?.sdict?.custom,
      wordCount: base?.sdict?.words?.length ?? 0,
      lastLearnIndex: base?.sdict?.lastLearnIndex,
      statistics: !!document.querySelector('.statistics') || bodyText.includes('今日任务完成'),
      completeText: bodyText.includes('今日任务完成'),
      hasTyping: !!document.querySelector('.typing-word'),
      missToast: bodyText.includes('词库资源无法加载') || bodyText.includes('没有单词可学习！'),
      wrongClearToast: bodyText.includes('还有错词，继续巩固一下吧'),
      href: location.href,
    }
  })
}

async function resolveCurrentPracticeWord() {
  let sources = await collectPracticeWordSources()
  if (sources.statistics || sources.completeText) return { word: '', sources }
  let word = resolveInstalledPracticeWord(sources)
  if (!word && isMaskedPracticeLetterText(sources.letterText)) {
    await page.keyboard.press(sources.showWordShortcut || 'Escape')
    await pause(300)
    sources = await collectPracticeWordSources()
    sources.revealedLetterText = sources.letterText
    word = resolveInstalledPracticeWord(sources)
  }
  assert.ok(word, `Expected a practice word, got ${JSON.stringify(sources.letterText)}`)
  assert.notEqual(word.replace(/[_ \u00a0]/g, ''), '', 'Refusing masked practice letters')
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
    const domSentences = [...document.querySelectorAll('.typing-article .sentence')].map(node =>
      (node.innerText || '').replace(/\s+/g, ' ').trim()
    )
    const currentDom = document.querySelector('.typing-article .word:not(.wrote)')
    const wroteCount = document.querySelectorAll('.typing-article .word.wrote').length
    return {
      cursor,
      word: token?.word || currentDom?.textContent?.trim() || '',
      type: token?.type,
      nextSpace: token?.nextSpace,
      sentenceText: sentence?.text || domSentences[cursor?.sentenceIndex || 0] || '',
      title: article?.title || '',
      articleId: article?.id,
      sectionCount: article?.sections?.length || document.querySelectorAll('.typing-article .section').length,
      sentenceCount:
        article?.sections?.reduce((count, section) => count + (section?.length || 0), 0) || domSentences.length,
      wroteCount,
      finishedDomSentences: [...document.querySelectorAll('.typing-article .sentence')].filter(node => {
        const words = [...node.querySelectorAll('.word')]
        return words.length > 0 && words.every(word => word.classList.contains('wrote'))
      }).length,
      isEnd: cursor ? !article?.sections?.[cursor.sectionIndex]?.[cursor.sentenceIndex] : !currentDom && wroteCount > 0,
    }
  })
}

async function probeBuiltinResources() {
  return page.evaluate(async () => {
    async function probe(url) {
      try {
        const response = await fetch(url)
        if (!response.ok) return { url, ok: false, status: response.status, count: 0 }
        const data = await response.json()
        const first = Array.isArray(data) ? data[0] : null
        return {
          url,
          ok: true,
          status: response.status,
          count: Array.isArray(data) ? data.length : 0,
          first: first?.name || first?.title || first?.word || first?.enName || null,
        }
      } catch (error) {
        return { url, ok: false, status: 0, error: String(error?.message || error) }
      }
    }
    return {
      wordList: await probe('/list/word.json'),
      cet4: await probe('/dicts/en/word/CET4_T.json'),
      articleList: await probe('/list/article.json'),
      nce1: await probe('/dicts/en/article/NCE_1.json'),
    }
  })
}

async function prepareWrongWordSession() {
  return page.evaluate(async () => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    const setting = pinia._s.get('setting')
    const base = pinia._s.get('base')
    setting.wordPracticeMode = 0
    setting.practiceSentence = false
    setting.autoNextWord = false
    setting.autoAddRandomReviewWhenNoDue = false
    setting.showUsageTips = false
    setting.showPanel = false
    let lastLearnIndex = 20
    for (const book of base.word?.bookList || []) {
      const ids = [book.id, book.enName, book.en_name].map(value => String(value ?? ''))
      if (ids.includes('1') || ids.includes('cet4')) {
        lastLearnIndex = Number(book.lastLearnIndex || 0)
        book.complete = false
        book.perDayStudyNumber = lastLearnIndex + 1
      }
    }
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    const readKey = key =>
      new Promise((resolveKey, reject) => {
        const get = db.transaction('keyval', 'readonly').objectStore('keyval').get(key)
        get.onsuccess = () => resolveKey(get.result ?? null)
        get.onerror = () => reject(get.error)
      })
    const writeKey = (key, value) =>
      new Promise((resolveKey, reject) => {
        const put = db.transaction('keyval', 'readwrite').objectStore('keyval').put(value, key)
        put.onsuccess = () => resolveKey()
        put.onerror = () => reject(put.error)
      })
    const deleteKey = key =>
      new Promise((resolveKey, reject) => {
        const del = db.transaction('keyval', 'readwrite').objectStore('keyval').delete(key)
        del.onsuccess = () => resolveKey()
        del.onerror = () => reject(del.error)
      })
    const parseRecord = raw => {
      if (raw == null) return null
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    }
    const settingRecord = parseRecord(await readKey('typing-word-setting'))
    if (settingRecord?.val) {
      settingRecord.val.wordPracticeMode = 0
      settingRecord.val.practiceSentence = false
      settingRecord.val.autoNextWord = false
      await writeKey('typing-word-setting', JSON.stringify(settingRecord))
    }
    const dictRecord = parseRecord(await readKey('typing-word-dict'))
    const dictVal = dictRecord?.val || dictRecord
    if (dictVal?.word?.bookList) {
      for (const book of dictVal.word.bookList) {
        const ids = [book.id, book.enName, book.en_name].map(value => String(value ?? ''))
        if (ids.includes('1') || ids.includes('cet4')) {
          lastLearnIndex = Number(book.lastLearnIndex || lastLearnIndex)
          book.complete = false
          book.perDayStudyNumber = lastLearnIndex + 1
        }
      }
      await writeKey(
        'typing-word-dict',
        JSON.stringify(dictRecord?.val ? dictRecord : { val: dictVal, version: dictRecord?.version })
      )
    }
    await deleteKey('PracticeSaveWord')
    db.close()
    return {
      wordPracticeMode: setting.wordPracticeMode,
      volume: setting.wordSoundVolume,
      lastLearnIndex,
      perDay: lastLearnIndex + 1,
      keptArticleCache: true,
    }
  })
}

async function openBuiltinWordPractice() {
  await page.goto('http://tauri.localhost/practice-words/1', { waitUntil: 'domcontentloaded' })
  await ready().catch(() => {})
  const deadline = Date.now() + 30000
  let last = null
  while (Date.now() < deadline) {
    last = await collectPracticeWordSources()
    if (last.missToast || /\/words\/?$/.test(new URL(last.href).pathname)) {
      return { loaded: false, ...last }
    }
    if (last.hasTyping === true) return { loaded: true, ...last }
    await pause(200)
  }
  return { loaded: false, timeout: true, ...last }
}

async function openArticlePractice(articleId) {
  // official article path: /practice-articles/246 (NCE1)
  await page.goto(`http://tauri.localhost/practice-articles/${articleId}`, {
    waitUntil: 'domcontentloaded',
  })
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
      const base = pinia?._s.get('base')
      const text = document.body?.innerText || ''
      return {
        href: location.href,
        hasArticle: !!document.querySelector('.typing-article'),
        miss: text.includes('词库资源无法加载') || text.includes('没有文章可学习！'),
        id: base?.sbook?.id,
        custom: base?.sbook?.custom,
        articleCount: base?.sbook?.articles?.length ?? 0,
        title: base?.sbook?.articles?.[0]?.title || '',
      }
    })
    if (state.hasArticle && state.articleCount > 0) return { loaded: true, source: 'nce1', ...state }
    if (state.miss || /\/articles\/?$/.test(new URL(state.href).pathname)) {
      return { loaded: false, ...state }
    }
    await pause(200)
  }
  return { loaded: false, timeout: true }
}

async function typeCurrentArticleToken(cursor) {
  const token = cursor.word
  assert.ok(token, `Expected an article token, got ${JSON.stringify(cursor)}`)
  assert.ok(!/^[_ \u00a0]+$/.test(token), 'Refusing masked article letters')
  const isSymbolOrNumber = cursor.type === 0 || cursor.type === 1
  if (isSymbolOrNumber) {
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
  let guard = 0
  let last = await collectArticleCursor()
  while (guard < 40) {
    guard += 1
    if (last.isEnd) break
    const before = last
    const typed = await typeCurrentArticleToken(last)
    last = await collectArticleCursor()
    if (!typed.skipped) typedWords += 1
    if (typedWords >= minAdvance && isDomMidArticle(last)) {
      return { last, typedWords, before }
    }
    if (last.finishedDomSentences >= last.sentenceCount - 1 && last.sentenceCount > 2) {
      return { last, typedWords, before, stoppedBeforeEnd: true }
    }
  }
  return { last, typedWords }
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

async function typeArticleWrongOnFreshWord(already) {
  const seen = []
  let cursor = await collectArticleCursor()
  for (let guard = 0; guard < 24; guard++) {
    seen.push({
      guard,
      cursor: cursor.cursor,
      word: cursor.word,
      type: cursor.type,
      isEnd: cursor.isEnd,
      title: cursor.title,
    })
    if (cursor.isEnd) break
    const usable =
      (cursor.type === 2 || cursor.type == null) &&
      isVisiblePracticeWord(cursor.word) &&
      !already.includes(cursor.word) &&
      !already.includes(String(cursor.word).toLowerCase()) &&
      !already.some(item => String(item).toLowerCase() === String(cursor.word).toLowerCase())
    if (usable) {
      const letter = wrongLetterForWord(cursor.word)
      await focusPractice()
      await page.keyboard.press(letter)
      const after = await waitForWrongBookWord(cursor.word)
      return {
        word: cursor.word,
        letter,
        recorded: wrongBookHasWord(after.wrongBook, cursor.word),
        cursor,
        after,
        seen,
      }
    }
    const before = `${cursor.cursor?.sectionIndex}:${cursor.cursor?.sentenceIndex}:${cursor.cursor?.wordIndex}:${cursor.word}`
    await typeCurrentArticleToken(cursor)
    cursor = await collectArticleCursor()
    const afterKey = `${cursor.cursor?.sectionIndex}:${cursor.cursor?.sentenceIndex}:${cursor.cursor?.wordIndex}:${cursor.word}`
    if (afterKey === before) {
      await focusPractice()
      await page.keyboard.press('Space')
      await pause(200)
      cursor = await collectArticleCursor()
    }
  }
  report.articleWrongProbe = seen
  throw new Error(`No unused official article word for 错词; already=${already.join(',')} seen=${JSON.stringify(seen)}`)
}

try {
  if (!page.url().includes('/setting') && !page.url().includes('/words') && !page.url().includes('/practice')) {
    await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
  }
  await ready()
  await dismissOverlays()
  report.before = await snapshotState()
  assert.equal(report.before.volume, 37)
  assert.equal(report.before.note, 'ZIP semantic round-trip')
  assert.equal(report.before.audioBytes, 2943)
  assert.ok(uniqueNonEmptyWords(report.before.customWords).length >= 20)

  report.builtinProbe = await probeBuiltinResources()
  if (report.builtinProbe.cet4?.ok !== true || (report.builtinProbe.cet4?.count || 0) < 20) {
    throw new Error(
      'Built-in CET-4 did not load from dest; not faking a built-in book from custom words. See existing miss UI evidence.'
    )
  }
  assert.ok((report.builtinProbe.nce1?.count || 0) >= 1)

  report.leftoverArticleCache = parseArticleCachePosition({ val: { practiceData: report.before.articleCache } })

  report.articleOpen = await openArticlePractice(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.id)
  if (!report.articleOpen.loaded) {
    throw new Error(
      `NCE1 article did not start; not faking from backup-articles: ${JSON.stringify(report.articleOpen)}`
    )
  }
  await ready()
  await dismissOverlays()
  await hidePanel()
  await focusPractice()
  const leftoverResume = await collectArticleCursor()
  report.articleLeftoverResume = leftoverResume
  assert.ok((leftoverResume.sentenceCount || 0) >= 2, `NCE1 article not ready: ${JSON.stringify(leftoverResume)}`)
  report.articleLeftoverMatchedCache = articleCursorsEqual(leftoverResume.cursor, report.leftoverArticleCache)

  const alreadyWrong = wrongBookWords(report.before.wrongBook)
  let articleWrong
  try {
    articleWrong = await typeArticleWrongOnFreshWord(alreadyWrong)
  } catch (error) {
    report.articleWrongFirstError = String(error && error.message ? error.message : error)
    await page.evaluate(async () => {
      const request = indexedDB.open('keyval-store')
      const db = await new Promise((resolveDb, reject) => {
        request.onsuccess = () => resolveDb(request.result)
        request.onerror = () => reject(request.error)
      })
      await new Promise((resolveKey, reject) => {
        const del = db.transaction('keyval', 'readwrite').objectStore('keyval').delete('PracticeSaveArticle')
        del.onsuccess = () => resolveKey()
        del.onerror = () => reject(del.error)
      })
      db.close()
    })
    report.articleOpen = await openArticlePractice(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.id)
    await hidePanel()
    await focusPractice()
    articleWrong = await typeArticleWrongOnFreshWord(alreadyWrong)
  }
  report.wrongWord = articleWrong.word
  report.wrongLetter = articleWrong.letter
  report.wrongSource = 'nce1-article'
  report.wrongLiveAfterType = {
    recorded: articleWrong.recorded,
    wrongBook: articleWrong.after?.wrongBook,
    cursor: articleWrong.cursor,
  }
  assert.equal(articleWrong.recorded, true, `Official article 错词 missing ${articleWrong.word}`)
  assert.ok(isOfficialWrongBook(articleWrong.after.wrongBook))
  await page.screenshot({ path: resolve(evidence, 'native-wrong-locate-wrong.png') })
  await page.keyboard.press('Backspace')
  await pause(150)

  const started = await collectArticleCursor()
  report.articleStarted = started
  const advanced = await typeUntilMidArticle(2)
  report.articleTyped = { typedWords: advanced.typedWords, last: advanced.last }
  assert.ok(advanced.typedWords >= 1, `Need to type real article words, got ${JSON.stringify(advanced)}`)
  assert.ok(
    isDomMidArticle(advanced.last),
    `文章定位 must stop mid-article, not finish: ${JSON.stringify(advanced.last)}`
  )
  await pause(1800)
  report.articleSaved = await snapshotState()
  report.articleSavedCursor = parseArticleCachePosition({ val: { practiceData: report.articleSaved.articleCache } })
  assert.ok(report.articleSavedCursor, 'PracticeSaveArticle missing after mid-article typing')
  await page.screenshot({ path: resolve(evidence, 'native-wrong-locate-article.png') })

  await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
  await ready()
  await page.goto(`http://tauri.localhost/practice-articles/${OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.id}`, {
    waitUntil: 'domcontentloaded',
  })
  await ready()
  await page.waitForSelector('.typing-article', { timeout: 20000 })
  await hidePanel()
  await pause(600)
  const resumed = await collectArticleCursor()
  report.articleResumed = resumed
  const resumedDisk = parseArticleCachePosition({ val: { practiceData: (await snapshotState()).articleCache } })
  report.articleResumedDisk = resumedDisk
  const cursorMatched = articleCursorsEqual(resumed.cursor || resumedDisk, report.articleSavedCursor)
  const domMatched =
    isDomMidArticle(resumed) &&
    Number(resumed.finishedDomSentences || 0) === Number(report.articleTyped?.last?.finishedDomSentences || -1)
  assert.ok(
    cursorMatched || domMatched,
    `文章定位 did not resume: saved=${JSON.stringify(report.articleSavedCursor)} resumed=${JSON.stringify(resumed)} disk=${JSON.stringify(resumedDisk)}`
  )
  assert.ok(!isOriginArticleCursor(report.articleSavedCursor))
  await page.screenshot({ path: resolve(evidence, 'native-wrong-locate-article-resume.png') })

  report.prepare = await prepareWrongWordSession()
  assert.equal(report.prepare.wordPracticeMode, OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM)
  assert.equal(report.prepare.volume, 37)
  await pause(800)

  report.wordOpen = await openBuiltinWordPractice()
  if (!report.wordOpen.loaded) {
    throw new Error(
      `Built-in CET-4 practice did not start; not faking from custom words: ${JSON.stringify(report.wordOpen)}`
    )
  }
  await ready()
  await page.waitForSelector('.typing-word', { timeout: 20000 })
  await dismissOverlays()
  await hidePanel()
  await focusPractice()
  const selected = await snapshotState()
  assert.equal(selected.wordPracticeMode, OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM)
  assert.equal(String(selected.cet4.id), String(OFFICIAL_T01_BUILTIN_WORD_BOOK.id))
  assert.equal(selected.cet4.custom, false)

  const cet4Word = await resolveCurrentPracticeWord()
  report.cet4WrongAttempt = {
    word: cet4Word.word,
    practiceType: cet4Word.sources.practiceType,
    dictId: cet4Word.sources.dictId,
    custom: cet4Word.sources.custom,
    lastLearnIndex: cet4Word.sources.lastLearnIndex,
  }
  assert.ok(
    cet4Word.word && !isMaskedPracticeLetterText(cet4Word.word),
    `Official CET-4 session word required, got ${JSON.stringify(cet4Word)}`
  )
  const cet4Letter = wrongLetterForWord(cet4Word.word)
  report.cet4WrongAttempt.letter = cet4Letter
  await focusPractice()
  await page.keyboard.press(cet4Letter)
  await pause(400)
  report.cet4WrongAttempt.live = await collectWrongLive()
  report.cet4WrongAttempt.recorded =
    sessionHasWrongWord(report.cet4WrongAttempt.live.sessionWrongWords, cet4Word.word) ||
    wrongBookHasWord(report.cet4WrongAttempt.live.wrongBook, cet4Word.word)
  assert.equal(report.cet4WrongAttempt.recorded, true, `Official CET-4 FollowWrite 错词 missing ${cet4Word.word}`)

  await page.goto(`http://tauri.localhost/practice-words/${OFFICIAL_T01_WRONG_BOOK.id}`, {
    waitUntil: 'domcontentloaded',
  })
  await ready().catch(() => {})
  await pause(800)
  report.wrongBookOpen = await collectWrongLive()
  const bookWords = wrongBookWords(report.wrongBookOpen.wrongBook)
  assert.ok(
    bookWords.includes(report.wrongWord),
    `错词 book review missing ${report.wrongWord}: ${JSON.stringify(bookWords)}`
  )
  report.wrongAfter = await snapshotState()
  assert.ok(wrongBookHasWord(report.wrongAfter.wrongBook, report.wrongWord))
  await page.screenshot({ path: resolve(evidence, 'native-wrong-locate-wrong-book.png') })

  report.after = await snapshotState()
  assert.equal(report.after.volume, 37)
  assert.equal(report.after.note, 'ZIP semantic round-trip')
  assert.equal(report.after.audioBytes, 2943)
  assert.ok(uniqueNonEmptyWords(report.after.customWords).length >= 20)
  assert.ok(wrongBookHasWord(report.after.wrongBook, report.wrongWord))
  assert.ok(report.after.fiveKeys.includes(OFFICIAL_T01_ARTICLE_CACHE_KEY))
  assert.deepEqual(report.errors, [])
  report.passed = true
  console.log(
    JSON.stringify(
      {
        passed: true,
        wrongWord: report.wrongWord,
        wrongLetter: report.wrongLetter,
        wrongSource: report.wrongSource,
        articleCursor: report.articleResumed?.cursor,
        articleTitle: report.articleResumed?.title,
        volume: report.after.volume,
        last: page.url(),
      },
      null,
      2
    )
  )
} finally {
  writeFileSync(resolve(evidence, 'native-wrong-locate.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
