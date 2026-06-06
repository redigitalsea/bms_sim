import type { SimulationState, ScenarioControls, TerrainData, TerrainConfig } from '../types'
import { TerrainPreview } from '../components/TerrainPreview'

type Props = {
  simulation: SimulationState
  running: boolean
  scenario: ScenarioControls
  terrainData: TerrainData | null
  terrainConfig: TerrainConfig
  totalKm: number
  tripKm: number
  estimatedRemainingKm: number | null
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onExportCSV: () => void
  onUpdateScenario: (key: keyof ScenarioControls, value: number, min: number, max: number) => void
}

function formatElapsed(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds - h * 3600 - m * 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toFixed(0).padStart(2, '0')}s`
  return `${m.toString().padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`
}

const scenarioFields = [
  { key: 'targetPower' as const, label: '动力输出目标', unit: 'W', min: 800, max: 4500, step: 50, hint: '电机控制器请求的目标功率' },
  { key: 'throttle' as const, label: '油门开度', unit: '%', min: 20, max: 100, step: 1, hint: '骑手实时给定的扭矩请求' },
  { key: 'cellTemperature' as const, label: '电芯温度', unit: '°C', min: -10, max: 60, step: 1, hint: '用于估算当前等效内阻' },
]

export function MainPage({
  simulation, running, scenario, terrainData, terrainConfig,
  totalKm, tripKm, estimatedRemainingKm,
  onStart, onPause, onReset, onExportCSV, onUpdateScenario,
}: Props) {
  const snap = simulation.snapshot

  const supplyRatio = Math.min((snap.actualPower / Math.max(snap.demandPower, 1)) * 100, 100)
  const thermalRatio = Math.min((snap.thermalLoad / 220) * 100, 100)
  const bmsCurveGap = snap.bmsEstimatedCellOcv - snap.actualCellOcv
  const curveAlignment = Math.abs(bmsCurveGap) < 0.03 ? '标定接近' : '标定偏移'
  const responseState = snap.efficiency >= 0.94 ? '输出稳定' : snap.efficiency >= 0.84 ? '轻度受限' : '明显受限'

  return (
    <div className="main-page">
      {/* ── 顶部控制栏 ── */}
      <section className="card section-card control-bar">
        <div className="control-bar-inner">
          <div className="sim-controls">
            <button type="button" className={running ? 'primary-button warn-button' : 'primary-button'} onClick={running ? onPause : onStart}>
              {running ? '⏸ 暂停' : '▶ 开始模拟'}
            </button>
            <button type="button" className="secondary-button" onClick={onReset}>↺ 重置</button>
            <button type="button" className="secondary-button" onClick={onExportCSV}>⬇ 导出 CSV</button>
          </div>
          <div className="sim-status-chips">
            <span className={`status-chip ${running ? 'status-running' : 'status-paused'}`}>
              {running ? '● 运行中' : '◯ 已暂停'}
            </span>
            <span className="status-chip">⏱ {formatElapsed(simulation.elapsedSeconds)}</span>
            <span className="status-chip">🔋 {snap.soc.toFixed(1)}%</span>
          </div>
        </div>
      </section>

      <div className="main-layout">
        {/* ── 左列：场景参数 + 地形预览 ── */}
        <div className="main-col-left">
          {/* 场景参数 */}
          <section className="card section-card">
            <div className="section-heading">
              <div>
                <span className="section-kicker">运行场景</span>
                <h2>模拟条件</h2>
              </div>
            </div>
            <div className="control-list">
              {scenarioFields.map((f) => (
                <label key={f.key} className="control-card">
                  <div className="control-headline">
                    <div>
                      <span>{f.label}</span>
                      <strong>{scenario[f.key].toFixed(f.step < 1 ? 1 : 0)} {f.unit}</strong>
                    </div>
                    <p>{f.hint}</p>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={scenario[f.key]}
                    onChange={(e) => onUpdateScenario(f.key, Number(e.target.value), f.min, f.max)} />
                  <input className="number-input" type="number" min={f.min} max={f.max} step={f.step} value={scenario[f.key]}
                    onChange={(e) => onUpdateScenario(f.key, Number(e.target.value), f.min, f.max)} />
                </label>
              ))}
            </div>
          </section>

          {/* 地形剖面 */}
          {terrainData && (
            <section className="card section-card">
              <div className="section-heading compact-heading">
                <div>
                  <span className="section-kicker">地形剖面</span>
                  <h2>当前路线</h2>
                </div>
              </div>
              <div className="odo-row">
                <div className="odo-item"><span>总里程</span><strong>{totalKm.toFixed(3)} km</strong></div>
                <div className="odo-item"><span>小计里程</span><strong>{tripKm.toFixed(3)} km</strong></div>
                <div className="odo-item"><span>预估剩余</span><strong>{estimatedRemainingKm !== null ? `${estimatedRemainingKm.toFixed(2)} km` : '—'}</strong></div>
                <div className="odo-item"><span>速度</span><strong>{terrainConfig.averageSpeedKmh} km/h</strong></div>
              </div>
              <TerrainPreview terrain={terrainData} currentKm={totalKm} width={620} height={160} />
            </section>
          )}

          {/* 采样记录 */}
          <section className="card section-card">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">时间序列</span>
                <h2>最近采样记录</h2>
              </div>
            </div>
            <div className="history-table-wrap">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>输出</th>
                    <th>电压</th>
                    <th>电流</th>
                    <th>单体电压</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {simulation.history.map((e) => (
                    <tr key={e.id}>
                      <td>{e.label}</td>
                      <td>{e.actualPower.toFixed(0)} W</td>
                      <td>{e.actualVoltage.toFixed(1)} V</td>
                      <td>{e.actualCurrent.toFixed(1)} A</td>
                      <td>{e.loadedCellVoltage.toFixed(3)} V</td>
                      <td>{e.protectionState}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ── 右列：实时状态 ── */}
        <div className="main-col-right">
          {/* 核心指标卡片 */}
          <div className="metric-hero-grid">
            <article className="metric-hero-card">
              <span className="metric-label">保护状态</span>
              <strong className="metric-value">{snap.protectionState}</strong>
              <small className="metric-sub">{curveAlignment}</small>
            </article>
            <article className="metric-hero-card accent">
              <span className="metric-label">剩余电量</span>
              <strong className="metric-value">{snap.soc.toFixed(1)}%</strong>
              <small className="metric-sub">{formatElapsed(simulation.elapsedSeconds)}</small>
            </article>
            <article className="metric-hero-card">
              <span className="metric-label">实际输出</span>
              <strong className="metric-value">{snap.actualPower.toFixed(0)} W</strong>
              <small className="metric-sub">目标 {snap.demandPower.toFixed(0)} W</small>
            </article>
            <article className="metric-hero-card">
              <span className="metric-label">整包模型</span>
              <strong className="metric-value">{snap.capacityAh.toFixed(1)} Ah</strong>
              <small className="metric-sub">{snap.sampleLag.toFixed(0)} ms 延迟</small>
            </article>
          </div>

          {/* 详细指标 */}
          <section className="card section-card">
            <div className="section-heading compact-heading">
              <div><span className="section-kicker">实时数据</span><h2>电池状态详情</h2></div>
            </div>
            <div className="metric-grid">
              <article><span>整包电压</span><strong>{snap.actualVoltage.toFixed(1)} V</strong></article>
              <article><span>实际电流</span><strong>{snap.actualCurrent.toFixed(1)} A</strong></article>
              <article><span>真实单体 OCV</span><strong>{snap.actualCellOcv.toFixed(3)} V</strong></article>
              <article><span>BMS 估算 OCV</span><strong>{snap.bmsEstimatedCellOcv.toFixed(3)} V</strong></article>
              <article><span>负载单体电压</span><strong>{snap.loadedCellVoltage.toFixed(3)} V</strong></article>
              <article><span>估算单体电压</span><strong>{snap.estimatedCellVoltage.toFixed(3)} V</strong></article>
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
              <div><span>功率缺口</span><strong>{snap.outputGap.toFixed(0)} W</strong></div>
              <div><span>热损耗</span><strong>{snap.thermalLoad.toFixed(1)} W</strong></div>
              <div><span>BMS 曲线偏差</span><strong>{bmsCurveGap >= 0 ? '+' : ''}{bmsCurveGap.toFixed(3)} V</strong></div>
              <div><span>整包内阻</span><strong>{snap.packResistance.toFixed(4)} Ω</strong></div>
              <div><span>单体内阻</span><strong>{snap.cellResistanceMilliOhm.toFixed(1)} mΩ</strong></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
