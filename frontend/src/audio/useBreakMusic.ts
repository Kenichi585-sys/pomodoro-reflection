import { useCallback, useEffect, useRef } from 'react'

import breakAmbientUrl from '../assets/break-ambient.mp3'

export type BreakMusicStartResult = 'started' | 'cancelled' | 'failed'

type BreakMusicController = {
  start: (volume: number) => Promise<BreakMusicStartResult>
  pause: () => void
  stop: () => void
  setVolume: (volume: number) => void
}

const clampVolume = (volume: number) => Math.min(1, Math.max(0, volume))

export const useBreakMusic = (): BreakMusicController => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startRequestIdRef = useRef(0)
  const shouldBePlayingRef = useRef(false)
  const volumeRef = useRef(0)

  const getOrCreateAudio = useCallback(() => {
    if (typeof Audio === 'undefined') return null
    if (audioRef.current) return audioRef.current

    const audio = new Audio(breakAmbientUrl)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = clampVolume(volumeRef.current)
    audioRef.current = audio
    return audio
  }, [])

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = volume
    const audio = audioRef.current
    if (audio) audio.volume = clampVolume(volume)
  }, [])

  const pause = useCallback(() => {
    shouldBePlayingRef.current = false
    startRequestIdRef.current += 1
    audioRef.current?.pause()
  }, [])

  const stop = useCallback(() => {
    shouldBePlayingRef.current = false
    startRequestIdRef.current += 1
    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    audio.currentTime = 0
  }, [])

  const start = useCallback(
    async (volume: number) => {
      volumeRef.current = volume
      shouldBePlayingRef.current = true
      const startRequestId = startRequestIdRef.current + 1
      startRequestIdRef.current = startRequestId
      const audio = getOrCreateAudio()
      if (!audio) {
        shouldBePlayingRef.current = false
        return 'failed'
      }

      audio.volume = clampVolume(volumeRef.current)

      try {
        await audio.play()
        if (startRequestId !== startRequestIdRef.current) {
          if (!shouldBePlayingRef.current) audio.pause()
          return 'cancelled'
        }
        return 'started'
      } catch {
        if (startRequestId !== startRequestIdRef.current) return 'cancelled'
        shouldBePlayingRef.current = false
        audio.pause()
        return 'failed'
      }
    },
    [getOrCreateAudio],
  )

  useEffect(() => {
    return () => {
      stop()
      const audio = audioRef.current
      audioRef.current = null
      if (!audio) return

      audio.removeAttribute('src')
      audio.load()
    }
  }, [stop])

  return { start, pause, stop, setVolume }
}
