import { useCallback, useEffect, useState } from 'react'

import { useBreakMusic } from '../audio/useBreakMusic'
import { useBrownNoise } from '../audio/useBrownNoise'
import {
  formatClock,
  formatStudyTime,
  TIMER_PRESETS,
  TIMER_TEST_PRESETS,
  type TimerPresetId,
} from '../timer/timerConfig'

type TimerPhase = 'focus' | 'break' | 'waiting'
type TimerStatus = 'idle' | 'running' | 'paused'
type BreakKind = 'short' | 'long' | null

type TimerPanelProps = {
  showStudyTime: boolean
  onTimerNavigationLockChange: (locked: boolean) => void
}

const AUDIO_FADE_OUT_MILLISECONDS = 7_000

const calculateRemainingMilliseconds = (
  endTimeMs: number | null,
  fallbackRemainingMilliseconds: number,
  currentTimeMs = Date.now(),
) => {
  if (endTimeMs === null) return fallbackRemainingMilliseconds
  return Math.max(0, endTimeMs - currentTimeMs)
}

const calculateFadedAudioVolume = (baseVolume: number, remainingMilliseconds: number) => {
  const fadeRatio = Math.min(
    1,
    Math.max(0, remainingMilliseconds) / AUDIO_FADE_OUT_MILLISECONDS,
  )
  return baseVolume * fadeRatio
}

