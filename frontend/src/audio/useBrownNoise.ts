import { useCallback, useEffect, useRef } from 'react'

export type BrownNoiseStartResult = 'started' | 'cancelled' | 'failed'

type BrownNoiseController = {
  start: (volume: number) => Promise<BrownNoiseStartResult>
  stop: () => void
  setVolume: (volume: number) => void
}

const normalizedGain = (volume: number) => {
  const clampedVolume = Math.min(1, Math.max(0, volume))
  return clampedVolume * 2.4
}

export const useBrownNoise = (): BrownNoiseController => {
  const contextRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const highPassRef = useRef<BiquadFilterNode | null>(null)
  const lowPassRef = useRef<BiquadFilterNode | null>(null)
  const lowShelfRef = useRef<BiquadFilterNode | null>(null)
  const limiterRef = useRef<DynamicsCompressorNode | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startRequestIdRef = useRef(0)

  const disconnectSource = useCallback(() => {
    const source = sourceRef.current
    if (!source) return

    source.stop()
    source.disconnect()
    sourceRef.current = null
  }, [])

  const stop = useCallback(() => {
    startRequestIdRef.current += 1
    disconnectSource()
  }, [disconnectSource])

  const setVolume = useCallback((volume: number) => {
    const context = contextRef.current
    const gain = gainRef.current
    if (!context || !gain) return

    gain.gain.setTargetAtTime(normalizedGain(volume), context.currentTime, 0.02)
  }, [])

  const start = useCallback(
    async (volume: number) => {
      if (typeof AudioContext === 'undefined') return 'failed'

      const requestId = startRequestIdRef.current + 1
      startRequestIdRef.current = requestId
      disconnectSource()

      try {
        const context = contextRef.current ?? new AudioContext()
        contextRef.current = context

        const gain = gainRef.current ?? context.createGain()
        if (!gainRef.current) {
          const highPass = context.createBiquadFilter()
          highPass.type = 'highpass'
          highPass.frequency.value = 18
          highPass.Q.value = 0.2

          const lowPass = context.createBiquadFilter()
          lowPass.type = 'lowpass'
          lowPass.frequency.value = 850
          lowPass.Q.value = 0.3

          const lowShelf = context.createBiquadFilter()
          lowShelf.type = 'lowshelf'
          lowShelf.frequency.value = 95
          lowShelf.gain.value = 6

          const limiter = context.createDynamicsCompressor()
          limiter.threshold.value = -3
          limiter.knee.value = 0
          limiter.ratio.value = 20
          limiter.attack.value = 0.003
          limiter.release.value = 0.15

          highPass.connect(lowPass)
          lowPass.connect(lowShelf)
          lowShelf.connect(gain)
          gain.connect(limiter)
          limiter.connect(context.destination)
          highPassRef.current = highPass
          lowPassRef.current = lowPass
          lowShelfRef.current = lowShelf
          limiterRef.current = limiter
          gainRef.current = gain
        }

        await context.resume()
        if (requestId !== startRequestIdRef.current) return 'cancelled'

        let buffer = bufferRef.current
        if (!buffer) {
          const frameCount = context.sampleRate * 30
          buffer = context.createBuffer(1, frameCount, context.sampleRate)
          const samples = buffer.getChannelData(0)
          let previousSample = 0

          for (let index = 0; index < frameCount; index += 1) {
            const whiteNoise = Math.random() * 2 - 1
            const brownNoise = (previousSample + 0.02 * whiteNoise) / 1.02
            previousSample = brownNoise
            samples[index] = brownNoise * 3.2
          }

          bufferRef.current = buffer
        }

        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(highPassRef.current ?? gain)
        gain.gain.setValueAtTime(normalizedGain(volume), context.currentTime)
        source.start()
        sourceRef.current = source
        return 'started'
      } catch {
        if (requestId !== startRequestIdRef.current) return 'cancelled'
        disconnectSource()
        return 'failed'
      }
    },
    [disconnectSource],
  )

  useEffect(() => {
    return () => {
      stop()
      const context = contextRef.current
      contextRef.current = null
      gainRef.current = null
      highPassRef.current = null
      lowPassRef.current = null
      lowShelfRef.current = null
      limiterRef.current = null
      bufferRef.current = null
      if (context) void context.close()
    }
  }, [stop])

  return { start, stop, setVolume }
}
