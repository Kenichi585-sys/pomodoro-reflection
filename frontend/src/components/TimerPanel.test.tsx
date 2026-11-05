import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TimerPanel } from './TimerPanel'

const audioMocks = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue('started'),
  stop: vi.fn(),
  setVolume: vi.fn(),
}))
const breakMusicMocks = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue('started'),
  pause: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
}))
const timerLockMock = vi.fn()

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
    audioMocks.start.mockReset().mockResolvedValue('started')
    audioMocks.stop.mockClear()
    audioMocks.setVolume.mockClear()
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
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.getByLabelText('学習 24:59')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を一時停止' })).toBeInTheDocument()
  })

  it('一時停止中は時間を進めない', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(2_000))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))
    act(() => vi.advanceTimersByTime(5_000))

    expect(screen.getByLabelText('学習 24:58')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を再開' })).toBeInTheDocument()
  })

  it('終了7秒前から再生音量だけを下げ、画面の設定音量は変えない', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000 - 5_250))
    act(() => vi.advanceTimersByTime(250))

    expect(audioMocks.setVolume).toHaveBeenLastCalledWith(0.25)
    expect(breakMusicMocks.setVolume).toHaveBeenLastCalledWith(0.25)
    expect(screen.getByRole('slider', { name: '音量' })).toHaveValue('35')
  })

  it('1秒未満で一時停止しても経過した端数を保持する', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(500))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を再開' }))
    act(() => vi.advanceTimersByTime(500))

    expect(screen.getByLabelText('学習 24:59')).toBeInTheDocument()
  })

  it('開始後は認証画面への移動をロックする', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))

    expect(timerLockMock).toHaveBeenLastCalledWith(true)
  })

  it('開始前は52分17分へ変更できる', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    expect(screen.getByText('0分')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '52分 / 17分' }))

    expect(screen.getByLabelText('学習 52:00')).toBeInTheDocument()
  })

  it('開発用URLでは3秒で学習と休憩の切り替えを確認できる', async () => {
    window.history.replaceState(null, '', '/?timerTest=1')
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    expect(screen.getByLabelText('学習 00:03')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3秒 / 3秒（25分 / 5分確認）' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 2_750))
    await act(async () => vi.advanceTimersByTime(250))

    expect(screen.getByRole('heading', { name: '3秒休憩' })).toBeInTheDocument()
    expect(breakMusicMocks.start.mock.calls[0]?.[0]).toBeCloseTo(0.15)

    vi.setSystemTime(new Date(Date.now() + 2_750))
    await act(async () => vi.advanceTimersByTime(250))

    expect(screen.getByRole('heading', { name: '次の学習を待機中' })).toBeInTheDocument()
    expect(breakMusicMocks.stop).toHaveBeenCalled()
  })

  it('学習と短い休憩の両方が経過してから復帰すると待機状態になる', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date('2026-10-27T00:31:00Z'))
    act(() => vi.advanceTimersByTime(250))

    expect(
      screen.getByRole('heading', { name: '次の学習を待機中' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を始める' })).toBeInTheDocument()
    expect(screen.getByText('1 / 4回')).toBeInTheDocument()
  })

  it('休憩終了7秒前へ復帰した場合はフェード後の音量で休憩音を開始する', async () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 30 * 60 * 1000 - 5_250))
    await act(async () => vi.advanceTimersByTime(250))

    expect(screen.getByLabelText('5分休憩 00:05')).toBeInTheDocument()
    expect(breakMusicMocks.start.mock.calls[0]?.[0]).toBeCloseTo(0.25)
  })

  it('長い休憩を切り上げると4回分の進捗をリセットする', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

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
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

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
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 1000))
    await act(async () => vi.advanceTimersByTime(250))
    vi.setSystemTime(new Date(Date.now() + 5 * 60 * 1000))
    await act(async () => vi.advanceTimersByTime(250))

    expect(breakMusicMocks.stop).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '次の学習を待機中' })).toBeInTheDocument()
  })

  it('ミュート状態で開始しても途中からブラウンノイズを開始できる', () => {
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: 'ミュート' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    expect(audioMocks.start).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '音を出す' }))
    expect(audioMocks.start).toHaveBeenCalledWith(0.35)
  })

  it('ブラウンノイズの正常な開始キャンセルでは警告を表示しない', async () => {
    audioMocks.start.mockResolvedValueOnce('cancelled')
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    })

    expect(
      screen.queryByText('ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。'),
    ).not.toBeInTheDocument()
  })

  it('ブラウンノイズの開始失敗後にミュート表示から再試行できる', async () => {
    audioMocks.start.mockResolvedValueOnce('failed')
    render(<TimerPanel showStudyTime onTimerNavigationLockChange={timerLockMock} />)

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
