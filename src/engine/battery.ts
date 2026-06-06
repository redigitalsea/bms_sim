import type { BmsConfig, CellConfig, CurvePoint, ScenarioControls, Snapshot } from '../types'

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

/**
 * 计算一个仿真步长的完整电池状态快照
 * 纯函数，无副作用，无 React 依赖
 *
 * @param currentSoc  当前 SOC (%)
 * @param intervalSeconds  本次步长的物理时间 (秒)
 * @param scenario    运行场景参数
 * @param bmsConfig   BMS 配置
 * @param cellConfig  电芯配置
 * @param demandPowerOverride  可选：由地形计算得出的覆盖功率（坡度+红绿灯影响）
 */
export function createSnapshot(
  currentSoc: number,
  intervalSeconds: number,
  scenario: ScenarioControls,
  bmsConfig: BmsConfig,
  cellConfig: CellConfig,
  demandPowerOverride?: number,
): Snapshot {
  const demandPower =
    demandPowerOverride ?? scenario.targetPower * (scenario.throttle / 100)
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
