import type { SimulationRecord } from '../types'

type Props = {
  records: SimulationRecord[]
  onExportCSV: () => void
  onClear: () => void
}

function formatMs(ms: number): string {
  const s = ms / 1000
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = (s % 60).toFixed(1)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.padStart(4, '0')}`
  return `${m.toString().padStart(2, '0')}:${sec.padStart(4, '0')}`
}

export function HistoryPage({ records, onExportCSV, onClear }: Props) {
  const secondLevelRecords = (() => {
    const result: SimulationRecord[] = []
    let lastSecond = -1
    for (const r of records) {
      const sec = Math.floor(r.timeMs / 1000)
      if (sec > lastSecond) {
        result.push(r)
        lastSecond = sec
      }
    }
    return result
  })()

  return (
    <div className="history-page">
      {/* 摘要 */}
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">数据概览</span>
            <h2>模拟记录</h2>
          </div>
          <p>每个仿真点均完整记录，支持秒级导出。</p>
        </div>

        <div className="summary-grid">
          <article className="summary-card">
            <span>总记录数</span>
            <strong>{records.length.toLocaleString()}</strong>
            <small>每个仿真点 (0.01s)</small>
          </article>
          <article className="summary-card">
            <span>秒级记录</span>
            <strong>{secondLevelRecords.length.toLocaleString()}</strong>
            <small>每秒取一条</small>
          </article>
          <article className="summary-card">
            <span>覆盖时长</span>
            <strong>{records.length > 0 ? formatMs(records[records.length - 1].timeMs) : '00:00'}</strong>
            <small>仿真总时长</small>
          </article>
          <article className="summary-card">
            <span>最终 SOC</span>
            <strong>{records.length > 0 ? `${records[records.length - 1].soc.toFixed(1)}%` : '—'}</strong>
            <small>仿真结束时电量</small>
          </article>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button type="button" className="primary-button" onClick={onExportCSV} disabled={records.length === 0}>
            ⬇ 导出秒级 CSV
          </button>
          <button type="button" className="secondary-button" onClick={onClear} disabled={records.length === 0}>
            清空记录
          </button>
        </div>
      </section>

      {/* 秒级记录预览表 */}
      <section className="card section-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">秒级采样</span>
            <h2>记录预览</h2>
          </div>
          <p>显示秒级采样记录（最近 200 条）。</p>
        </div>

        <div className="history-table-wrap">
          <table className="history-table full-history-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>包电压 (V)</th>
                <th>电流 (A)</th>
                <th>SOC (%)</th>
                <th>功率 (W)</th>
                <th>单体电压 (V)</th>
                <th>总里程 (km)</th>
                <th>小计 (km)</th>
                <th>坡度 (%)</th>
                <th>剩余里程 (km)</th>
              </tr>
            </thead>
            <tbody>
              {secondLevelRecords.slice(-200).reverse().map((r, i) => (
                <tr key={i}>
                  <td>{formatMs(r.timeMs)}</td>
                  <td>{r.packVoltage.toFixed(2)}</td>
                  <td>{r.current.toFixed(2)}</td>
                  <td>{r.soc.toFixed(2)}</td>
                  <td>{r.power.toFixed(1)}</td>
                  <td>{r.cellVoltage.toFixed(4)}</td>
                  <td>{r.totalKm.toFixed(3)}</td>
                  <td>{r.tripKm.toFixed(3)}</td>
                  <td>{r.slope.toFixed(2)}</td>
                  <td>{r.estimatedRemainingKm !== null ? r.estimatedRemainingKm.toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {secondLevelRecords.length > 200 && (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted, #888)' }}>
            仅显示最近 200 条，共 {secondLevelRecords.length} 条秒级记录。导出 CSV 可获取完整数据。
          </p>
        )}
      </section>
    </div>
  )
}
