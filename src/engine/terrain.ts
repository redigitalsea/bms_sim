import { createPRNG, randomFloat, randomGaussian, randomInt } from './prng'
import type { TerrainConfig, TerrainData, TerrainPoint, TrafficLight } from '../types'

/**
 * 地形点密度：每公里生成的地形点数
 * 10 点/km = 每 100m 一个点
 */
const POINTS_PER_KM = 10

/**
 * 根据配置生成确定性地形数据
 * 种子相同 + 参数相同 → 输出完全一致
 */
export function generateTerrain(config: TerrainConfig): TerrainData {
  const rng = createPRNG(config.seed)

  const totalPoints = Math.round(config.distanceKm * POINTS_PER_KM)
  const segmentLengthKm = 1 / POINTS_PER_KM

  // ── 1. 生成原始随机海拔序列 ──
  // steepness 映射到海拔标准差：0→0m, 50→5m, 100→15m
  const altitudeStdDev = (config.steepness / 100) * 15
  const rawAltitudes: number[] = [config.startAltitude]

  for (let i = 1; i < totalPoints; i++) {
    const noise = randomGaussian(rng) * altitudeStdDev
    // 平滑：新点 = 上一个点 + 噪声（随机游走，保持局部连续性）
    rawAltitudes.push(rawAltitudes[i - 1] + noise)
  }

  // ── 2. 海拔差修正：线性叠加趋势，使终点海拔趋近 endAltitude ──
  const rawEndAlt = rawAltitudes[totalPoints - 1]
  const altitudeCorrection = config.endAltitude - rawEndAlt
  const points: TerrainPoint[] = []

  for (let i = 0; i < totalPoints; i++) {
    const fraction = i / (totalPoints - 1)
    const correctedAlt = rawAltitudes[i] + altitudeCorrection * fraction
    points.push({
      distanceKm: i * segmentLengthKm,
      altitude: correctedAlt,
      slope: 0, // 下一步计算
    })
  }

  // ── 3. 计算相邻点坡度 ──
  for (let i = 1; i < points.length; i++) {
    const deltaAlt = points[i].altitude - points[i - 1].altitude
    const deltaDist = segmentLengthKm * 1000 // 转换为米
    // slope: 正值=上坡，负值=下坡，百分比坡度
    points[i].slope = deltaDist > 0 ? (deltaAlt / deltaDist) * 100 : 0
  }
  // 第一个点的坡度与第二个点相同
  if (points.length > 1) {
    points[0].slope = points[1].slope
  }

  // ── 4. 生成红绿灯 ──
  const trafficLights = generateTrafficLights(rng, config)

  return {
    points,
    trafficLights,
    totalDistanceKm: config.distanceKm,
  }
}

/**
 * 根据密度在路线中随机分布红绿灯
 */
function generateTrafficLights(
  rng: () => number,
  config: TerrainConfig,
): TrafficLight[] {
  const totalLights = Math.round(config.distanceKm * config.trafficLightDensity)
  const lights: TrafficLight[] = []

  if (totalLights === 0) return lights

  // 将路线分为 totalLights 段，每段内随机放置一个灯，避免重叠
  const segmentLength = config.distanceKm / totalLights

  for (let i = 0; i < totalLights; i++) {
    const segmentStart = i * segmentLength
    const positionKm = segmentStart + randomFloat(rng, segmentLength * 0.15, segmentLength * 0.85)
    const redDurationS = randomInt(rng, 20, 60)
    const greenDurationS = randomInt(rng, 20, 60)

    lights.push({
      positionKm,
      redDurationS,
      greenDurationS,
    })
  }

  return lights.sort((a, b) => a.positionKm - b.positionKm)
}

/**
 * 查询指定距离处的地形信息（线性插值）
 */
export function queryTerrainAtDistance(
  terrain: TerrainData,
  distanceKm: number,
): TerrainPoint {
  const points = terrain.points

  if (distanceKm <= points[0].distanceKm) return points[0]
  if (distanceKm >= points[points.length - 1].distanceKm) return points[points.length - 1]

  for (let i = 0; i < points.length - 1; i++) {
    if (distanceKm >= points[i].distanceKm && distanceKm <= points[i + 1].distanceKm) {
      const ratio =
        (distanceKm - points[i].distanceKm) /
        Math.max(points[i + 1].distanceKm - points[i].distanceKm, 1e-10)
      return {
        distanceKm,
        altitude: points[i].altitude + (points[i + 1].altitude - points[i].altitude) * ratio,
        slope: points[i].slope + (points[i + 1].slope - points[i].slope) * ratio,
      }
    }
  }

  return points[points.length - 1]
}

/**
 * 查询当前里程是否遇到红灯
 * @returns 红灯剩余等待时间（秒），0 表示绿灯或无灯
 */
export function queryTrafficLightAtDistance(
  terrain: TerrainData,
  distanceKm: number,
  elapsedSeconds: number,
): number {
  for (const light of terrain.trafficLights) {
    const distToLight = Math.abs(distanceKm - light.positionKm)
    // 在灯附近 50m 范围内判定
    if (distToLight < 0.05) {
      const cycleDuration = light.redDurationS + light.greenDurationS
      const cyclePosition = elapsedSeconds % cycleDuration
      // 红灯在前，绿灯在后
      if (cyclePosition < light.redDurationS) {
        return light.redDurationS - cyclePosition
      }
      return 0
    }
  }
  return 0
}
