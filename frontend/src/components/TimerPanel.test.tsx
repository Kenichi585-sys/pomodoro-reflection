import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../api/client'
import type {
  CreateStudyRecordInput,
  CreateStudyRecordOptions,
  StudyRecord,
} from '../api/studyRecords'
import { TIMER_TEST_PRESETS } from '../timer/timerConfig'
import {
  createTimerRecoveryStorageKey,
  loadTimerRecoverySnapshot,
  saveTimerRecoverySnapshot,
  TIMER_RECOVERY_VERSION,
} from '../timer/timerRecovery'
import { TimerPanel } from './TimerPanel'

const audioMocks = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue('started'),
  stop: vi.fn(),
  setVolume: vi.fn(),
  resumeIfNeeded: vi.fn(),
}))
const breakMusicMocks = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue('started'),
  pause: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
}))
const timerLockMock = vi.fn()
const createStudyRecordResponse = (
  input: CreateStudyRecordInput,
): StudyRecord => ({
  ...input,
  id: 1,
  study_date: '2026-10-27',
  created_at: input.ended_at,
  updated_at: input.ended_at,
})
const renderTimerPanel = (
  recoveryOwnerKey = 'guest',
  onCreateStudyRecord?: (
    input: CreateStudyRecordInput,
    options?: CreateStudyRecordOptions,
  ) => Promise<StudyRecord>,
) =>
  render(
    <TimerPanel
      showStudyTime
      recoveryOwnerKey={recoveryOwnerKey}
      onCreateStudyRecord={onCreateStudyRecord}
      onTimerNavigationLockChange={timerLockMock}
    />,
  )

vi.mock('../audio/useBrownNoise', () => ({
  useBrownNoise: () => audioMocks,
}))
vi.mock('../audio/useBreakMusic', () => ({
  useBreakMusic: () => breakMusicMocks,
}))

