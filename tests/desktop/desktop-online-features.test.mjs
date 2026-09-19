import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'

const root = process.env.TYPEWORDS_TEST_ROOT || process.cwd()

function evaluate(path, globals = {}, dependencies = {}) {
  const source = readFileSync(resolve(root, path), 'utf8').replaceAll('import.meta.env.MODE', "'test'")
  const exports = {}
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports,
    URL,
    console,
    ...globals,
    require: name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      if (name === '@floating-ui/dom') return { offset() {} }
      if (name === '../types/enum.ts') return { ShortcutKey: {}, WordPracticeMode: {}, WordPracticeStage: {} }
      return {}
    },
  })
  return exports
}

function read(path) {
  return readFileSync(resolve(root, path), 'utf8')
}

const features = evaluate('app/core/config/desktopOnlineFeatures.ts')
const env = evaluate('app/core/config/env.ts')

test('official P1-02 desktop online list is the named enable/disable inventory', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(Array.from(features.DESKTOP_ONLINE_FEATURES, item => [item.id, item.desktop]))),
    [
      ['word-query-api', 'optional-https'],
      ['baidu-translate', 'disabled'],
      ['baidu-dev-proxy', 'disabled'],
      ['cloud-sync', 'disabled'],
      ['website-analytics', 'disabled'],
      ['service-worker', 'disabled'],
      ['remote-google-fonts', 'disabled'],
      ['youdao-pronunciation', 'enabled'],
      ['bundled-dict-lists', 'enabled-local'],
      ['allowlisted-hosts-without-new-dest-entry', 'inventory-only'],
    ]
  )
})

test('desktop word-query helper accepts only explicit non-loopback HTTPS', () => {
  assert.equal(features.isDesktopWordQueryEnabled(''), false)
  assert.equal(features.normalizeDesktopApiBase('https://api.example.test/typewords'), 'https://api.example.test/typewords/')
  for (const desktopApiBase of [
    '/baidu',
    'http://localhost/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://[::1]/',
    'http://api.example/',
    'https://user:pass@api.example/',
    'https://api.example/?key=x',
    'https://api.example/#x',
  ]) {
    assert.equal(features.isDesktopWordQueryEnabled(desktopApiBase), false, desktopApiBase)
  }
})

test('static dict lists stay bundled local paths, not ENV.API localhost', () => {
  assert.equal(env.ENV.RESOURCE_URL, '')
  assert.deepEqual(JSON.parse(JSON.stringify(env.DICT_LIST)), {
    WORD: { ALL: '/list/word.json', RECOMMENDED: '/list/recommend_word.json' },
    ARTICLE: { ALL: '/list/article.json', RECOMMENDED: '/list/recommend_article.json' },
  })
  assert.match(env.PronunciationApi, /^https:\/\/dict\.youdao\.com\/dictvoice/)
})

