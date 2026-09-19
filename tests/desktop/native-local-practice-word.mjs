const PRACTICE_WORD_RE = /^[A-Za-z][A-Za-z' -]*$/

export function isVisiblePracticeWord(value) {
  return typeof value === 'string' && PRACTICE_WORD_RE.test(value.trim())
}

export function isMaskedPracticeLetterText(value) {
  return typeof value === 'string' && /^[_\s\u00a0]+$/.test(value.trim())
}

export function resolveInstalledPracticeWord(sources = {}) {
  const ordered = [
    sources.propWord,
    sources.providedWord,
    sources.cacheWord,
    sources.revealedLetterText,
    sources.letterText,
  ]
  for (const candidate of ordered) {
    if (isVisiblePracticeWord(candidate)) return candidate.trim()
  }
  return ''
}