describe('TimerPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'))
    window.history.replaceState(null, '', '/')
    localStorage.clear()
    audioMocks.start.mockReset().mockResolvedValue('started')
    audioMocks.stop.mockClear()
    audioMocks.setVolume.mockClear()
    audioMocks.resumeIfNeeded.mockClear()
    breakMusicMocks.start.mockReset().mockResolvedValue('started')
    breakMusicMocks.pause.mockClear()
    breakMusicMocks.stop.mockClear()
    breakMusicMocks.setVolume.mockClear()
    timerLockMock.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('開始後は実時刻との差から残り時間を更新する', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.getByLabelText('学習 24:59')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を一時停止' })).toBeInTheDocument()
  })

  it('ログイン中は終了時点までの学習時間を保存して復旧データを削除する', async () => {
    const recoveryOwnerKey = 'user:test@example.com'
    const storageKey = createTimerRecoveryStorageKey(recoveryOwnerKey, false)
    const createStudyRecordMock = vi.fn(async (input: CreateStudyRecordInput) =>
      createStudyRecordResponse(input),
    )
    renderTimerPanel(recoveryOwnerKey, createStudyRecordMock)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(2_000))
    fireEvent.click(screen.getByRole('button', { name: '学習を終了' }))

    expect(
      screen.getByRole('heading', { name: '今回の学習を終了します' }),
    ).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: '学習時間を保存して終了' }),
      )
    })

    expect(createStudyRecordMock.mock.calls[0]?.[0]).toEqual({
      client_uuid: expect.any(String),
      started_at: '2026-10-27T00:00:00.000Z',
      ended_at: '2026-10-27T00:00:02.000Z',
      study_seconds: 2,
    })
    expect(
      screen.getByRole('heading', { name: '学習時間を保存しました' }),
    ).toBeInTheDocument()
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toEqual({
      status: 'empty',
    })
  })

  it('保存結果が不明な場合は同じ内容の再送だけを許可する', async () => {
    const recoveryOwnerKey = 'user:test@example.com'
    const storageKey = createTimerRecoveryStorageKey(recoveryOwnerKey, false)
    let requestCount = 0
    const createStudyRecordMock = vi.fn(
      async (
        input: CreateStudyRecordInput,
        options?: CreateStudyRecordOptions,
      ) => {
        options?.onRequestStarted?.()
        requestCount += 1
        if (requestCount === 1) {
          throw new ApiError('サーバーへ接続できません。', {}, true)
        }
        return createStudyRecordResponse(input)
      },
    )
    const firstRender = renderTimerPanel(
      recoveryOwnerKey,
      createStudyRecordMock,
    )

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(2_000))
    fireEvent.click(screen.getByRole('button', { name: '学習を終了' }))

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: '学習時間を保存して終了' }),
      )
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      '保存結果を確認できませんでした。',
    )
    expect(
      screen.getByRole('button', { name: '学習時間を保存せず終了' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'タイマーへ戻る' }),
    ).toBeDisabled()
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toMatchObject({
      status: 'loaded',
      snapshot: {
        pendingStudyEnd: {
          studySeconds: 2,
          isOutcomeUncertain: true,
          saveDestination: 'finish',
        },
      },
    })

    firstRender.unmount()
    renderTimerPanel(recoveryOwnerKey, createStudyRecordMock)
    fireEvent.click(
      screen.getByRole('button', { name: '終了操作の続きへ進む' }),
    )
    expect(
      screen.getByRole('button', { name: '学習時間を保存せず終了' }),
    ).toBeDisabled()

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: '同じ内容で保存結果を確認' }),
      )
    })

    expect(createStudyRecordMock).toHaveBeenCalledTimes(2)
    expect(createStudyRecordMock.mock.calls[1]?.[0]).toEqual(
      createStudyRecordMock.mock.calls[0]?.[0],
    )
    expect(
      screen.getByRole('heading', { name: '学習時間を保存しました' }),
    ).toBeInTheDocument()
  })

  it('区間終了直後の切り替え前でも満額の学習時間を保存する', async () => {
    const createStudyRecordMock = vi.fn(async (input: CreateStudyRecordInput) =>
      createStudyRecordResponse(input),
    )
    renderTimerPanel('user:test@example.com', createStudyRecordMock)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date('2026-10-27T00:25:00Z'))
    fireEvent.click(screen.getByRole('button', { name: '学習を終了' }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: '学習時間を保存して終了' }),
      )
    })

    expect(createStudyRecordMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        study_seconds: 25 * 60,
      }),
    )
  })

  it('7秒確認モードでは実際に学習した秒数を保存する', async () => {
    window.history.replaceState(null, '', '/?timerTest=1')
    const createStudyRecordMock = vi.fn(async (input: CreateStudyRecordInput) =>
      createStudyRecordResponse(input),
    )
    renderTimerPanel('user:test@example.com', createStudyRecordMock)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date('2026-10-27T00:00:07Z'))
    fireEvent.click(screen.getByRole('button', { name: '学習を終了' }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: '学習時間を保存して終了' }),
      )
    })

    expect(createStudyRecordMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        study_seconds: 7,
      }),
    )
  })

  it('ブラウザストレージを取得できなくても保存完了画面へ進む', async () => {
    const localStorageSpy = vi
      .spyOn(window, 'localStorage', 'get')
      .mockImplementation(() => {
        throw new DOMException('Storage is unavailable', 'SecurityError')
      })
    const createStudyRecordMock = vi.fn(async (input: CreateStudyRecordInput) =>
      createStudyRecordResponse(input),
    )
    renderTimerPanel('user:test@example.com', createStudyRecordMock)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.click(screen.getByRole('button', { name: '学習を終了' }))
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: '学習時間を保存して終了' }),
      )
    })

    expect(
      screen.getByRole('heading', { name: '学習時間を保存しました' }),
    ).toBeInTheDocument()
    localStorageSpy.mockRestore()
  })

  it('保存されたタイマーを自動再生せず一時停止状態で復旧する', () => {
    const storageKey = createTimerRecoveryStorageKey('guest', false)
    saveTimerRecoverySnapshot(localStorage, storageKey, {
      version: TIMER_RECOVERY_VERSION,
      savedAtMs: Date.now(),
      sessionStartedAtMs: Date.now() - 2_000,
      clientUuid: '00000000-0000-4000-8000-000000000001',
      presetId: '25-5',
      phase: 'focus',
      breakKind: null,
      phaseRemainingMilliseconds: 25 * 60 * 1000 - 2_000,
      phaseDurationMilliseconds: 25 * 60 * 1000,
      accumulatedFocusMilliseconds: 2_000,
      completedFocusCount: 0,
      pendingStudyEnd: null,
    })
    const storedSnapshot = localStorage.getItem(storageKey)

    renderTimerPanel()

    expect(localStorage.getItem(storageKey)).toBe(storedSnapshot)
    expect(
      screen.getByRole('heading', { name: '前回のタイマーが見つかりました' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '学習を開始' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '前回の続きから再開' }))

    expect(screen.getByLabelText('学習 24:58')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を再開' })).toBeInTheDocument()
    expect(audioMocks.start).not.toHaveBeenCalled()
  })

  it('一時停止中は時間を進めない', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(2_000))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))
    act(() => vi.advanceTimersByTime(5_000))

    expect(screen.getByLabelText('学習 24:58')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を再開' })).toBeInTheDocument()
  })

  it('区間終了直後の切り替え前に一時停止しても休憩状態を復旧保存する', () => {
    const recoveryOwnerKey = 'user:test@example.com'
    const storageKey = createTimerRecoveryStorageKey(recoveryOwnerKey, false)
    renderTimerPanel(recoveryOwnerKey)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date('2026-10-27T00:25:00Z'))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))

    expect(
      screen.getByRole('button', { name: '5分休憩を再開' }),
    ).toBeInTheDocument()
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toMatchObject({
      status: 'loaded',
      snapshot: {
        phase: 'break',
        breakKind: 'short',
        accumulatedFocusMilliseconds: 25 * 60 * 1000,
        completedFocusCount: 1,
      },
    })
  })

  it('開始時と動作中の5秒後と一時停止時に復旧用データを保存する', () => {
    const storageKey = createTimerRecoveryStorageKey('user:test@example.com', false)
    renderTimerPanel('user:test@example.com')

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toMatchObject({
      status: 'loaded',
      snapshot: {
        savedAtMs: Date.now(),
        sessionStartedAtMs: Date.now(),
        clientUuid: expect.any(String),
        phaseRemainingMilliseconds: 25 * 60 * 1000,
        accumulatedFocusMilliseconds: 0,
      },
    })

    act(() => vi.advanceTimersByTime(5_000))
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toMatchObject({
      status: 'loaded',
      snapshot: {
        savedAtMs: Date.now(),
        phaseRemainingMilliseconds: 25 * 60 * 1000 - 5_000,
        accumulatedFocusMilliseconds: 5_000,
      },
    })

    act(() => vi.advanceTimersByTime(1_000))
    const visibilityStateSpy = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toMatchObject({
      status: 'loaded',
      snapshot: {
        savedAtMs: Date.now(),
        phaseRemainingMilliseconds: 25 * 60 * 1000 - 6_000,
        accumulatedFocusMilliseconds: 6_000,
      },
    })
    visibilityStateSpy.mockRestore()

    act(() => vi.advanceTimersByTime(1_000))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toMatchObject({
      status: 'loaded',
      snapshot: {
        savedAtMs: Date.now(),
        phaseRemainingMilliseconds: 25 * 60 * 1000 - 7_000,
        accumulatedFocusMilliseconds: 7_000,
      },
    })

    act(() => vi.advanceTimersByTime(1))
    fireEvent.click(screen.getByRole('button', { name: '学習を再開' }))
    expect(loadTimerRecoverySnapshot(localStorage, storageKey)).toMatchObject({
      status: 'loaded',
      snapshot: {
        savedAtMs: Date.now(),
        phaseRemainingMilliseconds: 25 * 60 * 1000 - 7_000,
        accumulatedFocusMilliseconds: 7_000,
      },
    })
  })

  it('ブラウザストレージを取得できなくても警告を出してタイマーを続ける', async () => {
    const localStorageSpy = vi
      .spyOn(window, 'localStorage', 'get')
      .mockImplementation(() => {
        throw new DOMException('Storage is unavailable', 'SecurityError')
      })
    renderTimerPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    })

    expect(
      screen.getByText(
        'タイマーの復旧用データを保存できませんでした。タイマーはそのまま利用できます。',
      ),
    ).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByLabelText('学習 24:59')).toBeInTheDocument()
    localStorageSpy.mockRestore()
  })

  it('終了5秒前から再生音量だけを下げ、画面の設定音量は変えない', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000 - 2_750))
    act(() => vi.advanceTimersByTime(250))

    expect(audioMocks.setVolume).toHaveBeenLastCalledWith(0.175)
    expect(breakMusicMocks.setVolume).toHaveBeenLastCalledWith(0.175)
    expect(screen.getByRole('slider', { name: '音量' })).toHaveValue('35')
  })

  it('1秒未満で一時停止しても経過した端数を保持する', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(500))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を再開' }))
    act(() => vi.advanceTimersByTime(500))

    expect(screen.getByLabelText('学習 24:59')).toBeInTheDocument()
  })

  it('開始後は認証画面への移動をロックする', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))

    expect(timerLockMock).toHaveBeenLastCalledWith(true)
  })

  it('開始前は52分17分へ変更できる', () => {
    renderTimerPanel()

    expect(screen.getByText('0分')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '52分 / 17分' }))

    expect(screen.getByLabelText('学習 52:00')).toBeInTheDocument()
  })

  it('開発用URLでは7秒で学習と休憩の切り替えを確認できる', async () => {
    window.history.replaceState(null, '', '/?timerTest=1')
    renderTimerPanel()

    expect(screen.getByLabelText('学習 00:07')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7秒 / 7秒（25分 / 5分確認）' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    const testStorageKey = createTimerRecoveryStorageKey('guest', true)
    const standardStorageKey = createTimerRecoveryStorageKey('guest', false)

    expect(
      loadTimerRecoverySnapshot(localStorage, testStorageKey, TIMER_TEST_PRESETS),
    ).toMatchObject({ status: 'loaded' })
    expect(localStorage.getItem(standardStorageKey)).toBeNull()

    vi.setSystemTime(new Date(Date.now() + 6_750))
    await act(async () => vi.advanceTimersByTime(250))

    expect(screen.getByRole('heading', { name: '7秒休憩' })).toBeInTheDocument()
    expect(breakMusicMocks.start.mock.calls[0]?.[0]).toBeCloseTo(0.35)
    expect(
      loadTimerRecoverySnapshot(localStorage, testStorageKey, TIMER_TEST_PRESETS),
    ).toMatchObject({
      status: 'loaded',
      snapshot: {
        phase: 'break',
        breakKind: 'short',
        phaseRemainingMilliseconds: 7_000,
        accumulatedFocusMilliseconds: 7_000,
        completedFocusCount: 1,
      },
    })

    vi.setSystemTime(new Date(Date.now() + 6_750))
    await act(async () => vi.advanceTimersByTime(250))

    expect(screen.getByRole('heading', { name: '次の学習を待機中' })).toBeInTheDocument()
    expect(breakMusicMocks.stop).toHaveBeenCalled()
    expect(
      loadTimerRecoverySnapshot(localStorage, testStorageKey, TIMER_TEST_PRESETS),
    ).toMatchObject({
      status: 'loaded',
      snapshot: {
        phase: 'waiting',
        breakKind: null,
        phaseRemainingMilliseconds: 7_000,
        accumulatedFocusMilliseconds: 7_000,
        completedFocusCount: 1,
      },
    })
  })

  it('学習と短い休憩の両方が経過してから復帰すると待機状態になる', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date('2026-10-27T00:31:00Z'))
    act(() => vi.advanceTimersByTime(250))

    expect(
      screen.getByRole('heading', { name: '次の学習を待機中' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を始める' })).toBeInTheDocument()
    expect(screen.getByText('1 / 4回')).toBeInTheDocument()
  })

  it('学習終了後に画面へ戻っても古いブラウンノイズを再開しない', async () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    audioMocks.resumeIfNeeded.mockClear()

    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(audioMocks.resumeIfNeeded).not.toHaveBeenCalled()
    expect(audioMocks.stop).toHaveBeenCalled()
    expect(breakMusicMocks.start).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '5分休憩' })).toBeInTheDocument()
  })

  it('フェード中に画面へ戻った場合は現在の音量でブラウンノイズを再開する', async () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    audioMocks.resumeIfNeeded.mockClear()

    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000 - 2_500))
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(audioMocks.resumeIfNeeded).toHaveBeenCalledWith(0.175)
  })

  it('休憩終了5秒前へ復帰した場合はフェード後の音量で休憩音を開始する', async () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 30 * 60 * 1000 - 2_750))
    await act(async () => vi.advanceTimersByTime(250))

    expect(screen.getByLabelText('5分休憩 00:03')).toBeInTheDocument()
    expect(breakMusicMocks.start.mock.calls[0]?.[0]).toBeCloseTo(0.175)
  })

  it('長い休憩を切り上げると4回分の進捗をリセットする', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))

    for (let completed = 1; completed <= 4; completed += 1) {
      vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000))
      act(() => vi.advanceTimersByTime(250))

      if (completed < 4) {
        fireEvent.click(
          screen.getByRole('button', {
            name: '休憩を切り上げて学習を始める',
          }),
        )
      }
    }

    expect(screen.getByRole('heading', { name: '15分休憩' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '15分休憩' }).closest('section')).toHaveClass(
      'is-break',
    )
    expect(screen.getByText('4 / 4回')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: '休憩を切り上げて学習を始める',
      }),
    )

    expect(screen.getByRole('heading', { name: '学習' })).toBeInTheDocument()
    expect(screen.getByText('0 / 4回')).toBeInTheDocument()
  })

  it('学習終了後は休憩音へ切り替え、一時停止と再開を連動させる', async () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000))
    await act(async () => vi.advanceTimersByTime(250))

    expect(audioMocks.stop).toHaveBeenCalled()
    expect(breakMusicMocks.start).toHaveBeenCalledWith(0.35)
    expect(screen.getByRole('heading', { name: '5分休憩' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '5分休憩を一時停止' }))
    expect(breakMusicMocks.pause).toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '5分休憩を再開' }))
    })
    expect(breakMusicMocks.start).toHaveBeenCalledTimes(2)
  })

  it('休憩終了後は休憩音を停止して次の学習を待つ', async () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000))
    await act(async () => vi.advanceTimersByTime(250))
    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000))
    await act(async () => vi.advanceTimersByTime(250))

    expect(breakMusicMocks.stop).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '次の学習を待機中' })).toBeInTheDocument()
  })

  it('ミュート状態で開始しても途中からブラウンノイズを開始できる', () => {
    renderTimerPanel()

    fireEvent.click(screen.getByRole('button', { name: 'ミュート' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    expect(audioMocks.start).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '音を出す' }))
    expect(audioMocks.start).toHaveBeenCalledWith(0.35)
  })

  it('ブラウンノイズの正常な開始キャンセルでは警告を表示しない', async () => {
    audioMocks.start.mockResolvedValueOnce('cancelled')
    renderTimerPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    })

    expect(
      screen.queryByText('ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。'),
    ).not.toBeInTheDocument()
  })

  it('ブラウンノイズの開始失敗後にミュート表示から再試行できる', async () => {
    audioMocks.start.mockResolvedValueOnce('failed')
    renderTimerPanel()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    })

    expect(
      screen.getByText('ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '音を出す' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '音を出す' }))
    })

    expect(audioMocks.start).toHaveBeenCalledTimes(2)
    expect(audioMocks.start).toHaveBeenLastCalledWith(0.35)
    expect(screen.getByRole('button', { name: 'ミュート' })).toBeInTheDocument()
    expect(
      screen.queryByText('ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。'),
    ).not.toBeInTheDocument()
  })
})
