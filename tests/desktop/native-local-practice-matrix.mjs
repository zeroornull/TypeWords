// Official T01 matrix on an isolated dest: built-in CET-4 System 3-phase + 5 article sentences.
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
import { isMaskedPracticeLetterText, resolveInstalledPracticeWord } from './native-local-practice-word.mjs'
import {
  OFFICIAL_T01_ARTICLE_SENTENCE_COUNT,
  OFFICIAL_T01_ARTICLE_SENTENCES,
  OFFICIAL_T01_BUILTIN_ARTICLE_BOOK,
  OFFICIAL_T01_BUILTIN_WORD_BOOK,
  OFFICIAL_T01_PRACTICE_TYPE,
  OFFICIAL_T01_UNIQUE_WORD_COUNT,
  OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM,
  uniqueNonEmptyWords,
} from './native-local-practice-matrix-spec.mjs'

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

const PRACTICE_TYPE_NAME = {
  [OFFICIAL_T01_PRACTICE_TYPE.followWrite]: 'followWrite',
  [OFFICIAL_T01_PRACTICE_TYPE.spell]: 'spell',
  [OFFICIAL_T01_PRACTICE_TYPE.identify]: 'identify',
  [OFFICIAL_T01_PRACTICE_TYPE.listen]: 'listen',
  [OFFICIAL_T01_PRACTICE_TYPE.dictation]: 'dictation',
}

function phaseFromSources(sources) {
  const cursor = sources?.cursor
  if (cursor && Number(cursor.nodeIndex) === 1) {
    if (Number(cursor.stepIndex) === 0) {
      return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.identify, phase: 'identify' }
    }
    if (Number(cursor.stepIndex) === 1) {
      return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.listen, phase: 'listen' }
    }
    if (Number(cursor.stepIndex) === 2) {
      return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.dictation, phase: 'dictation' }
    }
  }
  if (cursor && Number(cursor.nodeIndex) === 0) {
    if (Number(cursor.stepIndex) === 1) {
      return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.listen, phase: 'listen' }
    }
    if (Number(cursor.stepIndex) === 2) {
      return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.dictation, phase: 'dictation' }
    }
    if (cursor.loop) {
      return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.spell, phase: 'spell' }
    }
    return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.followWrite, phase: 'followWrite' }
  }
  if (typeof sources?.practiceType === 'number') {
    return {
      practiceType: sources.practiceType,
      phase: PRACTICE_TYPE_NAME[sources.practiceType] || 'other',
    }
  }
  return { practiceType: OFFICIAL_T01_PRACTICE_TYPE.followWrite, phase: 'followWrite' }
}

const report = {
  sha256: launch.sha256,
  productVersion: launch.productVersion,
  pid: launch.pid,
  port: launch.port,
  plan: {
    wording: '内置词书完成 20 个单词；文章完成 5 句；切换设置后继续',
    uniqueWords: OFFICIAL_T01_UNIQUE_WORD_COUNT,
    articleSentences: OFFICIAL_T01_ARTICLE_SENTENCE_COUNT,
    wordPracticeMode: OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM,
    wordBook: OFFICIAL_T01_BUILTIN_WORD_BOOK,
    articleBook: OFFICIAL_T01_BUILTIN_ARTICLE_BOOK,
  },
  errors: [],
  external: [],
  typedWords: [],
  typedEvents: [],
  phaseCounts: {
    followWrite: 0,
    spell: 0,
    identify: 0,
    listen: 0,
    dictation: 0,
    other: 0,
  },
  completedSentences: [],
  settingsSwitch: null,
  articleSource: null,
  builtinLoad: null,
}
page.on('pageerror', error => report.errors.push(error.message))
await context.route(/^https:\/\//, route => {
  report.external.push(route.request().url())
  return route.abort()
})

const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms))

function dictIdentity(dict) {
  return {
    id: dict?.id ?? dict?.dictId,
    enName: dict?.enName ?? dict?.dictEnName,
    en_name: dict?.en_name,
  }
}

function isBuiltinWordBook(dict) {
  const ids = [dictIdentity(dict).id, dictIdentity(dict).enName, dictIdentity(dict).en_name].map(value =>
    String(value ?? '')
  )
  return ids.includes(String(OFFICIAL_T01_BUILTIN_WORD_BOOK.id)) || ids.includes(OFFICIAL_T01_BUILTIN_WORD_BOOK.enName)
}

