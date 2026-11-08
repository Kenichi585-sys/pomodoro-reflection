import {
  TIMER_PRESETS,
  type TimerPreset,
  type TimerPresetId,
} from './timerConfig'

export const TIMER_RECOVERY_VERSION = 2
const TIMER_RECOVERY_STORAGE_KEY_PREFIX = 'pomodoro-reflection:timer-recovery'

export type TimerRecoveryPhase = 'focus' | 'break' | 'waiting'
export type TimerRecoveryBreakKind = 'short' | 'long' | null
export type TimerRecoveryPendingStudyEnd = {
  endedAtMs: number
  studySeconds: number
  completedFocusCount: number
  isOutcomeUncertain: boolean
}

export type TimerRecoverySnapshot = {
  version: typeof TIMER_RECOVERY_VERSION
  savedAtMs: number
  sessionStartedAtMs: number
  clientUuid: string
  presetId: TimerPresetId
  phase: TimerRecoveryPhase
  breakKind: TimerRecoveryBreakKind
  phaseRemainingMilliseconds: number
  phaseDurationMilliseconds: number
  accumulatedFocusMilliseconds: number
  completedFocusCount: number
  pendingStudyEnd: TimerRecoveryPendingStudyEnd | null
}

export type TimerRecoveryLoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; snapshot: TimerRecoverySnapshot }
  | { status: 'invalid' }
  | { status: 'unavailable' }

type TimerRecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type TimerRecoveryPresets = Readonly<Record<TimerPresetId, TimerPreset>>

