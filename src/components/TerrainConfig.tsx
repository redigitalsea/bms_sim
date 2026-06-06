import type { TerrainConfig } from '../types'

type Props = {
  config: TerrainConfig
  onChange: (config: TerrainConfig) => void
  onGenerate: () => void
}

type FieldDef = {
  key: keyof TerrainConfig
  label: string
  unit: string
  min: number
  max: number
  step: number
  hint: string
  type: 'range' | 'text'
}

const fields: FieldDef[] = [
  { key: 'seed', label: '种子', unit: '', min: 0, max: 0, step: 0, hint: '数字或字符串，决定地形的随机序列。', type: 'text' },
  { key: 'distanceKm', label: '总路线距离', unit: 'km', min: 1, max: 200, step: 1, hint: '整条路线的总长度。', type: 'range' },
  { key: 'averageSpeedKmh', label: '骑行平均速度', unit: 'km/h', min: 5, max: 60, step: 1, hint: '上坡、下坡、起步的目标速度均以此为基准。', type: 'range' },
  { key: 'trafficLightDensity', label: '红绿灯密度', unit: '个/km', min: 0, max: 10, step: 0.5, hint: '每公里平均红绿灯数量。', type: 'range' },
  { key: 'steepness', label: '陡峭度', unit: '', min: 0, max: 100, step: 1, hint: '值越大，地形起伏越剧烈。', type: 'range' },
  { key: 'startAltitude', label: '起点海拔', unit: 'm', min: 0, max: 5000, step: 10, hint: '路线起点的海拔高度。', type: 'range' },
  { key: 'endAltitude', label: '终点海拔', unit: 'm', min: 0, max: 5000, step: 10, hint: '路线终点的海拔高度，影响整体上下坡趋势。', type: 'range' },
]

function updateConfig(config: TerrainConfig, key: keyof TerrainConfig, value: string | number): TerrainConfig {
  return { ...config, [key]: value }
}

export function TerrainConfigPanel({ config, onChange, onGenerate }: Props) {
  return (
    <section className="card section-card">
      <div className="section-heading">
        <div>
          <span className="section-kicker">地形配置</span>
          <h2>路况生成参数</h2>
        </div>
        <p>配置种子和地形参数，点击生成按钮创建确定性地形。</p>
      </div>

      <div className="control-list">
        {fields.map((field) => (
          <label key={field.key} className="control-card">
            <div className="control-headline">
              <div>
                <span>{field.label}</span>
                {field.type === 'range' ? (
                  <strong>
                    {typeof config[field.key] === 'number'
                      ? (config[field.key] as number).toFixed(field.step < 1 ? 1 : 0)
                      : config[field.key]}{' '}
                    {field.unit}
                  </strong>
                ) : null}
              </div>
              <p>{field.hint}</p>
            </div>
            {field.type === 'text' ? (
              <input
                className="number-input"
                type="text"
                value={String(config[field.key])}
                onChange={(e) => onChange(updateConfig(config, field.key, e.target.value))}
                style={{ width: '100%' }}
              />
            ) : (
              <>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={config[field.key] as number}
                  onChange={(e) => onChange(updateConfig(config, field.key, Number(e.target.value)))}
                />
                <input
                  className="number-input"
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={config[field.key] as number}
                  onChange={(e) => onChange(updateConfig(config, field.key, Number(e.target.value)))}
                />
              </>
            )}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button type="button" className="primary-button" onClick={onGenerate}>
          生成地形
        </button>
      </div>
    </section>
  )
}
