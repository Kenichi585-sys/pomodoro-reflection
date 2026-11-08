import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client";
import type {
  CreateStudyRecordInput,
  CreateStudyRecordOptions,
  StudyRecord,
} from "../api/studyRecords";
import { useBreakMusic } from "../audio/useBreakMusic";
import { useBrownNoise } from "../audio/useBrownNoise";
import {
  formatClock,
  formatStudyTime,
  TIMER_PRESETS,
  TIMER_TEST_PRESETS,
  type TimerPresetId,
} from "../timer/timerConfig";
import {
  createTimerRecoveryStorageKey,
  loadTimerRecoverySnapshot,
  removeTimerRecoverySnapshot,
  saveTimerRecoverySnapshot,
  TIMER_RECOVERY_VERSION,
  type TimerRecoverySnapshot,
} from "../timer/timerRecovery";

type TimerPhase = "focus" | "break" | "waiting";
type TimerStatus = "idle" | "running" | "paused";
type BreakKind = "short" | "long" | null;

type TimerPanelProps = {
  showStudyTime: boolean;
  recoveryOwnerKey: string;
  onCreateStudyRecord?: (
    input: CreateStudyRecordInput,
    options?: CreateStudyRecordOptions,
  ) => Promise<StudyRecord>;
  onTimerNavigationLockChange: (locked: boolean) => void;
};

type PendingStudyEnd = {
  endedAtMs: number;
  studySeconds: number;
  completedFocusCount: number;
};

type SessionCompletion = {
  kind: "saved" | "discarded";
  studySeconds: number;
};

const AUDIO_FADE_OUT_MILLISECONDS = 5_000;
const TIMER_RECOVERY_SAVE_INTERVAL_MILLISECONDS = 5_000;

const loadInitialRecoveryState = (
  storageKey: string,
  timerPresets: typeof TIMER_PRESETS,
) => {
  try {
    const result = loadTimerRecoverySnapshot(
      window.localStorage,
      storageKey,
      timerPresets,
    );

    if (result.status === "loaded") {
      return { snapshot: result.snapshot, warning: "" };
    }
    if (result.status === "invalid") {
      return {
        snapshot: null,
        warning:
          "前回のタイマー情報を読み込めませんでした。新しいタイマーを利用できます。",
      };
    }
    if (result.status === "unavailable") {
      return {
        snapshot: null,
        warning:
          "タイマーの復旧用データを確認できませんでした。新しいタイマーを利用できます。",
      };
    }
  } catch {
    return {
      snapshot: null,
      warning:
        "タイマーの復旧用データを確認できませんでした。新しいタイマーを利用できます。",
    };
  }

  return { snapshot: null, warning: "" };
};

const calculateRemainingMilliseconds = (
  endTimeMs: number | null,
  fallbackRemainingMilliseconds: number,
  currentTimeMs = Date.now(),
) => {
  if (endTimeMs === null) return fallbackRemainingMilliseconds;
  return Math.max(0, endTimeMs - currentTimeMs);
};

const calculateFadedAudioVolume = (
  baseVolume: number,
  remainingMilliseconds: number,
) => {
  const fadeRatio = Math.min(
    1,
    Math.max(0, remainingMilliseconds) / AUDIO_FADE_OUT_MILLISECONDS,
  );
  return baseVolume * fadeRatio;
};

