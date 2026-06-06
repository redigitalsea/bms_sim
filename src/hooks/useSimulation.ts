import { useEffect, useRef, useState, useCallback } from 'react'
import { createSnapshot } from '../engine/battery'
import { generateTerrain, queryTerrainAtDistance, queryTrafficLightAtDistance } from '../engine/terrain'
import { DataCollector } from '../engine/dataCollector'
import type {
  BmsConfig,
  CellConfig,
  EngineConfig,
  SampleRecord,
  ScenarioControls,
  SimulationState,
  Snapshot,
  TerrainConfig,
  TerrainData,
} from '../types'

const INITIAL_SOC = 95
const HISTORY_LIMIT = 8
const IDLE_POWER = 50 // 红灯待机功率 (W)
const VEHICLE_MASS_KG = 120 // 车+骑手质量 (kg)
const GRAVITY = 9.81
const WHEELBASE_POWER_FACTOR = 0.6 // 坡度功率系数

function makeRecord(id: number, snapshot: Snapshot, elapsedSeconds: number): SampleRecord {
  const minutes = Math.floor(elapsedSeconds / 60)
  const remainder = elapsedSeconds - minutes * 60
  const label = `${minutes.toString().padStart(2, '0')}:${remainder
    .toFixed(1)
    .padStart(4, '0')}`

  return { id, label, ...snapshot }
}

function makeInitialState(
  scenario: ScenarioControls,
  bmsConfig: BmsConfig,
  cellConfig: CellConfig,
): SimulationState {
  const snapshot = createSnapshot(INITIAL_SOC, 1 / bmsConfig.samplingRate, scenario, bmsConfig, cellConfig)
  return {
    tick: 0,
    elapsedSeconds: 0,
    snapshot,
    history: [makeRecord(0, snapshot, 0)],
  }
}

export type UseSimulationOptions = {
  scenario: ScenarioControls
  bmsConfig: BmsConfig
  cellConfig: CellConfig
  engineConfig: EngineConfig
  terrainConfig: TerrainConfig
}

export type UseSimulationReturn = {
  simulation: SimulationState
  running: boolean
  start: () => void
  pause: () => void
  reset: () => void
  dataCollector: DataCollector
  terrainData: TerrainData | null
  totalKm: number
  tripKm: number
  estimatedRemainingKm: number | null
  regenerateTerrain: () => void
}

