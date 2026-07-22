import * as React from 'react'

export type AmbientKind = 'off' | 'brown' | 'white'

/**
 * Focus-music engine with zero assets: generates brown/white noise via the
 * Web Audio API. Brown noise ("rain-like") is the popular study choice.
 */
export function useAmbientSound() {
  const [kind, setKind] = React.useState<AmbientKind>('off')
  const [volume, setVolume] = React.useState(0.35)
  const contextRef = React.useRef<AudioContext | null>(null)
  const sourceRef = React.useRef<AudioBufferSourceNode | null>(null)
  const gainRef = React.useRef<GainNode | null>(null)

  const stop = React.useCallback(() => {
    sourceRef.current?.stop()
    sourceRef.current?.disconnect()
    sourceRef.current = null
    gainRef.current?.disconnect()
    gainRef.current = null
    void contextRef.current?.close()
    contextRef.current = null
  }, [])

  const play = React.useCallback(
    (nextKind: Exclude<AmbientKind, 'off'>, nextVolume: number) => {
      stop()
      const AudioContextCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextCtor) return
      const ctx = new AudioContextCtor()
      const seconds = 4
      const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
      const data = buffer.getChannelData(0)

      if (nextKind === 'white') {
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
      } else {
        // Brown noise: integrate white noise with leak to avoid drift.
        let last = 0
        for (let i = 0; i < data.length; i += 1) {
          const white = Math.random() * 2 - 1
          last = (last + 0.02 * white) / 1.02
          data[i] = last * 3.5
        }
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const gain = ctx.createGain()
      gain.gain.value = nextVolume
      source.connect(gain).connect(ctx.destination)
      source.start()

      contextRef.current = ctx
      sourceRef.current = source
      gainRef.current = gain
    },
    [stop],
  )

  const select = React.useCallback(
    (nextKind: AmbientKind) => {
      setKind(nextKind)
      if (nextKind === 'off') stop()
      else play(nextKind, volume)
    },
    [play, stop, volume],
  )

  const changeVolume = React.useCallback((nextVolume: number) => {
    setVolume(nextVolume)
    if (gainRef.current) gainRef.current.gain.value = nextVolume
  }, [])

  React.useEffect(() => stop, [stop])

  return { kind, volume, select, changeVolume }
}
