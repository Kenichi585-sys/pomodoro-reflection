import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useBreakMusic } from './useBreakMusic'

const createDeferred = () => {
  let resolvePromise: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

describe('useBreakMusic', () => {
  const play = vi.fn<() => Promise<void>>()
  const pause = vi.fn()
  const load = vi.fn()
  const removeAttribute = vi.fn()
  const audio = {
    currentTime: 0,
    load,
    loop: false,
    pause,
    play,
    preload: '',
    removeAttribute,
    volume: 1,
  } as unknown as HTMLAudioElement

  beforeEach(() => {
    audio.currentTime = 0
    audio.loop = false
    audio.preload = ''
    audio.volume = 1
    play.mockReset().mockResolvedValue(undefined)
    pause.mockClear()
    load.mockClear()
    removeAttribute.mockClear()
    vi.stubGlobal(
      'Audio',
      vi.fn(function AudioMock() {
        return audio
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('休憩用音源をループ再生し、一時停止後は続きから再開する', async () => {
    const { result } = renderHook(() => useBreakMusic())

    await act(async () => {
      expect(await result.current.start(0.35)).toBe('started')
    })

    expect(audio.loop).toBe(true)
    expect(audio.preload).toBe('auto')
    expect(audio.volume).toBe(0.35)

    audio.currentTime = 42
    act(() => result.current.pause())
    expect(pause).toHaveBeenCalledTimes(1)
    expect(audio.currentTime).toBe(42)

    await act(async () => {
      expect(await result.current.start(0.5)).toBe('started')
    })
    expect(play).toHaveBeenCalledTimes(2)
    expect(audio.currentTime).toBe(42)
    expect(audio.volume).toBe(0.5)
  })

  it('停止時は再生位置を先頭へ戻す', async () => {
    const { result } = renderHook(() => useBreakMusic())

    await act(async () => {
      await result.current.start(0.35)
    })
    audio.currentTime = 84
    act(() => result.current.stop())

    expect(pause).toHaveBeenCalled()
    expect(audio.currentTime).toBe(0)
  })

  it('古い再生要求の完了が新しく再開した音声を停止しない', async () => {
    const firstPlay = createDeferred()
    const secondPlay = createDeferred()
    play
      .mockReset()
      .mockReturnValueOnce(firstPlay.promise)
      .mockReturnValueOnce(secondPlay.promise)
    const { result } = renderHook(() => useBreakMusic())

    const firstStartResult = result.current.start(0.35)
    act(() => result.current.pause())
    const secondStartResult = result.current.start(0.5)

    secondPlay.resolve()
    await expect(secondStartResult).resolves.toBe('started')
    const pauseCountAfterRestart = pause.mock.calls.length

    firstPlay.resolve()
    await expect(firstStartResult).resolves.toBe('cancelled')
    expect(pause).toHaveBeenCalledTimes(pauseCountAfterRestart)
  })

  it('再生待機中に一時停止した場合は遅れて開始した音声も停止する', async () => {
    const pendingPlay = createDeferred()
    play.mockReset().mockReturnValueOnce(pendingPlay.promise)
    const { result } = renderHook(() => useBreakMusic())

    const startResult = result.current.start(0.35)
    act(() => result.current.pause())
    pendingPlay.resolve()

    await expect(startResult).resolves.toBe('cancelled')
    expect(pause).toHaveBeenCalledTimes(2)
  })

  it('再生できない場合は失敗を返す', async () => {
    play.mockRejectedValueOnce(new Error('play failed'))
    const { result } = renderHook(() => useBreakMusic())

    await act(async () => {
      expect(await result.current.start(0.35)).toBe('failed')
    })

    expect(pause).toHaveBeenCalled()
  })

  it('破棄時に音源を停止して読み込みを解放する', async () => {
    const { result, unmount } = renderHook(() => useBreakMusic())

    await act(async () => {
      await result.current.start(0.35)
    })
    unmount()

    expect(audio.currentTime).toBe(0)
    expect(removeAttribute).toHaveBeenCalledWith('src')
    expect(load).toHaveBeenCalled()
  })
})