export function useSimulation(options: UseSimulationOptions): UseSimulationReturn {
  const { scenario, bmsConfig, cellConfig, engineConfig, terrainConfig } = options

  const [simulation, setSimulation] = useState(() =>
    makeInitialState(scenario, bmsConfig, cellConfig),
  )
  const [running, setRunning] = useState(false)
  const [totalKm, setTotalKm] = useState(0)
  const [tripKm, setTripKm] = useState(0)
  const [estimatedRemainingKm, setEstimatedRemainingKm] = useState<number | null>(null)

  // ── 生成地形 ──
  const [terrainData, setTerrainData] = useState<TerrainData>(() =>
    generateTerrain(terrainConfig),
  )

  const regenerateTerrain = useCallback(() => {
    setTerrainData(generateTerrain(terrainConfig))
  }, [terrainConfig])

  // ── 引擎内部状态（用 ref 保持最新，不触发重渲染） ──
  const engineState = useRef({
    soc: INITIAL_SOC,
    elapsedMs: 0,
    totalKm: 0,
    tripKm: 0,
    tick: 0,
    lastDisplayedTick: -1,
    estimatedRemainingKm: null as number | null,
    pendingSnapshot: null as Snapshot | null,
    pendingElapsedSec: null as number | null,
  })

  const dataCollector = useRef(new DataCollector())
  const scenarioRef = useRef(scenario)
  const bmsConfigRef = useRef(bmsConfig)
  const cellConfigRef = useRef(cellConfig)
  const engineConfigRef = useRef(engineConfig)
  const terrainDataRef = useRef(terrainData)
  const terrainConfigRef = useRef(terrainConfig)

  // 保持 ref 同步
  useEffect(() => { scenarioRef.current = scenario }, [scenario])
  useEffect(() => { bmsConfigRef.current = bmsConfig }, [bmsConfig])
  useEffect(() => { cellConfigRef.current = cellConfig }, [cellConfig])
  useEffect(() => { engineConfigRef.current = engineConfig }, [engineConfig])
  useEffect(() => { terrainDataRef.current = terrainData }, [terrainData])
  useEffect(() => { terrainConfigRef.current = terrainConfig }, [terrainConfig])

  // ── 参数变化时的预览更新 ──
  useEffect(() => {
    setSimulation((prev) => {
      const preview = createSnapshot(
        prev.snapshot.soc,
        1 / bmsConfig.samplingRate,
        scenario,
        bmsConfig,
        cellConfig,
      )
      return {
        ...prev,
        snapshot: preview,
        history: [
          makeRecord(prev.tick, preview, prev.elapsedSeconds),
          ...prev.history.filter((r) => r.id !== prev.tick),
        ].slice(0, HISTORY_LIMIT),
      }
    })
  }, [scenario, bmsConfig, cellConfig])

  // ── 仿真主循环 ──
  useEffect(() => {
    if (!running) return

    let animFrameId: number
    let lastFrameTime = performance.now()

    const loop = (now: number) => {
      const frameDt = Math.min((now - lastFrameTime) / 1000, 0.1) // 帧间隔（秒），上限 0.1s 防跳帧
      lastFrameTime = now

      const state = engineState.current
      const stepSec = engineConfigRef.current.simulationStepSeconds
      const _bms = bmsConfigRef.current
      const _cell = cellConfigRef.current
      const _scenario = scenarioRef.current
      const _terrain = terrainDataRef.current
      const _terrainCfg = terrainConfigRef.current

      // 当前帧要推进多少个物理步（至少 1 步，防止第一帧 frameDt≈0 导致卡死）
      const stepsToAdvance = Math.max(1, Math.floor(frameDt / stepSec))
      const bmsIntervalMs = (1000 / _bms.samplingRate)

      for (let i = 0; i < stepsToAdvance; i++) {
        state.tick++
        state.elapsedMs += stepSec * 1000

        // ── 查询地形 ──
        const terrainPt = queryTerrainAtDistance(_terrain, state.totalKm)
        const slope = terrainPt.slope

        // ── 红绿灯检查 ──
        const redWaitS = queryTrafficLightAtDistance(_terrain, state.totalKm, state.elapsedMs / 1000)
        const isStopped = redWaitS > 0

        // ── 功率计算 ──
        let demandPower: number
        let currentSpeed: number

        if (isStopped) {
          demandPower = IDLE_POWER
          currentSpeed = 0
        } else {
          currentSpeed = _terrainCfg.averageSpeedKmh
          // 基础功率 = 目标功率 × 油门
          const basePower = _scenario.targetPower * (_scenario.throttle / 100)
          // 坡度附加功率：P_slope = m * g * sin(θ) * v * 系数
          const slopeRad = Math.atan(slope / 100)
          const slopePower = VEHICLE_MASS_KG * GRAVITY * Math.sin(slopeRad) * (currentSpeed / 3.6) * WHEELBASE_POWER_FACTOR
          demandPower = basePower + slopePower
        }

        // ── 电池仿真 ──
        const snapshot = createSnapshot(
          state.soc,
          stepSec,
          _scenario,
          _bms,
          _cell,
          demandPower,
        )
        state.soc = snapshot.soc

        // ── 里程更新 ──
        state.totalKm += currentSpeed * (stepSec / 3600)
        state.tripKm += currentSpeed * (stepSec / 3600)

        // ── 数据记录 ──
        dataCollector.current.addRecord({
          tick: state.tick,
          timeMs: state.elapsedMs,
          packVoltage: snapshot.actualVoltage,
          current: snapshot.actualCurrent,
          soc: snapshot.soc,
          power: snapshot.actualPower,
          cellVoltage: snapshot.loadedCellVoltage,
          temperature: _scenario.cellTemperature,
          totalKm: state.totalKm,
          tripKm: state.tripKm,
          slope,
          speed: currentSpeed,
          estimatedRemainingKm: state.estimatedRemainingKm,
        })

        // ── BMS 采样周期到达时：保存快照并在循环外刷新 UI ──
        const bmsTick = Math.floor(state.elapsedMs / bmsIntervalMs)
        if (bmsTick > state.lastDisplayedTick) {
          state.lastDisplayedTick = bmsTick
          state.pendingSnapshot = snapshot
          state.pendingElapsedSec = state.elapsedMs / 1000
        }
      }

      // ── UI 刷新：仅在有新 BMS 采样时 setState ──
      if (state.pendingSnapshot) {
        const snap = state.pendingSnapshot
        const elapsedSec = state.pendingElapsedSec!

        setSimulation({
          tick: state.tick,
          elapsedSeconds: elapsedSec,
          snapshot: snap,
          history: [
            makeRecord(state.tick, snap, elapsedSec),
          ].slice(0, HISTORY_LIMIT),
        })

        setTotalKm(state.totalKm)
        setTripKm(state.tripKm)
        setEstimatedRemainingKm(state.estimatedRemainingKm)

        state.pendingSnapshot = null
        state.pendingElapsedSec = null
      }

      animFrameId = requestAnimationFrame(loop)
    }

    animFrameId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animFrameId)
  }, [running, terrainConfig])

  // ── 地形重新生成时重置仿真 ──
  useEffect(() => {
    // terrainData 变化时自动重置
    engineState.current = {
      soc: INITIAL_SOC,
      elapsedMs: 0,
      totalKm: 0,
      tripKm: 0,
      tick: 0,
      lastDisplayedTick: -1,
      estimatedRemainingKm: null,
      pendingSnapshot: null,
      pendingElapsedSec: null,
    }
    dataCollector.current.clear()
    setTotalKm(0)
    setTripKm(0)
    setEstimatedRemainingKm(null)
    setSimulation(makeInitialState(scenarioRef.current, bmsConfigRef.current, cellConfigRef.current))
  }, [terrainData])

  const start = useCallback(() => setRunning(true), [])
  const pause = useCallback(() => setRunning(false), [])
  const reset = useCallback(() => {
    engineState.current = {
      soc: INITIAL_SOC,
      elapsedMs: 0,
      totalKm: 0,
      tripKm: 0,
      tick: 0,
      lastDisplayedTick: -1,
      estimatedRemainingKm: null,
      pendingSnapshot: null,
      pendingElapsedSec: null,
    }
    dataCollector.current.clear()
    setTotalKm(0)
    setTripKm(0)
    setEstimatedRemainingKm(null)
    setSimulation(makeInitialState(scenario, bmsConfig, cellConfig))
  }, [scenario, bmsConfig, cellConfig])

  return {
    simulation,
    running,
    start,
    pause,
    reset,
    dataCollector: dataCollector.current,
    terrainData,
    totalKm,
    tripKm,
    estimatedRemainingKm,
    regenerateTerrain,
  }
}
