import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TimerPanel } from './TimerPanel'

const audioMocks = vi.hoisted(() => ({
  start: vi.fn().mockResolvedValue('started'),
  stop: vi.fn(),
  setVolume: vi.fn(),
}))
const timerLockMock = vi.fn()

vi.mock('../audio/useBrownNoise', () => ({
  useBrownNoise: () => audioMocks,
}))

describe('TimerPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'))
    audioMocks.start.mockClear()
    audioMocks.stop.mockClear()
    audioMocks.setVolume.mockClear()
    timerLockMock.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('開始後は実時刻との差から残り時間を更新する', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(1_000))

    expect(screen.getByLabelText('学習 24:59')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を一時停止' })).toBeInTheDocument()
  })

  it('一時停止中は時間を進めない', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(2_000))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))
    act(() => vi.advanceTimersByTime(5_000))

    expect(screen.getByLabelText('学習 24:58')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を再開' })).toBeInTheDocument()
  })

  it('1秒未満で一時停止しても経過した端数を保持する', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    act(() => vi.advanceTimersByTime(500))
    fireEvent.click(screen.getByRole('button', { name: '学習を一時停止' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を再開' }))
    act(() => vi.advanceTimersByTime(500))

    expect(screen.getByLabelText('学習 24:59')).toBeInTheDocument()
  })

  it('開始後は認証画面への移動をロックする', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))

    expect(timerLockMock).toHaveBeenLastCalledWith(true)
  })

  it('開始前は52分17分へ変更できる', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    expect(screen.getByText('0分')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '52分 / 17分' }))

    expect(screen.getByLabelText('学習 52:00')).toBeInTheDocument()
  })

  it('学習と短い休憩の両方が経過してから復帰すると待機状態になる', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    vi.setSystemTime(new Date('2026-10-27T00:31:00Z'))
    act(() => vi.advanceTimersByTime(250))

    expect(
      screen.getByRole('heading', { name: '次の学習を待機中' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '学習を始める' })).toBeInTheDocument()
    expect(screen.getByText('1 / 4回')).toBeInTheDocument()
  })

  it('長い休憩を切り上げると4回分の進捗をリセットする', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

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

  it('ミュート状態で開始しても途中からブラウンノイズを開始できる', () => {
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    fireEvent.click(screen.getByRole('button', { name: 'ミュート' }))
    fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    expect(audioMocks.start).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '音を出す' }))
    expect(audioMocks.start).toHaveBeenCalledWith(0.35)
  })

  it('ブラウンノイズの正常な開始キャンセルでは警告を表示しない', async () => {
    audioMocks.start.mockResolvedValueOnce('cancelled')
    render(<TimerPanel showStudyTime onTimerLockChange={timerLockMock} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '学習を開始' }))
    })

    expect(
      screen.queryByText('ブラウンノイズを開始できませんでした。タイマーはそのまま利用できます。'),
    ).not.toBeInTheDocument()
  })
})
