// Explicit native runner. Never included in the default Node suite.
// Backs up isolated IndexedDB, proves first-run vs corrupt toasts and
// dictionary URL miss UI, then restores the known-good profile.
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

const evidencePath = process.argv[2]
assert.ok(evidencePath, 'Supply an evidence directory with launch.json')
const evidence = resolve(evidencePath)
const launch = JSON.parse(readFileSync(resolve(evidence, 'launch.json'), 'utf8').replace(/^\uFEFF/, ''))
assert.equal(resolve(launch.profile), resolve(evidence, 'isolated-profile'))
assert.equal(createHash('sha256').update(readFileSync(launch.exe)).digest('hex'), launch.sha256.toLowerCase())
const modulePath = process.env.TYPEWORDS_PLAYWRIGHT_MODULE
assert.ok(modulePath, 'Set TYPEWORDS_PLAYWRIGHT_MODULE to the installed Playwright module')

const DICT_MISS = '词库资源无法加载，已使用空词表继续。请稍后重试或返回词书列表。'
const CORRUPT_DICT = '本地词书数据无法读取，已使用空的本地状态继续。请用备份恢复。'
const CORRUPT_SETTING = '本地设置无法读取，已使用默认设置继续。请用备份恢复。'
const KEYS = ['typing-word-dict', 'typing-word-setting', 'PracticeSaveWord', 'PracticeSaveArticle', 'typing-word-files']

