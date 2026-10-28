import { useCallback, useEffect, useState } from 'react'

import { useBrownNoise } from '../audio/useBrownNoise'
import {
  formatClock,
  formatStudyTime,
  TIMER_PRESETS,
  type TimerPresetId,
} from '../timer/timerConfig'

type TimerPhase = 'focus' | 'break' | 'waiting'
type TimerStatus = 'idle' | 'running' | 'paused'
type BreakKind = 'short' | 'long' | null

type TimerPanelProps = {
  showStudyTime: boolean
  onTimerLockChange: (locked: boolean) => void
}

const remainingMillisecondsAt = (
  endAtMs: number | null,
  fallbackMilliseconds: number,
  currentTimeMs = Date.now(),
) => {
  if (endAtMs === null) return fallbackMilliseconds
  return Math.max(0, endAtMs - currentTimeMs)
}

export const TimerPanel = ({ showStudyTime, onTimerLockChange }: TimerPanelProps) => {
  const [presetId, setPresetId] = useState<TimerPresetId>('25-5')
  const [phase, setPhase] = useState<TimerPhase>('focus')
  const [status, setStatus] = useState<TimerStatus>('idle')
  const [breakKind, setBreakKind] = useState<BreakKind>(null)
  const [remainingMilliseconds, setRemainingMilliseconds] = useState(
    TIMER_PRESETS['25-5'].focusSeconds * 1000,
  )
  const [phaseDurationMilliseconds, setPhaseDurationMilliseconds] = useState(
    TIMER_PRESETS['25-5'].focusSeconds * 1000,
  )
  const [endAtMs, setEndAtMs] = useState<number | null>(null)
  const [runStartedRemainingMilliseconds, setRunStartedRemainingMilliseconds] = useState(
    TIMER_PRESETS['25-5'].focusSeconds * 1000,
  )
  const [nowMs, setNowMs] = useState(0)
  const [completedFocusCount, setCompletedFocusCount] = useState(0)
  const [recordedFocusMilliseconds, setRecordedFocusMilliseconds] = useState(0)
  const [volume, setVolume] = useState(0.35)
  const [muted, setMuted] = useState(false)
  const [audioWarning, setAudioWarning] = useState('')
  const {
    start: startBrownNoise,
    stop: stopBrownNoise,
    setVolume: setBrownNoiseVolume,
  } = useBrownNoise()

  const preset = TIMER_PRESETS[presetId]
  const isRunning = status === 'running'
  const visibleRemainingMilliseconds = isRunning
    ? remainingMillisecondsAt(endAtMs, remainingMilliseconds, nowMs)
    : remainingMilliseconds
  const visibleRemainingSeconds = Math.ceil(visibleRemainingMilliseconds / 1000)
  const currentFocusRunMilliseconds =
    isRunning && phase === 'focus'
      ? Math.max(0, runStartedRemainingMilliseconds - visibleRemainingMilliseconds)
      : 0
  const sessionFocusSeconds = Math.floor(
    (recordedFocusMilliseconds + currentFocusRunMilliseconds) / 1000,
  )
  const remainingRatio =
    phaseDurationMilliseconds === 0
      ? 0
      : visibleRemainingMilliseconds / phaseDurationMilliseconds
  const timerHasProgress =
    phase !== 'focus' ||
    status !== 'idle' ||
    recordedFocusMilliseconds > 0 ||
    completedFocusCount > 0

  useEffect(() => {
    onTimerLockChange(timerHasProgress)
  }, [onTimerLockChange, timerHasProgress])

  useEffect(() => {
    return () => onTimerLockChange(false)
  }, [onTimerLockChange])

  const stopFocusAudio = useCallback(() => {
    stopBrownNoise()
    setAudioWarning('')
  }, [stopBrownNoise])

  const startFocusAudio = useCallback(
    (nextVolume: number) => {
      if (nextVolume === 0) return

      void startBrownNoise(nextVolume).then((result) => {
        if (result === 'failed') {
          setAudioWarning(
            'ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。',
          )
        }
      })
    },
    [startBrownNoise],
  )

  const moveToBreak = useCallback((currentTimeMs: number, focusEndAtMs: number) => {
    const nextCompletedFocusCount = completedFocusCount + 1
    const isLongBreak =
      preset.focusCountBeforeLongBreak !== null &&
      nextCompletedFocusCount === preset.focusCountBeforeLongBreak
    const nextBreakSeconds =
      isLongBreak && preset.longBreakSeconds !== null
        ? preset.longBreakSeconds
        : preset.shortBreakSeconds
    const nextBreakMilliseconds = nextBreakSeconds * 1000
    const breakEndAtMs = focusEndAtMs + nextBreakMilliseconds

    setRecordedFocusMilliseconds(
      (currentMilliseconds) =>
        currentMilliseconds + runStartedRemainingMilliseconds,
    )

    if (currentTimeMs >= breakEndAtMs) {
      setCompletedFocusCount(isLongBreak ? 0 : nextCompletedFocusCount)
      setPhase('waiting')
      setBreakKind(null)
      setStatus('idle')
      setRemainingMilliseconds(preset.focusSeconds * 1000)
      setPhaseDurationMilliseconds(preset.focusSeconds * 1000)
      setRunStartedRemainingMilliseconds(preset.focusSeconds * 1000)
      setEndAtMs(null)
      stopFocusAudio()
      return
    }

    const nextRemainingMilliseconds = remainingMillisecondsAt(
      breakEndAtMs,
      nextBreakMilliseconds,
      currentTimeMs,
    )
    setCompletedFocusCount(nextCompletedFocusCount)
    setPhase('break')
    setBreakKind(isLongBreak ? 'long' : 'short')
    setStatus('running')
    setRemainingMilliseconds(nextRemainingMilliseconds)
    setPhaseDurationMilliseconds(nextBreakMilliseconds)
    setRunStartedRemainingMilliseconds(nextRemainingMilliseconds)
    setEndAtMs(breakEndAtMs)
    stopFocusAudio()
  }, [
    completedFocusCount,
    preset.focusCountBeforeLongBreak,
    preset.longBreakSeconds,
    preset.shortBreakSeconds,
    preset.focusSeconds,
    runStartedRemainingMilliseconds,
    stopFocusAudio,
  ])

  const moveToWaiting = useCallback(() => {
    if (breakKind === 'long') setCompletedFocusCount(0)
    setPhase('waiting')
    setBreakKind(null)
    setStatus('idle')
    setRemainingMilliseconds(preset.focusSeconds * 1000)
    setPhaseDurationMilliseconds(preset.focusSeconds * 1000)
    setRunStartedRemainingMilliseconds(preset.focusSeconds * 1000)
    setEndAtMs(null)
  }, [breakKind, preset.focusSeconds])

  useEffect(() => {
    if (!isRunning || endAtMs === null) return

    const tick = () => {
      const currentTimeMs = Date.now()
      setNowMs(currentTimeMs)

      if (currentTimeMs < endAtMs) return
      if (phase === 'focus') moveToBreak(currentTimeMs, endAtMs)
      if (phase === 'break') moveToWaiting()
    }

    const intervalId = window.setInterval(tick, 250)
    return () => window.clearInterval(intervalId)
  }, [
    endAtMs,
    isRunning,
    moveToBreak,
    moveToWaiting,
    phase,
  ])

  useEffect(() => {
    setBrownNoiseVolume(muted ? 0 : volume)
  }, [muted, setBrownNoiseVolume, volume])

  const startOrResume = () => {
    const nextPhase = phase === 'waiting' ? 'focus' : phase
    const nextRemainingMilliseconds =
      phase === 'waiting' ? preset.focusSeconds * 1000 : remainingMilliseconds

    setPhase(nextPhase)
    setStatus('running')
    setRemainingMilliseconds(nextRemainingMilliseconds)
    setPhaseDurationMilliseconds(
      phase === 'waiting' ? preset.focusSeconds * 1000 : phaseDurationMilliseconds,
    )
    setRunStartedRemainingMilliseconds(nextRemainingMilliseconds)
    setEndAtMs(Date.now() + nextRemainingMilliseconds)
    setNowMs(Date.now())

    if (nextPhase === 'focus' && !muted) startFocusAudio(volume)
  }

  const pause = () => {
    const nextRemainingMilliseconds = remainingMillisecondsAt(
      endAtMs,
      remainingMilliseconds,
    )

    if (phase === 'focus') {
      setRecordedFocusMilliseconds(
        (currentMilliseconds) =>
          currentMilliseconds +
          Math.max(
            0,
            runStartedRemainingMilliseconds - nextRemainingMilliseconds,
          ),
      )
    }

    setRemainingMilliseconds(nextRemainingMilliseconds)
    setRunStartedRemainingMilliseconds(nextRemainingMilliseconds)
    setStatus('paused')
    setEndAtMs(null)
    stopFocusAudio()
  }

  const handlePrimaryAction = () => {
    if (isRunning) {
      pause()
      return
    }
    startOrResume()
  }

  const startFocusEarly = () => {
    if (breakKind === 'long') setCompletedFocusCount(0)
    setPhase('focus')
    setBreakKind(null)
    setStatus('running')
    setRemainingMilliseconds(preset.focusSeconds * 1000)
    setPhaseDurationMilliseconds(preset.focusSeconds * 1000)
    setRunStartedRemainingMilliseconds(preset.focusSeconds * 1000)
    setEndAtMs(Date.now() + preset.focusSeconds * 1000)
    setNowMs(Date.now())
    if (!muted) startFocusAudio(volume)
  }

  const changePreset = (nextPresetId: TimerPresetId) => {
    const nextPreset = TIMER_PRESETS[nextPresetId]
    setPresetId(nextPresetId)
    setRemainingMilliseconds(nextPreset.focusSeconds * 1000)
    setPhaseDurationMilliseconds(nextPreset.focusSeconds * 1000)
    setRunStartedRemainingMilliseconds(nextPreset.focusSeconds * 1000)
  }

  const toggleMute = () => {
    const nextMuted = !muted
    setMuted(nextMuted)

    if (nextMuted) {
      stopFocusAudio()
      return
    }

    if (isRunning && phase === 'focus' && volume > 0) {
      startFocusAudio(volume)
    }
  }

  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume)

    if (nextVolume === 0) {
      stopFocusAudio()
      return
    }

    if (volume === 0 && !muted && isRunning && phase === 'focus') {
      startFocusAudio(nextVolume)
    }
  }

  const breakMinutes = Math.round(phaseDurationMilliseconds / 60_000)
  const phaseLabel =
    phase === 'focus'
      ? '学習'
      : phase === 'waiting'
        ? '次の学習を待機中'
        : `${breakMinutes}分休憩`
  const primaryActionLabel = isRunning
    ? `${phaseLabel}を一時停止`
    : phase === 'waiting'
      ? '学習を始める'
      : status === 'paused'
        ? `${phaseLabel}を再開`
        : `${phaseLabel}を開始`

  return (
    <section
      className={phase === 'break' ? 'timer-stage is-break' : 'timer-stage'}
      aria-labelledby="timer-heading"
    >
      <div className="timer-layout">
        <div className="timer-visual">
          <div className="preset-selector" aria-label="タイマー設定">
            {(Object.keys(TIMER_PRESETS) as TimerPresetId[]).map((id) => (
              <button
                className={id === presetId ? 'preset-button is-selected' : 'preset-button'}
                type="button"
                key={id}
                disabled={timerHasProgress}
                aria-pressed={id === presetId}
                onClick={() => changePreset(id)}
              >
                {TIMER_PRESETS[id].label}
              </button>
            ))}
          </div>

          <h1 className="timer-phase" id="timer-heading">
            {phaseLabel}
          </h1>

          <div
            className="timer-dial"
            aria-label={`${phaseLabel} ${formatClock(visibleRemainingSeconds)}`}
          >
            <svg viewBox="0 0 240 240" role="presentation" aria-hidden="true">
              {presetId === '25-5' && (
                <g className="cycle-ring">
                  {[0, 1, 2, 3].map((index) => (
                    <circle
                      className={index < completedFocusCount ? 'cycle-segment is-complete' : 'cycle-segment'}
                      cx="120"
                      cy="120"
                      r="108"
                      pathLength="100"
                      strokeDasharray="21 79"
                      strokeDashoffset={-(index * 25 + 2)}
                      key={index}
                    />
                  ))}
                </g>
              )}
              <circle className="timer-track" cx="120" cy="120" r="88" pathLength="100" />
              <circle
                className="timer-progress"
                cx="120"
                cy="120"
                r="88"
                pathLength="100"
                strokeDasharray={`${remainingRatio * 100} 100`}
              />
            </svg>
            <div className="timer-time" aria-hidden="true">
              {formatClock(visibleRemainingSeconds)}
            </div>
          </div>
        </div>

        <div className="timer-controls">
          <button
            className="timer-primary-button"
            type="button"
            aria-label={primaryActionLabel}
            title={primaryActionLabel}
            onClick={handlePrimaryAction}
          >
            <span aria-hidden="true">{isRunning ? 'Ⅱ' : '▶'}</span>
          </button>

          {phase === 'break' && (
            <button className="text-button break-skip-button" type="button" onClick={startFocusEarly}>
              休憩を切り上げて学習を始める
            </button>
          )}

          <dl className={showStudyTime ? 'timer-summary' : 'timer-summary is-single'}>
            {showStudyTime && (
              <div>
                <dt>今回の学習時間</dt>
                <dd>{formatStudyTime(sessionFocusSeconds)}</dd>
              </div>
            )}
            {presetId === '25-5' && (
              <div>
                <dt>完了した学習</dt>
                <dd>{completedFocusCount} / 4回</dd>
              </div>
            )}
          </dl>

          <div className="sound-controls">
            <button className="sound-toggle" type="button" aria-pressed={muted} onClick={toggleMute}>
              {muted ? '音を出す' : 'ミュート'}
            </button>
            <label htmlFor="timer-volume">音量</label>
            <input
              id="timer-volume"
              type="range"
              min="0"
              max="100"
              value={Math.round(volume * 100)}
              onChange={(event) => changeVolume(Number(event.target.value) / 100)}
            />
          </div>

          {audioWarning && (
            <p className="timer-warning" role="status">
              {audioWarning}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