function isBuiltinArticleBook(book) {
  const ids = [book?.id, book?.enName, book?.en_name].map(value => String(value ?? ''))
  return (
    ids.includes(String(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.id)) || ids.includes(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.enName)
  )
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

async function snapshotRetain() {
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
    const article = articles?.articles?.[0]
    const cet4 = (base.word?.bookList || []).find(book => String(book.id) === '1' || book.enName === 'cet4')
    const nce1 = (base.article?.bookList || []).find(book => String(book.id) === '246' || book.enName === 'nce1')
    return {
      href: location.href,
      volume: setting.wordSoundVolume,
      translate: setting.translate,
      wordPracticeMode: setting.wordPracticeMode,
      note: base.noteData?.fixture,
      fiveKeys: keys.filter(key => disk[key] != null),
      audioIds: files.map(item => item.id),
      audioBytes,
      customId: custom?.id,
      customWords: (custom?.words || []).map(item => item.word),
      customLastLearnIndex: custom?.lastLearnIndex,
      customPerDay: custom?.perDayStudyNumber,
      articleId: article?.id,
      articleText: article?.text || '',
      articleAudioId: article?.audioFileId,
      inputWordNumber: pinia._s.get('practice')?.inputWordNumber ?? null,
      spend: pinia._s.get('practice')?.spend ?? null,
      sdict: {
        id: base.sdict?.id,
        enName: base.sdict?.enName,
        name: base.sdict?.name,
        custom: base.sdict?.custom,
        wordCount: base.sdict?.words?.length ?? 0,
        lastLearnIndex: base.sdict?.lastLearnIndex,
        perDay: base.sdict?.perDayStudyNumber,
        firstWords: (base.sdict?.words || []).slice(0, 5).map(item => item.word),
      },
      sbook: {
        id: base.sbook?.id,
        enName: base.sbook?.enName,
        name: base.sbook?.name,
        custom: base.sbook?.custom,
        articleCount: base.sbook?.articles?.length ?? 0,
        lastLearnIndex: base.sbook?.lastLearnIndex,
        firstTitle: base.sbook?.articles?.[0]?.title || '',
      },
      cet4: {
        id: cet4?.id,
        enName: cet4?.enName,
        custom: cet4?.custom,
        wordCount: cet4?.words?.length ?? 0,
        lastLearnIndex: cet4?.lastLearnIndex,
        firstWords: (cet4?.words || []).slice(0, 5).map(item => item.word),
      },
      nce1: {
        id: nce1?.id,
        enName: nce1?.enName,
        custom: nce1?.custom,
        articleCount: nce1?.articles?.length ?? 0,
        lastLearnIndex: nce1?.lastLearnIndex,
        firstTitle: nce1?.articles?.[0]?.title || '',
      },
    }
  })
}