export const createTimerRecoveryStorageKey = (
  ownerKey: string,
  isTimerTestMode: boolean,
) =>
  `${TIMER_RECOVERY_STORAGE_KEY_PREFIX}:${isTimerTestMode ? 'test' : 'standard'}:${encodeURIComponent(ownerKey)}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonNegativeSafeNumber = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  Number.isSafeInteger(value) &&
  value >= 0

const isUuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )

const isTimerPresetId = (value: unknown): value is TimerPresetId =>
  value === '25-5' || value === '52-17'

const isTimerRecoveryPhase = (value: unknown): value is TimerRecoveryPhase =>
  value === 'focus' || value === 'break' || value === 'waiting'

const isTimerRecoveryBreakKind = (
  value: unknown,
): value is TimerRecoveryBreakKind => value === null || value === 'short' || value === 'long'

const isPendingStudyEnd = (
  value: unknown,
  sessionStartedAtMs: number,
  savedAtMs: number,
): value is TimerRecoveryPendingStudyEnd => {
  if (!isRecord(value)) return false

  const {
    endedAtMs,
    studySeconds,
    completedFocusCount,
    isOutcomeUncertain,
  } = value
  return (
    isNonNegativeSafeNumber(endedAtMs) &&
    endedAtMs >= sessionStartedAtMs &&
    endedAtMs <= savedAtMs &&
    isNonNegativeSafeNumber(studySeconds) &&
    studySeconds <= Math.floor((endedAtMs - sessionStartedAtMs) / 1000) &&
    isNonNegativeSafeNumber(completedFocusCount) &&
    typeof isOutcomeUncertain === 'boolean'
  )
}

const hasValidAccumulatedFocusTime = (
  phase: TimerRecoveryPhase,
  breakKind: TimerRecoveryBreakKind,
  focusDurationMilliseconds: number,
  phaseRemainingMilliseconds: number,
  accumulatedFocusMilliseconds: number,
  completedFocusCount: number,
  focusCountBeforeLongBreak: number | null,
) => {
  const completedFocusIntervals = Math.floor(
    accumulatedFocusMilliseconds / focusDurationMilliseconds,
  )
  const elapsedCurrentFocusMilliseconds =
    accumulatedFocusMilliseconds % focusDurationMilliseconds
  const expectedElapsedFocusMilliseconds =
    phase === 'focus'
      ? focusDurationMilliseconds - phaseRemainingMilliseconds
      : 0

  if (elapsedCurrentFocusMilliseconds !== expectedElapsedFocusMilliseconds) return false
  if (phase === 'waiting' && completedFocusIntervals === 0) return false

  if (focusCountBeforeLongBreak === null) {
    return completedFocusIntervals === completedFocusCount
  }

  if (phase === 'break' && breakKind === 'long') {
    return (
      completedFocusIntervals > 0 &&
      completedFocusIntervals % focusCountBeforeLongBreak === 0
    )
  }

  return completedFocusIntervals % focusCountBeforeLongBreak === completedFocusCount
}

const hasValidPresetState = (
  timerPresets: TimerRecoveryPresets,
  presetId: TimerPresetId,
  phase: TimerRecoveryPhase,
  breakKind: TimerRecoveryBreakKind,
  phaseRemainingMilliseconds: number,
  phaseDurationMilliseconds: number,
  accumulatedFocusMilliseconds: number,
  completedFocusCount: number,
) => {
  const preset = timerPresets[presetId]
  const focusDurationMilliseconds = preset.focusSeconds * 1000
  const focusCountBeforeLongBreak = preset.focusCountBeforeLongBreak

  if (!hasValidAccumulatedFocusTime(
    phase,
    breakKind,
    focusDurationMilliseconds,
    phaseRemainingMilliseconds,
    accumulatedFocusMilliseconds,
    completedFocusCount,
    focusCountBeforeLongBreak,
  )) {
    return false
  }

  if (phase === 'focus') {
    return (
      breakKind === null &&
      phaseDurationMilliseconds === focusDurationMilliseconds &&
      (focusCountBeforeLongBreak === null ||
        completedFocusCount < focusCountBeforeLongBreak)
    )
  }

  if (phase === 'waiting') {
    return (
      breakKind === null &&
      phaseDurationMilliseconds === focusDurationMilliseconds &&
      phaseRemainingMilliseconds === focusDurationMilliseconds &&
      (focusCountBeforeLongBreak === null
        ? completedFocusCount >= 1
        : completedFocusCount < focusCountBeforeLongBreak)
    )
  }

  if (breakKind === 'short') {
    return (
      phaseDurationMilliseconds === preset.shortBreakSeconds * 1000 &&
      completedFocusCount >= 1 &&
      (focusCountBeforeLongBreak === null ||
        completedFocusCount < focusCountBeforeLongBreak)
    )
  }

  return (
    breakKind === 'long' &&
    preset.longBreakSeconds !== null &&
    focusCountBeforeLongBreak !== null &&
    phaseDurationMilliseconds === preset.longBreakSeconds * 1000 &&
    completedFocusCount === focusCountBeforeLongBreak
  )
}

const isTimerRecoverySnapshot = (
  value: unknown,
  timerPresets: TimerRecoveryPresets,
): value is TimerRecoverySnapshot => {
  if (!isRecord(value)) return false

  const {
    version,
    savedAtMs,
    sessionStartedAtMs,
    clientUuid,
    presetId,
    phase,
    breakKind,
    phaseRemainingMilliseconds,
    phaseDurationMilliseconds,
    accumulatedFocusMilliseconds,
    completedFocusCount,
    pendingStudyEnd,
  } = value

  return (
    version === TIMER_RECOVERY_VERSION &&
    isNonNegativeSafeNumber(savedAtMs) &&
    isNonNegativeSafeNumber(sessionStartedAtMs) &&
    sessionStartedAtMs <= savedAtMs &&
    isUuid(clientUuid) &&
    isTimerPresetId(presetId) &&
    isTimerRecoveryPhase(phase) &&
    isTimerRecoveryBreakKind(breakKind) &&
    isNonNegativeSafeNumber(phaseRemainingMilliseconds) &&
    isNonNegativeSafeNumber(phaseDurationMilliseconds) &&
    phaseDurationMilliseconds > 0 &&
    phaseRemainingMilliseconds <= phaseDurationMilliseconds &&
    isNonNegativeSafeNumber(accumulatedFocusMilliseconds) &&
    isNonNegativeSafeNumber(completedFocusCount) &&
    (pendingStudyEnd === null ||
      isPendingStudyEnd(pendingStudyEnd, sessionStartedAtMs, savedAtMs)) &&
    hasValidPresetState(
      timerPresets,
      presetId,
      phase,
      breakKind,
      phaseRemainingMilliseconds,
      phaseDurationMilliseconds,
      accumulatedFocusMilliseconds,
      completedFocusCount,
    )
  )
}

export const loadTimerRecoverySnapshot = (
  storage: TimerRecoveryStorage,
  storageKey: string,
  timerPresets: TimerRecoveryPresets = TIMER_PRESETS,
): TimerRecoveryLoadResult => {
  let serializedSnapshot: string | null

  try {
    serializedSnapshot = storage.getItem(storageKey)
  } catch {
    return { status: 'unavailable' }
  }

  if (serializedSnapshot === null) return { status: 'empty' }

  try {
    const parsedSnapshot: unknown = JSON.parse(serializedSnapshot)
    return isTimerRecoverySnapshot(parsedSnapshot, timerPresets)
      ? { status: 'loaded', snapshot: parsedSnapshot }
      : { status: 'invalid' }
  } catch {
    return { status: 'invalid' }
  }
}

export const saveTimerRecoverySnapshot = (
  storage: TimerRecoveryStorage,
  storageKey: string,
  snapshot: TimerRecoverySnapshot,
  timerPresets: TimerRecoveryPresets = TIMER_PRESETS,
) => {
  if (!isTimerRecoverySnapshot(snapshot, timerPresets)) return false

  try {
    storage.setItem(storageKey, JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

export const removeTimerRecoverySnapshot = (
  storage: TimerRecoveryStorage,
  storageKey: string,
) => {
  try {
    storage.removeItem(storageKey)
    return true
  } catch {
    return false
  }
}
