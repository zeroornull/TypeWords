export type ImeCompositionType = 'compositionstart' | 'compositionupdate' | 'compositionend'
export type ImeCompositionPhase = 'idle' | 'composing'

export interface ImeCompositionEvent {
  type: ImeCompositionType
  data?: string | null
}

export interface ImeKeyEvent {
  key?: string
  code?: string
  isComposing?: boolean
}

export interface ImeInputEvent {
  inputType?: string
  data?: string | null
  value?: string
}

export interface ImePracticeCommit {
  phase: ImeCompositionPhase
  keys: string[]
}

export function isImeComposingKey(event: ImeKeyEvent, phase: ImeCompositionPhase = 'idle'): boolean {
  return phase === 'composing' || event.isComposing === true || event.key === 'Process'
}

export function imeCompositionCommitKeys(type: ImeCompositionType, data?: string | null): string[] {
  if (type !== 'compositionend') return []
  return data ? [...data] : []
}

export function createImeCompositionGuard() {
  let phase: ImeCompositionPhase = 'idle'

  function onComposition(event: ImeCompositionEvent): ImePracticeCommit {
    if (event.type === 'compositionstart' || event.type === 'compositionupdate') {
      phase = 'composing'
      return { phase, keys: [] }
    }
    phase = 'idle'
    return { phase, keys: imeCompositionCommitKeys(event.type, event.data) }
  }

  function onInput(event: ImeInputEvent): ImePracticeCommit {
    if (phase === 'composing' || event.inputType === 'insertCompositionText') {
      return { phase, keys: [] }
    }
    if (event.inputType === 'deleteContentBackward') {
      return { phase, keys: ['Backspace'] }
    }
    const char = event.value?.slice(-1) || event.data?.slice(-1) || ''
    return { phase, keys: char ? [char] : [] }
  }

  function onKey(event: ImeKeyEvent): ImePracticeCommit {
    if (isImeComposingKey(event, phase) || !event.key) {
      return { phase, keys: [] }
    }
    return { phase, keys: [event.key] }
  }

  return {
    phase: () => phase,
    onComposition,
    onInput,
    onKey,
  }
}
