import { useCapabilities, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP, VIEW_ACTIONS } from '../core/registry.ts'
import { Button } from '../components/Button.tsx'
import { SelectField } from '../components/Fields.tsx'

/**
 * Step-2 viewport controls (VIEW-01). Every button is a declarative command;
 * camera work, hit testing and measurement all happen behind the bridge.
 */
export function View3D() {
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const capabilities = useCapabilities()
  const webgl = useCapability(CAP.webgl)
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const open = isGroupOpen(state, 'stage-view-group')
  const toolsOpen = isGroupOpen(state, 'stage-tools', true)
  const visibleRevision = snapshot.project.visibleModelRevision
  const selection = snapshot.project.selection
  const blocks = snapshot.project.blocks

  return (
    <div id="w3a-stage-tools" className="stack" style={{ alignItems: 'flex-end' }} hidden={!toolsOpen}>
      <div className="toolbar fc-border" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          aria-expanded={open}
          aria-controls="w3a-view-actions"
          onClick={() => actions.setGroupOpen('stage-view-group', !open)}
        >
          {open ? '▾' : '▸'} Khung xem
        </button>
        {/* Rendered always and hidden, so `aria-controls` has a stable target. */}
        <div id="w3a-view-actions" className="row" role="group" aria-label="Điều khiển khung xem" hidden={!open}>
            {VIEW_ACTIONS.map((action) => {
              // A gated action states the reason the core gave; a capability the
              // snapshot never mentions is treated as absent (UI-C01).
              const gate = action.capability ? capabilities.get(action.capability) : undefined
              const capabilityBlocked =
                action.capability && !gate?.available
                  ? (gate?.reason ??
                    `Nhân chưa công bố năng lực ${action.capability} trong snapshot hiện tại.`)
                  : null
              const blocked =
                capabilityBlocked ??
                (webgl.available ? null : `${webgl.reason} Ô số và lệnh dựng vẫn dùng được.`)
              return (
                <Button
                  key={action.id}
                  size="small"
                  icon={action.icon}
                  keyHint={action.key}
                  aria-keyshortcuts={action.key}
                  disabledReason={blocked}
                  reasonHidden
                  title={`${action.label} (${action.key})${blocked ? ` — ${blocked}` : ''}`}
                  onClick={() => void run({ type: 'viewport.action', action: action.id })}
                >
                  {action.label}
                </Button>
              )
            })}
        </div>
      </div>

      {/* UI-C04: the selection lives in the snapshot. Contract 0.3 adds the
          block list and `selection.set`, so the keyboard can reach exactly the
          same selection a click in the viewport would publish. Drawn only when
          the build published blocks: an empty control over the model is noise. */}
      {blocks.length > 0 ? (
        <div
          className="card card--glass fc-border"
          style={{ padding: 8, gap: 6, minInlineSize: 0, maxInlineSize: '100%' }}
        >
          <SelectField
            inputId="w3a-block-select"
            label="Khối đang chọn"
            value={selection?.blockId ?? ''}
            options={[
              { value: '', label: '— không chọn khối nào' },
              ...blocks.map((block) => ({
                value: block.id,
                label: `${block.label} · ${block.kind}`,
              })),
            ]}
            disabledReason={writeBlocked ?? null}
            onChange={(value) => {
              void run({ type: 'selection.set', blockId: value === '' ? null : value })
            }}
          />
          {selection ? (
            <Button size="small" icon="cube" onClick={() => actions.setBlockPopup({ x: 120, y: 120 })}>
              Chi tiết khối: {selection.label}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!webgl.available ? (
        <span className="chip chip--warn fc-border">
          Không có WebGL: tắt chọn khối, đo và xuất PNG. Dựng và xuất hình học vẫn chạy.
        </span>
      ) : null}

      {/* Which build is on screen. `visibleModelRevision` is the lease being
          drawn (contract 0.3); staleness is said once, in the readout band of
          the stage and on the step chip, not repeated here. */}
      <span className="chip chip--muted fc-border" data-visible-model-revision={visibleRevision ?? 'none'}>
        {visibleRevision === null ? 'Chưa giữ mô hình nào' : `Mô hình của bản sửa ${visibleRevision}`}
      </span>
    </div>
  )
}