test('existing desktop gates match the official enable/disable list', () => {
  const http = read('app/core/utils/http.ts')
  const translate = read('app/core/hooks/translate.ts')
  const edit = read('app/components/article/EditArticle.vue')
  const supabase = read('app/core/utils/supabase.ts')
  const init = read('app/plugins/02.init.client.ts')
  const desktop = read('app/core/platform/desktop.ts')
  const nuxt = read('nuxt.config.ts')
  const dict = read('app/pages/(words)/dict.vue')

  assert.match(http, /normalizeDesktopApiBase/)
  assert.match(http, /DESKTOP_WORD_QUERY_DISABLED_MESSAGE/)
  assert.match(translate, /if \(useRuntimeConfig\(\)\.public\.isDesktop\) return false/)
  assert.match(edit, /桌面百度翻译未启用/)
  assert.match(supabase, /return !useRuntimeConfig\(\)\.public\.isDesktop/)
  assert.match(supabase, /本地桌面版暂不提供云同步/)
  assert.match(init, /if \(\s*!isDesktop &&/)
  assert.match(init, /serviceWorker/)
  assert.match(nuxt, /devProxy: isDesktop\s*\?\s*\{\}/)
  assert.match(nuxt, /isDesktop \? \[\] : \['~\/assets\/css\/web-fonts\.css'\]/)
  assert.match(desktop, /'2study\.top'/)
  assert.match(desktop, /'www\.google\.cn'/)
  assert.match(dict, /isDesktopWordQueryEnabled/)
  assert.match(dict, /DESKTOP_WORD_QUERY_DISABLED_MESSAGE/)
  const search = dict.slice(dict.indexOf('async function searchOfficialWord()'))
  assert.ok(search.indexOf('isDesktopWordQueryEnabled') >= 0)
  assert.ok(search.indexOf('isDesktopWordQueryEnabled') < search.indexOf("'单词未收录'"))
  assert.ok(search.indexOf('DESKTOP_WORD_QUERY_DISABLED_MESSAGE') < search.indexOf("'单词未收录'"))

  const popover = read('app/components/word/WordLookupPopover.vue')
  const hook = read('app/core/hooks/useWordLookup.ts')
  const lookup = read('app/core/utils/wordLookup.ts')
  assert.match(popover, /resolveWordLookupEmptyCopy/)
  assert.match(popover, /lookupEmptyCopy/)
  assert.doesNotMatch(popover, /暂未收录该单词/)
  assert.match(hook, /isDesktopWordQueryEnabled/)
  assert.match(hook, /DESKTOP_WORD_QUERY_DISABLED_MESSAGE/)
  assert.ok(hook.indexOf('isDesktopWordQueryEnabled') < hook.indexOf('resolveWordLookup(rawWord)'))
  assert.match(lookup, /DESKTOP_WORD_QUERY_DISABLED_MESSAGE/)
  assert.match(lookup, /resolveWordLookupEmptyCopy/)
})

test('WordLookupPopover empty copy is official disable text, not 未收录, when word-query is off', async () => {
  const lookup = evaluate(
    'app/core/utils/wordLookup.ts',
    {},
    {
      '../apis/words.ts': {
        queryWord: async () => ({
          success: false,
          code: 503,
          msg: features.DESKTOP_WORD_QUERY_DISABLED_MESSAGE,
          data: null,
        }),
      },
      '../config/desktopOnlineFeatures.ts': features,
    }
  )

  assert.equal(
    lookup.resolveWordLookupEmptyCopy({ isDesktop: true, desktopApiBase: '' }),
    features.DESKTOP_WORD_QUERY_DISABLED_MESSAGE
  )
  assert.equal(
    lookup.resolveWordLookupEmptyCopy({
      isDesktop: true,
      desktopApiBase: 'https://api.example.test/typewords',
    }),
    lookup.WORD_LOOKUP_NOT_FOUND_MESSAGE
  )
  assert.equal(
    lookup.resolveWordLookupEmptyCopy({
      isDesktop: false,
      httpMessage: features.DESKTOP_WORD_QUERY_DISABLED_MESSAGE,
    }),
    features.DESKTOP_WORD_QUERY_DISABLED_MESSAGE
  )
  assert.equal(lookup.WORD_LOOKUP_NOT_FOUND_MESSAGE, '暂未收录该单词')
  assert.notEqual(lookup.WORD_LOOKUP_NOT_FOUND_MESSAGE, features.DESKTOP_WORD_QUERY_DISABLED_MESSAGE)
  assert.match(features.DESKTOP_WORD_QUERY_DISABLED_MESSAGE, /桌面.*API/)

  const result = await lookup.resolveWordLookup('hello')
  assert.equal(result.data, null)
  assert.equal(result.httpMessage, features.DESKTOP_WORD_QUERY_DISABLED_MESSAGE)
})

test('inventory-only hosts do not gain new dest product buttons', () => {
  const inventory = features.DESKTOP_ONLINE_FEATURES.find(item => item.id === 'allowlisted-hosts-without-new-dest-entry')
  assert.equal(inventory.desktop, 'inventory-only')
  assert.match(inventory.note, /Do not add dest product buttons/)
  assert.match(inventory.note, /2study\.top/)
  assert.match(inventory.note, /www\.google\.cn/)
  assert.match(inventory.note, /pan\.quark\.cn/)
})

test('official P3-02 leftover host inventory is dest-click-exhausted and inventory-only', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(Array.from(features.DESKTOP_LEFTOVER_HOST_INVENTORY, item => [item.host, item.kind]))),
    [
      ['2study.top', 'no-dest-entry'],
      ['www.google.cn', 'no-dest-entry'],
      ['pan.quark.cn', 'qr-only'],
      ['supabase.com', 'settings-hidden'],
      ['www.kdocs.cn', 'settings-hidden'],
    ]
  )
  for (const item of features.DESKTOP_LEFTOVER_HOST_INVENTORY) {
    assert.match(item.note, /Do not add dest product buttons/, item.host)
  }

  const desktop = read('app/core/platform/desktop.ts')
  for (const host of ['2study.top', 'www.google.cn', 'pan.quark.cn', 'supabase.com', 'www.kdocs.cn']) {
    assert.match(desktop, new RegExp(`'${host.replace(/\./g, '\\.')}'`))
  }
})

