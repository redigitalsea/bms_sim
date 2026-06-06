import { useState } from 'react'
import type { BmsConfig, CellConfig, CurvePoint } from '../types'
import { CurveEditor } from '../components/CurveEditor'

type Props = {
  bmsConfig: BmsConfig
  cellConfig: CellConfig
  onUpdateBms: (key: keyof BmsConfig, value: number, min: number, max: number) => void
  onUpdateCell: (key: keyof CellConfig, value: number, min: number, max: number) => void
  onUpdateCurve: (scope: 'bms' | 'cell-ocv' | 'cell-resistance', index: number, axis: 'x' | 'y', value: number) => void
}

const bmsFields = [
  { key: 'samplingRate' as const, label: '采样率', unit: 'Hz', min: 2, max: 20, step: 1, hint: '决定 BMS 响应频率和采样滞后。' },
  { key: 'currentLimit' as const, label: '限流阈值', unit: 'A', min: 20, max: 90, step: 1, hint: 'BMS 对实际输出电流的保护上限。' },
  { key: 'overchargeVoltage' as const, label: '过充电压', unit: 'V/Cell', min: 3.9, max: 4.3, step: 0.01, hint: '单体是否进入过充预警区的判断阈值。' },
  { key: 'cutoffVoltage' as const, label: '截止电压', unit: 'V/Cell', min: 2.5, max: 3.3, step: 0.01, hint: '低于该值时 BMS 进入限流或截止保护。' },
]

const cellFields = [
  { key: 'seriesCount' as const, label: '串联节数', unit: 'S', min: 12, max: 24, step: 1, hint: '决定整包电压平台。' },
  { key: 'parallelCount' as const, label: '并联节数', unit: 'P', min: 1, max: 12, step: 1, hint: '决定容量与电流分摊能力。' },
  { key: 'cellCapacityAh' as const, label: '单芯容量', unit: 'Ah', min: 2, max: 10, step: 0.1, hint: '用于估算整包容量与 SOC 衰减速度。' },
]