export const TimerPanel = ({
  showStudyTime,
  onTimerNavigationLockChange,
}: TimerPanelProps) => {
  const isTimerTestMode =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('timerTest') === '1'
  const timerPresets = isTimerTestMode ? TIMER_TEST_PRESETS : TIMER_PRESETS
  // 選択中の「25分／5分」または「52分／17分」。
  const [presetId, setPresetId] = useState<TimerPresetId>('25-5')
  // 今が学習中・休憩中・次の学習待ちのどれか。
  const [phase, setPhase] = useState<TimerPhase>('focus')
  // タイマーが開始前・動作中・一時停止中のどれか。
  const [status, setStatus] = useState<TimerStatus>('idle')
  // 休憩中なら、短い休憩か長い休憩か。休憩中でなければnull。
  const [breakKind, setBreakKind] = useState<BreakKind>(null)
  // 今の学習または休憩が、あと何ミリ秒残っているか。
  const [phaseRemainingMilliseconds, setPhaseRemainingMilliseconds] = useState(
    timerPresets['25-5'].focusSeconds * 1000,
  )
  // 今の学習または休憩は、全部で何ミリ秒か。円の進捗率の計算に使う。
  const [phaseDurationMilliseconds, setPhaseDurationMilliseconds] = useState(
    timerPresets['25-5'].focusSeconds * 1000,
  )
  // 今の学習または休憩が終わる時刻。停止中はnull。
  const [phaseEndAtMs, setPhaseEndAtMs] = useState<number | null>(null)
  // 開始・再開した時点で、あと何ミリ秒残っていたか。今回動いた時間の計算に使う。
  const [remainingAtRunStartMilliseconds, setRemainingAtRunStartMilliseconds] = useState(
    timerPresets['25-5'].focusSeconds * 1000,
  )
  // 残り時間の表示に使う現在時刻。
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  // 現在のタイマー設定で、学習を何回完了したか。
  const [completedFocusCount, setCompletedFocusCount] = useState(0)
  // 一時停止または完了までに、記録済みとなった学習時間。
  const [accumulatedFocusMilliseconds, setAccumulatedFocusMilliseconds] = useState(0)
  // 学習音と休憩音の音量。0が無音、1が最大。
  const [volume, setVolume] = useState(0.35)
  // 学習音と休憩音を消しているか。
  const [muted, setMuted] = useState(false)
  // 音の開始に失敗したとき、画面に出すメッセージ。
  const [audioWarning, setAudioWarning] = useState('')
  const {
    start: startBrownNoise,
    stop: stopBrownNoise,
    setVolume: setBrownNoiseVolume,
  } = useBrownNoise()
  const {
    start: startBreakMusic,
    pause: pauseBreakMusic,
    stop: stopBreakMusic,
    setVolume: setBreakMusicVolume,
  } = useBreakMusic()

  const preset = timerPresets[presetId]
  const isRunning = status === 'running'
  const visibleRemainingMilliseconds = isRunning
    ? calculateRemainingMilliseconds(
        phaseEndAtMs,
        phaseRemainingMilliseconds,
        currentTimeMs,
      )
    : phaseRemainingMilliseconds
  const playbackVolume = muted
    ? 0
    : calculateFadedAudioVolume(volume, visibleRemainingMilliseconds)
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
          setMuted(true)
          setAudioWarning(
            'ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。',
          )
          return
        }

        if (result === 'started') setAudioWarning('')
      })
    },
    [startBrownNoise],
  )

  const startBreakAudio = useCallback(
    (nextVolume: number) => {
      if (nextVolume === 0) return

      void startBreakMusic(nextVolume).then((result) => {
        if (result === 'failed') {
          setMuted(true)
          setAudioWarning(
            '休憩用の音楽を開始できませんでした。タイマーはそのまま利用できます。',
          )
          return
        }

        if (result === 'started') setAudioWarning('')
      })
    },
    [startBreakMusic],
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
      const nextFocusDurationMilliseconds = preset.focusSeconds * 1000

      setCompletedFocusCount(isLongBreak ? 0 : nextCompletedFocusCount)
      setPhase('waiting')
      setBreakKind(null)
      setStatus('idle')
      setPhaseRemainingMilliseconds(nextFocusDurationMilliseconds)
      setPhaseDurationMilliseconds(nextFocusDurationMilliseconds)
      setRemainingAtRunStartMilliseconds(nextFocusDurationMilliseconds)
      setPhaseEndAtMs(null)
      stopFocusAudio()
      stopBreakMusic()
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
    if (!muted) {
      startBreakAudio(
        calculateFadedAudioVolume(volume, breakRemainingMilliseconds),
      )
    }
  }, [
    completedFocusCount,
    preset.focusCountBeforeLongBreak,
    preset.longBreakSeconds,
    preset.shortBreakSeconds,
    preset.focusSeconds,
    remainingAtRunStartMilliseconds,
    muted,
    startBreakAudio,
    stopFocusAudio,
    stopBreakMusic,
    volume,
  ])

  const moveToWaiting = useCallback(() => {
    const nextFocusDurationMilliseconds = preset.focusSeconds * 1000

    if (breakKind === 'long') setCompletedFocusCount(0)
    setPhase('waiting')
    setBreakKind(null)
    setStatus('idle')
    setPhaseRemainingMilliseconds(nextFocusDurationMilliseconds)
    setPhaseDurationMilliseconds(nextFocusDurationMilliseconds)
    setRemainingAtRunStartMilliseconds(nextFocusDurationMilliseconds)
    setPhaseEndAtMs(null)
    stopBreakMusic()
  }, [breakKind, preset.focusSeconds, stopBreakMusic])

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
    setBrownNoiseVolume(playbackVolume)
    setBreakMusicVolume(playbackVolume)
  }, [playbackVolume, setBreakMusicVolume, setBrownNoiseVolume])

  const startOrResume = () => {
    const phaseToStart = phase === 'waiting' ? 'focus' : phase
    const focusDurationMilliseconds = preset.focusSeconds * 1000
    const remainingAtStartMilliseconds =
      phase === 'waiting' ? focusDurationMilliseconds : phaseRemainingMilliseconds

    setPhase(phaseToStart)
    setStatus('running')
    setPhaseRemainingMilliseconds(remainingAtStartMilliseconds)
    setPhaseDurationMilliseconds(
      phase === 'waiting' ? focusDurationMilliseconds : phaseDurationMilliseconds,
    )
    setRemainingAtRunStartMilliseconds(remainingAtStartMilliseconds)
    setPhaseEndAtMs(Date.now() + remainingAtStartMilliseconds)
    setCurrentTimeMs(Date.now())

    const volumeAtStart = calculateFadedAudioVolume(volume, remainingAtStartMilliseconds)
    if (phaseToStart === 'focus' && !muted) startFocusAudio(volumeAtStart)
    if (phaseToStart === 'break' && !muted) startBreakAudio(volumeAtStart)
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
    if (phase === 'focus') stopFocusAudio()
    if (phase === 'break') pauseBreakMusic()
  }

  const handleTimerControl = () => {
    if (isRunning) {
      pause()
      return
    }
    startOrResume()
  }

  const skipBreakAndStartFocus = () => {
    const focusDurationMilliseconds = preset.focusSeconds * 1000

    if (breakKind === 'long') setCompletedFocusCount(0)
    setPhase('focus')
    setBreakKind(null)
    setStatus('running')
    setPhaseRemainingMilliseconds(focusDurationMilliseconds)
    setPhaseDurationMilliseconds(focusDurationMilliseconds)
    setRemainingAtRunStartMilliseconds(focusDurationMilliseconds)
    setPhaseEndAtMs(Date.now() + focusDurationMilliseconds)
    setCurrentTimeMs(Date.now())
    stopBreakMusic()
    if (!muted) startFocusAudio(volume)
  }

  const changePreset = (nextPresetId: TimerPresetId) => {
    const nextPreset = timerPresets[nextPresetId]
    const nextFocusDurationMilliseconds = nextPreset.focusSeconds * 1000

    setPresetId(nextPresetId)
    setPhaseRemainingMilliseconds(nextFocusDurationMilliseconds)
    setPhaseDurationMilliseconds(nextFocusDurationMilliseconds)
    setRemainingAtRunStartMilliseconds(nextFocusDurationMilliseconds)
  }

  const toggleMute = () => {
    const nextMuted = !muted
    setMuted(nextMuted)

    if (nextMuted) {
      stopFocusAudio()
      pauseBreakMusic()
      return
    }

    const resumedVolume = calculateFadedAudioVolume(volume, visibleRemainingMilliseconds)
    if (isRunning && phase === 'focus' && volume > 0) {
      startFocusAudio(resumedVolume)
    }
    if (isRunning && phase === 'break' && volume > 0) {
      startBreakAudio(resumedVolume)
    }
  }

  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume)

    if (nextVolume === 0) {
      stopFocusAudio()
      pauseBreakMusic()
      return
    }

    if (volume === 0 && !muted && isRunning && phase === 'focus') {
      startFocusAudio(
        calculateFadedAudioVolume(nextVolume, visibleRemainingMilliseconds),
      )
    }
    if (volume === 0 && !muted && isRunning && phase === 'break') {
      startBreakAudio(
        calculateFadedAudioVolume(nextVolume, visibleRemainingMilliseconds),
      )
    }
  }

  const breakDurationLabel = isTimerTestMode
    ? `${Math.round(phaseDurationMilliseconds / 1000)}秒休憩`
    : `${Math.round(phaseDurationMilliseconds / 60_000)}分休憩`
  const phaseLabel =
    phase === 'focus'
      ? '学習'
      : phase === 'waiting'
        ? '次の学習を待機中'
        : breakDurationLabel
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
            {(Object.keys(timerPresets) as TimerPresetId[]).map((id) => (
              <button
                className={id === presetId ? 'preset-button is-selected' : 'preset-button'}
                type="button"
                key={id}
                disabled={hasTimerSessionStarted}
                aria-pressed={id === presetId}
                onClick={() => changePreset(id)}
              >
                {timerPresets[id].label}
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
