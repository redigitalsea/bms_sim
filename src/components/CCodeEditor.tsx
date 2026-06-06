import { useRef, useEffect, useState } from 'react'
import { basicSetup } from 'codemirror'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { cpp } from '@codemirror/lang-cpp'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap } from '@codemirror/commands'

const DEFAULT_CODE = `// 在此编写预估剩余里程函数
// 函数签名已固定，请勿修改函数名和参数
// 可使用 static 变量保持跨调用状态

static float history[8] = {0};
static int history_idx = 0;
static int call_count = 0;

history[history_idx] = soc;
history_idx = (history_idx + 1) % 8;
call_count++;

// 简单线性估算：基于当前 SOC 和平均电流
float avg_soc = 0;
for (int i = 0; i < 8; i++) avg_soc += history[i];
avg_soc /= 8.0f;

float remaining_km = total_km * (soc / 100.0f) * 0.95f;
return remaining_km;
`

type Props = {
  onCodeChange?: (code: string) => void
}

export function CCodeEditor({ onCodeChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [code, setCode] = useState(DEFAULT_CODE)

  useEffect(() => {
    if (!editorRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newCode = update.state.doc.toString()
        setCode(newCode)
        onCodeChange?.(newCode)
      }
    })

    const state = EditorState.create({
      doc: DEFAULT_CODE,
      extensions: [
        basicSetup,
        cpp(),
        oneDark,
        keymap.of(defaultKeymap),
        updateListener,
        EditorView.theme({
          '&': { fontSize: '13px', maxHeight: '400px' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: editorRef.current,
    })

    viewRef.current = view
    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="c-code-editor">
      <div ref={editorRef} className="cm-container" />
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted, #888)' }}>
        当前代码长度: {code.length} 字符 | 行数: {code.split('\n').length}
      </div>
    </div>
  )
}
