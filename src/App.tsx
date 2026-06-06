import { useState } from 'react'
import './App.css'
import type { ScenarioControls, PageKey } from './types'
import {
  defaultScenario,
  defaultBmsConfig,
  defaultCellConfig,
  defaultTerrainConfig,
  defaultEngineConfig,
} from './types'
import { CurveEditor } from './components/CurveEditor'
import { TerrainConfigPanel } from './components/TerrainConfig'
import { TerrainPreview } from './components/TerrainPreview'
import { useSimulation } from './hooks/useSimulation'

// ── 场景参数字段定义 ──

const scenarioFields: Array<{
  key: keyof ScenarioControls
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint: string
}> = [
  { key: 'targetPower', label: '动力输出目标', unit: 'W', min: 800, max: 4500, step: 50, hint: '电机控制器请求的目标功率。' },
  { key: 'throttle', label: '油门开度', unit: '%', min: 20, max: 100, step: 1, hint: '骑手实时给定的扭矩请求。' },
  { key: 'cellTemperature', label: '电芯温度', unit: '°C', min: -10, max: 60, step: 1, hint: '用于从温度内阻曲线中估算当前等效内阻。' },
]

const bmsNumberFields = [
  { key: 'samplingRate' as const, label: '采样率', unit: 'Hz', min: 2, max: 20, step: 1, hint: '决定 BMS 响应频率和采样滞后。' },
  { key: 'currentLimit' as const, label: '限流阈值', unit: 'A', min: 20, max: 90, step: 1, hint: 'BMS 对实际输出电流的保护上限。' },
  { key: 'overchargeVoltage' as const, label: '过充电压', unit: 'V/Cell', min: 3.9, max: 4.3, step: 0.01, hint: '用于判断单体是否进入过充预警区。' },
  { key: 'cutoffVoltage' as const, label: '截止电压', unit: 'V/Cell', min: 2.5, max: 3.3, step: 0.01, hint: '低于该值时，BMS 将进入限流或截止保护。' },
]

