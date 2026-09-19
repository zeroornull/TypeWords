import { isVisiblePracticeWord } from './native-local-practice-word.mjs'

export const OFFICIAL_T01_WRONG_BOOK = {
  id: 'wordWrong',
  enName: 'wordWrong',
  name: '错词',
}

export const OFFICIAL_T01_ARTICLE_CACHE_KEY = 'PracticeSaveArticle'
export const OFFICIAL_T01_WRONG_CLEAR_TOAST = '还有错词，继续巩固一下吧'
export const OFFICIAL_T01_PLAN_SCENE = '内置词书完成 20 个单词；文章完成 5 句；切换设置后继续'
export const OFFICIAL_T01_PLAN_PASS = '输入判定、进度、错词和文章定位与 Web 基线一致'

export function wrongLetterForWord(word) {
  if (!isVisiblePracticeWord(word)) throw new Error('need a real session word')
  const first = word.trim()[0].toLowerCase()
  return first === 'z' ? 'q' : 'z'
}

export function isOfficialWrongBook(book) {
  const ids = [book?.id, book?.enName, book?.en_name].map(value => String(value ?? ''))
  return ids.includes(OFFICIAL_T01_WRONG_BOOK.id) || book?.name === OFFICIAL_T01_WRONG_BOOK.name
}

export function wrongBookWords(book) {
  return (book?.words || [])
    .map(item => (typeof item === 'string' ? item : item?.word))
    .filter(word => isVisiblePracticeWord(word))
    .map(word => word.trim())
}

export function wrongBookHasWord(book, word) {
  if (!isVisiblePracticeWord(word)) return false
  return wrongBookWords(book).includes(word.trim())
}

export function articleCursorTriple(cursor) {
  return {
    sectionIndex: Number(cursor?.sectionIndex ?? 0),
    sentenceIndex: Number(cursor?.sentenceIndex ?? 0),
    wordIndex: Number(cursor?.wordIndex ?? 0),
  }
}

export function articleCursorsEqual(left, right) {
  const a = articleCursorTriple(left)
  const b = articleCursorTriple(right)
  return a.sectionIndex === b.sectionIndex && a.sentenceIndex === b.sentenceIndex && a.wordIndex === b.wordIndex
}

export function isOriginArticleCursor(cursor) {
  const triple = articleCursorTriple(cursor)
  return triple.sectionIndex === 0 && triple.sentenceIndex === 0 && triple.wordIndex === 0
}

export function isMidArticlePosition(cursor, sentenceCount) {
  if (!cursor || cursor.isEnd) return false
  if (!Number.isFinite(sentenceCount) || sentenceCount < 2) return false
  const triple = articleCursorTriple(cursor)
  if (triple.sectionIndex < 0 || triple.sentenceIndex < 0 || triple.wordIndex < 0) return false
  if (triple.sentenceIndex >= sentenceCount) return false
  return !isOriginArticleCursor(triple)
}

export function isDomMidArticle(state) {
  if (!state || state.isEnd) return false
  const sentences = Number(state.sentenceCount || 0)
  const finished = Number(state.finishedDomSentences || 0)
  const wrote = Number(state.wroteCount || 0)
  if (sentences >= 2 && finished >= 1 && finished < sentences) return true
  if (wrote >= 2 && !state.isEnd) return true
  return isMidArticlePosition({ ...(state.cursor || {}), isEnd: state.isEnd }, sentences)
}

export function parseArticleCachePosition(raw) {
  if (raw == null) return null
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
  const val = parsed?.val || parsed
  const practiceData = val?.practiceData
  if (!practiceData || typeof practiceData !== 'object') return null
  return articleCursorTriple(practiceData)
}

export function sessionWrongWordKeys(list) {
  return (list || [])
    .map(item => (typeof item === 'string' ? item : item?.word))
    .filter(word => isVisiblePracticeWord(word))
    .map(word => word.trim())
}

export function sessionHasWrongWord(list, word) {
  if (!isVisiblePracticeWord(word)) return false
  return sessionWrongWordKeys(list).includes(word.trim())
}
