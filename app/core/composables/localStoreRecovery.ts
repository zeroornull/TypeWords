export type LocalStoreKind = 'dict' | 'setting'
export type LocalStoreRecovery = 'first-run' | 'ok' | 'corrupt'

export const LOCAL_STORE_CORRUPT_MESSAGE = {
  dict: '本地词书数据无法读取，已使用空的本地状态继续。请用备份恢复。',
  setting: '本地设置无法读取，已使用默认设置继续。请用备份恢复。',
} as const

export function isLocalStoreAbsent(raw: unknown): boolean {
  return raw == null || raw === ''
}

export async function readLocalStoreRecord<T>(
  raw: unknown,
  parse: (value: string) => Promise<T>
): Promise<{ recovery: LocalStoreRecovery; record: T | null; reason?: string }> {
  if (isLocalStoreAbsent(raw)) {
    return { recovery: 'first-run', record: null }
  }
  if (typeof raw !== 'string') {
    return { recovery: 'corrupt', record: null, reason: 'stored value is not text' }
  }
  try {
    const record = await parse(raw)
    if (!record || typeof record !== 'object') {
      return { recovery: 'corrupt', record: null, reason: 'parsed value is not an object' }
    }
    return { recovery: 'ok', record }
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
        ? error.message
        : String(error)
    return {
      recovery: 'corrupt',
      record: null,
      reason: message,
    }
  }
}

export function notifyLocalStoreRecovery(
  recovery: LocalStoreRecovery,
  kind: LocalStoreKind,
  toast: { error: (message: string) => void }
) {
  if (recovery === 'corrupt') toast.error(LOCAL_STORE_CORRUPT_MESSAGE[kind])
}