async function probeBuiltinResources() {
  return page.evaluate(async () => {
    async function probe(url) {
      const started = Date.now()
      try {
        const response = await fetch(url)
        if (!response.ok) {
          return { url, ok: false, status: response.status, count: 0, ms: Date.now() - started }
        }
        const data = await response.json()
        const first = Array.isArray(data) ? data[0] : null
        return {
          url,
          ok: true,
          status: response.status,
          count: Array.isArray(data) ? data.length : 0,
          first: first?.name || first?.title || first?.word || first?.enName || null,
          ms: Date.now() - started,
        }
      } catch (error) {
        return {
          url,
          ok: false,
          status: 0,
          count: 0,
          error: error && error.message ? error.message : String(error),
          ms: Date.now() - started,
        }
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

async function prepareBuiltinSystemSession() {
  return page.evaluate(
    async ({ uniqueCount }) => {
      const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
      const setting = pinia._s.get('setting')
      const base = pinia._s.get('base')
      setting.wordPracticeMode = 0
      setting.practiceSentence = false
      setting.autoNextWord = false
      setting.autoAddRandomReviewWhenNoDue = false
      setting.showUsageTips = false
      setting.showPanel = false
      for (const book of base.word?.bookList || []) {
        const ids = [book.id, book.enName, book.en_name].map(value => String(value ?? ''))
        if (ids.includes('1') || ids.includes('cet4')) {
          book.lastLearnIndex = 0
          book.perDayStudyNumber = uniqueCount
          book.complete = false
        }
      }
      for (const book of base.article?.bookList || []) {
        const ids = [book.id, book.enName, book.en_name].map(value => String(value ?? ''))
        if (ids.includes('246') || ids.includes('nce1')) {
          book.lastLearnIndex = 0
          book.complete = false
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
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
        return parsed
      }
      const settingRecord = parseRecord(await readKey('typing-word-setting'))
      if (settingRecord?.val) {
        settingRecord.val.wordPracticeMode = 0
        settingRecord.val.practiceSentence = false
        settingRecord.val.autoNextWord = false
        settingRecord.val.autoAddRandomReviewWhenNoDue = false
        await writeKey('typing-word-setting', JSON.stringify(settingRecord))
      }
      const dictRecord = parseRecord(await readKey('typing-word-dict'))
      const dictVal = dictRecord?.val || dictRecord
      if (dictVal?.word?.bookList) {
        for (const book of dictVal.word.bookList) {
          const ids = [book.id, book.enName, book.en_name].map(value => String(value ?? ''))
          if (ids.includes('1') || ids.includes('cet4')) {
            book.lastLearnIndex = 0
            book.perDayStudyNumber = uniqueCount
            book.complete = false
          }
        }
        if (dictVal.article?.bookList) {
          for (const book of dictVal.article.bookList) {
            const ids = [book.id, book.enName, book.en_name].map(value => String(value ?? ''))
            if (ids.includes('246') || ids.includes('nce1')) {
              book.lastLearnIndex = 0
              book.complete = false
            }
          }
        }
        await writeKey(
          'typing-word-dict',
          JSON.stringify(dictRecord?.val ? dictRecord : { val: dictVal, version: dictRecord?.version })
        )
      }
      await deleteKey('PracticeSaveWord')
      await deleteKey('PracticeSaveArticle')
      db.close()
      return {
        wordPracticeMode: setting.wordPracticeMode,
        volume: setting.wordSoundVolume,
        note: base.noteData?.fixture,
        persistedMode: settingRecord?.val?.wordPracticeMode ?? null,
      }
    },
    {
      uniqueCount: OFFICIAL_T01_UNIQUE_WORD_COUNT,
    }
  )
}

async function clearPracticeCaches() {
  await page.evaluate(async () => {
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const tx = db.transaction('keyval', 'readwrite')
      await Promise.all(
        ['PracticeSaveWord', 'PracticeSaveArticle'].map(
          key =>
            new Promise((resolveKey, reject) => {
              const del = tx.objectStore('keyval').delete(key)
              del.onsuccess = () => resolveKey()
              del.onerror = () => reject(del.error)
            })
        )
      )
    } finally {
      db.close()
    }
  })
}

function pageHasMissUi(text) {
  return (
    String(text || '').includes('词库资源无法加载') ||
    String(text || '').includes('没有单词可学习！') ||
    String(text || '').includes('没有文章可学习！')
  )
}

async function collectPracticeWordSources() {
  return page.evaluate(async () => {
    const letterText = document.querySelector('.typing-word .letter')?.textContent?.trim() || ''
    const bodyText = document.body?.innerText || ''
    let propWord = ''
    let providedWord = ''
    let practiceType = null
    let flowId = ''
    let cursorFromVue = null
    const seen = new Set()
    const stack = [document.querySelector('#__nuxt')?.__vue_app__?._instance]
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
      const data = inst.provides?.practiceData
      if (!providedWord && data?.words?.[data.index]?.word) providedWord = data.words[data.index].word
      const flow = inst.provides?.activeFlowConfig
      if (!flowId && flow?.id) flowId = flow.id
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
      var cacheCursor = val?.sessionSnapshot?.cursor || null
      var cacheFlowId = val?.sessionSnapshot?.flowId || ''
    } finally {
      db.close()
    }
    const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
    const base = pinia?._s.get('base')
    const setting = pinia?._s.get('setting')
    return {
      letterText,
      propWord,
      providedWord,
      cacheWord,
      practiceType,
      flowId: flowId || cacheFlowId || '',
      cursor: cursorFromVue || cacheCursor || null,
      showWordShortcut: setting?.shortcutKeyMap?.ShowWord || 'Escape',
      inputWordNumber: pinia?._s.get('practice')?.inputWordNumber ?? null,
      wordPracticeMode: setting?.wordPracticeMode,
      dictId: base?.sdict?.id,
      dictName: base?.sdict?.name,
      dictEnName: base?.sdict?.enName,
      custom: base?.sdict?.custom,
      wordCount: base?.sdict?.words?.length ?? 0,
      lastLearnIndex: base?.sdict?.lastLearnIndex,
      statistics: !!document.querySelector('.statistics'),
      completeText: bodyText.includes('今日任务完成') || bodyText.includes("Today's task complete"),
      hasTyping: !!document.querySelector('.typing-word'),
      missToast: bodyText.includes('词库资源无法加载') || bodyText.includes('没有单词可学习！'),
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
      const children = inst.subTree?.children
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child?.component) stack.push(child.component)
        }
      }
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
      sectionCount: article?.sections?.length || document.querySelectorAll('.typing-article .section').length,
      sentenceCount: article?.sections?.[0]?.length || domSentences.length,
      wroteCount,
      finishedDomSentences: [...document.querySelectorAll('.typing-article .sentence')].filter(node => {
        const words = [...node.querySelectorAll('.word')]
        return words.length > 0 && words.every(word => word.classList.contains('wrote'))
      }).length,
      isEnd: cursor ? !article?.sections?.[cursor.sectionIndex]?.[cursor.sentenceIndex] : !currentDom && wroteCount > 0,
    }
  })
}

async function toggleTranslate() {
  const before = await page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    return pinia._s.get('setting').translate
  })
  await page.keyboard.press('Control+Z')
  await pause(400)
  let after = await page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    return {
      translate: pinia._s.get('setting').translate,
      volume: pinia._s.get('setting').wordSoundVolume,
    }
  })
  let method = 'shortcut'
  if (after.translate === before) {
    after = await page.evaluate(() => {
      const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
      const setting = pinia._s.get('setting')
      setting.translate = !setting.translate
      return {
        translate: setting.translate,
        volume: setting.wordSoundVolume,
      }
    })
    method = 'pinia'
    await pause(400)
  }
  return { key: 'translate', before, after: after.translate, volume: after.volume, method }
}

