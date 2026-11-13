import { beforeEach, describe, expect, it } from 'vitest'

import { TIMER_TEST_PRESETS } from './timerConfig'
import {
  loadTimerRecoverySnapshot,
  removeTimerRecoverySnapshot,
  saveTimerRecoverySnapshot,
  TIMER_RECOVERY_VERSION,
  type TimerRecoverySnapshot,
} from './timerRecovery'

const STORAGE_KEY = 'pomodoro-reflection:test-timer-recovery'

const snapshot: TimerRecoverySnapshot = {
  version: TIMER_RECOVERY_VERSION,
  savedAtMs: 1_700_000_000_000,
  sessionStartedAtMs: 1_699_999_700_000,
  clientUuid: '00000000-0000-4000-8000-000000000001',
  goal: '復旧処理を確認する',
  presetId: '25-5',
  phase: 'focus',
  breakKind: null,
  phaseRemainingMilliseconds: 20 * 60 * 1000,
  phaseDurationMilliseconds: 25 * 60 * 1000,
  accumulatedFocusMilliseconds: 5 * 60 * 1000,
  completedFocusCount: 0,
  pendingStudyEnd: null,
}

const unavailableStorage = {
  getItem: () => {
    throw new DOMException('Storage is unavailable')
  },
  setItem: () => {
    throw new DOMException('Storage is unavailable')
  },
  removeItem: () => {
    throw new DOMException('Storage is unavailable')
  },
}

describe('timerRecovery', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('復旧用データを保存して読み込む', () => {
    expect(saveTimerRecoverySnapshot(localStorage, STORAGE_KEY, snapshot)).toBe(true)

    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({
      status: 'loaded',
      snapshot,
    })
  })

  it('保存済みデータがなければemptyを返す', () => {
    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'empty' })
  })

  it('壊れたJSONと未知のバージョンを読み込まない', () => {
    localStorage.setItem(STORAGE_KEY, '{invalid json')
    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'invalid' })

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, version: 999 }))
    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'invalid' })
  })

  it('矛盾した区間情報や不正な時間を読み込まない', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...snapshot, phase: 'break', breakKind: null }),
    )
    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'invalid' })

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...snapshot,
        phaseRemainingMilliseconds: snapshot.phaseDurationMilliseconds + 1,
      }),
    )
    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'invalid' })
  })

  it('プリセットでは起こり得ない状態を読み込まない', () => {
    const invalidSnapshots: TimerRecoverySnapshot[] = [
      {
        ...snapshot,
        presetId: '52-17',
        phase: 'break',
        breakKind: 'long',
        phaseRemainingMilliseconds: 17 * 60 * 1000,
        phaseDurationMilliseconds: 17 * 60 * 1000,
        completedFocusCount: 4,
      },
      {
        ...snapshot,
        phase: 'waiting',
        phaseRemainingMilliseconds: 20 * 60 * 1000,
      },
      {
        ...snapshot,
        completedFocusCount: 5,
      },
      {
        ...snapshot,
        phaseRemainingMilliseconds: 24 * 60 * 1000,
        phaseDurationMilliseconds: 24 * 60 * 1000,
      },
      {
        ...snapshot,
        accumulatedFocusMilliseconds: 0,
      },
      {
        ...snapshot,
        phase: 'break',
        breakKind: 'short',
        phaseRemainingMilliseconds: 5 * 60 * 1000,
        phaseDurationMilliseconds: 5 * 60 * 1000,
        completedFocusCount: 1,
      },
      {
        ...snapshot,
        phase: 'waiting',
        phaseRemainingMilliseconds: 25 * 60 * 1000,
        accumulatedFocusMilliseconds: 0,
      },
    ]

    invalidSnapshots.forEach((invalidSnapshot) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(invalidSnapshot))
      expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'invalid' })
    })
  })

  it('プリセットに沿った休憩と待機の状態を読み込む', () => {
    const validSnapshots: TimerRecoverySnapshot[] = [
      {
        ...snapshot,
        phase: 'break',
        breakKind: 'short',
        phaseRemainingMilliseconds: 4 * 60 * 1000,
        phaseDurationMilliseconds: 5 * 60 * 1000,
        accumulatedFocusMilliseconds: 25 * 60 * 1000,
        completedFocusCount: 1,
      },
      {
        ...snapshot,
        phase: 'break',
        breakKind: 'long',
        phaseRemainingMilliseconds: 14 * 60 * 1000,
        phaseDurationMilliseconds: 15 * 60 * 1000,
        accumulatedFocusMilliseconds: 100 * 60 * 1000,
        completedFocusCount: 4,
      },
      {
        ...snapshot,
        phase: 'waiting',
        phaseRemainingMilliseconds: 25 * 60 * 1000,
        accumulatedFocusMilliseconds: 75 * 60 * 1000,
        completedFocusCount: 3,
      },
      {
        ...snapshot,
        phase: 'waiting',
        phaseRemainingMilliseconds: 25 * 60 * 1000,
        accumulatedFocusMilliseconds: 100 * 60 * 1000,
        completedFocusCount: 0,
      },
      {
        ...snapshot,
        presetId: '52-17',
        phase: 'break',
        breakKind: 'short',
        phaseRemainingMilliseconds: 16 * 60 * 1000,
        phaseDurationMilliseconds: 17 * 60 * 1000,
        accumulatedFocusMilliseconds: 52 * 60 * 1000,
        completedFocusCount: 1,
      },
    ]

    validSnapshots.forEach((validSnapshot) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validSnapshot))
      expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({
        status: 'loaded',
        snapshot: validSnapshot,
      })
    })
  })

  it('7秒確認モードのプリセットに沿った状態を保存して読み込む', () => {
    const testModeSnapshot: TimerRecoverySnapshot = {
      ...snapshot,
      phaseRemainingMilliseconds: 4 * 1000,
      phaseDurationMilliseconds: 7 * 1000,
      accumulatedFocusMilliseconds: 3 * 1000,
    }

    expect(
      saveTimerRecoverySnapshot(
        localStorage,
        STORAGE_KEY,
        testModeSnapshot,
        TIMER_TEST_PRESETS,
      ),
    ).toBe(true)
    expect(
      loadTimerRecoverySnapshot(localStorage, STORAGE_KEY, TIMER_TEST_PRESETS),
    ).toEqual({
      status: 'loaded',
      snapshot: testModeSnapshot,
    })
    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'invalid' })
  })

  it('不正な復旧用データは保存しない', () => {
    localStorage.setItem(STORAGE_KEY, 'existing snapshot')

    expect(
      saveTimerRecoverySnapshot(localStorage, STORAGE_KEY, {
        ...snapshot,
        phase: 'break',
        breakKind: null,
      }),
    ).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('existing snapshot')

    expect(
      saveTimerRecoverySnapshot(localStorage, STORAGE_KEY, {
        ...snapshot,
        savedAtMs: Number.NaN,
      }),
    ).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('existing snapshot')
  })

  it('復旧用データを削除する', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))

    expect(removeTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toBe(true)
    expect(loadTimerRecoverySnapshot(localStorage, STORAGE_KEY)).toEqual({ status: 'empty' })
  })

  it('ブラウザストレージを利用できない場合は失敗結果を返す', () => {
    expect(loadTimerRecoverySnapshot(unavailableStorage, STORAGE_KEY)).toEqual({
      status: 'unavailable',
    })
    expect(saveTimerRecoverySnapshot(unavailableStorage, STORAGE_KEY, snapshot)).toBe(false)
    expect(removeTimerRecoverySnapshot(unavailableStorage, STORAGE_KEY)).toBe(false)
  })
})
