import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { LANE_X, PLAYER_Z, useGameStore, gameStore } from './gameStore'

const damp = (current, target, k, dt) => target + (current - target) * Math.exp(-k * dt)

const laneColor = ['#4f5d75', '#5e6f91', '#8ea6cb', '#8a9ab5']

function CameraRig() {
  const speedKmh = useGameStore((state) => state.speedKmh)

  useFrame((state, delta) => {
    const { camera } = state
    const dt = Math.min(0.05, delta)
    const speedFactor = Math.min(1, speedKmh / 220)
    const desiredZ = 16 + speedFactor * 2
    const desiredY = 5.2 + speedFactor * 0.35

    camera.position.z = damp(camera.position.z, desiredZ, 8, dt)
    camera.position.y = damp(camera.position.y, desiredY, 8, dt)

    camera.fov = damp(camera.fov, 54 + speedFactor * 8, 6, dt)
    camera.updateProjectionMatrix()
  })

  return null
}

function PlayerCar() {
  const laneX = useGameStore((state) => state.laneX)
  const phase = useGameStore((state) => state.phase)
  const ref = useRef()
  const previousX = useRef(laneX)

  useFrame((_, delta) => {
    if (!ref.current) return
    const dt = Math.min(0.05, delta)
    ref.current.position.x = damp(ref.current.position.x, laneX, 12, dt)

    const lateralVelocity = (ref.current.position.x - previousX.current) / Math.max(dt, 0.001)
    const targetTilt = THREE.MathUtils.clamp(-lateralVelocity * 0.09, -0.2, 0.2)
    ref.current.rotation.z = damp(ref.current.rotation.z, targetTilt, 11, dt)
    ref.current.rotation.x = phase === 'crash' ? 0.15 : 0
    previousX.current = ref.current.position.x
  })

  return (
    <group ref={ref} position={[laneX, 0.35, PLAYER_Z]}>
      <mesh castShadow position={[0, 0.2, 0]}>
        <boxGeometry args={[1.35, 0.4, 2.4]} />
        <meshStandardMaterial color="#ff7546" roughness={0.38} metalness={0.14} />
      </mesh>
      <mesh castShadow position={[0, 0.55, -0.15]}>
        <boxGeometry args={[0.95, 0.28, 1.2]} />
        <meshStandardMaterial color="#ffc17f" roughness={0.42} metalness={0.12} />
      </mesh>
      <mesh castShadow position={[0, 0.38, 0.95]}>
        <boxGeometry args={[0.88, 0.18, 0.5]} />
        <meshStandardMaterial color="#313955" roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  )
}

