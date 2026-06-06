import { useState } from 'react'
import './App.css'
import type { ScenarioControls, BmsConfig, CellConfig } from './types'
import {
  defaultScenario,
  defaultBmsConfig,
  defaultCellConfig,
  defaultTerrainConfig,
  defaultEngineConfig,
} from './types'
import { useSimulation } from './hooks/useSimulation'
import { MainPage } from './pages/MainPage'
import { VCUPage } from './pages/VCUPage'
import { BMSPage } from './pages/BMSPage'
import { TerrainPage } from './pages/TerrainPage'
import { HistoryPage } from './pages/HistoryPage'

type AppPage = 'main' | 'vcu' | 'bms' | 'terrain' | 'history'

const NAV_ITEMS: { key: AppPage; label: string; icon: string }[] = [
  { key: 'main',    label: '主页面',     icon: '🏠' },
  { key: 'bms',     label: 'BMS 配置',   icon: '🔋' },
  { key: 'terrain', label: '地形配置',   icon: '⛰️' },
  { key: 'vcu',     label: 'VCU 算法',   icon: '⚙️' },
  { key: 'history', label: '历史记录',   icon: '📊' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeCurve(points: { x: number; y: number }[]) {
  return [...points].sort((a, b) => a.x - b.x)
}

function App() {
  const [activePage, setActivePage] = useState<AppPage>('main')
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

  // ── 更新函数 ──

  function updateScenario(key: keyof ScenarioControls, value: number, min: number, max: number) {
    if (Number.isNaN(value)) return
    setScenario((prev) => ({ ...prev, [key]: clamp(value, min, max) }))
  }

  function updateBmsNumber(key: keyof BmsConfig, value: number, min: number, max: number) {
    if (Number.isNaN(value)) return
    setBmsConfig((prev) => ({ ...prev, [key]: clamp(value, min, max) }))
  }

  function updateCellNumber(key: keyof CellConfig, value: number, min: number, max: number) {
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

  // ── 页面渲染 ──

  function renderPage() {
    switch (activePage) {
      case 'main':
        return (
          <MainPage
            simulation={sim.simulation}
            running={sim.running}
            scenario={scenario}
            terrainData={sim.terrainData}
            terrainConfig={terrainConfig}
            totalKm={sim.totalKm}
            tripKm={sim.tripKm}
            estimatedRemainingKm={sim.estimatedRemainingKm}
            onStart={sim.start}
            onPause={sim.pause}
            onReset={sim.reset}
            onExportCSV={handleExportCSV}
            onUpdateScenario={updateScenario}
          />
        )
      case 'bms':
        return (
          <BMSPage
            bmsConfig={bmsConfig}
            cellConfig={cellConfig}
            onUpdateBms={updateBmsNumber}
            onUpdateCell={updateCellNumber}
            onUpdateCurve={updateCurvePoint}
          />
        )
      case 'terrain':
        return (
          <TerrainPage
            config={terrainConfig}
            terrainData={sim.terrainData}
            currentKm={sim.totalKm}
            onChange={setTerrainConfig}
            onGenerate={sim.regenerateTerrain}
          />
        )
      case 'vcu':
        return <VCUPage />
      case 'history':
        return (
          <HistoryPage
            records={sim.dataCollector.getAllRecords()}
            onExportCSV={handleExportCSV}
            onClear={() => sim.dataCollector.clear()}
          />
        )
    }
  }

  return (
    <div className="app-shell">
      {/* ── 顶部导航栏 ── */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">⚡</span>
          <div>
            <h1 className="brand-title">BMS Simulator</h1>
            <span className="brand-sub">两轮电动车电池仿真器</span>
          </div>
        </div>

        <nav className="header-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activePage === item.key ? 'nav-btn active-nav' : 'nav-btn'}
              onClick={() => setActivePage(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="header-status">
          <span className={`status-dot ${sim.running ? 'dot-running' : 'dot-paused'}`} />
          <span className="status-text">{sim.running ? '运行中' : '已暂停'}</span>
          <span className="status-soc">{sim.simulation.snapshot.soc.toFixed(1)}%</span>
        </div>
      </header>

      {/* ── 页面内容 ── */}
      <main className="page-content">
        {renderPage()}
      </main>
    </div>
  )
}

export default App
