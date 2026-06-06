import type { TerrainConfig, TerrainData } from '../types'
import { TerrainPreview } from '../components/TerrainPreview'

type Props = {
  config: TerrainConfig
  terrainData: TerrainData | null
  currentKm: number
  onChange: (config: TerrainConfig) => void
  onGenerate: () => void
}

export function TerrainPage({ config, terrainData, currentKm, onChange, onGenerate }: Props) {
  function update<K extends keyof TerrainConfig>(key: K, value: TerrainConfig[K]) {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="terrain-page">
      {/* 基础参数 */}
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">路线基础</span>
            <h2>种子与距离</h2>
          </div>
          <p>种子值决定地形的随机序列，相同种子 + 参数保证完全一致的生成结果。</p>
        </div>

        <div className="terrain-param-grid">
          <label className="control-card">
            <div className="control-headline">
              <div><span>种子值</span></div>
              <p>数字或字符串，决定地形随机序列。</p>
            </div>
            <input
              className="text-input"
              type="text"
              value={config.seed}
              onChange={(e) => update('seed', e.target.value)}
              placeholder="输入种子值..."
            />
          </label>
          <label className="control-card">
            <div className="control-headline">
              <div><span>总路线距离</span><strong>{config.distanceKm} km</strong></div>
              <p>整条路线的总长度。</p>
            </div>
            <input type="range" min={1} max={200} step={1} value={config.distanceKm}
              onChange={(e) => update('distanceKm', Number(e.target.value))} />
            <input className="number-input" type="number" min={1} max={200} step={1} value={config.distanceKm}
              onChange={(e) => update('distanceKm', Number(e.target.value))} />
          </label>
          <label className="control-card">
            <div className="control-headline">
              <div><span>骑行平均速度</span><strong>{config.averageSpeedKmh} km/h</strong></div>
              <p>上坡、下坡、起步目标速度均以此为基准。</p>
            </div>
            <input type="range" min={5} max={60} step={1} value={config.averageSpeedKmh}
              onChange={(e) => update('averageSpeedKmh', Number(e.target.value))} />
            <input className="number-input" type="number" min={5} max={60} step={1} value={config.averageSpeedKmh}
              onChange={(e) => update('averageSpeedKmh', Number(e.target.value))} />
          </label>
        </div>
      </section>

      {/* 地形陡峭度 */}
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">地形起伏</span>
            <h2>上下坡与陡峭度</h2>
          </div>
          <p>陡峭度控制地形起伏的剧烈程度；起终海拔差决定整体上下坡趋势。</p>
        </div>

        <div className="terrain-param-grid">
          <label className="control-card">
            <div className="control-headline">
              <div><span>陡峭度</span><strong>{config.steepness}</strong></div>
              <p>值越大，地形起伏越剧烈。0 = 完全平坦，100 = 最陡峭。</p>
            </div>
            <input type="range" min={0} max={100} step={1} value={config.steepness}
              onChange={(e) => update('steepness', Number(e.target.value))} />
            <input className="number-input" type="number" min={0} max={100} step={1} value={config.steepness}
              onChange={(e) => update('steepness', Number(e.target.value))} />
          </label>
          <label className="control-card">
            <div className="control-headline">
              <div><span>起点海拔</span><strong>{config.startAltitude} m</strong></div>
              <p>路线起点的海拔高度。</p>
            </div>
            <input type="range" min={0} max={5000} step={10} value={config.startAltitude}
              onChange={(e) => update('startAltitude', Number(e.target.value))} />
            <input className="number-input" type="number" min={0} max={5000} step={10} value={config.startAltitude}
              onChange={(e) => update('startAltitude', Number(e.target.value))} />
          </label>
          <label className="control-card">
            <div className="control-headline">
              <div><span>终点海拔</span><strong>{config.endAltitude} m</strong></div>
              <p>终点高于起点整体偏上坡，低于起点整体偏下坡。</p>
            </div>
            <input type="range" min={0} max={5000} step={10} value={config.endAltitude}
              onChange={(e) => update('endAltitude', Number(e.target.value))} />
            <input className="number-input" type="number" min={0} max={5000} step={10} value={config.endAltitude}
              onChange={(e) => update('endAltitude', Number(e.target.value))} />
          </label>
        </div>

        {/* 海拔差指示 */}
        <div className="altitude-diff-bar">
          <span className="altitude-diff-label">
            海拔差: <strong>{config.endAltitude - config.startAltitude >= 0 ? '+' : ''}{config.endAltitude - config.startAltitude} m</strong>
            {config.endAltitude > config.startAltitude
              ? ' （整体上坡，负载更高）'
              : config.endAltitude < config.startAltitude
                ? ' （整体下坡，负载更低）'
                : ' （纯随机起伏）'}
          </span>
        </div>
      </section>

      {/* 红绿灯 */}
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">交通设施</span>
            <h2>红绿灯配置</h2>
          </div>
          <p>红绿灯密度控制每公里平均数量，概率参数精细调整绿灯起始偏移。</p>
        </div>

        <div className="terrain-param-grid">
          <label className="control-card">
            <div className="control-headline">
              <div><span>红绿灯密度</span><strong>{config.trafficLightDensity.toFixed(1)} 个/km</strong></div>
              <p>每公里平均红绿灯数量。0 = 无红绿灯。</p>
            </div>
            <input type="range" min={0} max={10} step={0.5} value={config.trafficLightDensity}
              onChange={(e) => update('trafficLightDensity', Number(e.target.value))} />
            <input className="number-input" type="number" min={0} max={10} step={0.5} value={config.trafficLightDensity}
              onChange={(e) => update('trafficLightDensity', Number(e.target.value))} />
          </label>
        </div>

        {terrainData && (
          <div className="traffic-light-stats">
            <span>当前路线共 <strong>{terrainData.trafficLights.length}</strong> 个红绿灯</span>
            {terrainData.trafficLights.length > 0 && (
              <span>
                | 首灯位置: <strong>{terrainData.trafficLights[0].positionKm.toFixed(2)} km</strong>
                | 末灯位置: <strong>{terrainData.trafficLights[terrainData.trafficLights.length - 1].positionKm.toFixed(2)} km</strong>
              </span>
            )}
          </div>
        )}
      </section>

      {/* 生成按钮 + 预览 */}
      <section className="card section-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">生成与预览</span>
            <h2>地形预览</h2>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <button type="button" className="primary-button" onClick={onGenerate}>
            生成地形
          </button>
          {terrainData && (
            <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-muted, #888)' }}>
              种子: <strong>{config.seed}</strong> | 距离: <strong>{config.distanceKm} km</strong> |
              红绿灯: <strong>{terrainData.trafficLights.length} 个</strong> |
              海拔: <strong>{terrainData.points[0]?.altitude.toFixed(0)}m</strong> → <strong>{terrainData.points[terrainData.points.length - 1]?.altitude.toFixed(0)}m</strong>
            </span>
          )}
        </div>

        {terrainData && (
          <TerrainPreview terrain={terrainData} currentKm={currentKm} width={780} height={220} />
        )}
      </section>
    </div>
  )
}
