import { useEffect, useState } from 'react'
import './App.css'

type Controls = {
  targetPower: number
  bmsRate: number
  packVoltage: number
  currentLimit: number
  internalResistance: number
  throttle: number
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

const INITIAL_SOC = 96
const PACK_CAPACITY_AH = 32
const HISTORY_LIMIT = 8

const defaultControls: Controls = {
  targetPower: 2400,
  bmsRate: 10,
  packVoltage: 72,
  currentLimit: 42,
  internalResistance: 0.065,
  throttle: 78,
}

const controlFields: Array<{
  key: keyof Controls
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
    max: 4000,
    step: 50,
    hint: '电机控制器请求的目标功率上限。',
  },
  {
    key: 'bmsRate',
    label: 'BMS 采样率',
    unit: 'Hz',
    min: 2,
    max: 20,
    step: 1,
    hint: '采样越快，功率响应越平滑，滞后越低。',
  },
  {
    key: 'packVoltage',
    label: '标称电压',
    unit: 'V',
    min: 48,
    max: 84,
    step: 1,
    hint: '电池包在静态条件下的标称输出电压。',
  },
  {
    key: 'currentLimit',
    label: 'BMS 限流阈值',
    unit: 'A',
    min: 20,
    max: 80,
    step: 1,
    hint: '超过阈值后会直接压制实际输出电流。',
  },
  {
    key: 'internalResistance',
    label: '等效内阻',
    unit: 'Ω',
    min: 0.02,
    max: 0.12,
    step: 0.005,
    hint: '内阻越大，压降和热损越明显。',
  },
  {
    key: 'throttle',
    label: '油门开度',
    unit: '%',
    min: 20,
    max: 100,
    step: 1,
    hint: '用于模拟骑手的实时动力需求强度。',
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
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
  controls: Controls,
): Snapshot {
  const demandPower = controls.targetPower * (controls.throttle / 100)
  const openCircuitVoltage = controls.packVoltage * (0.86 + (currentSoc / 100) * 0.16)
  const requestedCurrent = demandPower / Math.max(openCircuitVoltage, 1)
  const sampleQuality = clamp(0.74 + controls.bmsRate / 24, 0.72, 1)
  const rippleFactor = clamp((12 - controls.bmsRate) * 0.012, 0, 0.1)
  const actualCurrent = Math.min(requestedCurrent * sampleQuality, controls.currentLimit)
  const voltageDrop = actualCurrent * controls.internalResistance * (1 + rippleFactor)
  const actualVoltage = clamp(
    openCircuitVoltage - voltageDrop,
    controls.packVoltage * 0.65,
    controls.packVoltage * 1.08,
  )
  const actualPower = actualVoltage * actualCurrent
  const efficiency = clamp(actualPower / Math.max(demandPower, 1), 0, 1.08)
  const outputGap = Math.max(demandPower - actualPower, 0)
  const thermalLoad = actualCurrent * actualCurrent * controls.internalResistance
  const socDrop =
    (actualCurrent * intervalSeconds * 100) / (PACK_CAPACITY_AH * 3600)
  const soc = clamp(currentSoc - socDrop, 8, 100)

  return {
    demandPower,
    actualPower,
    actualVoltage,
    actualCurrent,
    soc,
    sampleLag: 1000 / controls.bmsRate,
    efficiency,
    outputGap,
    thermalLoad,
  }
}

function createInitialState(controls: Controls): SimulationState {
  const snapshot = createSnapshot(INITIAL_SOC, 1 / controls.bmsRate, controls)

  return {
    tick: 0,
    elapsedSeconds: 0,
    snapshot,
    history: [makeRecord(0, snapshot, 0)],
  }
}

function stepSimulation(previous: SimulationState, controls: Controls): SimulationState {
  const intervalSeconds = 1 / controls.bmsRate
  const tick = previous.tick + 1
  const elapsedSeconds = previous.elapsedSeconds + intervalSeconds
  const snapshot = createSnapshot(previous.snapshot.soc, intervalSeconds, controls)

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

function App() {
  const [controls, setControls] = useState(defaultControls)
  const [running, setRunning] = useState(true)
  const [simulation, setSimulation] = useState(() => createInitialState(defaultControls))

  useEffect(() => {
    setSimulation((previous) => {
      const preview = createSnapshot(
        previous.snapshot.soc,
        1 / controls.bmsRate,
        controls,
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
  }, [controls])

  useEffect(() => {
    if (!running) {
      return undefined
    }

    const intervalMs = Math.max(150, Math.round(1000 / controls.bmsRate))
    const timer = window.setInterval(() => {
      setSimulation((previous) => stepSimulation(previous, controls))
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [controls, running])

  const snapshot = simulation.snapshot
  const supplyRatio = Math.min((snapshot.actualPower / Math.max(snapshot.demandPower, 1)) * 100, 100)
  const thermalRatio = Math.min((snapshot.thermalLoad / 160) * 100, 100)
  const responseState =
    snapshot.efficiency >= 0.93
      ? '稳定输出'
      : snapshot.efficiency >= 0.84
        ? '轻度限流'
        : '压降预警'
  const sampleState =
    controls.bmsRate >= 12 ? '高频采样' : controls.bmsRate >= 6 ? '常规采样' : '低频采样'

  function updateControl(
    key: keyof Controls,
    value: number,
    min: number,
    max: number,
  ) {
    if (Number.isNaN(value)) {
      return
    }

    setControls((previous) => ({
      ...previous,
      [key]: clamp(value, min, max),
    }))
  }

  function resetSimulation() {
    setSimulation(createInitialState(controls))
  }

  return (
    <div className="app-shell">
      <header className="hero-panel card">
        <div className="hero-copy">
          <span className="eyebrow">BMS SIMULATOR / WEB MVP</span>
          <h1>两轮电动车电池仿真面板</h1>
          <p className="lead">
            用一组可调参数，快速观察动力请求、BMS 采样频率、限流策略与内阻压降如何共同影响实际输出、电压、电流和电量状态。
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={() => setRunning((value) => !value)}>
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
            <span>仿真状态</span>
            <strong>{responseState}</strong>
            <small>{sampleState}</small>
          </article>
          <article className="stat-card">
            <span>实际输出</span>
            <strong>{snapshot.actualPower.toFixed(0)} W</strong>
            <small>目标 {snapshot.demandPower.toFixed(0)} W</small>
          </article>
          <article className="stat-card">
            <span>BMS 延迟</span>
            <strong>{snapshot.sampleLag.toFixed(0)} ms</strong>
            <small>{controls.bmsRate.toFixed(0)} 次/秒</small>
          </article>
          <article className="stat-card accent-card">
            <span>剩余电量</span>
            <strong>{snapshot.soc.toFixed(1)}%</strong>
            <small>运行时长 {formatElapsed(simulation.elapsedSeconds)}</small>
          </article>
        </div>
      </header>

      <main className="main-grid">
        <div className="column-stack">
          <section className="card section-card">
            <div className="section-heading">
              <div>
                <span className="section-kicker">输入参数</span>
                <h2>场景控制</h2>
              </div>
              <p>调整下面的参数，观察输出曲线和采样记录变化。</p>
            </div>

            <div className="control-list">
              {controlFields.map((field) => (
                <label key={field.key} className="control-card">
                  <div className="control-headline">
                    <div>
                      <span>{field.label}</span>
                      <strong>
                        {controls[field.key].toFixed(field.step < 1 ? 3 : 0)} {field.unit}
                      </strong>
                    </div>
                    <p>{field.hint}</p>
                  </div>
                  <input
                    type="range"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={controls[field.key]}
                    onChange={(event) =>
                      updateControl(
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
                    value={controls[field.key]}
                    onChange={(event) =>
                      updateControl(
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
                <span className="section-kicker">时间序列</span>
                <h2>最近采样记录</h2>
              </div>
              <p>保留最近 8 个 BMS 采样点，便于观察参数变化后的响应。</p>
            </div>

            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>目标功率</th>
                    <th>实际输出</th>
                    <th>电压</th>
                    <th>电流</th>
                    <th>SOC</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.history.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.label}</td>
                      <td>{entry.demandPower.toFixed(0)} W</td>
                      <td>{entry.actualPower.toFixed(0)} W</td>
                      <td>{entry.actualVoltage.toFixed(1)} V</td>
                      <td>{entry.actualCurrent.toFixed(1)} A</td>
                      <td>{entry.soc.toFixed(1)}%</td>
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
                <span className="section-kicker">输出结果</span>
                <h2>实时电池状态</h2>
              </div>
              <p>重点看功率覆盖率、热负荷和压降是否处于安全区间。</p>
            </div>

            <div className="metric-grid">
              <article>
                <span>实际电压</span>
                <strong>{snapshot.actualVoltage.toFixed(1)} V</strong>
              </article>
              <article>
                <span>实际电流</span>
                <strong>{snapshot.actualCurrent.toFixed(1)} A</strong>
              </article>
              <article>
                <span>功率缺口</span>
                <strong>{snapshot.outputGap.toFixed(0)} W</strong>
              </article>
              <article>
                <span>热损耗</span>
                <strong>{snapshot.thermalLoad.toFixed(1)} W</strong>
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
                <span>采样结论</span>
                <strong>{sampleState}</strong>
              </div>
              <div>
                <span>电池状态</span>
                <strong>{snapshot.soc > 60 ? '电量健康' : snapshot.soc > 30 ? '进入中段' : '需要补能'}</strong>
              </div>
              <div>
                <span>输出评估</span>
                <strong>{responseState}</strong>
              </div>
            </div>
          </section>

          <section className="card section-card notes-panel">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">建模说明</span>
                <h2>MVP 假设</h2>
              </div>
            </div>

            <ul className="notes-list">
              <li>动力请求由目标功率与油门开度共同决定，优先用于生成目标电流。</li>
              <li>BMS 采样率越低，输出越容易出现滞后与纹波，导致实际功率打折。</li>
              <li>等效内阻会带来压降和热损，电流越大，电压下探越明显。</li>
              <li>当前版本聚焦单电池包级别估算，后续可扩展温度、单体一致性与故障注入。</li>
            </ul>
          </section>
        </div>
      </main>
    </div>
  )
}

export default App
