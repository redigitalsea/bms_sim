import { useEffect, useState } from 'react'
import './App.css'

type CurvePoint = {
  x: number
  y: number
}

type ScenarioControls = {
  targetPower: number
  throttle: number
  cellTemperature: number
}

type BmsConfig = {
  samplingRate: number
  currentLimit: number
  overchargeVoltage: number
  cutoffVoltage: number
  ocvCurve: CurvePoint[]
}

type CellConfig = {
  seriesCount: number
  parallelCount: number
  cellCapacityAh: number
  ocvCurve: CurvePoint[]
  resistanceCurve: CurvePoint[]
}

type Snapshot = {
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

type SampleRecord = Snapshot & {
  id: number
  label: string
}

type SimulationState = {
  tick: number
  elapsedSeconds: number
  snapshot: Snapshot
  history: SampleRecord[]
}

type PageKey = 'dashboard' | 'battery-config'

type CurveEditorProps = {
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

const INITIAL_SOC = 95
const HISTORY_LIMIT = 8

const defaultScenario: ScenarioControls = {
  targetPower: 2600,
  throttle: 76,
  cellTemperature: 25,
}

const defaultBmsConfig: BmsConfig = {
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

const defaultCellConfig: CellConfig = {
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

const scenarioFields: Array<{
  key: keyof ScenarioControls
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint: string
}> = [
  {
    key: 'targetPower',
    label: '动力输出目标',
    unit: 'W',
    min: 800,
    max: 4500,
    step: 50,
    hint: '电机控制器请求的目标功率。',
  },
  {
    key: 'throttle',
    label: '油门开度',
    unit: '%',
    min: 20,
    max: 100,
    step: 1,
    hint: '骑手实时给定的扭矩请求。',
  },
  {
    key: 'cellTemperature',
    label: '电芯温度',
    unit: '°C',
    min: -10,
    max: 60,
    step: 1,
    hint: '用于从温度内阻曲线中估算当前等效内阻。',
  },
]

const bmsNumberFields: Array<{
  key: Exclude<keyof BmsConfig, 'ocvCurve'>
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint: string
}> = [
  {
    key: 'samplingRate',
    label: '采样率',
    unit: 'Hz',
    min: 2,
    max: 20,
    step: 1,
    hint: '决定 BMS 响应频率和采样滞后。',
  },
  {
    key: 'currentLimit',
    label: '限流阈值',
    unit: 'A',
    min: 20,
    max: 90,
    step: 1,
    hint: 'BMS 对实际输出电流的保护上限。',
  },
  {
    key: 'overchargeVoltage',
    label: '过充电压',
    unit: 'V/Cell',
    min: 3.9,
    max: 4.3,
    step: 0.01,
    hint: '用于判断单体是否进入过充预警区。',
  },
  {
    key: 'cutoffVoltage',
    label: '截止电压',
    unit: 'V/Cell',
    min: 2.5,
    max: 3.3,
    step: 0.01,
    hint: '低于该值时，BMS 将进入限流或截止保护。',
  },
]

const cellNumberFields: Array<{
  key: Exclude<keyof CellConfig, 'ocvCurve' | 'resistanceCurve'>
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint: string
}> = [
  {
    key: 'seriesCount',
    label: '串联节数',
    unit: 'S',
    min: 12,
    max: 24,
    step: 1,
    hint: '决定整包电压平台。',
  },
  {
    key: 'parallelCount',
    label: '并联节数',
    unit: 'P',
    min: 1,
    max: 12,
    step: 1,
    hint: '决定容量与电流分摊能力。',
  },
  {
    key: 'cellCapacityAh',
    label: '单芯容量',
    unit: 'Ah',
    min: 2,
    max: 10,
    step: 0.1,
    hint: '用于估算整包容量与 SOC 衰减速度。',
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeCurve(points: CurvePoint[]) {
  return [...points].sort((left, right) => left.x - right.x)
}

function interpolateCurve(points: CurvePoint[], input: number) {
  const sorted = normalizeCurve(points)

  if (input <= sorted[0].x) {
    return sorted[0].y
  }

  if (input >= sorted[sorted.length - 1].x) {
    return sorted[sorted.length - 1].y
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index]
    const right = sorted[index + 1]

    if (input >= left.x && input <= right.x) {
      const ratio = (input - left.x) / Math.max(right.x - left.x, 1)
      return left.y + (right.y - left.y) * ratio
    }
  }

  return sorted[sorted.length - 1].y
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return `${minutes.toString().padStart(2, '0')}:${remainder
    .toFixed(1)
    .padStart(4, '0')}`
}

function makeRecord(id: number, snapshot: Snapshot, elapsedSeconds: number): SampleRecord {
  return {
    id,
    label: formatElapsed(elapsedSeconds),
    ...snapshot,
  }
}

function createSnapshot(
  currentSoc: number,
  intervalSeconds: number,
  scenario: ScenarioControls,
  bmsConfig: BmsConfig,
  cellConfig: CellConfig,
): Snapshot {
  const demandPower = scenario.targetPower * (scenario.throttle / 100)
  const actualCellOcv = interpolateCurve(cellConfig.ocvCurve, currentSoc)
  const bmsEstimatedCellOcv = interpolateCurve(bmsConfig.ocvCurve, currentSoc)
  const cellResistanceMilliOhm = interpolateCurve(
    cellConfig.resistanceCurve,
    scenario.cellTemperature,
  )
  const packCapacityAh = cellConfig.cellCapacityAh * cellConfig.parallelCount
  const packResistance =
    (cellResistanceMilliOhm / 1000) * (cellConfig.seriesCount / cellConfig.parallelCount)
  const packOpenCircuitVoltage = actualCellOcv * cellConfig.seriesCount
  const requestedCurrent = demandPower / Math.max(packOpenCircuitVoltage, 1)
  const sampleQuality = clamp(0.76 + bmsConfig.samplingRate / 28, 0.72, 1)
  const preLimitedCurrent = Math.min(
    requestedCurrent * sampleQuality,
    bmsConfig.currentLimit,
  )
  const singlePathResistance = (cellResistanceMilliOhm / 1000) / cellConfig.parallelCount
  const estimatedCellVoltage = bmsEstimatedCellOcv - preLimitedCurrent * singlePathResistance
  const cutoffBand = Math.max(bmsConfig.cutoffVoltage * 0.08, 0.12)
  const protectionFactor =
    estimatedCellVoltage > bmsConfig.cutoffVoltage
      ? 1
      : clamp(
          (estimatedCellVoltage - (bmsConfig.cutoffVoltage - cutoffBand)) / cutoffBand,
          0.18,
          1,
        )
  const actualCurrent = preLimitedCurrent * protectionFactor
  const actualVoltage = clamp(
    packOpenCircuitVoltage - actualCurrent * packResistance,
    bmsConfig.cutoffVoltage * cellConfig.seriesCount * 0.9,
    bmsConfig.overchargeVoltage * cellConfig.seriesCount * 1.02,
  )
  const loadedCellVoltage = actualVoltage / cellConfig.seriesCount
  const actualPower = actualVoltage * actualCurrent
  const thermalLoad = actualCurrent * actualCurrent * packResistance
  const efficiency = clamp(actualPower / Math.max(demandPower, 1), 0, 1.06)
  const outputGap = Math.max(demandPower - actualPower, 0)
  const socDrop = (actualCurrent * intervalSeconds * 100) / (packCapacityAh * 3600)
  const soc = clamp(currentSoc - socDrop, 2, 100)

  let protectionState = '正常'

  if (actualCellOcv >= bmsConfig.overchargeVoltage) {
    protectionState = '过充预警'
  } else if (loadedCellVoltage <= bmsConfig.cutoffVoltage) {
    protectionState = '截止保护'
  } else if (estimatedCellVoltage <= bmsConfig.cutoffVoltage + 0.05) {
    protectionState = '低压限流'
  } else if (sampleQuality < 0.9) {
    protectionState = '采样保守'
  }

  return {
    demandPower,
    actualPower,
    actualVoltage,
    actualCurrent,
    soc,
    sampleLag: 1000 / bmsConfig.samplingRate,
    efficiency,
    outputGap,
    thermalLoad,
    actualCellOcv,
    bmsEstimatedCellOcv,
    loadedCellVoltage,
    estimatedCellVoltage,
    cellResistanceMilliOhm,
    packResistance,
    protectionState,
    capacityAh: packCapacityAh,
  }
}

function createInitialState(
  scenario: ScenarioControls,
  bmsConfig: BmsConfig,
  cellConfig: CellConfig,
): SimulationState {
  const snapshot = createSnapshot(
    INITIAL_SOC,
    1 / bmsConfig.samplingRate,
    scenario,
    bmsConfig,
    cellConfig,
  )

  return {
    tick: 0,
    elapsedSeconds: 0,
    snapshot,
    history: [makeRecord(0, snapshot, 0)],
  }
}

function stepSimulation(
  previous: SimulationState,
  scenario: ScenarioControls,
  bmsConfig: BmsConfig,
  cellConfig: CellConfig,
): SimulationState {
  const intervalSeconds = 1 / bmsConfig.samplingRate
  const tick = previous.tick + 1
  const elapsedSeconds = previous.elapsedSeconds + intervalSeconds
  const snapshot = createSnapshot(
    previous.snapshot.soc,
    intervalSeconds,
    scenario,
    bmsConfig,
    cellConfig,
  )

  return {
    tick,
    elapsedSeconds,
    snapshot,
    history: [makeRecord(tick, snapshot, elapsedSeconds), ...previous.history].slice(
      0,
      HISTORY_LIMIT,
    ),
  }
}

function CurveEditor({
  title,
  description,
  xLabel,
  xUnit,
  yLabel,
  yUnit,
  xStep,
  yStep,
  points,
  onChange,
}: CurveEditorProps) {
  return (
    <section className="curve-editor card-nested">
      <div className="subsection-heading">
        <div>
          <span className="section-kicker">曲线参数</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>

      <div className="curve-table-wrap">
        <table className="curve-table">
          <thead>
            <tr>
              <th>点位</th>
              <th>
                {xLabel} ({xUnit})
              </th>
              <th>
                {yLabel} ({yUnit})
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={`${title}-${index.toString()}`}>
                <td>P{index + 1}</td>
                <td>
                  <input
                    className="table-input"
                    type="number"
                    step={xStep}
                    value={point.x}
                    onChange={(event) => onChange(index, 'x', Number(event.target.value))}
                  />
                </td>
                <td>
                  <input
                    className="table-input"
                    type="number"
                    step={yStep}
                    value={point.y}
                    onChange={(event) => onChange(index, 'y', Number(event.target.value))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function App() {
  const [activePage, setActivePage] = useState<PageKey>('dashboard')
  const [scenario, setScenario] = useState(defaultScenario)
  const [bmsConfig, setBmsConfig] = useState(defaultBmsConfig)
  const [cellConfig, setCellConfig] = useState(defaultCellConfig)
  const [running, setRunning] = useState(true)
  const [simulation, setSimulation] = useState(() =>
    createInitialState(defaultScenario, defaultBmsConfig, defaultCellConfig),
  )

  useEffect(() => {
    setSimulation((previous) => {
      const preview = createSnapshot(
        previous.snapshot.soc,
        1 / bmsConfig.samplingRate,
        scenario,
        bmsConfig,
        cellConfig,
      )

      return {
        ...previous,
        snapshot: preview,
        history: [
          makeRecord(previous.tick, preview, previous.elapsedSeconds),
          ...previous.history.filter((record) => record.id !== previous.tick),
        ].slice(0, HISTORY_LIMIT),
      }
    })
  }, [scenario, bmsConfig, cellConfig])

  useEffect(() => {
    if (!running) {
      return undefined
    }

    const intervalMs = Math.max(150, Math.round(1000 / bmsConfig.samplingRate))
    const timer = window.setInterval(() => {
      setSimulation((previous) =>
        stepSimulation(previous, scenario, bmsConfig, cellConfig),
      )
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [scenario, bmsConfig, cellConfig, running])

  const snapshot = simulation.snapshot
  const supplyRatio = Math.min(
    (snapshot.actualPower / Math.max(snapshot.demandPower, 1)) * 100,
    100,
  )
  const thermalRatio = Math.min((snapshot.thermalLoad / 220) * 100, 100)
  const bmsCurveGap = snapshot.bmsEstimatedCellOcv - snapshot.actualCellOcv
  const curveAlignment = Math.abs(bmsCurveGap) < 0.03 ? '标定接近' : '标定偏移'
  const responseState =
    snapshot.efficiency >= 0.94
      ? '输出稳定'
      : snapshot.efficiency >= 0.84
        ? '轻度受限'
        : '明显受限'

  function updateScenarioControl(
    key: keyof ScenarioControls,
    value: number,
    min: number,
    max: number,
  ) {
    if (Number.isNaN(value)) {
      return
    }

    setScenario((previous) => ({
      ...previous,
      [key]: clamp(value, min, max),
    }))
  }

  function updateBmsNumber(
    key: Exclude<keyof BmsConfig, 'ocvCurve'>,
    value: number,
    min: number,
    max: number,
  ) {
    if (Number.isNaN(value)) {
      return
    }

    setBmsConfig((previous) => ({
      ...previous,
      [key]: clamp(value, min, max),
    }))
  }

  function updateCellNumber(
    key: Exclude<keyof CellConfig, 'ocvCurve' | 'resistanceCurve'>,
    value: number,
    min: number,
    max: number,
  ) {
    if (Number.isNaN(value)) {
      return
    }

    setCellConfig((previous) => ({
      ...previous,
      [key]: clamp(value, min, max),
    }))
  }

  function updateCurvePoint(
    scope: 'bms' | 'cell-ocv' | 'cell-resistance',
    index: number,
    axis: 'x' | 'y',
    value: number,
  ) {
    if (Number.isNaN(value)) {
      return
    }

    if (scope === 'bms') {
      setBmsConfig((previous) => {
        const nextCurve = previous.ocvCurve.map((point, pointIndex) =>
          pointIndex === index ? { ...point, [axis]: value } : point,
        )

        return {
          ...previous,
          ocvCurve: normalizeCurve(nextCurve),
        }
      })
      return
    }

    if (scope === 'cell-ocv') {
      setCellConfig((previous) => {
        const nextCurve = previous.ocvCurve.map((point, pointIndex) =>
          pointIndex === index ? { ...point, [axis]: value } : point,
        )

        return {
          ...previous,
          ocvCurve: normalizeCurve(nextCurve),
        }
      })
      return
    }

    setCellConfig((previous) => {
      const nextCurve = previous.resistanceCurve.map((point, pointIndex) =>
        pointIndex === index ? { ...point, [axis]: value } : point,
      )

      return {
        ...previous,
        resistanceCurve: normalizeCurve(nextCurve),
      }
    })
  }

  function resetSimulation() {
    setSimulation(createInitialState(scenario, bmsConfig, cellConfig))
  }

  const batterySummaryText = `${cellConfig.seriesCount}S${cellConfig.parallelCount}P / ${snapshot.capacityAh.toFixed(
    1,
  )}Ah`

  return (
    <div className="app-shell">
      <header className="hero-panel card">
        <div className="hero-copy">
          <div className="hero-topline">
            <span className="eyebrow">BMS SIMULATOR / CELL MODEL</span>
            <div className="page-switch">
              <button
                type="button"
                className={activePage === 'dashboard' ? 'page-tab active-tab' : 'page-tab'}
                onClick={() => setActivePage('dashboard')}
              >
                运行看板
              </button>
              <button
                type="button"
                className={
                  activePage === 'battery-config' ? 'page-tab active-tab' : 'page-tab'
                }
                onClick={() => setActivePage('battery-config')}
              >
                电池配置
              </button>
            </div>
          </div>

          <div>
            <h1>两轮电动车电池仿真与配置</h1>
            <p className="lead">
              当前模型同时区分 BMS 标定曲线与真实电芯曲线，按电芯温度估算内阻，再将单体结果换算为整包电压和实际输出，用于观察保护阈值和曲线偏差对整包行为的影响。
            </p>
          </div>

          <div className="hero-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => setRunning((value) => !value)}
            >
              {running ? '暂停采样' : '继续采样'}
            </button>
            <button type="button" className="secondary-button" onClick={resetSimulation}>
              重置场景
            </button>
            <span className="live-chip">{running ? '实时运行中' : '已暂停'}</span>
          </div>
        </div>

        <div className="hero-stats">
          <article className="stat-card">
            <span>保护状态</span>
            <strong>{snapshot.protectionState}</strong>
            <small>{curveAlignment}</small>
          </article>
          <article className="stat-card">
            <span>实际输出</span>
            <strong>{snapshot.actualPower.toFixed(0)} W</strong>
            <small>目标 {snapshot.demandPower.toFixed(0)} W</small>
          </article>
          <article className="stat-card">
            <span>整包模型</span>
            <strong>{batterySummaryText}</strong>
            <small>{snapshot.sampleLag.toFixed(0)} ms 采样延迟</small>
          </article>
          <article className="stat-card accent-card">
            <span>剩余电量</span>
            <strong>{snapshot.soc.toFixed(1)}%</strong>
            <small>运行时长 {formatElapsed(simulation.elapsedSeconds)}</small>
          </article>
        </div>
      </header>

      {activePage === 'dashboard' ? (
        <main className="main-grid">
          <div className="column-stack">
            <section className="card section-card">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">运行场景</span>
                  <h2>实时输入参数</h2>
                </div>
                <p>这里保留工况参数，电池模型本身请在电池配置页调整。</p>
              </div>

              <div className="control-list">
                {scenarioFields.map((field) => (
                  <label key={field.key} className="control-card">
                    <div className="control-headline">
                      <div>
                        <span>{field.label}</span>
                        <strong>
                          {scenario[field.key].toFixed(field.step < 1 ? 1 : 0)} {field.unit}
                        </strong>
                      </div>
                      <p>{field.hint}</p>
                    </div>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={scenario[field.key]}
                      onChange={(event) =>
                        updateScenarioControl(
                          field.key,
                          Number(event.target.value),
                          field.min,
                          field.max,
                        )
                      }
                    />
                    <input
                      className="number-input"
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={scenario[field.key]}
                      onChange={(event) =>
                        updateScenarioControl(
                          field.key,
                          Number(event.target.value),
                          field.min,
                          field.max,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="card section-card">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">配置摘要</span>
                  <h2>当前电池模型</h2>
                </div>
                <p>快速核对 BMS 和电芯两个来源的关键参数。</p>
              </div>

              <div className="summary-grid">
                <article className="summary-card">
                  <span>BMS 采样率</span>
                  <strong>{bmsConfig.samplingRate.toFixed(0)} Hz</strong>
                  <small>
                    截止 {bmsConfig.cutoffVoltage.toFixed(2)}V / 过充{' '}
                    {bmsConfig.overchargeVoltage.toFixed(2)}V
                  </small>
                </article>
                <article className="summary-card">
                  <span>真实电芯曲线</span>
                  <strong>{cellConfig.ocvCurve.length} 个 OCV 点</strong>
                  <small>{cellConfig.resistanceCurve.length} 个温阻点</small>
                </article>
                <article className="summary-card">
                  <span>当前内阻</span>
                  <strong>{snapshot.cellResistanceMilliOhm.toFixed(1)} mΩ</strong>
                  <small>整包 {snapshot.packResistance.toFixed(4)} Ω</small>
                </article>
                <article className="summary-card">
                  <span>BMS 曲线偏差</span>
                  <strong>{bmsCurveGap >= 0 ? '+' : ''}{bmsCurveGap.toFixed(3)} V</strong>
                  <small>{curveAlignment}</small>
                </article>
              </div>
            </section>

            <section className="card section-card">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">时间序列</span>
                  <h2>最近采样记录</h2>
                </div>
                <p>保留最近 8 个 BMS 采样点，便于观察真实电芯模型的响应。</p>
              </div>

              <div className="history-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>输出</th>
                      <th>整包电压</th>
                      <th>电流</th>
                      <th>单体负载电压</th>
                      <th>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simulation.history.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.label}</td>
                        <td>{entry.actualPower.toFixed(0)} W</td>
                        <td>{entry.actualVoltage.toFixed(1)} V</td>
                        <td>{entry.actualCurrent.toFixed(1)} A</td>
                        <td>{entry.loadedCellVoltage.toFixed(3)} V</td>
                        <td>{entry.protectionState}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <div className="column-stack">
            <section className="card section-card status-panel">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">仿真输出</span>
                  <h2>实时电池状态</h2>
                </div>
                <p>优先关注整包输出、电芯负载电压、保护阈值和热负荷。</p>
              </div>

              <div className="metric-grid">
                <article>
                  <span>整包电压</span>
                  <strong>{snapshot.actualVoltage.toFixed(1)} V</strong>
                </article>
                <article>
                  <span>实际电流</span>
                  <strong>{snapshot.actualCurrent.toFixed(1)} A</strong>
                </article>
                <article>
                  <span>真实单体 OCV</span>
                  <strong>{snapshot.actualCellOcv.toFixed(3)} V</strong>
                </article>
                <article>
                  <span>BMS 估算 OCV</span>
                  <strong>{snapshot.bmsEstimatedCellOcv.toFixed(3)} V</strong>
                </article>
                <article>
                  <span>负载单体电压</span>
                  <strong>{snapshot.loadedCellVoltage.toFixed(3)} V</strong>
                </article>
                <article>
                  <span>估算单体电压</span>
                  <strong>{snapshot.estimatedCellVoltage.toFixed(3)} V</strong>
                </article>
              </div>

              <div className="meter-block">
                <div className="meter-headline">
                  <span>目标满足度</span>
                  <strong>{supplyRatio.toFixed(1)}%</strong>
                </div>
                <div className="meter-track">
                  <span className="meter-fill power-fill" style={{ width: `${supplyRatio}%` }}></span>
                </div>
              </div>

              <div className="meter-block">
                <div className="meter-headline">
                  <span>热压力</span>
                  <strong>{thermalRatio.toFixed(1)}%</strong>
                </div>
                <div className="meter-track warm-track">
                  <span className="meter-fill thermal-fill" style={{ width: `${thermalRatio}%` }}></span>
                </div>
              </div>

              <div className="summary-list">
                <div>
                  <span>输出评估</span>
                  <strong>{responseState}</strong>
                </div>
                <div>
                  <span>功率缺口</span>
                  <strong>{snapshot.outputGap.toFixed(0)} W</strong>
                </div>
                <div>
                  <span>热损耗</span>
                  <strong>{snapshot.thermalLoad.toFixed(1)} W</strong>
                </div>
                <div>
                  <span>保护结论</span>
                  <strong>{snapshot.protectionState}</strong>
                </div>
              </div>
            </section>

            <section className="card section-card notes-panel">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">建模说明</span>
                  <h2>本次模型变化</h2>
                </div>
              </div>

              <ul className="notes-list">
                <li>真实电芯 OCV 曲线用于计算整包开路电压，直接决定理论输出平台。</li>
                <li>BMS OCV 曲线独立存在，用于模拟 BMS 侧估算偏差和保护判断。</li>
                <li>温度内阻曲线按当前电芯温度插值，换算为整包等效内阻。</li>
                <li>当估算单体电压接近截止阈值时，模型会自动进入限流或截止保护。</li>
              </ul>
            </section>
          </div>
        </main>
      ) : (
        <main className="config-page">
          <section className="card section-card config-intro">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">电池配置页</span>
                <h2>BMS 与电芯双配置</h2>
              </div>
              <p>
                本页专门管理电池模型。BMS 负责采样、保护阈值和标定曲线；电芯负责真实 OCV 与温度内阻特性。
              </p>
            </div>
          </section>

          <section className="config-grid">
            <article className="card section-card config-panel">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">BMS</span>
                  <h2>保护与标定参数</h2>
                </div>
                <p>采样率、阈值和 BMS OCV 曲线都在这里配置。</p>
              </div>

              <div className="control-list compact-controls">
                {bmsNumberFields.map((field) => (
                  <label key={field.key} className="control-card">
                    <div className="control-headline">
                      <div>
                        <span>{field.label}</span>
                        <strong>
                          {bmsConfig[field.key].toFixed(field.step < 1 ? 2 : 0)} {field.unit}
                        </strong>
                      </div>
                      <p>{field.hint}</p>
                    </div>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={bmsConfig[field.key]}
                      onChange={(event) =>
                        updateBmsNumber(
                          field.key,
                          Number(event.target.value),
                          field.min,
                          field.max,
                        )
                      }
                    />
                    <input
                      className="number-input"
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={bmsConfig[field.key]}
                      onChange={(event) =>
                        updateBmsNumber(
                          field.key,
                          Number(event.target.value),
                          field.min,
                          field.max,
                        )
                      }
                    />
                  </label>
                ))}
              </div>

              <CurveEditor
                title="BMS OCV 曲线"
                description="用于模拟 BMS 电量估算和保护判断时所采用的标定曲线。"
                xLabel="SOC"
                xUnit="%"
                yLabel="电压"
                yUnit="V"
                xStep={1}
                yStep={0.01}
                points={bmsConfig.ocvCurve}
                onChange={(index, axis, value) => updateCurvePoint('bms', index, axis, value)}
              />
            </article>

            <article className="card section-card config-panel">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">电芯</span>
                  <h2>真实电芯参数</h2>
                </div>
                <p>真实电芯 OCV 曲线和温度内阻曲线会直接进入整包仿真计算。</p>
              </div>

              <div className="control-list compact-controls">
                {cellNumberFields.map((field) => (
                  <label key={field.key} className="control-card">
                    <div className="control-headline">
                      <div>
                        <span>{field.label}</span>
                        <strong>
                          {cellConfig[field.key].toFixed(field.step < 1 ? 1 : 0)} {field.unit}
                        </strong>
                      </div>
                      <p>{field.hint}</p>
                    </div>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={cellConfig[field.key]}
                      onChange={(event) =>
                        updateCellNumber(
                          field.key,
                          Number(event.target.value),
                          field.min,
                          field.max,
                        )
                      }
                    />
                    <input
                      className="number-input"
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={cellConfig[field.key]}
                      onChange={(event) =>
                        updateCellNumber(
                          field.key,
                          Number(event.target.value),
                          field.min,
                          field.max,
                        )
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="curve-stack">
                <CurveEditor
                  title="真实电芯 OCV 曲线"
                  description="用于从 SOC 估算真实单体开路电压，再换算整包平台电压。"
                  xLabel="SOC"
                  xUnit="%"
                  yLabel="电压"
                  yUnit="V"
                  xStep={1}
                  yStep={0.01}
                  points={cellConfig.ocvCurve}
                  onChange={(index, axis, value) =>
                    updateCurvePoint('cell-ocv', index, axis, value)
                  }
                />

                <CurveEditor
                  title="温度内阻曲线"
                  description="用于按当前电芯温度估算单体内阻，并换算为整包等效内阻。"
                  xLabel="温度"
                  xUnit="°C"
                  yLabel="内阻"
                  yUnit="mΩ"
                  xStep={1}
                  yStep={0.1}
                  points={cellConfig.resistanceCurve}
                  onChange={(index, axis, value) =>
                    updateCurvePoint('cell-resistance', index, axis, value)
                  }
                />
              </div>
            </article>
          </section>
        </main>
      )}
    </div>
  )
}

export default App
