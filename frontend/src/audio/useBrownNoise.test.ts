import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  useBrownNoise,
  type BrownNoiseStartResult,
} from './useBrownNoise'

type Deferred = {
  promise: Promise<void>
  resolve: () => void
}

const createDeferred = (): Deferred => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe('useBrownNoise', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('停止後にAudioContextの再開が完了しても音源を開始しない', async () => {
    const resume = createDeferred()
    const source = {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    const filter = {
      type: 'lowpass',
      frequency: { value: 0 },
      Q: { value: 0 },
      gain: { value: 0 },
      connect: vi.fn(),
    }
    const gain = {
      gain: {
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
    const limiter = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
    }
    const context = {
      currentTime: 0,
      sampleRate: 10,
      destination: {},
      close: vi.fn().mockResolvedValue(undefined),
      createBiquadFilter: vi.fn(() => ({ ...filter })),
      createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => new Float32Array(300)),
      })),
      createBufferSource: vi.fn(() => source),
      createDynamicsCompressor: vi.fn(() => limiter),
      createGain: vi.fn(() => gain),
      resume: vi.fn(() => resume.promise),
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContextMock() {
        return context
      }),
    )

    const { result, unmount } = renderHook(() => useBrownNoise())
    let startResult: Promise<BrownNoiseStartResult> = Promise.resolve('cancelled')
    act(() => {
      startResult = result.current.start(0.35)
    })
    act(() => {
      result.current.stop()
      resume.resolve()
    })

    await expect(startResult).resolves.toBe('cancelled')
    expect(source.start).not.toHaveBeenCalled()
    unmount()
  })

  it('低い音へ寄せたステレオのブラウンノイズを生成する', async () => {
    const source = {
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
    const filters: Array<{
      type: string
      frequency: { value: number }
      Q: { value: number }
      gain: { value: number }
      connect: ReturnType<typeof vi.fn>
    }> = []
    const createBiquadFilter = vi.fn(() => {
      const filter = {
        type: 'lowpass',
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 },
        connect: vi.fn(),
      }
      filters.push(filter)
      return filter
    })
    const gain = {
      gain: {
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
    const limiter = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: vi.fn(),
    }
    const channels = [new Float32Array(300), new Float32Array(300)]
    const createBuffer = vi.fn(() => ({
      numberOfChannels: channels.length,
      getChannelData: vi.fn((channel: number) => channels[channel]),
    }))
    const context = {
      currentTime: 0,
      sampleRate: 10,
      destination: {},
      close: vi.fn().mockResolvedValue(undefined),
      createBiquadFilter,
      createBuffer,
      createBufferSource: vi.fn(() => source),
      createDynamicsCompressor: vi.fn(() => limiter),
      createGain: vi.fn(() => gain),
      resume: vi.fn().mockResolvedValue(undefined),
    }
    vi.stubGlobal(
      'AudioContext',
      vi.fn(function AudioContextMock() {
        return context
      }),
    )

    const { result, unmount } = renderHook(() => useBrownNoise())

    await expect(result.current.start(0.35)).resolves.toBe('started')
    expect(createBuffer).toHaveBeenCalledWith(2, 300, 10)
    expect(filters.map(({ type, frequency }) => [type, frequency.value])).toEqual([
      ['highpass', 32],
      ['lowpass', 360],
      ['peaking', 110],
    ])
    expect(filters[2].gain.value).toBe(3)
    expect(source.start).toHaveBeenCalledOnce()

    unmount()
  })
})