const cellNumberFields = [
  { key: 'seriesCount' as const, label: '串联节数', unit: 'S', min: 12, max: 24, step: 1, hint: '决定整包电压平台。' },
  { key: 'parallelCount' as const, label: '并联节数', unit: 'P', min: 1, max: 12, step: 1, hint: '决定容量与电流分摊能力。' },
  { key: 'cellCapacityAh' as const, label: '单芯容量', unit: 'Ah', min: 2, max: 10, step: 0.1, hint: '用于估算整包容量与 SOC 衰减速度。' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeCurve(points: { x: number; y: number }[]) {
  return [...points].sort((a, b) => a.x - b.x)
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds - minutes * 60
  return `${minutes.toString().padStart(2, '0')}:${remainder.toFixed(1).padStart(4, '0')}`
}

function App() {
  const [activePage, setActivePage] = useState<PageKey | 'terrain-config'>('dashboard')
  const [scenario, setScenario] = useState(defaultScenario)
  const [bmsConfig, setBmsConfig] = useState(defaultBmsConfig)
  const [cellConfig, setCellConfig] = useState(defaultCellConfig)
  const [terrainConfig, setTerrainConfig] = useState(defaultTerrainConfig)
  const [engineConfig] = useState(defaultEngineConfig)

  const sim = useSimulation({
    scenario,
    bmsConfig,
    cellConfig,
    engineConfig,
    terrainConfig,
  })

  const snapshot = sim.simulation.snapshot
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

  function updateScenarioControl(key: keyof ScenarioControls, value: number, min: number, max: number) {
    if (Number.isNaN(value)) return
    setScenario((prev) => ({ ...prev, [key]: clamp(value, min, max) }))
  }

  function updateBmsNumber(key: keyof typeof bmsConfig, value: number, min: number, max: number) {
    if (Number.isNaN(value)) return
    setBmsConfig((prev) => ({ ...prev, [key]: clamp(value, min, max) }))
  }

  function updateCellNumber(key: keyof typeof cellConfig, value: number, min: number, max: number) {
    if (Number.isNaN(value)) return
    setCellConfig((prev) => ({ ...prev, [key]: clamp(value, min, max) }))
  }

  function updateCurvePoint(scope: 'bms' | 'cell-ocv' | 'cell-resistance', index: number, axis: 'x' | 'y', value: number) {
    if (Number.isNaN(value)) return

    if (scope === 'bms') {
      setBmsConfig((prev) => ({
        ...prev,
        ocvCurve: normalizeCurve(prev.ocvCurve.map((p, i) => i === index ? { ...p, [axis]: value } : p)),
      }))
      return
    }
    if (scope === 'cell-ocv') {
      setCellConfig((prev) => ({
        ...prev,
        ocvCurve: normalizeCurve(prev.ocvCurve.map((p, i) => i === index ? { ...p, [axis]: value } : p)),
      }))
      return
    }
    setCellConfig((prev) => ({
      ...prev,
      resistanceCurve: normalizeCurve(prev.resistanceCurve.map((p, i) => i === index ? { ...p, [axis]: value } : p)),
    }))
  }

  function handleExportCSV() {
    const csv = sim.dataCollector.exportCSV()
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bms_sim_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const batterySummaryText = `${cellConfig.seriesCount}S${cellConfig.parallelCount}P / ${snapshot.capacityAh.toFixed(1)}Ah`

  return (
    <div className="app-shell">
      <header className="hero-panel card">
        <div className="hero-copy">
          <div className="hero-topline">
            <span className="eyebrow">BMS SIMULATOR / CELL MODEL</span>
            <div className="page-switch">
              {(['dashboard', 'battery-config', 'terrain-config'] as const).map((page) => (
                <button
                  key={page}
                  type="button"
                  className={activePage === page ? 'page-tab active-tab' : 'page-tab'}
                  onClick={() => setActivePage(page)}
                >
                  {page === 'dashboard' ? '运行看板' : page === 'battery-config' ? '电池配置' : '地形配置'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h1>两轮电动车电池仿真与配置</h1>
            <p className="lead">
              基于种子地形的真实路况电池仿真，区分 BMS 标定曲线与真实电芯曲线，按电芯温度估算内阻，支持自定义剩余里程算法。
            </p>
          </div>

          <div className="hero-actions">
            <button type="button" className="primary-button" onClick={sim.running ? sim.pause : sim.start}>
              {sim.running ? '暂停仿真' : '继续仿真'}
            </button>
            <button type="button" className="secondary-button" onClick={sim.reset}>
              重置场景
            </button>
            <button type="button" className="secondary-button" onClick={handleExportCSV} title="导出秒级采样 CSV">
              导出 CSV
            </button>
            <span className="live-chip">{sim.running ? '实时运行中' : '已暂停'}</span>
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
            <small>运行时长 {formatElapsed(sim.simulation.elapsedSeconds)}</small>
          </article>
        </div>
      </header>

      {activePage === 'dashboard' ? (
        <main className="main-grid">
          <div className="column-stack">
            {/* 地形预览 */}
            {sim.terrainData && (
              <section className="card section-card">
                <div className="section-heading compact-heading">
                  <div>
                    <span className="section-kicker">地形剖面</span>
                    <h2>当前路线</h2>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                  <article className="summary-card" style={{ flex: '1 1 120px' }}>
                    <span>总里程</span>
                    <strong>{sim.totalKm.toFixed(3)} km</strong>
                  </article>
                  <article className="summary-card" style={{ flex: '1 1 120px' }}>
                    <span>小计里程</span>
                    <strong>{sim.tripKm.toFixed(3)} km</strong>
                  </article>
                  <article className="summary-card" style={{ flex: '1 1 120px' }}>
                    <span>预估剩余里程</span>
                    <strong>{sim.estimatedRemainingKm !== null ? `${sim.estimatedRemainingKm.toFixed(2)} km` : '—'}</strong>
                  </article>
                  <article className="summary-card" style={{ flex: '1 1 120px' }}>
                    <span>当前速度</span>
                    <strong>{terrainConfig.averageSpeedKmh} km/h</strong>
                  </article>
                </div>
                <TerrainPreview
                  terrain={sim.terrainData}
                  currentKm={sim.totalKm}
                  width={640}
                  height={180}
                />
              </section>
            )}

            <section className="card section-card">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">运行场景</span>
                  <h2>实时输入参数</h2>
                </div>
                <p>工况参数，电池模型本身请在电池配置页调整，地形在地形配置页调整。</p>
              </div>
              <div className="control-list">
                {scenarioFields.map((field) => (
                  <label key={field.key} className="control-card">
                    <div className="control-headline">
                      <div>
                        <span>{field.label}</span>
                        <strong>{scenario[field.key].toFixed(field.step < 1 ? 1 : 0)} {field.unit}</strong>
                      </div>
                      <p>{field.hint}</p>
                    </div>
                    <input type="range" min={field.min} max={field.max} step={field.step} value={scenario[field.key]}
                      onChange={(e) => updateScenarioControl(field.key, Number(e.target.value), field.min, field.max)} />
                    <input className="number-input" type="number" min={field.min} max={field.max} step={field.step} value={scenario[field.key]}
                      onChange={(e) => updateScenarioControl(field.key, Number(e.target.value), field.min, field.max)} />
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
              </div>
              <div className="summary-grid">
                <article className="summary-card">
                  <span>BMS 采样率</span>
                  <strong>{bmsConfig.samplingRate.toFixed(0)} Hz</strong>
                  <small>截止 {bmsConfig.cutoffVoltage.toFixed(2)}V / 过充 {bmsConfig.overchargeVoltage.toFixed(2)}V</small>
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
                <p>最近 BMS 采样点，便于观察真实电芯模型的响应。</p>
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
                    {sim.simulation.history.map((entry) => (
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
                <article><span>整包电压</span><strong>{snapshot.actualVoltage.toFixed(1)} V</strong></article>
                <article><span>实际电流</span><strong>{snapshot.actualCurrent.toFixed(1)} A</strong></article>
                <article><span>真实单体 OCV</span><strong>{snapshot.actualCellOcv.toFixed(3)} V</strong></article>
                <article><span>BMS 估算 OCV</span><strong>{snapshot.bmsEstimatedCellOcv.toFixed(3)} V</strong></article>
                <article><span>负载单体电压</span><strong>{snapshot.loadedCellVoltage.toFixed(3)} V</strong></article>
                <article><span>估算单体电压</span><strong>{snapshot.estimatedCellVoltage.toFixed(3)} V</strong></article>
              </div>
              <div className="meter-block">
                <div className="meter-headline"><span>目标满足度</span><strong>{supplyRatio.toFixed(1)}%</strong></div>
                <div className="meter-track"><span className="meter-fill power-fill" style={{ width: `${supplyRatio}%` }}></span></div>
              </div>
              <div className="meter-block">
                <div className="meter-headline"><span>热压力</span><strong>{thermalRatio.toFixed(1)}%</strong></div>
                <div className="meter-track warm-track"><span className="meter-fill thermal-fill" style={{ width: `${thermalRatio}%` }}></span></div>
              </div>
              <div className="summary-list">
                <div><span>输出评估</span><strong>{responseState}</strong></div>
                <div><span>功率缺口</span><strong>{snapshot.outputGap.toFixed(0)} W</strong></div>
                <div><span>热损耗</span><strong>{snapshot.thermalLoad.toFixed(1)} W</strong></div>
                <div><span>保护结论</span><strong>{snapshot.protectionState}</strong></div>
              </div>
            </section>

            <section className="card section-card notes-panel">
              <div className="section-heading compact-heading">
                <div><span className="section-kicker">建模说明</span><h2>模型变化</h2></div>
              </div>
              <ul className="notes-list">
                <li>地形由种子驱动生成，相同种子 + 参数保证完全一致的仿真条件。</li>
                <li>上坡增加电池放电负载，下坡相对降低；红绿灯处车辆停车等待。</li>
                <li>真实电芯 OCV 曲线用于计算整包开路电压，BMS OCV 曲线独立存在模拟标定偏差。</li>
                <li>温度内阻曲线按当前电芯温度插值，换算为整包等效内阻。</li>
                <li>仿真基础步长 {engineConfig.simulationStepSeconds}s，以最快速度运行，每个点精确计算。</li>
              </ul>
            </section>
          </div>
        </main>
      ) : activePage === 'battery-config' ? (
        <main className="config-page">
          <section className="card section-card config-intro">
            <div className="section-heading compact-heading">
              <div><span className="section-kicker">电池配置页</span><h2>BMS 与电芯双配置</h2></div>
              <p>本页专门管理电池模型。BMS 负责采样、保护阈值和标定曲线；电芯负责真实 OCV 与温度内阻特性。</p>
            </div>
          </section>

          <section className="config-grid">
            <article className="card section-card config-panel">
              <div className="section-heading compact-heading">
                <div><span className="section-kicker">BMS</span><h2>保护与标定参数</h2></div>
                <p>采样率、阈值和 BMS OCV 曲线都在这里配置。</p>
              </div>
              <div className="control-list compact-controls">
                {bmsNumberFields.map((field) => (
                  <label key={field.key} className="control-card">
                    <div className="control-headline">
                      <div>
                        <span>{field.label}</span>
                        <strong>{(bmsConfig[field.key] as number).toFixed(field.step < 1 ? 2 : 0)} {field.unit}</strong>
                      </div>
                      <p>{field.hint}</p>
                    </div>
                    <input type="range" min={field.min} max={field.max} step={field.step} value={bmsConfig[field.key]}
                      onChange={(e) => updateBmsNumber(field.key, Number(e.target.value), field.min, field.max)} />
                    <input className="number-input" type="number" min={field.min} max={field.max} step={field.step} value={bmsConfig[field.key]}
                      onChange={(e) => updateBmsNumber(field.key, Number(e.target.value), field.min, field.max)} />
                  </label>
                ))}
              </div>
              <CurveEditor
                title="BMS OCV 曲线"
                description="用于模拟 BMS 电量估算和保护判断时所采用的标定曲线。"
                xLabel="SOC" xUnit="%" yLabel="电压" yUnit="V" xStep={1} yStep={0.01}
                points={bmsConfig.ocvCurve}
                onChange={(index, axis, value) => updateCurvePoint('bms', index, axis, value)}
              />
            </article>

            <article className="card section-card config-panel">
              <div className="section-heading compact-heading">
                <div><span className="section-kicker">电芯</span><h2>真实电芯参数</h2></div>
                <p>真实电芯 OCV 曲线和温度内阻曲线会直接进入整包仿真计算。</p>
              </div>
              <div className="control-list compact-controls">
                {cellNumberFields.map((field) => (
                  <label key={field.key} className="control-card">
                    <div className="control-headline">
                      <div>
                        <span>{field.label}</span>
                        <strong>{cellConfig[field.key].toFixed(field.step < 1 ? 1 : 0)} {field.unit}</strong>
                      </div>
                      <p>{field.hint}</p>
                    </div>
                    <input type="range" min={field.min} max={field.max} step={field.step} value={cellConfig[field.key]}
                      onChange={(e) => updateCellNumber(field.key, Number(e.target.value), field.min, field.max)} />
                    <input className="number-input" type="number" min={field.min} max={field.max} step={field.step} value={cellConfig[field.key]}
                      onChange={(e) => updateCellNumber(field.key, Number(e.target.value), field.min, field.max)} />
                  </label>
                ))}
              </div>
              <div className="curve-stack">
                <CurveEditor
                  title="真实电芯 OCV 曲线"
                  description="用于从 SOC 估算真实单体开路电压，再换算整包平台电压。"
                  xLabel="SOC" xUnit="%" yLabel="电压" yUnit="V" xStep={1} yStep={0.01}
                  points={cellConfig.ocvCurve}
                  onChange={(index, axis, value) => updateCurvePoint('cell-ocv', index, axis, value)}
                />
                <CurveEditor
                  title="温度内阻曲线"
                  description="用于按当前电芯温度估算单体内阻，并换算为整包等效内阻。"
                  xLabel="温度" xUnit="°C" yLabel="内阻" yUnit="mΩ" xStep={1} yStep={0.1}
                  points={cellConfig.resistanceCurve}
                  onChange={(index, axis, value) => updateCurvePoint('cell-resistance', index, axis, value)}
                />
              </div>
            </article>
          </section>
        </main>
      ) : (
        /* 地形配置页 */
        <main className="config-page">
          <TerrainConfigPanel
            config={terrainConfig}
            onChange={setTerrainConfig}
            onGenerate={sim.regenerateTerrain}
          />
          {sim.terrainData && (
            <section className="card section-card" style={{ marginTop: 16 }}>
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">地形预览</span>
                  <h2>生成结果</h2>
                </div>
                <p>
                  种子: <strong>{terrainConfig.seed}</strong> | 距离: <strong>{terrainConfig.distanceKm} km</strong> |
                  红绿灯: <strong>{sim.terrainData.trafficLights.length} 个</strong> |
                  起点: <strong>{sim.terrainData.points[0]?.altitude.toFixed(0)}m</strong> →
                  终点: <strong>{sim.terrainData.points[sim.terrainData.points.length - 1]?.altitude.toFixed(0)}m</strong>
                </p>
              </div>
              <TerrainPreview terrain={sim.terrainData} currentKm={sim.totalKm} width={800} height={250} />
            </section>
          )}
        </main>
      )}
    </div>
  )
}

export default App
