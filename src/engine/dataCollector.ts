import type { SimulationRecord } from '../types'

/**
 * 仿真数据采集器
 * 记录每个仿真点的完整状态，支持秒级降采样和 CSV 导出
 */
export class DataCollector {
  private records: SimulationRecord[] = []

  addRecord(record: SimulationRecord): void {
    this.records.push(record)
  }

  getAllRecords(): SimulationRecord[] {
    return this.records
  }

  getCount(): number {
    return this.records.length
  }

  getLatest(): SimulationRecord | null {
    return this.records.length > 0 ? this.records[this.records.length - 1] : null
  }

  /**
   * 获取秒级降采样记录
   * 每秒取该秒内最后一条记录
   */
  getSecondLevelRecords(): SimulationRecord[] {
    if (this.records.length === 0) return []

    const result: SimulationRecord[] = []
    let lastSecond = -1

    for (const record of this.records) {
      const currentSecond = Math.floor(record.timeMs / 1000)
      if (currentSecond > lastSecond) {
        result.push(record)
        lastSecond = currentSecond
      }
    }

    return result
  }

  /**
   * 导出秒级 CSV
   */
  exportCSV(): string {
    const records = this.getSecondLevelRecords()
    if (records.length === 0) return ''

    const headers = [
      '时间(ms)',
      '包电压(V)',
      '电流(A)',
      'SOC(%)',
      '功率(W)',
      '单体电压(V)',
      '温度(°C)',
      '总里程(km)',
      '小计里程(km)',
      '坡度(%)',
      '速度(km/h)',
      '预估剩余里程(km)',
    ].join(',')

    const rows = records.map((r) =>
      [
        r.timeMs,
        r.packVoltage.toFixed(2),
        r.current.toFixed(2),
        r.soc.toFixed(2),
        r.power.toFixed(1),
        r.cellVoltage.toFixed(4),
        r.temperature.toFixed(1),
        r.totalKm.toFixed(4),
        r.tripKm.toFixed(4),
        r.slope.toFixed(2),
        r.speed.toFixed(1),
        r.estimatedRemainingKm !== null ? r.estimatedRemainingKm.toFixed(2) : '',
      ].join(','),
    )

    return [headers, ...rows].join('\n')
  }

  clear(): void {
    this.records = []
  }
}
