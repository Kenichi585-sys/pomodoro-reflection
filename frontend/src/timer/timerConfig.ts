export type TimerPresetId = '25-5' | '52-17'

export type TimerPreset = {
  id: TimerPresetId
  label: string
  focusSeconds: number
  shortBreakSeconds: number
  longBreakSeconds: number | null
  focusCountBeforeLongBreak: number | null
}

export const TIMER_PRESETS: Record<TimerPresetId, TimerPreset> = {
  '25-5': {
    id: '25-5',
    label: '25分 / 5分',
    focusSeconds: 25 * 60,
    shortBreakSeconds: 5 * 60,
    longBreakSeconds: 15 * 60,
    focusCountBeforeLongBreak: 4,
  },
  '52-17': {
    id: '52-17',
    label: '52分 / 17分',
    focusSeconds: 52 * 60,
    shortBreakSeconds: 17 * 60,
    longBreakSeconds: null,
    focusCountBeforeLongBreak: null,
  },
}

export const formatClock = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const formatStudyTime = (totalSeconds: number) => {
  if (totalSeconds <= 0) return '0分'
  if (totalSeconds < 60) return '1分未満'

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (hours === 0) return `${minutes}分`
  if (minutes === 0) return `${hours}時間`
  return `${hours}時間${minutes}分`
}
