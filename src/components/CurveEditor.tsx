import type { CurveEditorProps } from '../types'

export function CurveEditor({
  title,
  description,
  xLabel,
  xUnit,
  yLabel,
  yUnit,
  xStep,
  yStep,
  points,
  onChange,
}: CurveEditorProps) {
  return (
    <section className="curve-editor card-nested">
      <div className="subsection-heading">
        <div>
          <span className="section-kicker">曲线参数</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>

      <div className="curve-table-wrap">
        <table className="curve-table">
          <thead>
            <tr>
              <th>点位</th>
              <th>
                {xLabel} ({xUnit})
              </th>
              <th>
                {yLabel} ({yUnit})
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point, index) => (
              <tr key={`${title}-${index.toString()}`}>
                <td>P{index + 1}</td>
                <td>
                  <input
                    className="table-input"
                    type="number"
                    step={xStep}
                    value={point.x}
                    onChange={(event) => onChange(index, 'x', Number(event.target.value))}
                  />
                </td>
                <td>
                  <input
                    className="table-input"
                    type="number"
                    step={yStep}
                    value={point.y}
                    onChange={(event) => onChange(index, 'y', Number(event.target.value))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
