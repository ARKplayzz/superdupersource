import type { AppSnapshot } from '../../../shared/api'
import { inputChoices, inputLabel } from '../shared'

// Which switcher input each source is. Layouts name sources, so a new venue only needs this page.
export function Sources({ snap }: { snap: AppSnapshot }) {
  const s = snap.settings
  const choices = inputChoices(snap)
  const set = (role: string, input: number) => void window.sds.setSettings({ ...s, roles: { ...s.roles, [role]: input } })

  return (
    <main className="column-page">
      <div className="column">
        <h3 className="col-title">Sources</h3>
        <div className="rows">
          {Object.entries(s.roles).map(([role, input]) => (
            <div key={role} className="row source-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <div>{role}</div>
                <div className="muted num small">Input {inputLabel(snap, input)}</div>
              </div>
              <select className="source-select" value={input} onChange={(e) => set(role, Number(e.target.value))}>
                <optgroup label="Inputs">
                  {choices
                    .filter((c) => c.kind === 'external')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} {c.name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="M/Es">
                  {choices
                    .filter((c) => c.kind === 'me')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} {c.name}
                      </option>
                    ))}
                </optgroup>
                {!choices.some((c) => c.id === input) && <option value={input}>{input}</option>}
              </select>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
