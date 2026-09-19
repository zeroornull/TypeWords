export const OFFICIAL_T01_UNIQUE_WORD_COUNT = 20
export const OFFICIAL_T01_ARTICLE_SENTENCE_COUNT = 5
export const OFFICIAL_T01_WORD_PRACTICE_MODE_SYSTEM = 0
export const OFFICIAL_T01_BUILTIN_WORD_BOOK = {
  id: 1,
  enName: 'cet4',
  name: 'CET-4',
  url: 'CET4_T.json',
  length: 2607,
}
export const OFFICIAL_T01_BUILTIN_ARTICLE_BOOK = {
  id: 246,
  enName: 'nce1',
  name: '新概念英语1（示例，5篇）',
  url: 'NCE_1.json',
  length: 5,
}
export const OFFICIAL_T01_PRACTICE_TYPE = {
  followWrite: 0,
  spell: 1,
  identify: 2,
  listen: 3,
  dictation: 4,
}

export const OFFICIAL_T01_SEED_WORDS = [
  'fixture',
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
  'kilo',
  'lima',
  'mike',
  'november',
  'oscar',
  'papa',
  'quebec',
  'romeo',
  'sierra',
]

export const OFFICIAL_T01_ARTICLE_SENTENCES = [
  'This is a fixture.',
  'Birds fly south.',
  'Cats drink milk.',
  'Dogs chase balls.',
  'Kids read books.',
]

export const OFFICIAL_T01_ARTICLE_TRANSLATES = [
  '这是隔离测试。',
  '鸟儿往南飞。',
  '猫喝牛奶。',
  '狗追球。',
  '孩子读书。',
]

export function buildOfficialT01SeedWord(word) {
  if (typeof word !== 'string' || word.trim() === '') throw new Error('empty word.word')
  const value = word.trim()
  return {
    id: `t01-${value}`,
    custom: true,
    word: value,
    phonetic0: '',
    phonetic1: '',
    trans: ['T01 matrix'],
    sentences: [],
    phrases: [],
    synos: [],
    relWords: { root: '', rels: [] },
    etymology: [],
  }
}

export function officialT01ArticleText() {
  return OFFICIAL_T01_ARTICLE_SENTENCES.join('\n')
}

export function officialT01ArticleTranslate() {
  return OFFICIAL_T01_ARTICLE_TRANSLATES.join('\n')
}

export function countOfficialT01ArticleSentences(text) {
  return String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean).length
}

export function uniqueNonEmptyWords(words) {
  const unique = []
  const seen = new Set()
  for (const word of words || []) {
    if (typeof word !== 'string' || word.trim() === '') continue
    const value = word.trim()
    if (seen.has(value)) continue
    seen.add(value)
    unique.push(value)
  }
  return unique
}
