import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

const LANE_X = [-4.5, -1.5, 1.5, 4.5]
const PLAYER_Z = 8
const MAX_BOOST = 100

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const randomLane = () => Math.floor(Math.random() * LANE_X.length)

const recycleObstacle = (obstacle, farthestZ) => {
  obstacle.lane = randomLane()
  obstacle.z = farthestZ - 42 - Math.random() * 60
  obstacle.kind = Math.floor(Math.random() * 4)
  obstacle.nearMissed = false
}

const recyclePickup = (pickup, farthestZ) => {
  pickup.lane = randomLane()
  pickup.z = farthestZ - 36 - Math.random() * 72
  pickup.kind = Math.random() > 0.72 ? 'boost' : 'coin'
}

const buildWorld = () => {
  const obstacles = []
  const pickups = []

  for (let i = 0; i < 14; i += 1) {
    obstacles.push({
      id: `ob-${i}`,
      lane: randomLane(),
      z: -30 - i * 22,
      kind: i % 4,
      nearMissed: false,
    })
  }

  for (let i = 0; i < 8; i += 1) {
    pickups.push({
      id: `pk-${i}`,
      lane: randomLane(),
      z: -24 - i * 32,
      kind: i % 3 === 0 ? 'boost' : 'coin',
    })
  }

  return { obstacles, pickups }
}

const initialWorld = buildWorld()

const initialState = {
  laneIndex: 1,
  laneX: LANE_X[1],
  score: 0,
  distance: 0,
  bestScore: 0,
  speedKmh: 86,
  speedTier: 1,
  boostCharge: 28,
  boosting: false,
  phase: 'title',
  crashTimer: 0,
  obstacles: initialWorld.obstacles,
  pickups: initialWorld.pickups,
  pickupPulse: 0,
  boostPulse: 0,
  crashPulse: 0,
  muted: false,
  elapsed: 0,
}

const loadBest = () => {
  if (typeof window === 'undefined') return 0
  const value = Number(window.localStorage.getItem('sunset-runner-best-score') || '0')
  return Number.isFinite(value) ? value : 0
}

const saveBest = (bestScore) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem('sunset-runner-best-score', String(Math.round(bestScore)))
}

export const gameStore = createStore((set, get) => ({
  ...initialState,
  hydrate: () => {
    set({ bestScore: loadBest() })
  },
  setMuted: (muted) => set({ muted }),
  start: () => {
    const world = buildWorld()
    set((state) => ({
      ...state,
      laneIndex: 1,
      laneX: LANE_X[1],
      score: 0,
      distance: 0,
      speedKmh: 86,
      speedTier: 1,
      boostCharge: 36,
      boosting: false,
      phase: 'play',
      crashTimer: 0,
      elapsed: 0,
      obstacles: world.obstacles,
      pickups: world.pickups,
      pickupPulse: 0,
      boostPulse: 0,
      crashPulse: 0,
    }))
  },
  moveLane: (dir) => {
    const laneIndex = clamp(get().laneIndex + dir, 0, LANE_X.length - 1)
    set({ laneIndex, laneX: LANE_X[laneIndex] })
  },
  tryBoost: () => {
    const state = get()
    if (state.phase !== 'play' || state.boostCharge < 8) return
    set((current) => ({
      boosting: true,
      boostCharge: Math.max(0, current.boostCharge - 6),
      boostPulse: current.boostPulse + 1,
    }))
  },
  tick: (delta) => {
    const state = get()
    const dt = clamp(delta, 0, 0.05)
    if (state.phase !== 'play' && state.phase !== 'crash') return

    if (state.phase === 'crash') {
      const crashTimer = state.crashTimer + dt
      const bestScore = Math.max(state.bestScore, state.score)
      if (bestScore !== state.bestScore) saveBest(bestScore)
      if (crashTimer > 0.8) {
        set({
          phase: 'gameover',
          crashTimer,
          boosting: false,
          bestScore,
          speedKmh: 0,
        })
      } else {
        set({ crashTimer, speedKmh: Math.max(0, state.speedKmh * 0.9) })
      }
      return
    }

    const elapsed = state.elapsed + dt
    const baseSpeed = 86 + elapsed * 5.6
    const boostUse = state.boosting ? 58 : 0
    const speedKmh = baseSpeed + boostUse
    const speedTier = clamp(Math.floor((speedKmh - 80) / 35) + 1, 1, 6)
    const worldDelta = speedKmh * dt * 0.26
    const scoreGain = worldDelta * speedTier * 2.2

    const obstacles = state.obstacles.map((obstacle) => ({ ...obstacle }))
    const pickups = state.pickups.map((pickup) => ({ ...pickup }))

    let nearMissBonus = 0
    let pickupBonus = 0
    let boostCharge = state.boostCharge
    let crash = false

    let farthestObstacle = Math.min(...obstacles.map((item) => item.z))
    for (const obstacle of obstacles) {
      obstacle.z += worldDelta
      const sameLane = obstacle.lane === state.laneIndex
      const laneGap = Math.abs(obstacle.lane - state.laneIndex)
      const longitudinalGap = Math.abs(obstacle.z - PLAYER_Z)

      if (sameLane && longitudinalGap < 2) {
        crash = true
      }

      if (!obstacle.nearMissed && laneGap === 1 && obstacle.z > PLAYER_Z - 1 && obstacle.z < PLAYER_Z + 2) {
        obstacle.nearMissed = true
        nearMissBonus += 40
      }

      if (obstacle.z > PLAYER_Z + 18) {
        recycleObstacle(obstacle, farthestObstacle)
      }

      if (obstacle.z < farthestObstacle) {
        farthestObstacle = obstacle.z
      }
    }

    let farthestPickup = Math.min(...pickups.map((item) => item.z))
    let pickupPulse = state.pickupPulse
    for (const pickup of pickups) {
      pickup.z += worldDelta
      const sameLane = pickup.lane === state.laneIndex
      const longitudinalGap = Math.abs(pickup.z - PLAYER_Z)

      if (sameLane && longitudinalGap < 1.6) {
        if (pickup.kind === 'coin') {
          pickupBonus += 120
        } else {
          boostCharge = clamp(boostCharge + 24, 0, MAX_BOOST)
          pickupBonus += 60
        }
        pickupPulse += 1
        recyclePickup(pickup, farthestPickup)
      }

      if (pickup.z > PLAYER_Z + 15) {
        recyclePickup(pickup, farthestPickup)
      }

      if (pickup.z < farthestPickup) {
        farthestPickup = pickup.z
      }
    }

    if (state.boosting) {
      boostCharge = Math.max(0, boostCharge - dt * 24)
    }

    const boosting = state.boosting && boostCharge > 0.4

    if (crash) {
      set({
        phase: 'crash',
        crashTimer: 0,
        crashPulse: state.crashPulse + 1,
        speedKmh,
        obstacles,
        pickups,
      })
      return
    }

    set((current) => ({
      elapsed,
      speedKmh,
      speedTier,
      score: current.score + scoreGain + nearMissBonus + pickupBonus,
      distance: current.distance + worldDelta,
      boostCharge,
      boosting,
      obstacles,
      pickups,
      pickupPulse,
    }))
  },
}))

export const useGameStore = (selector) => useStore(gameStore, selector)

export { LANE_X, PLAYER_Z, MAX_BOOST }