async function waitForWordAdvance(beforeCount, previousWord) {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    const sources = await collectPracticeWordSources()
    if (sources.statistics || sources.completeText) return { advanced: true, complete: true, sources }
    const current = resolveInstalledPracticeWord(sources)
    const count = sources.inputWordNumber ?? 0
    if (current && current !== previousWord) return { advanced: true, complete: false, sources, word: current }
    if (count > beforeCount && current && current !== previousWord) {
      return { advanced: true, complete: false, sources, word: current }
    }
    await pause(120)
  }
  return { advanced: false, complete: false }
}

async function typePracticeItem(word, sources) {
  const resolved = phaseFromSources(sources)
  const practiceType = resolved.practiceType
  if (practiceType === OFFICIAL_T01_PRACTICE_TYPE.identify) {
    await page.keyboard.press('1')
    return practiceType
  }
  for (let i = 0; i < 20; i++) {
    const leftover = await page.evaluate(
      () =>
        (document.querySelector('.typing-word .input')?.textContent || '') +
        (document.querySelector('.typing-word .wrong')?.textContent || '')
    )
    if (!leftover) break
    await page.keyboard.press('Backspace')
  }
  await page.keyboard.type(word, { delay: 35 })
  await page.keyboard.press('Space')
  if (practiceType === OFFICIAL_T01_PRACTICE_TYPE.dictation) {
    await pause(250)
    await page.keyboard.press('Space')
  }
  return practiceType
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
    const hasTyping = await page.evaluate(() => !!document.querySelector('.typing-word'))
    if (
      hasTyping &&
      last.custom === false &&
      isBuiltinWordBook(last) &&
      (last.wordCount || 0) >= OFFICIAL_T01_UNIQUE_WORD_COUNT
    ) {
      return { loaded: true, hasTyping, ...last }
    }
    await pause(200)
  }
  return { loaded: false, timeout: true, ...last }
}

