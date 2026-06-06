export type CurvePoint = {
  x: number
  y: number
}

export type ScenarioControls = {
  targetPower: number
  throttle: number
  cellTemperature: number
}

export type BmsConfig = {
  samplingRate: number
  currentLimit: number
  overchargeVoltage: number
  cutoffVoltage: number
  ocvCurve: CurvePoint[]
}

export type CellConfig = {
  seriesCount: number
  parallelCount: number
  cellCapacityAh: number
  ocvCurve: CurvePoint[]
  resistanceCurve: CurvePoint[]
}

export type Snapshot = {
  demandPower: number
  actualPower: number
  actualVoltage: number
  actualCurrent: number
  soc: number
  sampleLag: number
  efficiency: number
  outputGap: number
  thermalLoad: number
  actualCellOcv: number
  bmsEstimatedCellOcv: number
  loadedCellVoltage: number
  estimatedCellVoltage: number
  cellResistanceMilliOhm: number
  packResistance: number
  protectionState: string
  capacityAh: number
}

export type SampleRecord = Snapshot & {
  id: number
  label: string
}

export type SimulationState = {
  tick: number
  elapsedSeconds: number
  snapshot: Snapshot
  history: SampleRecord[]
}

export type PageKey = 'dashboard' | 'battery-config'

// ── 地形相关类型 ──

export type TerrainConfig = {
  seed: string
  distanceKm: number
  averageSpeedKmh: number
  trafficLightDensity: number
  steepness: number
  startAltitude: number
  endAltitude: number
}

export type TerrainPoint = {
  distanceKm: number
  altitude: number
  slope: number
}

export type TrafficLight = {
  positionKm: number
  redDurationS: number
  greenDurationS: number
}

export type TerrainData = {
  points: TerrainPoint[]
  trafficLights: TrafficLight[]
  totalDistanceKm: number
}

// ── 引擎配置 ──

export type EngineConfig = {
  simulationStepSeconds: number
}

// ── 仿真记录（每个仿真点） ──

export type SimulationRecord = {
  tick: number
  timeMs: number
  packVoltage: number
  current: number
  soc: number
  power: number
  cellVoltage: number
  temperature: number
  totalKm: number
  tripKm: number
  slope: number
  speed: number
  estimatedRemainingKm: number | null
}

// ── 曲线编辑器 Props ──

export type CurveEditorProps = {
  title: string
  description: string
  xLabel: string
  xUnit: string
  yLabel: string
  yUnit: string
  xStep: number
  yStep: number
  points: CurvePoint[]
  onChange: (index: number, axis: 'x' | 'y', value: number) => void
}

// ── 默认值 ──

export const INITIAL_SOC = 95
export const HISTORY_LIMIT = 8

export const defaultScenario: ScenarioControls = {
  targetPower: 2600,
  throttle: 76,
  cellTemperature: 25,
}

export const defaultBmsConfig: BmsConfig = {
  samplingRate: 10,
  currentLimit: 48,
  overchargeVoltage: 4.2,
  cutoffVoltage: 2.9,
  ocvCurve: [
    { x: 0, y: 2.95 },
    { x: 10, y: 3.18 },
    { x: 25, y: 3.39 },
    { x: 50, y: 3.6 },
    { x: 75, y: 3.82 },
    { x: 100, y: 4.14 },
  ],
}

export const defaultCellConfig: CellConfig = {
  seriesCount: 20,
  parallelCount: 8,
  cellCapacityAh: 3.2,
  ocvCurve: [
    { x: 0, y: 2.9 },
    { x: 10, y: 3.14 },
    { x: 25, y: 3.35 },
    { x: 50, y: 3.58 },
    { x: 75, y: 3.8 },
    { x: 100, y: 4.18 },
  ],
  resistanceCurve: [
    { x: -10, y: 28 },
    { x: 0, y: 24 },
    { x: 10, y: 20 },
    { x: 25, y: 17 },
    { x: 40, y: 15 },
    { x: 55, y: 16.5 },
  ],
}

export const defaultTerrainConfig: TerrainConfig = {
  seed: 'default',
  distanceKm: 20,
  averageSpeedKmh: 25,
  trafficLightDensity: 3,
  steepness: 50,
  startAltitude: 50,
  endAltitude: 120,
}

export const defaultEngineConfig: EngineConfig = {
  simulationStepSeconds: 0.01,
}
