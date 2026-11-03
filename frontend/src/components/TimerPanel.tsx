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
  onTimerNavigationLockChange: (locked: boolean) => void
}

const calculateRemainingMilliseconds = (
  endTimeMs: number | null,
  fallbackRemainingMilliseconds: number,
  currentTimeMs = Date.now(),
) => {
  if (endTimeMs === null) return fallbackRemainingMilliseconds
  return Math.max(0, endTimeMs - currentTimeMs)
}

export const TimerPanel = ({
  showStudyTime,
  onTimerNavigationLockChange,
}: TimerPanelProps) => {
  const [presetId, setPresetId] = useState<TimerPresetId>('25-5')
  const [phase, setPhase] = useState<TimerPhase>('focus')
  const [status, setStatus] = useState<TimerStatus>('idle')
  const [breakKind, setBreakKind] = useState<BreakKind>(null)
  const [phaseRemainingMilliseconds, setPhaseRemainingMilliseconds] = useState(
    TIMER_PRESETS['25-5'].focusSeconds * 1000,
  )
  const [phaseDurationMilliseconds, setPhaseDurationMilliseconds] = useState(
    TIMER_PRESETS['25-5'].focusSeconds * 1000,
  )
  const [phaseEndAtMs, setPhaseEndAtMs] = useState<number | null>(null)
  const [remainingAtRunStartMilliseconds, setRemainingAtRunStartMilliseconds] = useState(
    TIMER_PRESETS['25-5'].focusSeconds * 1000,
  )
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [completedFocusCount, setCompletedFocusCount] = useState(0)
  const [accumulatedFocusMilliseconds, setAccumulatedFocusMilliseconds] = useState(0)
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
    ? calculateRemainingMilliseconds(
        phaseEndAtMs,
        phaseRemainingMilliseconds,
        currentTimeMs,
      )
    : phaseRemainingMilliseconds
  const visibleRemainingSeconds = Math.ceil(visibleRemainingMilliseconds / 1000)
  const activeFocusElapsedMilliseconds =
    isRunning && phase === 'focus'
      ? Math.max(0, remainingAtRunStartMilliseconds - visibleRemainingMilliseconds)
      : 0
  const sessionStudySeconds = Math.floor(
    (accumulatedFocusMilliseconds + activeFocusElapsedMilliseconds) / 1000,
  )
  const remainingRatio =
    phaseDurationMilliseconds === 0
      ? 0
      : visibleRemainingMilliseconds / phaseDurationMilliseconds
  const hasTimerSessionStarted =
    phase !== 'focus' ||
    status !== 'idle' ||
    accumulatedFocusMilliseconds > 0 ||
    completedFocusCount > 0

  useEffect(() => {
    onTimerNavigationLockChange(hasTimerSessionStarted)
  }, [hasTimerSessionStarted, onTimerNavigationLockChange])

  useEffect(() => {
    return () => onTimerNavigationLockChange(false)
  }, [onTimerNavigationLockChange])

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
    const breakDurationSeconds =
      isLongBreak && preset.longBreakSeconds !== null
        ? preset.longBreakSeconds
        : preset.shortBreakSeconds
    const breakDurationMilliseconds = breakDurationSeconds * 1000
    const breakEndAtMs = focusEndAtMs + breakDurationMilliseconds

    setAccumulatedFocusMilliseconds(
      (previousAccumulatedMilliseconds) =>
        previousAccumulatedMilliseconds + remainingAtRunStartMilliseconds,
    )

    if (currentTimeMs >= breakEndAtMs) {
      setCompletedFocusCount(isLongBreak ? 0 : nextCompletedFocusCount)
      setPhase('waiting')
      setBreakKind(null)
      setStatus('idle')
      setPhaseRemainingMilliseconds(preset.focusSeconds * 1000)
      setPhaseDurationMilliseconds(preset.focusSeconds * 1000)
      setRemainingAtRunStartMilliseconds(preset.focusSeconds * 1000)
      setPhaseEndAtMs(null)
      stopFocusAudio()
      return
    }

    const breakRemainingMilliseconds = calculateRemainingMilliseconds(
      breakEndAtMs,
      breakDurationMilliseconds,
      currentTimeMs,
    )
    setCompletedFocusCount(nextCompletedFocusCount)
    setPhase('break')
    setBreakKind(isLongBreak ? 'long' : 'short')
    setStatus('running')
    setPhaseRemainingMilliseconds(breakRemainingMilliseconds)
    setPhaseDurationMilliseconds(breakDurationMilliseconds)
    setRemainingAtRunStartMilliseconds(breakRemainingMilliseconds)
    setPhaseEndAtMs(breakEndAtMs)
    stopFocusAudio()
  }, [
    completedFocusCount,
    preset.focusCountBeforeLongBreak,
    preset.longBreakSeconds,
    preset.shortBreakSeconds,
    preset.focusSeconds,
    remainingAtRunStartMilliseconds,
    stopFocusAudio,
  ])

  const moveToWaiting = useCallback(() => {
    if (breakKind === 'long') setCompletedFocusCount(0)
    setPhase('waiting')
    setBreakKind(null)
    setStatus('idle')
    setPhaseRemainingMilliseconds(preset.focusSeconds * 1000)
    setPhaseDurationMilliseconds(preset.focusSeconds * 1000)
    setRemainingAtRunStartMilliseconds(preset.focusSeconds * 1000)
    setPhaseEndAtMs(null)
  }, [breakKind, preset.focusSeconds])

  useEffect(() => {
    if (!isRunning || phaseEndAtMs === null) return

    const tick = () => {
      const tickTimeMs = Date.now()
      setCurrentTimeMs(tickTimeMs)

      if (tickTimeMs < phaseEndAtMs) return
      if (phase === 'focus') moveToBreak(tickTimeMs, phaseEndAtMs)
      if (phase === 'break') moveToWaiting()
    }

    const intervalId = window.setInterval(tick, 250)
    return () => window.clearInterval(intervalId)
  }, [
    phaseEndAtMs,
    isRunning,
    moveToBreak,
    moveToWaiting,
    phase,
  ])

  useEffect(() => {
    setBrownNoiseVolume(muted ? 0 : volume)
  }, [muted, setBrownNoiseVolume, volume])

  const startOrResume = () => {
    const phaseToStart = phase === 'waiting' ? 'focus' : phase
    const remainingAtStartMilliseconds =
      phase === 'waiting'
        ? preset.focusSeconds * 1000
        : phaseRemainingMilliseconds

    setPhase(phaseToStart)
    setStatus('running')
    setPhaseRemainingMilliseconds(remainingAtStartMilliseconds)
    setPhaseDurationMilliseconds(
      phase === 'waiting' ? preset.focusSeconds * 1000 : phaseDurationMilliseconds,
    )
    setRemainingAtRunStartMilliseconds(remainingAtStartMilliseconds)
    setPhaseEndAtMs(Date.now() + remainingAtStartMilliseconds)
    setCurrentTimeMs(Date.now())

    if (phaseToStart === 'focus' && !muted) startFocusAudio(volume)
  }

  const pause = () => {
    const remainingAtPauseMilliseconds = calculateRemainingMilliseconds(
      phaseEndAtMs,
      phaseRemainingMilliseconds,
    )

    if (phase === 'focus') {
      setAccumulatedFocusMilliseconds(
        (previousAccumulatedMilliseconds) =>
          previousAccumulatedMilliseconds +
          Math.max(
            0,
            remainingAtRunStartMilliseconds - remainingAtPauseMilliseconds,
          ),
      )
    }

    setPhaseRemainingMilliseconds(remainingAtPauseMilliseconds)
    setRemainingAtRunStartMilliseconds(remainingAtPauseMilliseconds)
    setStatus('paused')
    setPhaseEndAtMs(null)
    stopFocusAudio()
  }

  const handleTimerControl = () => {
    if (isRunning) {
      pause()
      return
    }
    startOrResume()
  }

  const skipBreakAndStartFocus = () => {
    if (breakKind === 'long') setCompletedFocusCount(0)
    setPhase('focus')
    setBreakKind(null)
    setStatus('running')
    setPhaseRemainingMilliseconds(preset.focusSeconds * 1000)
    setPhaseDurationMilliseconds(preset.focusSeconds * 1000)
    setRemainingAtRunStartMilliseconds(preset.focusSeconds * 1000)
    setPhaseEndAtMs(Date.now() + preset.focusSeconds * 1000)
    setCurrentTimeMs(Date.now())
    if (!muted) startFocusAudio(volume)
  }

  const changePreset = (nextPresetId: TimerPresetId) => {
    const nextPreset = TIMER_PRESETS[nextPresetId]
    setPresetId(nextPresetId)
    setPhaseRemainingMilliseconds(nextPreset.focusSeconds * 1000)
    setPhaseDurationMilliseconds(nextPreset.focusSeconds * 1000)
    setRemainingAtRunStartMilliseconds(nextPreset.focusSeconds * 1000)
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
                disabled={hasTimerSessionStarted}
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
            onClick={handleTimerControl}
          >
            <span aria-hidden="true">{isRunning ? 'Ⅱ' : '▶'}</span>
          </button>

          {phase === 'break' && (
            <button
              className="text-button break-skip-button"
              type="button"
              onClick={skipBreakAndStartFocus}
            >
              休憩を切り上げて学習を始める
            </button>
          )}

          <dl className={showStudyTime ? 'timer-summary' : 'timer-summary is-single'}>
            {showStudyTime && (
              <div>
                <dt>今回の学習時間</dt>
                <dd>{formatStudyTime(sessionStudySeconds)}</dd>
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