export const TimerPanel = ({
  showStudyTime,
  recoveryOwnerKey,
  onCreateStudyRecord,
  onTimerNavigationLockChange,
}: TimerPanelProps) => {
  const isTimerTestMode =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("timerTest") === "1";
  const timerPresets = isTimerTestMode ? TIMER_TEST_PRESETS : TIMER_PRESETS;
  const recoveryStorageKey = createTimerRecoveryStorageKey(
    recoveryOwnerKey,
    isTimerTestMode,
  );
  const [initialRecoveryState] = useState(() =>
    loadInitialRecoveryState(recoveryStorageKey, timerPresets),
  );
  const [pendingRecoverySnapshot, setPendingRecoverySnapshot] =
    useState<TimerRecoverySnapshot | null>(initialRecoveryState.snapshot);
  // 今回の学習を最初に開始した時刻。学習記録の開始日時に使う。
  const [sessionStartedAtMs, setSessionStartedAtMs] = useState<number | null>(
    null,
  );
  // 同じ学習記録を重複保存しないための識別子。
  const [sessionClientUuid, setSessionClientUuid] = useState<string | null>(
    null,
  );
  // 選択中の「25分／5分」または「52分／17分」。
  const [presetId, setPresetId] = useState<TimerPresetId>("25-5");
  // 今が学習中・休憩中・次の学習待ちのどれか。
  const [phase, setPhase] = useState<TimerPhase>("focus");
  // タイマーが開始前・動作中・一時停止中のどれか。
  const [status, setStatus] = useState<TimerStatus>("idle");
  // 休憩中なら、短い休憩か長い休憩か。休憩中でなければnull。
  const [breakKind, setBreakKind] = useState<BreakKind>(null);
  // 今の学習または休憩が、あと何ミリ秒残っているか。
  const [phaseRemainingMilliseconds, setPhaseRemainingMilliseconds] = useState(
    timerPresets["25-5"].focusSeconds * 1000,
  );
  // 今の学習または休憩は、全部で何ミリ秒か。円の進捗率の計算に使う。
  const [phaseDurationMilliseconds, setPhaseDurationMilliseconds] = useState(
    timerPresets["25-5"].focusSeconds * 1000,
  );
  // 今の学習または休憩が終わる時刻。一時停止中と待機中はnull。
  const [phaseEndAtMs, setPhaseEndAtMs] = useState<number | null>(null);
  // 開始・再開した時点で、あと何ミリ秒残っていたか。今回動いた時間の計算に使う。
  const [remainingAtRunStartMilliseconds, setRemainingAtRunStartMilliseconds] =
    useState(timerPresets["25-5"].focusSeconds * 1000);
  // 残り時間の表示に使う現在時刻。
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  // 現在のタイマー設定で、学習を何回完了したか。
  const [completedFocusCount, setCompletedFocusCount] = useState(0);
  // 一時停止または完了までに、記録済みとなった学習時間。
  const [accumulatedFocusMilliseconds, setAccumulatedFocusMilliseconds] =
    useState(0);
  // 学習音と休憩音の音量。0が無音、1が最大。
  const [volume, setVolume] = useState(0.35);
  // 学習音と休憩音を消しているか。
  const [muted, setMuted] = useState(false);
  // 音の開始に失敗したとき、画面に出すメッセージ。
  const [audioWarning, setAudioWarning] = useState("");
  // タイマーの復旧用データをブラウザへ保存できなかったときのメッセージ。
  const [recoveryWarning, setRecoveryWarning] = useState(
    initialRecoveryState.warning,
  );
  const [pendingStudyEnd, setPendingStudyEnd] =
    useState<PendingStudyEnd | null>(null);
  const [sessionCompletion, setSessionCompletion] =
    useState<SessionCompletion | null>(null);
  const [isDiscardConfirmationVisible, setIsDiscardConfirmationVisible] =
    useState(false);
  const [isSavingStudyRecord, setIsSavingStudyRecord] = useState(false);
  const [isStudyRecordOutcomeUncertain, setIsStudyRecordOutcomeUncertain] =
    useState(false);
  const [studyRecordError, setStudyRecordError] = useState("");
  // ブラウンノイズを操作する関数を、TimerPanelで使う名前に変えて取り出す。
  const {
    start: startBrownNoise,
    stop: stopBrownNoise,
    setVolume: setBrownNoiseVolume,
    resumeIfNeeded: resumeBrownNoiseIfNeeded,
  } = useBrownNoise();
  // 休憩音を操作する関数を、TimerPanelで使う名前に変えて取り出す。
  const {
    start: startBreakMusic,
    pause: pauseBreakMusic,
    stop: stopBreakMusic,
    setVolume: setBreakMusicVolume,
  } = useBreakMusic();

  const preset = timerPresets[presetId];
  const isRunning = status === "running";
  const visibleRemainingMilliseconds = isRunning
    ? calculateRemainingMilliseconds(
        phaseEndAtMs,
        phaseRemainingMilliseconds,
        currentTimeMs,
      )
    : phaseRemainingMilliseconds;
  const playbackVolume = muted
    ? 0
    : calculateFadedAudioVolume(volume, visibleRemainingMilliseconds);
  const visibleRemainingSeconds = Math.ceil(
    visibleRemainingMilliseconds / 1000,
  );
  const activeFocusElapsedMilliseconds =
    isRunning && phase === "focus"
      ? Math.max(
          0,
          remainingAtRunStartMilliseconds - visibleRemainingMilliseconds,
        )
      : 0;
  const sessionStudySeconds = Math.floor(
    (accumulatedFocusMilliseconds + activeFocusElapsedMilliseconds) / 1000,
  );
  const remainingRatio =
    phaseDurationMilliseconds === 0
      ? 0
      : visibleRemainingMilliseconds / phaseDurationMilliseconds;
  const hasTimerSessionStarted =
    pendingRecoverySnapshot !== null ||
    phase !== "focus" ||
    status !== "idle" ||
    accumulatedFocusMilliseconds > 0 ||
    completedFocusCount > 0;

  const saveCurrentRecoveryState = useCallback(
    (outcomeUncertainOverride?: boolean) => {
    const savedAtMs = Date.now();

    if (
      pendingRecoverySnapshot !== null ||
      !hasTimerSessionStarted ||
      sessionStartedAtMs === null ||
      sessionClientUuid === null ||
      (isRunning &&
        (phaseEndAtMs === null || savedAtMs >= phaseEndAtMs))
    ) {
      return;
    }

    const remainingMilliseconds = isRunning
      ? calculateRemainingMilliseconds(
          phaseEndAtMs,
          phaseRemainingMilliseconds,
          savedAtMs,
        )
      : phaseRemainingMilliseconds;
    const activeFocusMilliseconds =
      isRunning && phase === "focus"
        ? Math.max(
            0,
            remainingAtRunStartMilliseconds - remainingMilliseconds,
          )
        : 0;
    const snapshot: TimerRecoverySnapshot = {
      version: TIMER_RECOVERY_VERSION,
      savedAtMs,
      sessionStartedAtMs,
      clientUuid: sessionClientUuid,
      presetId,
      phase,
      breakKind,
      phaseRemainingMilliseconds: remainingMilliseconds,
      phaseDurationMilliseconds,
      accumulatedFocusMilliseconds:
        accumulatedFocusMilliseconds + activeFocusMilliseconds,
      completedFocusCount,
      pendingStudyEnd:
        pendingStudyEnd === null
          ? null
          : {
              ...pendingStudyEnd,
              isOutcomeUncertain:
                outcomeUncertainOverride ?? isStudyRecordOutcomeUncertain,
            },
    };
    let didSave = false;

    try {
      didSave = saveTimerRecoverySnapshot(
        window.localStorage,
        recoveryStorageKey,
        snapshot,
        timerPresets,
      );
    } catch {
      didSave = false;
    }

    queueMicrotask(() => {
      setRecoveryWarning(
        didSave
          ? ""
          : "タイマーの復旧用データを保存できませんでした。タイマーはそのまま利用できます。",
      );
    });
    },
    [
      accumulatedFocusMilliseconds,
      breakKind,
      completedFocusCount,
      hasTimerSessionStarted,
      isRunning,
      phase,
      phaseDurationMilliseconds,
      phaseEndAtMs,
      phaseRemainingMilliseconds,
      pendingRecoverySnapshot,
      pendingStudyEnd,
      presetId,
      recoveryStorageKey,
      remainingAtRunStartMilliseconds,
      sessionClientUuid,
      sessionStartedAtMs,
      isStudyRecordOutcomeUncertain,
      timerPresets,
    ],
  );

  useEffect(() => {
    onTimerNavigationLockChange(hasTimerSessionStarted);
  }, [hasTimerSessionStarted, onTimerNavigationLockChange]);

  useEffect(() => {
    return () => onTimerNavigationLockChange(false);
  }, [onTimerNavigationLockChange]);

  useEffect(() => {
    saveCurrentRecoveryState();
  }, [saveCurrentRecoveryState]);

  useEffect(() => {
    if (!isRunning) return;

    const intervalId = window.setInterval(
      saveCurrentRecoveryState,
      TIMER_RECOVERY_SAVE_INTERVAL_MILLISECONDS,
    );
    return () => window.clearInterval(intervalId);
  }, [isRunning, saveCurrentRecoveryState]);

  useEffect(() => {
    if (!hasTimerSessionStarted) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveCurrentRecoveryState();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hasTimerSessionStarted, saveCurrentRecoveryState]);

  const stopFocusAudio = useCallback(() => {
    stopBrownNoise();
    setAudioWarning("");
  }, [stopBrownNoise]);

  const startFocusAudio = useCallback(
    (nextVolume: number) => {
      if (nextVolume === 0) return;

      void startBrownNoise(nextVolume).then((result) => {
        if (result === "failed") {
          setMuted(true);
          setAudioWarning(
            "ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。",
          );
          return;
        }

        if (result === "started") setAudioWarning("");
      });
    },
    [startBrownNoise],
  );

  const startBreakAudio = useCallback(
    (nextVolume: number) => {
      if (nextVolume === 0) return;

      void startBreakMusic(nextVolume).then((result) => {
        if (result === "failed") {
          setMuted(true);
          setAudioWarning(
            "休憩用の音楽を開始できませんでした。タイマーはそのまま利用できます。",
          );
          return;
        }

        if (result === "started") setAudioWarning("");
      });
    },
    [startBreakMusic],
  );

  const moveToBreak = useCallback(
    (currentTimeMs: number, focusEndAtMs: number) => {
      const nextCompletedFocusCount = completedFocusCount + 1;
      const isLongBreak =
        preset.focusCountBeforeLongBreak !== null &&
        nextCompletedFocusCount === preset.focusCountBeforeLongBreak;
      const breakDurationSeconds =
        isLongBreak && preset.longBreakSeconds !== null
          ? preset.longBreakSeconds
          : preset.shortBreakSeconds;
      const breakDurationMilliseconds = breakDurationSeconds * 1000;
      const breakEndAtMs = focusEndAtMs + breakDurationMilliseconds;

      setAccumulatedFocusMilliseconds(
        (previousAccumulatedMilliseconds) =>
          previousAccumulatedMilliseconds + remainingAtRunStartMilliseconds,
      );

      if (currentTimeMs >= breakEndAtMs) {
        const nextFocusDurationMilliseconds = preset.focusSeconds * 1000;

        setCompletedFocusCount(isLongBreak ? 0 : nextCompletedFocusCount);
        setPhase("waiting");
        setBreakKind(null);
        setStatus("idle");
        setPhaseRemainingMilliseconds(nextFocusDurationMilliseconds);
        setPhaseDurationMilliseconds(nextFocusDurationMilliseconds);
        setRemainingAtRunStartMilliseconds(nextFocusDurationMilliseconds);
        setPhaseEndAtMs(null);
        stopFocusAudio();
        stopBreakMusic();
        return;
      }

      const breakRemainingMilliseconds = calculateRemainingMilliseconds(
        breakEndAtMs,
        breakDurationMilliseconds,
        currentTimeMs,
      );
      setCompletedFocusCount(nextCompletedFocusCount);
      setPhase("break");
      setBreakKind(isLongBreak ? "long" : "short");
      setStatus("running");
      setPhaseRemainingMilliseconds(breakRemainingMilliseconds);
      setPhaseDurationMilliseconds(breakDurationMilliseconds);
      setRemainingAtRunStartMilliseconds(breakRemainingMilliseconds);
      setPhaseEndAtMs(breakEndAtMs);
      stopFocusAudio();
      if (!muted) {
        startBreakAudio(
          calculateFadedAudioVolume(volume, breakRemainingMilliseconds),
        );
      }
    },
    [
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
    ],
  );

  const moveToWaiting = useCallback(() => {
    const nextFocusDurationMilliseconds = preset.focusSeconds * 1000;

    if (breakKind === "long") setCompletedFocusCount(0);
    setPhase("waiting");
    setBreakKind(null);
    setStatus("idle");
    setPhaseRemainingMilliseconds(nextFocusDurationMilliseconds);
    setPhaseDurationMilliseconds(nextFocusDurationMilliseconds);
    setRemainingAtRunStartMilliseconds(nextFocusDurationMilliseconds);
    setPhaseEndAtMs(null);
    stopBreakMusic();
  }, [breakKind, preset.focusSeconds, stopBreakMusic]);

  useEffect(() => {
    if (!isRunning || phaseEndAtMs === null) return;

    const tick = () => {
      const tickTimeMs = Date.now();
      setCurrentTimeMs(tickTimeMs);

      if (tickTimeMs < phaseEndAtMs) {
        if (phase === "focus" && !muted) {
          const remainingMilliseconds = phaseEndAtMs - tickTimeMs;
          const resumedVolume = calculateFadedAudioVolume(
            volume,
            remainingMilliseconds,
          );
          resumeBrownNoiseIfNeeded(resumedVolume);
        }
        return;
      }
      if (phase === "focus") moveToBreak(tickTimeMs, phaseEndAtMs);
      if (phase === "break") moveToWaiting();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(tick, 250);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [
    phaseEndAtMs,
    isRunning,
    moveToBreak,
    moveToWaiting,
    muted,
    phase,
    resumeBrownNoiseIfNeeded,
    volume,
  ]);

  useEffect(() => {
    setBrownNoiseVolume(playbackVolume);
    setBreakMusicVolume(playbackVolume);
  }, [playbackVolume, setBreakMusicVolume, setBrownNoiseVolume]);

  const startOrResume = () => {
    const startTimeMs = Date.now();
    const phaseToStart = phase === "waiting" ? "focus" : phase;
    const focusDurationMilliseconds = preset.focusSeconds * 1000;
    const remainingAtStartMilliseconds =
      phase === "waiting"
        ? focusDurationMilliseconds
        : phaseRemainingMilliseconds;

    if (sessionStartedAtMs === null) {
      setSessionStartedAtMs(startTimeMs);
      setSessionClientUuid(window.crypto.randomUUID());
    }
    setPhase(phaseToStart);
    setStatus("running");
    setPhaseRemainingMilliseconds(remainingAtStartMilliseconds);
    setPhaseDurationMilliseconds(
      phase === "waiting"
        ? focusDurationMilliseconds
        : phaseDurationMilliseconds,
    );
    setRemainingAtRunStartMilliseconds(remainingAtStartMilliseconds);
    setPhaseEndAtMs(startTimeMs + remainingAtStartMilliseconds);
    setCurrentTimeMs(startTimeMs);

    const volumeAtStart = calculateFadedAudioVolume(
      volume,
      remainingAtStartMilliseconds,
    );
    if (phaseToStart === "focus" && !muted) startFocusAudio(volumeAtStart);
    if (phaseToStart === "break" && !muted) startBreakAudio(volumeAtStart);
  };

  const moveCompletedFocusToPausedBreak = (
    finalAccumulatedFocusMilliseconds: number,
  ) => {
    const nextCompletedFocusCount = completedFocusCount + 1;
    const isLongBreak =
      preset.focusCountBeforeLongBreak !== null &&
      nextCompletedFocusCount === preset.focusCountBeforeLongBreak;
    const breakDurationSeconds =
      isLongBreak && preset.longBreakSeconds !== null
        ? preset.longBreakSeconds
        : preset.shortBreakSeconds;
    const breakDurationMilliseconds = breakDurationSeconds * 1000;

    setAccumulatedFocusMilliseconds(finalAccumulatedFocusMilliseconds);
    setCompletedFocusCount(nextCompletedFocusCount);
    setPhase("break");
    setBreakKind(isLongBreak ? "long" : "short");
    setStatus("paused");
    setPhaseRemainingMilliseconds(breakDurationMilliseconds);
    setPhaseDurationMilliseconds(breakDurationMilliseconds);
    setRemainingAtRunStartMilliseconds(breakDurationMilliseconds);
    setPhaseEndAtMs(null);
    stopFocusAudio();

    return nextCompletedFocusCount;
  };

  const pause = () => {
    const remainingAtPauseMilliseconds = calculateRemainingMilliseconds(
      phaseEndAtMs,
      phaseRemainingMilliseconds,
    );

    if (phase === "focus") {
      const finalAccumulatedFocusMilliseconds =
        accumulatedFocusMilliseconds +
        Math.max(
          0,
          remainingAtRunStartMilliseconds - remainingAtPauseMilliseconds,
        );
      if (remainingAtPauseMilliseconds === 0) {
        moveCompletedFocusToPausedBreak(
          finalAccumulatedFocusMilliseconds,
        );
        return;
      }
      setAccumulatedFocusMilliseconds(finalAccumulatedFocusMilliseconds);
    }

    setPhaseRemainingMilliseconds(remainingAtPauseMilliseconds);
    setRemainingAtRunStartMilliseconds(remainingAtPauseMilliseconds);
    setStatus("paused");
    setPhaseEndAtMs(null);
    if (phase === "focus") stopFocusAudio();
    if (phase === "break") pauseBreakMusic();
  };

  const resetTimerSession = () => {
    const focusDurationMilliseconds = preset.focusSeconds * 1000;

    stopFocusAudio();
    stopBreakMusic();
    setPhase("focus");
    setStatus("idle");
    setBreakKind(null);
    setPhaseRemainingMilliseconds(focusDurationMilliseconds);
    setPhaseDurationMilliseconds(focusDurationMilliseconds);
    setPhaseEndAtMs(null);
    setRemainingAtRunStartMilliseconds(focusDurationMilliseconds);
    setCurrentTimeMs(Date.now());
    setCompletedFocusCount(0);
    setAccumulatedFocusMilliseconds(0);
    setSessionStartedAtMs(null);
    setSessionClientUuid(null);
    setPendingStudyEnd(null);
    setIsDiscardConfirmationVisible(false);
    setIsStudyRecordOutcomeUncertain(false);
    setStudyRecordError("");

    let didRemoveRecoveryState = false;
    try {
      didRemoveRecoveryState = removeTimerRecoverySnapshot(
        window.localStorage,
        recoveryStorageKey,
      );
    } catch {
      didRemoveRecoveryState = false;
    }
    setRecoveryWarning(
      didRemoveRecoveryState
        ? ""
        : "終了済みのタイマー復旧用データを削除できませんでした。",
    );
  };

  const requestStudyEnd = () => {
    if (sessionStartedAtMs === null || sessionClientUuid === null) return;

    const endedAtMs = Date.now();
    const remainingMilliseconds = isRunning
      ? calculateRemainingMilliseconds(
          phaseEndAtMs,
          phaseRemainingMilliseconds,
          endedAtMs,
        )
      : phaseRemainingMilliseconds;
    const activeFocusMilliseconds =
      isRunning && phase === "focus"
        ? Math.max(
            0,
            remainingAtRunStartMilliseconds - remainingMilliseconds,
          )
        : 0;
    const finalAccumulatedFocusMilliseconds =
      accumulatedFocusMilliseconds + activeFocusMilliseconds;
    const studySeconds = Math.floor(
      finalAccumulatedFocusMilliseconds / 1000,
    );
    const didCompleteFocusAtEnd =
      phase === "focus" && remainingMilliseconds === 0;
    let completedFocusCountAtEnd = completedFocusCount;

    if (phase === "focus" && !didCompleteFocusAtEnd) stopFocusAudio();
    if (phase === "break") pauseBreakMusic();
    setStatus("paused");
    if (didCompleteFocusAtEnd) {
      completedFocusCountAtEnd = moveCompletedFocusToPausedBreak(
        finalAccumulatedFocusMilliseconds,
      );
    } else {
      setPhaseRemainingMilliseconds(remainingMilliseconds);
      setRemainingAtRunStartMilliseconds(remainingMilliseconds);
      setPhaseEndAtMs(null);
      setAccumulatedFocusMilliseconds(finalAccumulatedFocusMilliseconds);
    }

    if (onCreateStudyRecord === undefined) {
      resetTimerSession();
      return;
    }

    setPendingStudyEnd({
      endedAtMs,
      studySeconds,
      completedFocusCount: completedFocusCountAtEnd,
    });
    setIsStudyRecordOutcomeUncertain(false);
    setStudyRecordError("");
  };

  const saveStudyRecordAndFinish = async () => {
    if (
      onCreateStudyRecord === undefined ||
      pendingStudyEnd === null ||
      sessionStartedAtMs === null ||
      sessionClientUuid === null
    ) {
      return;
    }

    setIsSavingStudyRecord(true);
    setStudyRecordError("");
    try {
      const recordPreset = TIMER_PRESETS[presetId];
      const completedFocusCountForRecord = Math.min(
        pendingStudyEnd.completedFocusCount,
        Math.floor(
          pendingStudyEnd.studySeconds / recordPreset.focusSeconds,
        ),
      );
      await onCreateStudyRecord(
        {
          client_uuid: sessionClientUuid,
          started_at: new Date(sessionStartedAtMs).toISOString(),
          ended_at: new Date(pendingStudyEnd.endedAtMs).toISOString(),
          study_seconds: pendingStudyEnd.studySeconds,
          preset: presetId,
          focus_seconds: recordPreset.focusSeconds,
          break_seconds: recordPreset.shortBreakSeconds,
          completed_focus_count: completedFocusCountForRecord,
        },
        {
          onRequestStarted: () => {
            setIsStudyRecordOutcomeUncertain(true);
            saveCurrentRecoveryState(true);
          },
        },
      );
      const savedStudySeconds = pendingStudyEnd.studySeconds;
      resetTimerSession();
      setSessionCompletion({
        kind: "saved",
        studySeconds: savedStudySeconds,
      });
    } catch (error) {
      const currentAttemptOutcomeUncertain =
        !(error instanceof ApiError) || error.isOutcomeUncertain;
      const mustConfirmPreviousSave =
        isStudyRecordOutcomeUncertain || currentAttemptOutcomeUncertain;
      setIsStudyRecordOutcomeUncertain(mustConfirmPreviousSave);
      setStudyRecordError(
        mustConfirmPreviousSave
          ? "保存結果を確認できませんでした。破棄せず、同じ内容で再試行してください。"
          : error instanceof ApiError
            ? error.message
            : "学習時間を保存できませんでした。もう一度お試しください。",
      );
    } finally {
      setIsSavingStudyRecord(false);
    }
  };

  const discardStudySession = () => {
    if (isStudyRecordOutcomeUncertain) return;

    const discardedStudySeconds = pendingStudyEnd?.studySeconds ?? 0;
    resetTimerSession();
    setSessionCompletion({
      kind: "discarded",
      studySeconds: discardedStudySeconds,
    });
  };

  const handleTimerControl = () => {
    if (isRunning) {
      pause();
      return;
    }
    startOrResume();
  };

  const continueRecoveredTimer = () => {
    if (pendingRecoverySnapshot === null) return;

    setPresetId(pendingRecoverySnapshot.presetId);
    setPhase(pendingRecoverySnapshot.phase);
    setBreakKind(pendingRecoverySnapshot.breakKind);
    setStatus(pendingRecoverySnapshot.phase === "waiting" ? "idle" : "paused");
    setPhaseRemainingMilliseconds(
      pendingRecoverySnapshot.phaseRemainingMilliseconds,
    );
    setPhaseDurationMilliseconds(
      pendingRecoverySnapshot.phaseDurationMilliseconds,
    );
    setRemainingAtRunStartMilliseconds(
      pendingRecoverySnapshot.phaseRemainingMilliseconds,
    );
    setPhaseEndAtMs(null);
    setCurrentTimeMs(Date.now());
    setAccumulatedFocusMilliseconds(
      pendingRecoverySnapshot.accumulatedFocusMilliseconds,
    );
    setCompletedFocusCount(pendingRecoverySnapshot.completedFocusCount);
    setSessionStartedAtMs(pendingRecoverySnapshot.sessionStartedAtMs);
    setSessionClientUuid(pendingRecoverySnapshot.clientUuid);
    if (pendingRecoverySnapshot.pendingStudyEnd !== null) {
      const {
        isOutcomeUncertain,
        ...recoveredPendingStudyEnd
      } = pendingRecoverySnapshot.pendingStudyEnd;
      setPendingStudyEnd(recoveredPendingStudyEnd);
      setIsStudyRecordOutcomeUncertain(isOutcomeUncertain);
      setStudyRecordError(
        isOutcomeUncertain
          ? "保存結果を確認できませんでした。破棄せず、同じ内容で再試行してください。"
          : "",
      );
    }
    setPendingRecoverySnapshot(null);
  };

  const skipBreakAndStartFocus = () => {
    const focusDurationMilliseconds = preset.focusSeconds * 1000;

    if (breakKind === "long") setCompletedFocusCount(0);
    setPhase("focus");
    setBreakKind(null);
    setStatus("running");
    setPhaseRemainingMilliseconds(focusDurationMilliseconds);
    setPhaseDurationMilliseconds(focusDurationMilliseconds);
    setRemainingAtRunStartMilliseconds(focusDurationMilliseconds);
    setPhaseEndAtMs(Date.now() + focusDurationMilliseconds);
    setCurrentTimeMs(Date.now());
    stopBreakMusic();
    if (!muted) startFocusAudio(volume);
  };

  const changePreset = (nextPresetId: TimerPresetId) => {
    const nextPreset = timerPresets[nextPresetId];
    const nextFocusDurationMilliseconds = nextPreset.focusSeconds * 1000;

    setPresetId(nextPresetId);
    setPhaseRemainingMilliseconds(nextFocusDurationMilliseconds);
    setPhaseDurationMilliseconds(nextFocusDurationMilliseconds);
    setRemainingAtRunStartMilliseconds(nextFocusDurationMilliseconds);
  };

  const toggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);

    if (nextMuted) {
      stopFocusAudio();
      pauseBreakMusic();
      return;
    }

    const resumedVolume = calculateFadedAudioVolume(
      volume,
      visibleRemainingMilliseconds,
    );
    if (isRunning && phase === "focus" && volume > 0) {
      startFocusAudio(resumedVolume);
    }
    if (isRunning && phase === "break" && volume > 0) {
      startBreakAudio(resumedVolume);
    }
  };

  const changeVolume = (nextVolume: number) => {
    setVolume(nextVolume);

    if (nextVolume === 0) {
      stopFocusAudio();
      pauseBreakMusic();
      return;
    }

    if (volume === 0 && !muted && isRunning && phase === "focus") {
      startFocusAudio(
        calculateFadedAudioVolume(nextVolume, visibleRemainingMilliseconds),
      );
    }
    if (volume === 0 && !muted && isRunning && phase === "break") {
      startBreakAudio(
        calculateFadedAudioVolume(nextVolume, visibleRemainingMilliseconds),
      );
    }
  };

  const breakDurationLabel = isTimerTestMode
    ? `${Math.round(phaseDurationMilliseconds / 1000)}秒休憩`
    : `${Math.round(phaseDurationMilliseconds / 60_000)}分休憩`;
  const phaseLabel =
    phase === "focus"
      ? "学習"
      : phase === "waiting"
        ? "次の学習を待機中"
        : breakDurationLabel;
  const primaryActionLabel = isRunning
    ? `${phaseLabel}を一時停止`
    : phase === "waiting"
      ? "学習を始める"
      : status === "paused"
        ? `${phaseLabel}を再開`
        : `${phaseLabel}を開始`;

  if (sessionCompletion !== null) {
    return (
      <section className="welcome-card" aria-labelledby="completion-title">
        <p className="eyebrow">学習終了</p>
        <h1 id="completion-title">
          {sessionCompletion.kind === "saved"
            ? "学習時間を保存しました"
            : "今回は保存せず終了しました"}
        </h1>
        {sessionCompletion.kind === "saved" && (
          <p>今回の学習時間: {formatStudyTime(sessionCompletion.studySeconds)}</p>
        )}
        <div className="welcome-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => setSessionCompletion(null)}
          >
            新しい学習を始める
          </button>
        </div>
      </section>
    );
  }

  if (pendingStudyEnd !== null) {
    if (isDiscardConfirmationVisible) {
      return (
        <section className="welcome-card" aria-labelledby="discard-title">
          <p className="eyebrow">保存せず終了</p>
          <h1 id="discard-title">今回の学習時間を破棄しますか</h1>
          <p>破棄すると、今回の学習時間は学習記録へ保存されません。</p>
          <div className="welcome-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={discardStudySession}
            >
              保存せず終了する
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setIsDiscardConfirmationVisible(false)}
            >
              終了方法へ戻る
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="welcome-card" aria-labelledby="study-end-title">
        <p className="eyebrow">学習終了</p>
        <h1 id="study-end-title">今回の学習を終了します</h1>
        <p>今回の学習時間: {formatStudyTime(pendingStudyEnd.studySeconds)}</p>
        {studyRecordError && (
          <p className="form-error" role="alert">
            {studyRecordError}
          </p>
        )}
        <div className="welcome-actions">
          <button
            className="primary-button"
            type="button"
            disabled={isSavingStudyRecord}
            onClick={saveStudyRecordAndFinish}
          >
            {isSavingStudyRecord
              ? "学習時間を保存しています"
              : isStudyRecordOutcomeUncertain
                ? "同じ内容で保存結果を確認"
              : "学習時間を保存して終了"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={
              isSavingStudyRecord || isStudyRecordOutcomeUncertain
            }
            onClick={() => setIsDiscardConfirmationVisible(true)}
          >
            学習時間を保存せず終了
          </button>
          <button
            className="text-button"
            type="button"
            disabled={
              isSavingStudyRecord || isStudyRecordOutcomeUncertain
            }
            onClick={() => setPendingStudyEnd(null)}
          >
            タイマーへ戻る
          </button>
        </div>
      </section>
    );
  }

  return pendingRecoverySnapshot !== null ? (
    <section className="welcome-card" aria-labelledby="recovery-title">
      <p className="eyebrow">タイマーの復旧</p>
      <h1 id="recovery-title">前回のタイマーが見つかりました</h1>
      <p>
        {pendingRecoverySnapshot.pendingStudyEnd === null
          ? "自動再生せず、前回の残り時間から一時停止状態で再開します。"
          : "前回の終了操作へ戻り、同じ学習記録の保存を続けます。"}
      </p>
      <div className="welcome-actions">
        <button
          className="primary-button"
          type="button"
          onClick={continueRecoveredTimer}
        >
          {pendingRecoverySnapshot.pendingStudyEnd === null
            ? "前回の続きから再開"
            : "終了操作の続きへ進む"}
        </button>
      </div>
    </section>
  ) : (
    <section
      className={phase === "break" ? "timer-stage is-break" : "timer-stage"}
      aria-labelledby="timer-heading"
    >
      <div className="timer-layout">
        <div className="timer-visual">
          <div className="preset-selector" aria-label="タイマー設定">
            {(Object.keys(timerPresets) as TimerPresetId[]).map((id) => (
              <button
                className={
                  id === presetId
                    ? "preset-button is-selected"
                    : "preset-button"
                }
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
              {presetId === "25-5" && (
                <g className="cycle-ring">
                  {[0, 1, 2, 3].map((index) => (
                    <circle
                      className={
                        index < completedFocusCount
                          ? "cycle-segment is-complete"
                          : "cycle-segment"
                      }
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
              <circle
                className="timer-track"
                cx="120"
                cy="120"
                r="88"
                pathLength="100"
              />
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
            <span aria-hidden="true">{isRunning ? "Ⅱ" : "▶"}</span>
          </button>

          {phase === "break" && (
            <button
              className="text-button break-skip-button"
              type="button"
              onClick={skipBreakAndStartFocus}
            >
              休憩を切り上げて学習を始める
            </button>
          )}

          <dl
            className={
              showStudyTime ? "timer-summary" : "timer-summary is-single"
            }
          >
            {showStudyTime && (
              <div>
                <dt>今回の学習時間</dt>
                <dd>{formatStudyTime(sessionStudySeconds)}</dd>
              </div>
            )}
            {presetId === "25-5" && (
              <div>
                <dt>完了した学習</dt>
                <dd>{completedFocusCount} / 4回</dd>
              </div>
            )}
          </dl>

          <div className="sound-controls">
            <button
              className="sound-toggle"
              type="button"
              aria-pressed={muted}
              onClick={toggleMute}
            >
              {muted ? "音を出す" : "ミュート"}
            </button>
            <label htmlFor="timer-volume">音量</label>
            <input
              id="timer-volume"
              type="range"
              min="0"
              max="100"
              value={Math.round(volume * 100)}
              onChange={(event) =>
                changeVolume(Number(event.target.value) / 100)
              }
            />
          </div>

          {hasTimerSessionStarted && (
            <button
              className="text-button"
              type="button"
              onClick={requestStudyEnd}
            >
              学習を終了
            </button>
          )}

          {audioWarning && (
            <p className="timer-warning" role="status">
              {audioWarning}
            </p>
          )}
          {recoveryWarning && (
            <p className="timer-warning" role="status">
              {recoveryWarning}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