function Traffic() {
  const obstacles = useGameStore((state) => state.obstacles)

  return (
    <group>
      {obstacles.map((obstacle) => {
        const width = 1.15 + (obstacle.kind % 3) * 0.2
        const length = 2 + (obstacle.kind % 2) * 0.55
        return (
          <group key={obstacle.id} position={[LANE_X[obstacle.lane], 0.3, obstacle.z]}>
            <mesh castShadow>
              <boxGeometry args={[width, 0.42, length]} />
              <meshStandardMaterial color={laneColor[obstacle.kind]} roughness={0.45} metalness={0.2} />
            </mesh>
            <mesh castShadow position={[0, 0.32, -0.15]}>
              <boxGeometry args={[width * 0.66, 0.22, length * 0.52]} />
              <meshStandardMaterial color="#dce7f7" roughness={0.4} metalness={0.15} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function Pickups() {
  const pickups = useGameStore((state) => state.pickups)

  return (
    <group>
      {pickups.map((pickup) => (
        <mesh key={pickup.id} position={[LANE_X[pickup.lane], 0.7, pickup.z]}>
          {pickup.kind === 'coin' ? <cylinderGeometry args={[0.34, 0.34, 0.12, 18]} /> : <boxGeometry args={[0.5, 0.5, 0.5]} />}
          <meshStandardMaterial color={pickup.kind === 'coin' ? '#ffcd4a' : '#59eddf'} emissive={pickup.kind === 'coin' ? '#674400' : '#0b5854'} emissiveIntensity={0.45} />
        </mesh>
      ))}
    </group>
  )
}

function Road() {
  const distance = useGameStore((state) => state.distance)
  const segments = useMemo(() => Array.from({ length: 6 }, (_, index) => index), [])
  const roadLength = 36
  const total = segments.length * roadLength

  return (
    <group>
      {segments.map((segment) => {
        const rawZ = segment * roadLength - (distance % total) - roadLength
        return (
          <group key={segment} position={[0, 0, rawZ]}>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[18, roadLength]} />
              <meshStandardMaterial color="#2e3552" roughness={0.92} />
            </mesh>
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
              <planeGeometry args={[0.16, roadLength]} />
              <meshStandardMaterial color="#ffdb7b" emissive="#7f6834" emissiveIntensity={0.2} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function Roadside() {
  const distance = useGameStore((state) => state.distance)
  const chunks = useMemo(() => Array.from({ length: 5 }, (_, index) => index), [])
  const chunkLength = 44
  const total = chunks.length * chunkLength

  return (
    <group>
      {chunks.map((chunk) => {
        const z = chunk * chunkLength - (distance % total) - chunkLength
        return (
          <group key={chunk} position={[0, 0, z]}>
            <mesh receiveShadow position={[-14, -0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[14, chunkLength]} />
              <meshStandardMaterial color="#2f7969" roughness={0.95} />
            </mesh>
            <mesh receiveShadow position={[14, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[13, chunkLength]} />
              <meshStandardMaterial color="#6b5f5f" roughness={1} />
            </mesh>

            <mesh castShadow position={[-16.2, 1.6, -8]}>
              <cylinderGeometry args={[0.26, 0.3, 2.3, 8]} />
              <meshStandardMaterial color="#6f4f3e" roughness={0.8} />
            </mesh>
            <mesh castShadow position={[-16.2, 3.5, -8]}>
              <coneGeometry args={[1.25, 2.1, 8]} />
              <meshStandardMaterial color="#2d8a67" roughness={0.85} />
            </mesh>

            <mesh castShadow position={[16.4, 0.8, 2]}>
              <boxGeometry args={[1.3, 1.6, 2]} />
              <meshStandardMaterial color="#5f5658" roughness={0.95} />
            </mesh>
            <mesh castShadow position={[15.6, 0.45, -7]}>
              <boxGeometry args={[0.55, 0.9, 0.55]} />
              <meshStandardMaterial color="#ff8e56" roughness={0.7} />
            </mesh>
          </group>
        )
      })}

      <mesh position={[0, -0.8, -130]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[180, 360]} />
        <meshStandardMaterial color="#5a4d71" roughness={1} />
      </mesh>
    </group>
  )
}

function Sun() {
  return (
    <group position={[0, 7.5, -120]}>
      <mesh>
        <sphereGeometry args={[8, 32, 24]} />
        <meshBasicMaterial color="#ffb466" toneMapped={false} />
      </mesh>
    </group>
  )
}

function FrameTicker() {
  useFrame((_, delta) => {
    gameStore.getState().tick(delta)
  })
  return null
}

function Scene() {
  return (
    <>
      <color attach="background" args={['#1f2752']} />
      <fog attach="fog" args={['#2e3f66', 40, 180]} />

      <ambientLight intensity={0.3} color="#ffd3aa" />
      <directionalLight
        castShadow
        position={[8, 12, 12]}
        intensity={1.25}
        color="#ffb382"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />

      <Environment resolution={64}>
        <Lightformer position={[0, 5, -24]} scale={[20, 8, 1]} intensity={2.2} color="#ff9e63" />
        <Lightformer position={[-10, 4, -18]} scale={[8, 5, 1]} intensity={1.35} color="#43c3be" />
        <Lightformer position={[10, 3, -14]} scale={[8, 5, 1]} intensity={1.1} color="#ff7f58" />
      </Environment>

      <Suspense fallback={null}>
        <Road />
        <Roadside />
        <Traffic />
        <Pickups />
      </Suspense>

      <Sun />
      <PlayerCar />
      <CameraRig />
      <FrameTicker />

      <EffectComposer>
        <Bloom intensity={0.25} luminanceThreshold={0.88} mipmapBlur />
        <Vignette eskil={false} offset={0.16} darkness={0.36} />
      </EffectComposer>
    </>
  )
}

export default function GameCanvas() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 5.2, 16], fov: 54 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <Scene />
    </Canvas>
  )
}
