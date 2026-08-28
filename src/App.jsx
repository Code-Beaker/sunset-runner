import { useEffect, useMemo, useRef, useState } from 'react'
import GameCanvas from './GameCanvas'
import { gameStore, useGameStore } from './gameStore'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function useHudSnapshot() {
  const [hud, setHud] = useState(() => {
    const state = gameStore.getState()
    return {
      score: state.score,
      speedKmh: state.speedKmh,
      speedTier: state.speedTier,
      boostCharge: state.boostCharge,
      bestScore: state.bestScore,
    }
  })

  useEffect(() => {
    const update = () => {
      const state = gameStore.getState()
      setHud({
        score: state.score,
        speedKmh: state.speedKmh,
        speedTier: state.speedTier,
        boostCharge: state.boostCharge,
        bestScore: state.bestScore,
      })
    }

    update()
    const interval = window.setInterval(update, 95)
    return () => window.clearInterval(interval)
  }, [])

  return hud
}

function useAudioSystem(armed) {
  const muted = useGameStore((state) => state.muted)
  const speedKmh = useGameStore((state) => state.speedKmh)
  const pickupPulse = useGameStore((state) => state.pickupPulse)
  const boostPulse = useGameStore((state) => state.boostPulse)
  const crashPulse = useGameStore((state) => state.crashPulse)
  const contextRef = useRef(null)
  const humOscRef = useRef(null)
  const humGainRef = useRef(null)

  const playTone = (frequency, duration, gainLevel, type = 'sine') => {
    const context = contextRef.current
    if (!context || muted) return

    const now = context.currentTime
    const gain = context.createGain()
    const osc = context.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, now)
    gain.gain.setValueAtTime(gainLevel, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    osc.connect(gain).connect(context.destination)
    osc.start(now)
    osc.stop(now + duration)
  }

  useEffect(() => {
    if (!armed || contextRef.current) return
    const context = new window.AudioContext()
    const humGain = context.createGain()
    const humOsc = context.createOscillator()
    humOsc.type = 'sawtooth'
    humOsc.frequency.value = 68
    humGain.gain.value = 0.0001
    humOsc.connect(humGain).connect(context.destination)
    humOsc.start()

    contextRef.current = context
    humOscRef.current = humOsc
    humGainRef.current = humGain

    return () => {
      humOsc.stop()
      context.close()
    }
  }, [armed])

  useEffect(() => {
    if (!contextRef.current || !humOscRef.current || !humGainRef.current) return
    const context = contextRef.current
    const now = context.currentTime
    const speedRatio = clamp(speedKmh / 240, 0, 1)
    const targetFrequency = 68 + speedRatio * 84
    const targetGain = muted ? 0.0001 : 0.036 + speedRatio * 0.03

    humOscRef.current.frequency.setTargetAtTime(targetFrequency, now, 0.11)
    humGainRef.current.gain.setTargetAtTime(targetGain, now, 0.11)
  }, [speedKmh, muted])

  useEffect(() => {
    playTone(860, 0.12, 0.04, 'triangle')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPulse])

  useEffect(() => {
    playTone(180, 0.3, 0.06, 'sawtooth')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boostPulse])

  useEffect(() => {
    playTone(92, 0.45, 0.09, 'square')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crashPulse])
}

function ControlsLayer({ onFirstInteraction }) {
  const phase = useGameStore((state) => state.phase)
  const [touchStart, setTouchStart] = useState(null)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (phase === 'title' && (event.key === 'Enter' || event.code === 'Space')) {
        onFirstInteraction()
        gameStore.getState().start()
        event.preventDefault()
        return
      }

      if (phase !== 'play') return
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        gameStore.getState().moveLane(-1)
      } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        gameStore.getState().moveLane(1)
      } else if (event.code === 'Space') {
        gameStore.getState().tryBoost()
        event.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [phase, onFirstInteraction])

  return (
    <div
      className="controls-layer"
      onPointerDown={(event) => {
        if (phase === 'title') {
          onFirstInteraction()
        }
        setTouchStart({ x: event.clientX, y: event.clientY, t: performance.now() })
      }}
      onPointerUp={(event) => {
        if (!touchStart) return
        const dx = event.clientX - touchStart.x
        const dy = event.clientY - touchStart.y
        const dt = performance.now() - touchStart.t

        if (phase === 'play') {
          if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
            gameStore.getState().moveLane(dx < 0 ? -1 : 1)
          } else if (dt < 240) {
            gameStore.getState().tryBoost()
          }
        }

        setTouchStart(null)
      }}
    />
  )
}

function Overlay() {
  const phase = useGameStore((state) => state.phase)
  const score = useGameStore((state) => state.score)
  const bestScore = useGameStore((state) => state.bestScore)
  const muted = useGameStore((state) => state.muted)
  const hud = useHudSnapshot()
  const speedRatio = clamp(hud.speedKmh / 230, 0, 1)

  return (
    <>
      <header className="hud">
        <div className="hud-group">
          <div className="hud-item">
            <span>Score</span>
            <strong>{Math.floor(hud.score)}</strong>
          </div>
          <div className="hud-item">
            <span>Best</span>
            <strong>{Math.floor(hud.bestScore)}</strong>
          </div>
        </div>

        <div className="hud-group">
          <div className="hud-item">
            <span>Speed</span>
            <strong>{Math.floor(hud.speedKmh)} km/h</strong>
          </div>
          <div className="hud-item">
            <span>Tier</span>
            <strong>T{hud.speedTier}</strong>
          </div>
          <div className="hud-item boost">
            <span>Boost</span>
            <div className="meter">
              <i style={{ width: `${hud.boostCharge}%` }} />
            </div>
          </div>
        </div>

        <button className="mute" onClick={() => gameStore.getState().setMuted(!muted)} type="button">
          {muted ? 'Unmute' : 'Mute'}
        </button>
      </header>

      <div className="speed-streak" style={{ opacity: 0.08 + speedRatio * 0.35 }} />

      {phase === 'title' && (
        <div className="card">
          <h1>Sunset Runner</h1>
          <p>4-lane sunset highway survival.</p>
          <p className="hint">Arrow keys / A-D to switch lanes. Space or tap to boost.</p>
          <p className="hint">Best score: {Math.floor(bestScore)}</p>
          <button className="action" type="button" onClick={() => gameStore.getState().start()}>
            Start
          </button>
        </div>
      )}

      {phase === 'gameover' && (
        <div className="card">
          <h2>Drive Over</h2>
          <p>Score: {Math.floor(score)}</p>
          <p>Best: {Math.floor(bestScore)}</p>
          {score >= bestScore && <p className="new-best">New best!</p>}
          <button className="action" type="button" onClick={() => gameStore.getState().start()}>
            Restart
          </button>
        </div>
      )}
    </>
  )
}

export default function App() {
  const [audioArmed, setAudioArmed] = useState(false)

  const onFirstInteraction = useMemo(
    () => () => {
      if (!audioArmed) {
        setAudioArmed(true)
      }
    },
    [audioArmed],
  )

  useEffect(() => {
    gameStore.getState().hydrate()
  }, [])

  useAudioSystem(audioArmed)

  return (
    <div className="app-shell" onPointerDown={onFirstInteraction}>
      <GameCanvas />
      <ControlsLayer onFirstInteraction={onFirstInteraction} />
      <Overlay />
    </div>
  )
}
