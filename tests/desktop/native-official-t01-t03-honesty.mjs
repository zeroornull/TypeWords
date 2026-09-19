// Official T01/T03 dest-runner honesty. Not a dest runner.
// Leftover dest SHA 99948E67 is pre-fix: old dest lacks leftover id-match /
// lastLearnIndex keep source fixes (V102/V104). Do not claim dest-green
// for leftover id-match / lastLearnIndex keep on SHA 99948E67.
// complete-20 → /words is official empty-task, not a Tauri 404.
// Do not treat old dest list-page navigation (/words /dict /articles)
// as leftover-20 proof. Do not invent a dest rematrix.

export const LEFTOVER_DEST_SHA256 =
  '99948E67C19B6C66501AE23D4DA643D31D4EE46B358F9063E5A9AFE972D77D72'
export const LEFTOVER_DEST_SHA_PREFIX = '99948E67'

export const OFFICIAL_COMPLETE20_WORD_PRACTICE_PATH = '/practice-words/backup-custom'
export const OFFICIAL_EMPTY_TASK_LANDING_PATH = '/words'
export const OFFICIAL_T03_HISTORY_PRACTICE_PATH = '/practice-articles/backup-articles'

export const DEST_LIST_PAGES = Object.freeze(['/words', '/dict', '/articles'])

export const OFFICIAL_T01_T03_DEST_RUNNERS = Object.freeze([
  'tests/desktop/native-local-practice.mjs',
  'tests/desktop/native-local-practice-matrix.mjs',
  'tests/desktop/native-local-practice-wrong-locate.mjs',
  'tests/desktop/native-official-pages.mjs',
])

export const OFFICIAL_T01_T03_STATUS = Object.freeze({
  T01: 'incomplete',
  T03: 'incomplete',
})

export const DEST_RUNNER_HONESTY_PHRASES = Object.freeze([
  '99948E67',
  'pre-fix',
  'id-match',
  'lastLearnIndex keep',
  'Do not claim dest-green',
  'complete-20',
  'official empty-task',
  'list-page navigation',
  'leftover-20 proof',
])

function pathOf(hrefOrPath) {
  if (hrefOrPath == null || hrefOrPath === '') return ''
  const raw = String(hrefOrPath)
  try {
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) {
      return new URL(raw).pathname.replace(/\/+$/, '') || '/'
    }
  } catch {
    return ''
  }
  const path = raw.split(/[?#]/, 1)[0]
  return path.replace(/\/+$/, '') || '/'
}

export function normalizeDestSha(sha256) {
  return String(sha256 || '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toUpperCase()
}

export function isLeftoverDestPreFix(sha256) {
  const sha = normalizeDestSha(sha256)
  return sha === LEFTOVER_DEST_SHA256 || sha.startsWith(LEFTOVER_DEST_SHA_PREFIX)
}

export function leftoverDestLacksSourceFixes(sha256) {
  return isLeftoverDestPreFix(sha256)
}

export function canClaimLeftoverDestGreen(sha256, claim) {
  if (claim !== 'id-match' && claim !== 'lastLearnIndex-keep') return false
  if (leftoverDestLacksSourceFixes(sha256)) return false
  return false
}

export function isDestListPage(path) {
  const normalized = pathOf(path)
  return DEST_LIST_PAGES.includes(normalized)
}

export function destListPageNavigationProvesLeftover20(input = {}) {
  void input.lastLearnIndex
  void input.sha256
  void input.path
  return false
}

export function isOfficialEmptyTaskComplete20Redirect(input = {}) {
  return (
    pathOf(input.fromPath) === OFFICIAL_COMPLETE20_WORD_PRACTICE_PATH &&
    pathOf(input.toPath) === OFFICIAL_EMPTY_TASK_LANDING_PATH
  )
}

export function officialT03WordPracticeHrefAccepted(href) {
  const path = pathOf(href)
  return path === OFFICIAL_COMPLETE20_WORD_PRACTICE_PATH || path === OFFICIAL_EMPTY_TASK_LANDING_PATH
}

export function leftoverDestHonesty(sha256) {
  const preFix = isLeftoverDestPreFix(sha256)
  return {
    sha256: normalizeDestSha(sha256),
    preFix,
    lacksSourceFixes: leftoverDestLacksSourceFixes(sha256),
    destGreenIdMatch: canClaimLeftoverDestGreen(sha256, 'id-match'),
    destGreenLastLearnIndexKeep: canClaimLeftoverDestGreen(sha256, 'lastLearnIndex-keep'),
    listPageNavigationIsLeftover20Proof: destListPageNavigationProvesLeftover20({
      sha256,
      path: '/words',
      lastLearnIndex: 20,
    }),
    complete20ToWordsIsOfficialEmptyTask: true,
    officialStatus: OFFICIAL_T01_T03_STATUS,
  }
}