const { chromium } = await import(pathToFileURL(modulePath).href)
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${launch.port}`)
const context = browser.contexts()[0]
const page = context.pages().find(item => item.url().startsWith('http://tauri.localhost'))
assert.ok(page, 'Expected a production Tauri page')
const pageerrors = []
page.on('pageerror', error => pageerrors.push(error.message))

async function waitReady(timeout = 20000) {
  await page.waitForFunction(
    () => {
      const pinia = document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$pinia
      return pinia?._s.get('base')?.load && pinia?._s.get('setting')?.load
    },
    { timeout }
  )
}

async function visibleToasts() {
  return page.evaluate(() =>
    [...document.querySelectorAll('.message-text')].map(el => (el.textContent || '').trim()).filter(Boolean)
  )
}

async function waitForToast(message, timeout = 8000) {
  await page.waitForFunction(
    expected =>
      [...document.querySelectorAll('.message-text')].some(el => (el.textContent || '').includes(expected)) ||
      (document.body?.innerText || '').includes(expected),
    message,
    { timeout }
  )
}

async function putKeys(entries) {
  await page.evaluate(async items => {
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const tx = db.transaction('keyval', 'readwrite')
      const store = tx.objectStore('keyval')
      for (const [key, value] of items) {
        if (value == null) store.delete(key)
        else store.put(value, key)
      }
      await new Promise((resolveTx, reject) => {
        tx.oncomplete = () => resolveTx()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, entries)
}

async function snapshotStores() {
  return page.evaluate(async keys => {
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
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
    const files = Array.isArray(disk['typing-word-files']) ? disk['typing-word-files'] : []
    const fileRecords = []
    for (const item of files) {
      if (!item?.file) continue
      fileRecords.push({
        id: item.id,
        type: item.file.type || 'audio/mpeg',
        bytes: Array.from(new Uint8Array(await item.file.arrayBuffer())),
      })
    }
    return {
      dict: disk['typing-word-dict'],
      setting: disk['typing-word-setting'],
      practiceWord: disk.PracticeSaveWord,
      practiceArticle: disk.PracticeSaveArticle,
      files: fileRecords,
    }
  }, KEYS)
}

async function restoreStores(snapshot) {
  await page.evaluate(async snap => {
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const tx = db.transaction('keyval', 'readwrite')
      const store = tx.objectStore('keyval')
      const files = (snap.files || []).map(item => ({
        id: item.id,
        file: new Blob([new Uint8Array(item.bytes)], { type: item.type || 'audio/mpeg' }),
      }))
      store.put(snap.dict, 'typing-word-dict')
      store.put(snap.setting, 'typing-word-setting')
      if (snap.practiceWord == null) store.delete('PracticeSaveWord')
      else store.put(snap.practiceWord, 'PracticeSaveWord')
      if (snap.practiceArticle == null) store.delete('PracticeSaveArticle')
      else store.put(snap.practiceArticle, 'PracticeSaveArticle')
      store.put(files, 'typing-word-files')
      await new Promise((resolveTx, reject) => {
        tx.oncomplete = () => resolveTx()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, snapshot)
}

async function inspectState() {
  return page.evaluate(async () => {
    const request = indexedDB.open('keyval-store')
    const db = await new Promise((resolveDb, reject) => {
      request.onsuccess = () => resolveDb(request.result)
      request.onerror = () => reject(request.error)
    })
    const disk = {}
    try {
      const tx = db.transaction('keyval', 'readonly')
      await Promise.all(
        ['typing-word-dict', 'typing-word-setting', 'typing-word-files'].map(
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
    return {
      href: location.href,
      note: base.noteData?.fixture ?? null,
      volume: setting.wordSoundVolume,
      load: Boolean(base.load && setting.load),
      bookCount: base.word?.bookList?.length ?? 0,
      audioIds: files.map(item => item.id),
      audioBytes,
      diskDictPreview:
        typeof disk['typing-word-dict'] === 'string' ? disk['typing-word-dict'].slice(0, 40) : disk['typing-word-dict'],
      diskSettingPreview:
        typeof disk['typing-word-setting'] === 'string'
          ? disk['typing-word-setting'].slice(0, 40)
          : disk['typing-word-setting'],
      toasts: [...document.querySelectorAll('.message-text')].map(el => (el.textContent || '').trim()).filter(Boolean),
    }
  })
}

function hasToast(toasts, message) {
  return toasts.some(item => String(item).includes(message))
}

const report = {
  pid: launch.pid,
  sha256: launch.sha256,
  productVersion: launch.productVersion,
  pageerrors,
  baseline: null,
  corrupt: null,
  firstRun: null,
  dictMiss: null,
  restored: null,
}

let snapshot = null

try {
  await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
  await waitReady()
  snapshot = await snapshotStores()
  assert.ok(typeof snapshot.dict === 'string' && snapshot.dict.startsWith('{'), 'Expected a readable dict store')
  assert.ok(
    typeof snapshot.setting === 'string' && snapshot.setting.startsWith('{'),
    'Expected a readable setting store'
  )
  writeFileSync(
    resolve(evidence, 'isolated-store-snapshot-batch72.json'),
    JSON.stringify({
      dict: snapshot.dict,
      setting: snapshot.setting,
      practiceWord: snapshot.practiceWord,
      practiceArticle: snapshot.practiceArticle,
      files: snapshot.files,
    })
  )
  const baseline = await inspectState()
  assert.equal(baseline.volume, 37)
  assert.equal(baseline.note, 'ZIP semantic round-trip')
  assert.equal(baseline.audioBytes, 2943)
  assert.equal(baseline.load, true)
  report.baseline = baseline

  await putKeys([
    ['typing-word-dict', '{not-json'],
    ['typing-word-setting', '{not-json'],
  ])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForToast(CORRUPT_DICT)
  await waitForToast(CORRUPT_SETTING)
  await waitReady()
  const corrupt = await inspectState()
  assert.equal(hasToast(corrupt.toasts, CORRUPT_DICT), true, `Missing dict corrupt toast: ${corrupt.toasts}`)
  assert.equal(hasToast(corrupt.toasts, CORRUPT_SETTING), true, `Missing setting corrupt toast: ${corrupt.toasts}`)
  assert.equal(corrupt.load, true)
  assert.equal(corrupt.volume, 100)
  assert.notEqual(corrupt.note, 'ZIP semantic round-trip')
  report.corrupt = {
    ...corrupt,
    toastDict: true,
    toastSetting: true,
    continuedWithDefault: corrupt.volume === 100 && corrupt.load === true,
  }

  await restoreStores(snapshot)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitReady()
  const afterCorruptRestore = await inspectState()
  assert.equal(afterCorruptRestore.volume, 37)
  assert.equal(afterCorruptRestore.note, 'ZIP semantic round-trip')
  assert.equal(afterCorruptRestore.audioBytes, 2943)

  await putKeys([
    ['typing-word-dict', null],
    ['typing-word-setting', null],
  ])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitReady()
  const firstRun = await inspectState()
  const firstRunToasts = [...firstRun.toasts, ...(await visibleToasts())]
  assert.equal(hasToast(firstRunToasts, CORRUPT_DICT), false, `First-run toasted dict corrupt: ${firstRunToasts}`)
  assert.equal(hasToast(firstRunToasts, CORRUPT_SETTING), false, `First-run toasted setting corrupt: ${firstRunToasts}`)
  assert.equal(firstRun.load, true)
  assert.equal(firstRun.volume, 100)
  report.firstRun = {
    ...firstRun,
    toastCorrupt: false,
    continuedWithDefault: firstRun.volume === 100 && firstRun.load === true,
  }

  await restoreStores(snapshot)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitReady()
  const afterFirstRunRestore = await inspectState()
  assert.equal(afterFirstRunRestore.volume, 37)
  assert.equal(afterFirstRunRestore.note, 'ZIP semantic round-trip')
  assert.equal(afterFirstRunRestore.audioBytes, 2943)

  await page.route('**/dicts/en/word/CET4_T.json', route =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing-dict-fixture' })
  )
  const missStarted = Date.now()
  await page.goto('http://tauri.localhost/practice-words/1', { waitUntil: 'domcontentloaded' })
  await waitForToast(DICT_MISS, 12000)
  await waitReady()
  const dictMiss = await inspectState()
  const missElapsedMs = Date.now() - missStarted
  assert.equal(
    hasToast(dictMiss.toasts, DICT_MISS) || (await page.locator('body').innerText()).includes(DICT_MISS),
    true
  )
  assert.ok(missElapsedMs < 12000, `Dict miss UI hung for ${missElapsedMs}ms`)
  assert.equal(dictMiss.load, true)
  report.dictMiss = {
    ...dictMiss,
    toastMiss: true,
    missElapsedMs,
    hung: false,
    recoveredHref: dictMiss.href,
  }
  await page.unroute('**/dicts/en/word/CET4_T.json')

  await restoreStores(snapshot)
  await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitReady()
  const restored = await inspectState()
  assert.equal(restored.volume, 37)
  assert.equal(restored.note, 'ZIP semantic round-trip')
  assert.equal(restored.audioBytes, 2943)
  assert.equal(restored.load, true)
  report.restored = restored
  report.pageerrorCount = pageerrors.length
  report.pass = true
  writeFileSync(resolve(evidence, 'native-r4-dict-miss.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ pass: true, sha256: launch.sha256, pid: launch.pid, volume: restored.volume }, null, 2))
} catch (error) {
  report.pass = false
  report.error = error instanceof Error ? error.message : String(error)
  report.pageerrorCount = pageerrors.length
  writeFileSync(resolve(evidence, 'native-r4-dict-miss.json'), JSON.stringify(report, null, 2))
  throw error
} finally {
  if (snapshot) {
    try {
      await restoreStores(snapshot)
      await page.goto('http://tauri.localhost/setting?index=5', { waitUntil: 'domcontentloaded' })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitReady()
    } catch (restoreError) {
      report.restoreError = restoreError instanceof Error ? restoreError.message : String(restoreError)
      writeFileSync(resolve(evidence, 'native-r4-dict-miss.json'), JSON.stringify(report, null, 2))
    }
  }
  await browser.close()
}