test('leftover hosts keep existing no-entry / QR / settings-hide sources, not dest UI', () => {
  const env = read('app/core/config/env.ts')
  const words = read('app/pages/(words)/words.vue')
  const ie = read('app/components/dialog/IeDialog.vue')
  const doc = read('app/pages/doc.vue')
  const card = read('app/components/ResourceCard.vue')
  const setting = read('app/pages/setting.vue')
  const destClickPages = [
    'app/pages/index.vue',
    'app/pages/help.vue',
    'app/pages/doc.vue',
    'app/pages/about.vue',
    'app/pages/feedback.vue',
    'app/components/About.vue',
    'app/pages/(words)/words.vue',
  ].map(read)

  assert.match(env, /Old_Host = '2study\.top'/)
  assert.match(words, /window\.location\.host === Old_Host/)
  assert.match(words, /v-if="isOldHost"/)
  assert.doesNotMatch(words, /href=["'`]https:\/\/2study\.top/)

  assert.match(ie, /isIE/)
  assert.match(ie, /https:\/\/www\.google\.cn\/chrome\//)
  assert.match(ie, /v-if="showIEDialog"/)

  assert.match(doc, /pan\.quark\.cn/)
  assert.match(doc, /请在手机上打开夸克 App 扫码访问/)
  assert.match(doc, /async function openLink\(/)
  assert.doesNotMatch(doc, /<a[^>]+href=["'][^"']*pan\.quark\.cn/)
  assert.match(card, /emit\('openLink', resource\.link\)/)
  assert.doesNotMatch(card, /<a[\s\S]*href/)

  assert.match(setting, /v-if="!config\.public\.isDesktop"/)
  assert.match(setting, /\$t\('data_sync'\)/)
  assert.ok(setting.indexOf('v-if="!config.public.isDesktop"') < setting.indexOf("$t('data_sync')"))
  const syncBlock = setting.slice(setting.indexOf('tabIndex === 6 && !config.public.isDesktop'))
  assert.match(syncBlock, /https:\/\/supabase\.com\//)
  assert.match(syncBlock, /https:\/\/www\.kdocs\.cn\/l\/cduLx52XXXgw/)
  assert.ok(setting.indexOf('tabIndex === 6 && !config.public.isDesktop') < setting.indexOf('https://supabase.com/'))
  assert.ok(setting.indexOf('tabIndex === 6 && !config.public.isDesktop') < setting.indexOf('https://www.kdocs.cn/l/cduLx52XXXgw'))

  for (const page of destClickPages) {
    assert.doesNotMatch(page, /<a[^>]+href=["'`][^"'`]*2study\.top/)
    assert.doesNotMatch(page, /<a[^>]+href=["'`][^"'`]*www\.google\.cn/)
    assert.doesNotMatch(page, /<a[^>]+href=["'`][^"'`]*pan\.quark\.cn/)
  }
})

const DISABLED_SETTINGS_LEAK = /supabase\.com|kdocs\.cn|serviceWorker|web-fonts|fonts\.gstatic|fonts\.googleapis|umami|t\.js/

test('desktop settings remaps sync query index 6 and no-ops remaining sync handlers', () => {
  const setting = read('app/pages/setting.vue')
  assert.match(setting, /isDesktop && requestedTab === 6 \? 5 : requestedTab/)
  assert.match(setting, /function openSupabaseSaveGate\(\) \{\r?\n  if \(config\.public\.isDesktop\) return/)
  assert.match(setting, /async function onSbFirstSyncChoice\([\s\S]*?if \(config\.public\.isDesktop\) return false/)
  assert.match(setting, /async function doSaveSbConfig\(\) \{\r?\n  if \(config\.public\.isDesktop\) return/)
  assert.ok(setting.indexOf('if (config.public.isDesktop) return') < setting.indexOf("pendingNextAction === 'supabase_save'"))
  assert.ok(setting.indexOf('if (config.public.isDesktop) return false') < setting.indexOf("$t('push_local')"))
  assert.ok(setting.indexOf('if (config.public.isDesktop) return false') < setting.indexOf("$t('pull_remote')"))
})

test('visible settings controls do not offer cloud/sync/SW/remote fonts/analytics when those official flags are off', () => {
  const setting = read('app/pages/setting.vue')
  const dataTab = setting.slice(setting.indexOf('v-if="tabIndex === 5"'), setting.indexOf('tabIndex === 6 && !config.public.isDesktop'))
  assert.match(dataTab, /export_data_title/)
  assert.doesNotMatch(dataTab, DISABLED_SETTINGS_LEAK)
  assert.doesNotMatch(dataTab, /\$t\('data_sync'\)|\$t\('supabase_config'\)/)

  for (const path of [
    'app/core/stores/setting.ts',
    'app/components/setting/CommonSetting.vue',
    'app/components/setting/FsrsSetting.vue',
    'app/components/setting/WordSetting.vue',
    'app/components/setting/ArticleSetting.vue',
    'app/components/setting/SoundSetting.vue',
    'app/components/setting/SettingDialog.vue',
  ]) {
    const source = read(path)
    assert.doesNotMatch(source, DISABLED_SETTINGS_LEAK, path)
  }

  const wordSetting = read('app/components/setting/WordSetting.vue')
  assert.match(wordSetting, /\$t\('font_setting'\)/)
  assert.match(wordSetting, /settingStore\.fontSize\.wordForeignFontSize/)
  assert.doesNotMatch(wordSetting, /fonts\.(?:gstatic|googleapis)\.com|web-fonts/)
})