async function openArticlePractice(preferredId, fallbackId) {
  await page.goto(`http://tauri.localhost/practice-articles/${preferredId}`, {
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
      await page.goto(`http://tauri.localhost/practice-articles/${fallbackId}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForSelector('.typing-article', { timeout: 20000 })
      return { loaded: true, source: 'backup-articles', fallback: true, ...state }
    }
    await pause(200)
  }
  await page.goto(`http://tauri.localhost/practice-articles/${fallbackId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('.typing-article', { timeout: 20000 })
  return { loaded: true, source: 'backup-articles', fallback: true, timeout: true }
}

try {
  if (!page.url().includes('/setting') && !page.url().includes('/words') && !page.url().includes('/practice')) {
    await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
  }
  if (!page.url().includes('tauri.localhost') || page.url() === 'http://tauri.localhost/') {
    await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
  }
  await ready()
  await dismissOverlays()
  report.before = await snapshotRetain()
  assert.equal(report.before.volume, 37)
  assert.equal(report.before.note, 'ZIP semantic round-trip')
  assert.equal(report.before.audioBytes, 2943)
  assert.ok(uniqueNonEmptyWords(report.before.customWords).length >= OFFICIAL_T01_UNIQUE_WORD_COUNT)

  report.builtinProbe = await probeBuiltinResources()
  if (
    report.builtinProbe.cet4?.ok !== true ||
    (report.builtinProbe.cet4?.count || 0) < OFFICIAL_T01_UNIQUE_WORD_COUNT
  ) {
    report.builtinLoad = {
      status: 'miss',
      reason: 'dest CET4_T.json did not load',
      probe: report.builtinProbe.cet4,
    }
    throw new Error(
      'Built-in CET-4 did not load from dest; not faking a built-in book from custom words. See existing miss UI evidence.'
    )
  }
  assert.equal(report.builtinProbe.wordList.first, OFFICIAL_T01_BUILTIN_WORD_BOOK.name)
  assert.ok((report.builtinProbe.cet4.count || 0) >= OFFICIAL_T01_BUILTIN_WORD_BOOK.length)

  report.prepare = await prepareBuiltinSystemSession()
  assert.equal(report.prepare.wordPracticeMode, OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM)
  assert.equal(report.prepare.volume, 37)
  await pause(800)
  await clearPracticeCaches()
  await pause(400)

  report.builtinLoad = await openBuiltinWordPractice()
  if (report.builtinLoad.loaded && report.builtinLoad.wordPracticeMode !== OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM) {
    report.prepareRetry = await prepareBuiltinSystemSession()
    await pause(800)
    report.builtinLoad = await openBuiltinWordPractice()
  }
  if (!report.builtinLoad.loaded) {
    throw new Error(
      `Built-in CET-4 practice did not start; not faking from custom words: ${JSON.stringify(report.builtinLoad)}`
    )
  }
  await ready()
  await page.waitForSelector('.typing-word', { timeout: 20000 })
  await dismissOverlays()
  await hidePanel()
  const selected = await snapshotRetain()
  report.selectedDict = selected.sdict
  assert.equal(selected.wordPracticeMode, OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM)
  assert.equal(String(selected.sdict.id), String(OFFICIAL_T01_BUILTIN_WORD_BOOK.id))
  assert.equal(selected.sdict.custom, false)
  assert.ok((selected.sdict.wordCount || 0) >= OFFICIAL_T01_BUILTIN_WORD_BOOK.length)
  assert.notEqual(selected.sdict.id, 'backup-custom')
  assert.notEqual(selected.sdict.firstWords?.[0], 'fixture')

  const unique = new Set()
  while (true) {
    const peek = await collectPracticeWordSources()
    const phasesDone =
      report.phaseCounts.followWrite >= OFFICIAL_T01_UNIQUE_WORD_COUNT &&
      report.phaseCounts.spell >= OFFICIAL_T01_UNIQUE_WORD_COUNT &&
      report.phaseCounts.listen >= OFFICIAL_T01_UNIQUE_WORD_COUNT &&
      report.phaseCounts.dictation >= OFFICIAL_T01_UNIQUE_WORD_COUNT
    if (peek.statistics || peek.completeText) break
    if (phasesDone && unique.size >= OFFICIAL_T01_UNIQUE_WORD_COUNT && !peek.hasTyping) break
    if (peek.missToast && peek.custom === false && (peek.wordCount || 0) === 0) {
      throw new Error('Built-in CET-4 emptied after start; not faking from custom words')
    }
    const { word, sources } = await resolveCurrentPracticeWord()
    if (sources.statistics || sources.completeText) break
    const beforeCount = sources.inputWordNumber ?? 0
    const resolved = phaseFromSources(sources)
    const practiceType = await typePracticeItem(word, sources)
    const advanced = await waitForWordAdvance(beforeCount, word)
    report.wordTokenGuard = (report.wordTokenGuard || 0) + 1
    assert.ok(report.wordTokenGuard < 250, `Word loop ran too long: ${JSON.stringify(report.typedEvents)}`)
    if (!advanced.advanced && !advanced.complete) {
      await pause(400)
      console.log(`retry word=${word} type=${resolved.phase} inputWordNumber=${beforeCount}`)
      continue
    }
    unique.add(word)
    if (!report.typedWords.includes(word)) report.typedWords.push(word)
    const phase = resolved.phase
    report.phaseCounts[phase] = (report.phaseCounts[phase] || 0) + 1
    report.typedEvents.push({ word, practiceType, phase, cursor: sources.cursor || null })
    console.log(
      `typed ${unique.size}/${OFFICIAL_T01_UNIQUE_WORD_COUNT} ${word} ${phase} events=${report.typedEvents.length}`
    )
    if (advanced.complete) break
    await pause(150)
    if (unique.size === 3 && !report.settingsSwitch) {
      const first = await toggleTranslate()
      assert.notEqual(first.after, first.before)
      assert.equal(first.volume, 37)
      report.settingsSwitch = { ...first, restored: false }
    }
    if (unique.size === 6 && report.settingsSwitch && !report.settingsSwitch.restored) {
      const restored = await toggleTranslate()
      assert.equal(restored.after, report.settingsSwitch.before)
      assert.equal(restored.volume, 37)
      report.settingsSwitch.restored = true
      report.settingsSwitch.restore = restored
    }
  }
  if (report.settingsSwitch && !report.settingsSwitch.restored) {
    const restored = await toggleTranslate()
    report.settingsSwitch.restored = restored.after === report.settingsSwitch.before
    report.settingsSwitch.restore = restored
  }
  await page.evaluate(() => {
    const pinia = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$pinia
    pinia._s.get('setting').translate = true
  })
  report.wordAfter = await snapshotRetain()
  report.wordAfter.statistics = await page.evaluate(() => {
    const text = document.body?.innerText || ''
    return (
      !!document.querySelector('.statistics') || text.includes('今日任务完成') || text.includes("Today's task complete")
    )
  })
  assert.equal(
    uniqueNonEmptyWords(report.typedWords).length,
    OFFICIAL_T01_UNIQUE_WORD_COUNT,
    JSON.stringify(report.typedWords)
  )
  assert.ok((report.wordAfter.inputWordNumber ?? 0) >= OFFICIAL_T01_UNIQUE_WORD_COUNT)
  assert.ok(report.phaseCounts.followWrite >= OFFICIAL_T01_UNIQUE_WORD_COUNT)
  assert.ok(report.phaseCounts.spell >= OFFICIAL_T01_UNIQUE_WORD_COUNT)
  assert.ok(report.phaseCounts.listen >= OFFICIAL_T01_UNIQUE_WORD_COUNT)
  assert.ok(report.phaseCounts.dictation >= OFFICIAL_T01_UNIQUE_WORD_COUNT)
  assert.equal(report.wordAfter.wordPracticeMode, OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM)
  assert.ok(isBuiltinWordBook(report.wordAfter.sdict))
  await page.screenshot({ path: resolve(evidence, 'native-local-practice-matrix.png') })

  const nce1Available = report.builtinProbe.nce1?.ok === true && (report.builtinProbe.nce1?.count || 0) >= 1
  report.articleOpen = nce1Available
    ? await openArticlePractice(OFFICIAL_T01_BUILTIN_ARTICLE_BOOK.id, 'backup-articles')
    : {
        loaded: true,
        source: 'backup-articles',
        fallback: true,
        reason: 'dest NCE_1.json did not load',
      }
  if (!nce1Available) {
    await page.goto('http://tauri.localhost/practice-articles/backup-articles', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('.typing-article', { timeout: 20000 })
  }
  report.articleSource = report.articleOpen.source
  await ready()
  await dismissOverlays()
  await hidePanel()
  const articleReadyDeadline = Date.now() + 15000
  let startedArticle = await collectArticleCursor()
  while (Date.now() < articleReadyDeadline && (startedArticle.sentenceCount || 0) < 1) {
    await pause(200)
    startedArticle = await collectArticleCursor()
  }
  report.articleStarted = startedArticle
  assert.ok(
    (startedArticle.sentenceCount || 0) >= OFFICIAL_T01_ARTICLE_SENTENCE_COUNT,
    `Article sections not ready: ${JSON.stringify(startedArticle)} href=${page.url()} source=${report.articleSource}`
  )

  while (report.completedSentences.length < OFFICIAL_T01_ARTICLE_SENTENCE_COUNT) {
    const cursor = await collectArticleCursor()
    if (cursor.isEnd && report.completedSentences.length >= OFFICIAL_T01_ARTICLE_SENTENCE_COUNT) break
    const token = cursor.word
    assert.ok(token, `Expected an article token, got ${JSON.stringify(cursor)}`)
    assert.ok(!/^[_ \u00a0]+$/.test(token), 'Refusing masked article letters')
    const isSymbolOrNumber = cursor.type === 0 || cursor.type === 1
    if (isSymbolOrNumber) {
      await page.keyboard.press('Space')
      await pause(200)
    } else {
      await page.keyboard.type(String(token).replace(/[^A-Za-z]/g, ''), { delay: 40 })
      if (cursor.nextSpace !== false) await page.keyboard.press('Space')
      await pause(250)
    }
    const after = await collectArticleCursor()
    while (report.completedSentences.length < (after.finishedDomSentences || 0)) {
      const fallback =
        report.articleSource === 'backup-articles'
          ? OFFICIAL_T01_ARTICLE_SENTENCES[report.completedSentences.length]
          : cursor.sentenceText.trim()
      report.completedSentences.push(fallback || cursor.sentenceText.trim())
      console.log(`article sentence ${report.completedSentences.length}/${OFFICIAL_T01_ARTICLE_SENTENCE_COUNT}`)
    }
    if (report.completedSentences.length >= OFFICIAL_T01_ARTICLE_SENTENCE_COUNT) break
    report.articleTokenGuard = (report.articleTokenGuard || 0) + 1
    assert.ok(report.articleTokenGuard < 80, `Article loop ran too long: ${JSON.stringify(after)}`)
  }
  report.articleAfter = await snapshotRetain()
  await page.screenshot({ path: resolve(evidence, 'native-local-practice-matrix-article.png') })
  assert.ok(
    report.completedSentences.length >= OFFICIAL_T01_ARTICLE_SENTENCE_COUNT,
    `Need ${OFFICIAL_T01_ARTICLE_SENTENCE_COUNT} sentences, got ${JSON.stringify(report.completedSentences)}`
  )
  assert.equal(report.articleAfter.volume, 37)
  assert.equal(report.articleAfter.note, 'ZIP semantic round-trip')
  assert.equal(report.articleAfter.audioBytes, 2943)
  assert.ok(uniqueNonEmptyWords(report.articleAfter.customWords).length >= OFFICIAL_T01_UNIQUE_WORD_COUNT)
  assert.deepEqual(report.errors, [])
  report.passed = true
  console.log(
    JSON.stringify(
      {
        passed: true,
        uniqueWords: uniqueNonEmptyWords(report.typedWords).length,
        phases: report.phaseCounts,
        sentences: report.completedSentences.length,
        articleSource: report.articleSource,
        settingsSwitch: report.settingsSwitch,
        volume: report.articleAfter.volume,
        last: page.url(),
      },
      null,
      2
    )
  )
} finally {
  writeFileSync(resolve(evidence, 'native-local-practice-matrix.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
