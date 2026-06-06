import type { TerrainData } from '../types'

type Props = {
  terrain: TerrainData
  currentKm: number
  width?: number
  height?: number
}

export function TerrainPreview({ terrain, currentKm, width = 600, height = 180 }: Props) {
  if (terrain.points.length < 2) return null

  const padding = { top: 20, right: 20, bottom: 30, left: 45 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const alts = terrain.points.map((p) => p.altitude)
  const minAlt = Math.min(...alts) - 5
  const maxAlt = Math.max(...alts) + 5
  const totalDist = terrain.totalDistanceKm

  const xScale = (km: number) => padding.left + (km / totalDist) * chartW
  const yScale = (alt: number) => padding.top + chartH - ((alt - minAlt) / Math.max(maxAlt - minAlt, 1)) * chartH

  // 海拔路径
  const pathPoints = terrain.points.map((p) => `${xScale(p.distanceKm).toFixed(1)},${yScale(p.altitude).toFixed(1)}`)
  const pathD = `M${pathPoints.join(' L')}`

  // 填充区域
  const fillD = `${pathD} L${xScale(totalDist).toFixed(1)},${yScale(minAlt).toFixed(1)} L${xScale(0).toFixed(1)},${yScale(minAlt).toFixed(1)} Z`

  // 红绿灯位置
  const trafficLights = terrain.trafficLights

  // 当前位置
  const cursorX = xScale(Math.min(currentKm, totalDist))

  // Y 轴刻度
  const yTicks = 4
  const yStep = (maxAlt - minAlt) / yTicks

  return (
    <svg width={width} height={height} className="terrain-preview" viewBox={`0 0 ${width} ${height}`}>
      {/* 背景网格 */}
      {Array.from({ length: yTicks + 1 }).map((_, i) => {
        const y = yScale(minAlt + i * yStep)
        return (
          <g key={`ytick-${i}`}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="var(--border, #e5e7eb)" strokeWidth={0.5} />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize={10} fill="var(--text-muted, #888)">
              {(minAlt + i * yStep).toFixed(0)}m
            </text>
          </g>
        )
      })}

      {/* X 轴刻度 */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const km = totalDist * frac
        return (
          <g key={`xtick-${frac}`}>
            <text x={xScale(km)} y={height - 6} textAnchor="middle" fontSize={10} fill="var(--text-muted, #888)">
              {km.toFixed(1)}km
            </text>
          </g>
        )
      })}

      {/* 海拔填充 */}
      <path d={fillD} fill="rgba(34,197,94,0.1)" />

      {/* 海拔线 */}
      <path d={pathD} fill="none" stroke="rgb(34,197,94)" strokeWidth={2} />

      {/* 红绿灯 */}
      {trafficLights.map((light, i) => (
        <g key={`tl-${i}`}>
          <line
            x1={xScale(light.positionKm)}
            y1={padding.top}
            x2={xScale(light.positionKm)}
            y2={padding.top + chartH}
            stroke="rgba(239,68,68,0.3)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
          <circle
            cx={xScale(light.positionKm)}
            cy={padding.top - 6}
            r={4}
            fill="#ef4444"
          />
        </g>
      ))}

      {/* 当前位置游标 */}
      <line
        x1={cursorX}
        y1={padding.top}
        x2={cursorX}
        y2={padding.top + chartH}
        stroke="#3b82f6"
        strokeWidth={2}
        opacity={0.8}
      />
      <circle cx={cursorX} cy={padding.top + chartH + 8} r={3} fill="#3b82f6" />

      {/* 起终点标签 */}
      <text x={xScale(0)} y={height - 16} textAnchor="start" fontSize={9} fill="var(--text-muted, #888)">
        起点 {terrain.points[0].altitude.toFixed(0)}m
      </text>
      <text x={xScale(totalDist)} y={height - 16} textAnchor="end" fontSize={9} fill="var(--text-muted, #888)">
        终点 {terrain.points[terrain.points.length - 1].altitude.toFixed(0)}m
      </text>
    </svg>
  )
}
