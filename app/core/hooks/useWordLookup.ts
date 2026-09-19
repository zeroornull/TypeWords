import { reactive } from 'vue'
import { DESKTOP_WORD_QUERY_DISABLED_MESSAGE, isDesktopWordQueryEnabled } from '../config/desktopOnlineFeatures.ts'
import type { Word } from '../types'
import { resolveWordLookup, resolveWordLookupEmptyCopy, stripWordPunctuation } from '../utils/wordLookup.ts'

export const wordLookupState = reactive({
  visible: false,
  loading: false,
  notFound: false,
  queryWord: '',
  httpMessage: '',
  data: null as Word | null,
  x: 0,
  y: 0,
})

function applyLookupResolution(rawWord: string, httpMessage = '') {
  const runtime = useRuntimeConfig().public
  const query = rawWord.trim()
  const officialDisabled =
    resolveWordLookupEmptyCopy({
      isDesktop: Boolean(runtime.isDesktop),
      desktopApiBase: runtime.desktopApiBase,
      httpMessage,
    }) === DESKTOP_WORD_QUERY_DISABLED_MESSAGE

  wordLookupState.queryWord = query
  wordLookupState.httpMessage = officialDisabled ? DESKTOP_WORD_QUERY_DISABLED_MESSAGE : httpMessage
  wordLookupState.data = null
  wordLookupState.notFound = Boolean(query) && !officialDisabled
  wordLookupState.loading = false
}

function updatePosition(target: HTMLElement) {
  const rect = target.getBoundingClientRect()
  wordLookupState.x = rect.left + rect.width / 2
  wordLookupState.y = rect.bottom + 8
}

async function fetchWordData(rawWord: string) {
  const runtime = useRuntimeConfig().public
  if (runtime.isDesktop && !isDesktopWordQueryEnabled(runtime.desktopApiBase)) {
    applyLookupResolution(rawWord, DESKTOP_WORD_QUERY_DISABLED_MESSAGE)
    return
  }

  const result = await resolveWordLookup(rawWord)
  if (!result.query) {
    applyLookupResolution('', result.httpMessage)
    return
  }

  if (!result.data) {
    applyLookupResolution(result.query, result.httpMessage)
    return
  }

  wordLookupState.queryWord = result.query
  wordLookupState.httpMessage = ''
  wordLookupState.data = result.data
  wordLookupState.notFound = false
  wordLookupState.loading = false
}

export function closeWordLookup() {
  wordLookupState.visible = false
}

export async function lookupWord(e: MouseEvent, rawWord: string, playAudio?: (word: string) => void) {
  e.stopPropagation()
  const target = e.currentTarget as HTMLElement | null
  if (!target) return

  updatePosition(target)
  wordLookupState.visible = true
  wordLookupState.loading = true
  wordLookupState.notFound = false
  wordLookupState.httpMessage = ''
  wordLookupState.data = null

  const stripped = stripWordPunctuation(rawWord)
  if (stripped) {
    playAudio?.(stripped)
  }

  await fetchWordData(rawWord)
  if (wordLookupState.visible && target.isConnected) {
    updatePosition(target)
  }
}

export function useWordLookup() {
  return {
    state: wordLookupState,
    lookupWord,
    close: closeWordLookup,
  }
}
