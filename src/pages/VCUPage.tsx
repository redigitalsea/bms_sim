import { useState } from 'react'
import { CCodeEditor } from '../components/CCodeEditor'

type CompileResult = {
  status: 'idle' | 'compiling' | 'success' | 'error'
  message?: string
}

export function VCUPage() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState<CompileResult>({ status: 'idle' })

  async function handleCompile() {
    if (!code.trim()) {
      setResult({ status: 'error', message: '代码不能为空' })
      return
    }
    setResult({ status: 'compiling' })
    try {
      const resp = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setResult({ status: 'success', message: `编译成功 (${(data.size / 1024).toFixed(1)} KB)` })
      } else {
        setResult({ status: 'error', message: data.error || '编译失败' })
      }
    } catch (err) {
      setResult({ status: 'error', message: `请求失败: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  return (
    <div className="vcu-page">
      <section className="card section-card">
        <div className="section-heading">
          <div>
            <span className="section-kicker">VCU 算法</span>
            <h2>自定义剩余里程函数</h2>
          </div>
          <p>使用 C 语言编写预估剩余里程函数，编译为 WebAssembly 后在仿真中运行。</p>
        </div>

        {/* 函数签名说明 */}
        <div className="signatur-box">
          <h4>固定函数签名</h4>
          <pre className="signature-code">{`float estimate_remaining_km(
    float pack_voltage,   // 包电压 (V)
    float current,        // 电流 (A)
    float soc,            // SOC (0.0~1.0)
    float cell_voltage,   // 单体电压 (V)
    float temperature,    // 电芯温度 (°C)
    float total_km,       // 总里程 (km)
    float trip_km,        // 小计里程 (km)
    unsigned long time_ms // 仿真时间 (ms)
);`}</pre>
          <p className="signature-note">
            函数体内可使用 <code>static</code> 局部变量和全局变量保持跨调用状态。
            每次重新编译加载时变量重置为初始值。
          </p>
        </div>
      </section>

      <section className="card section-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">代码编辑器</span>
            <h2>函数实现</h2>
          </div>
        </div>

        <CCodeEditor onCodeChange={setCode} />

        <div className="compile-bar">
          <button
            type="button"
            className="primary-button"
            onClick={handleCompile}
            disabled={result.status === 'compiling'}
          >
            {result.status === 'compiling' ? '编译中…' : '编译并加载'}
          </button>

          {result.status !== 'idle' && (
            <div className={`compile-result ${result.status}`}>
              {result.status === 'success' && '✓ '}
              {result.status === 'error' && '✗ '}
              {result.status === 'compiling' && '⟳ '}
              {result.message}
            </div>
          )}
        </div>
      </section>

      <section className="card section-card">
        <div className="section-heading compact-heading">
          <div>
            <span className="section-kicker">说明</span>
            <h2>使用指南</h2>
          </div>
        </div>
        <ul className="notes-list">
          <li>函数按 BMS 采样频率调用，两次调用之间剩余里程保持上次返回值。</li>
          <li>可使用 <code>static</code> 变量保存历史数据（如滑动平均、趋势判断等）。</li>
          <li>代码通过后端 Emscripten (emcc) 编译为 WASM 模块，编译失败会显示完整错误信息。</li>
          <li>同一份已编译的 WASM 实例内，static 变量跨调用持久保持；重新编译后重置。</li>
          <li>返回值为预估剩余里程（km），建议基于 SOC、电流、历史趋势等计算。</li>
        </ul>
      </section>
    </div>
  )
}
