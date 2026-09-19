export type DictResourceLoadStatus = 'ok' | 'miss' | 'error'

export const DICT_RESOURCE_MISS_MESSAGE = '词库资源无法加载，已使用空词表继续。请稍后重试或返回词书列表。'

export function isDictResourceAbsent(payload: unknown): boolean {
  return payload == null || payload === ''
}

export function isDictResourceHttpMiss(status: number): boolean {
  return !Number.isFinite(status) || status < 200 || status >= 300
}

export async function readDictResourcePayload<T>(
  load: () => Promise<{ ok: boolean; status: number; payload: T }>
): Promise<{ status: DictResourceLoadStatus; payload: T | null; reason?: string }> {
  try {
    const response = await load()
    if (!response.ok || isDictResourceHttpMiss(response.status)) {
      return {
        status: 'miss',
        payload: null,
        reason: `HTTP ${response.status}`,
      }
    }
    if (isDictResourceAbsent(response.payload)) {
      return {
        status: 'miss',
        payload: null,
        reason: 'empty dictionary resource',
      }
    }
    return { status: 'ok', payload: response.payload }
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : String(error)
    return {
      status: 'error',
      payload: null,
      reason: message,
    }
  }
}

export function notifyDictResourceLoad(status: DictResourceLoadStatus, toast: { warning: (message: string) => void }) {
  if (status === 'miss' || status === 'error') toast.warning(DICT_RESOURCE_MISS_MESSAGE)
}

export type LeftoverDictResource = {
  words?: unknown
  articles?: unknown
  length?: unknown
  lastLearnIndex?: unknown
}

/** Apply fetched official words/articles onto leftover dest books. Empty miss must not wipe leftover lastLearnIndex/length. */
export function applyFetchedDictResource<T extends LeftoverDictResource>(leftover: T, fetched?: T | null): T {
  if (!leftover || typeof leftover !== 'object') return leftover
  const words = Array.isArray(fetched?.words) ? fetched.words : null
  const articles = Array.isArray(fetched?.articles) ? fetched.articles : null
  if (words?.length) {
    leftover.words = words
    leftover.length = words.length
  }
  if (articles?.length) {
    leftover.articles = articles
    leftover.length = articles.length
  }
  return leftover
}

function leftoverLearnIndex(book: LeftoverDictResource | null | undefined): number {
  const leftover = Number(book?.lastLearnIndex)
  return Number.isFinite(leftover) ? leftover : 0
}

/** Skip lastLearnIndex clamp while leftover official words are still empty. */
export function resolveLastLearnIndex(book: LeftoverDictResource | null | undefined, nextIndex?: unknown): number {
  const current = leftoverLearnIndex(book)
  const words = Array.isArray(book?.words) ? book.words : []
  if (!words.length) return current
  const candidate = nextIndex === undefined ? current : Number(nextIndex)
  const safe = Number.isFinite(candidate) ? candidate : current
  if (safe < 0) return 0
  return safe > words.length ? words.length : safe
}

/** Slider/list bound: empty official words must not use words.length===0 as a 0-max clamp. */
export function leftoverLearnIndexBound(book: LeftoverDictResource | null | undefined): number {
  const words = Array.isArray(book?.words) ? book.words.length : 0
  if (words) return words
  const length = Number(book?.length)
  return Math.max(Number.isFinite(length) ? length : 0, leftoverLearnIndex(book))
}
