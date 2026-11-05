import { useCallback, useEffect, useRef } from 'react'

export type BrownNoiseStartResult = 'started' | 'cancelled' | 'failed'

type BrownNoiseController = {
  start: (volume: number) => Promise<BrownNoiseStartResult>
  stop: () => void
  setVolume: (volume: number) => void
}

const BROWN_NOISE_DURATION_SECONDS = 30
const LOOP_CROSSFADE_SECONDS = 0.05

const volumeToGain = (volume: number) => {
  const clampedVolume = Math.min(1, Math.max(0, volume))
  return clampedVolume * 2.4
}

export const useBrownNoise = (): BrownNoiseController => {
  const contextRef = useRef<AudioContext | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const highPassRef = useRef<BiquadFilterNode | null>(null)
  const lowPassRef = useRef<BiquadFilterNode | null>(null)
  const lowFrequencyBoostFilterRef = useRef<BiquadFilterNode | null>(null)
  const limiterRef = useRef<DynamicsCompressorNode | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const startRequestIdRef = useRef(0)
  const volumeRef = useRef(0)

  const stopAndDisconnectSource = useCallback(() => {
    const source = sourceRef.current
    if (!source) return

    source.stop()
    source.disconnect()
    sourceRef.current = null
  }, [])

  const stop = useCallback(() => {
    startRequestIdRef.current += 1
    stopAndDisconnectSource()
  }, [stopAndDisconnectSource])

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = volume
    const context = contextRef.current
    const gain = gainRef.current
    if (!context || !gain) return

    gain.gain.setTargetAtTime(volumeToGain(volume), context.currentTime, 0.02)
  }, [])

  const start = useCallback(
    async (volume: number) => {
      if (typeof AudioContext === 'undefined') return 'failed'

      volumeRef.current = volume
      const startRequestId = startRequestIdRef.current + 1
      startRequestIdRef.current = startRequestId
      stopAndDisconnectSource()

      try {
        const context = contextRef.current ?? new AudioContext()
        contextRef.current = context

        const gain = gainRef.current ?? context.createGain()
        if (!gainRef.current) {
          const highPass = context.createBiquadFilter()
          highPass.type = 'highpass'
          highPass.frequency.value = 32
          highPass.Q.value = 0.45

          const lowPass = context.createBiquadFilter()
          lowPass.type = 'lowpass'
          lowPass.frequency.value = 360
          lowPass.Q.value = 0.45

          const lowFrequencyBoostFilter = context.createBiquadFilter()
          lowFrequencyBoostFilter.type = 'peaking'
          lowFrequencyBoostFilter.frequency.value = 110
          lowFrequencyBoostFilter.Q.value = 0.55
          lowFrequencyBoostFilter.gain.value = 3

          const limiter = context.createDynamicsCompressor()
          limiter.threshold.value = -3
          limiter.knee.value = 0
          limiter.ratio.value = 20
          limiter.attack.value = 0.003
          limiter.release.value = 0.15

          highPass.connect(lowPass)
          lowPass.connect(lowFrequencyBoostFilter)
          lowFrequencyBoostFilter.connect(gain)
          gain.connect(limiter)
          limiter.connect(context.destination)
          highPassRef.current = highPass
          lowPassRef.current = lowPass
          lowFrequencyBoostFilterRef.current = lowFrequencyBoostFilter
          limiterRef.current = limiter
          gainRef.current = gain
        }

        await context.resume()
        if (startRequestId !== startRequestIdRef.current) return 'cancelled'

        let buffer = bufferRef.current
        if (!buffer) {
          const frameCount = context.sampleRate * BROWN_NOISE_DURATION_SECONDS
          const loopCrossfadeFrameCount = Math.max(
            1,
            Math.min(
              Math.round(context.sampleRate * LOOP_CROSSFADE_SECONDS),
              Math.floor(frameCount / 2),
            ),
          )
          buffer = context.createBuffer(2, frameCount, context.sampleRate)

          for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
            const samples = buffer.getChannelData(channel)
            let previousSample = 0

            for (let index = 0; index < frameCount; index += 1) {
              const whiteNoise = Math.random() * 2 - 1
              const brownNoise = (previousSample + 0.02 * whiteNoise) / 1.02
              previousSample = brownNoise
              samples[index] = brownNoise * 3.2
            }

            for (let index = 0; index < loopCrossfadeFrameCount; index += 1) {
              const progress = (index + 1) / loopCrossfadeFrameCount
              const fadeOut = Math.cos((progress * Math.PI) / 2)
              const fadeIn = Math.sin((progress * Math.PI) / 2)
              const loopEndIndex = frameCount - loopCrossfadeFrameCount + index
              samples[loopEndIndex] =
                samples[loopEndIndex] * fadeOut + samples[index] * fadeIn
            }
          }

          bufferRef.current = buffer
        }

        const source = context.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.loopStart = LOOP_CROSSFADE_SECONDS
        source.loopEnd = BROWN_NOISE_DURATION_SECONDS
        source.connect(highPassRef.current ?? gain)
        gain.gain.setValueAtTime(volumeToGain(volumeRef.current), context.currentTime)
        source.start()
        sourceRef.current = source
        return 'started'
      } catch {
        if (startRequestId !== startRequestIdRef.current) return 'cancelled'
        stopAndDisconnectSource()
        return 'failed'
      }
    },
    [stopAndDisconnectSource],
  )

  useEffect(() => {
    return () => {
      stop()
      const context = contextRef.current
      contextRef.current = null
      gainRef.current = null
      highPassRef.current = null
      lowPassRef.current = null
      lowFrequencyBoostFilterRef.current = null
      limiterRef.current = null
      bufferRef.current = null
      if (context) void context.close()
    }
  }, [stop])

  return { start, stop, setVolume }
}