export function BMSPage({ bmsConfig, cellConfig, onUpdateBms, onUpdateCell, onUpdateCurve }: Props) {
  const [subTab, setSubTab] = useState<'cell' | 'bms'>('cell')

  const packCapacityAh = cellConfig.cellCapacityAh * cellConfig.parallelCount
  const packVoltageNominal = cellConfig.ocvCurve.length > 0
    ? cellConfig.ocvCurve[Math.floor(cellConfig.ocvCurve.length / 2)].y * cellConfig.seriesCount
    : 0

  return (
    <div className="bms-page">
      {/* 子页面切换 */}
      <div className="sub-tab-bar">
        <button
          type="button"
          className={subTab === 'cell' ? 'sub-tab active-sub-tab' : 'sub-tab'}
          onClick={() => setSubTab('cell')}
        >
          🔋 电芯实际参数
        </button>
        <button
          type="button"
          className={subTab === 'bms' ? 'sub-tab active-sub-tab' : 'sub-tab'}
          onClick={() => setSubTab('bms')}
        >
          ⚡ BMS 配置参数
        </button>
      </div>

      {subTab === 'cell' ? (
        /* ── 电芯子页面 ── */
        <div className="bms-content">
          {/* 电芯摘要 */}
          <section className="card section-card">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">电芯摘要</span>
                <h2>当前电池包配置</h2>
              </div>
            </div>
            <div className="summary-grid">
              <article className="summary-card">
                <span>整包配置</span>
                <strong>{cellConfig.seriesCount}S{cellConfig.parallelCount}P</strong>
                <small>{cellConfig.seriesCount * cellConfig.parallelCount} 节电芯</small>
              </article>
              <article className="summary-card">
                <span>整包容量</span>
                <strong>{packCapacityAh.toFixed(1)} Ah</strong>
                <small>单芯 {cellConfig.cellCapacityAh} Ah × {cellConfig.parallelCount}P</small>
              </article>
              <article className="summary-card">
                <span>标称电压</span>
                <strong>{packVoltageNominal.toFixed(1)} V</strong>
                <small>单芯 OCV 中位 × {cellConfig.seriesCount}S</small>
              </article>
              <article className="summary-card">
                <span>曲线配置</span>
                <strong>{cellConfig.ocvCurve.length} 个 OCV 点</strong>
                <small>{cellConfig.resistanceCurve.length} 个温阻点</small>
              </article>
            </div>
          </section>

          {/* 电芯参数 */}
          <section className="card section-card">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">电芯参数</span>
                <h2>串并联与容量</h2>
              </div>
              <p>调整电芯物理参数，直接影响整包仿真计算。</p>
            </div>
            <div className="control-list compact-controls">
              {cellFields.map((f) => (
                <label key={f.key} className="control-card">
                  <div className="control-headline">
                    <div>
                      <span>{f.label}</span>
                      <strong>{cellConfig[f.key].toFixed(f.step < 1 ? 1 : 0)} {f.unit}</strong>
                    </div>
                    <p>{f.hint}</p>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={cellConfig[f.key]}
                    onChange={(e) => onUpdateCell(f.key, Number(e.target.value), f.min, f.max)} />
                  <input className="number-input" type="number" min={f.min} max={f.max} step={f.step} value={cellConfig[f.key]}
                    onChange={(e) => onUpdateCell(f.key, Number(e.target.value), f.min, f.max)} />
                </label>
              ))}
            </div>
          </section>

          {/* 电芯曲线 */}
          <div className="curve-stack">
            <CurveEditor
              title="真实电芯 OCV 曲线"
              description="SOC(%) → 开路电压(V)，用于计算整包开路电压平台。"
              xLabel="SOC" xUnit="%" yLabel="电压" yUnit="V" xStep={1} yStep={0.01}
              points={cellConfig.ocvCurve}
              onChange={(index, axis, value) => onUpdateCurve('cell-ocv', index, axis, value)}
            />
            <CurveEditor
              title="温度内阻曲线"
              description="温度(°C) → 单体内阻(mΩ)，按当前温度插值估算等效内阻。"
              xLabel="温度" xUnit="°C" yLabel="内阻" yUnit="mΩ" xStep={1} yStep={0.1}
              points={cellConfig.resistanceCurve}
              onChange={(index, axis, value) => onUpdateCurve('cell-resistance', index, axis, value)}
            />
          </div>
        </div>
      ) : (
        /* ── BMS 子页面 ── */
        <div className="bms-content">
          <section className="card section-card">
            <div className="section-heading compact-heading">
              <div>
                <span className="section-kicker">BMS 参数</span>
                <h2>保护与标定配置</h2>
              </div>
              <p>BMS 采样率、限流、过充/截止阈值。这些参数决定 BMS 侧的保护行为。</p>
            </div>

            {/* BMS 当前状态摘要 */}
            <div className="summary-grid" style={{ marginBottom: 16 }}>
              <article className="summary-card">
                <span>采样率</span>
                <strong>{bmsConfig.samplingRate} Hz</strong>
                <small>采样间隔 {(1000 / bmsConfig.samplingRate).toFixed(0)} ms</small>
              </article>
              <article className="summary-card">
                <span>保护窗口</span>
                <strong>{bmsConfig.cutoffVoltage.toFixed(2)} ~ {bmsConfig.overchargeVoltage.toFixed(2)} V</strong>
                <small>截止 ~ 过充</small>
              </article>
              <article className="summary-card">
                <span>限流</span>
                <strong>{bmsConfig.currentLimit} A</strong>
                <small>输出电流上限</small>
              </article>
              <article className="summary-card">
                <span>BMS OCV 曲线</span>
                <strong>{bmsConfig.ocvCurve.length} 个点</strong>
                <small>标定曲线</small>
              </article>
            </div>

            <div className="control-list compact-controls">
              {bmsFields.map((f) => (
                <label key={f.key} className="control-card">
                  <div className="control-headline">
                    <div>
                      <span>{f.label}</span>
                      <strong>
                        {(bmsConfig[f.key] as number).toFixed(f.step < 1 ? 2 : 0)} {f.unit}
                      </strong>
                    </div>
                    <p>{f.hint}</p>
                  </div>
                  <input type="range" min={f.min} max={f.max} step={f.step} value={bmsConfig[f.key]}
                    onChange={(e) => onUpdateBms(f.key, Number(e.target.value), f.min, f.max)} />
                  <input className="number-input" type="number" min={f.min} max={f.max} step={f.step} value={bmsConfig[f.key]}
                    onChange={(e) => onUpdateBms(f.key, Number(e.target.value), f.min, f.max)} />
                </label>
              ))}
            </div>
          </section>

          <CurveEditor
            title="BMS OCV 标定曲线"
            description="BMS 侧用于电量估算和保护判断的标定曲线，可与真实电芯 OCV 存在偏差。"
            xLabel="SOC" xUnit="%" yLabel="电压" yUnit="V" xStep={1} yStep={0.01}
            points={bmsConfig.ocvCurve}
            onChange={(index, axis, value) => onUpdateCurve('bms', index, axis, value)}
          />
        </div>
      )}
    </div>
  )
}
