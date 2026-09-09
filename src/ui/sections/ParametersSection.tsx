import { useEffect, useId, useMemo, useState } from 'react'
import type { ParameterView } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { useProjectGate } from '../core/project-gate.ts'
import { materialName } from '../core/names.ts'
import { ACCEPT_MESH, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { TextField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { formatNumber, matchesAllWords } from '../core/text.ts'
import { GROUP_COLOR, GROUP_LABEL, GROUP_ORDER, ParameterRow } from './ParameterRow.tsx'

/** The controller's stock sentence for a row it keeps but does not apply. */
const INACTIVE_REASON = 'Tham số được giữ lại nhưng đang không có hiệu lực.'
const isInactive = (parameter: ParameterView) =>
  !parameter.enabled && (parameter.reason ?? '') === INACTIVE_REASON
/** Groups that start folded: the mesh import is a side path, not the everyday settings. */
const FOLDED_BY_DEFAULT = new Set(['imported_mesh'])

export function ParametersSection() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const gate = useProjectGate()
  const write = useCapability(CAP.projectWrite)
  const meshImport = useCapability(CAP.meshImport)
  const writeBlocked = gate.reason ?? (write.available ? null : write.reason)
  const parameters = snapshot.project.parameters
  const searchId = useId()
  const [meshUnit, setMeshUnit] = useState('')
  const [meshTarget, setMeshTarget] = useState('')
  const [meshMaterial, setMeshMaterial] = useState('')
  useEffect(() => { setMeshUnit(''); setMeshTarget(''); setMeshMaterial('') }, [snapshot.project.id, snapshot.session.user?.id])
  const meshTargets = snapshot.project.importedMesh.targets ?? snapshot.project.blocks.filter(b => !b.id.startsWith('mesh:')).map(b => ({...b, mainBody:false}))
  const retainedTarget = meshTarget && meshTarget !== '@main-body' && !meshTarget.startsWith('mesh:') && !meshTargets.some(b => b.id === meshTarget)
  const meshOperation = parameters.find(p => p.id === 'impOp')?.value
  const separatePart = meshOperation === 'them'
  const meshOperationReason = separatePart || meshOperation === 'han' || meshOperation === 'tru' ? null : 'Chọn cách áp dụng khối nhập.'

  const groups = useMemo(() => {
    const visible = parameters.filter((parameter) => parameter.visible)
    const byGroup = new Map<string, ParameterView[]>()
    for (const parameter of visible) {
      const list = byGroup.get(parameter.group) ?? []
      list.push(parameter)
      byGroup.set(parameter.group, list)
    }
    const rank = (id: string) => {
      const index = GROUP_ORDER.indexOf(id)
      return index === -1 ? GROUP_ORDER.length : index
    }
    const ids = [...byGroup.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    return ids.map((id) => ({ id, all: byGroup.get(id) ?? [] }))
  }, [parameters])

  const filtered = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          rows: group.all.filter((parameter) => {
            // The compact view is the everyday one: advanced rows and rows the
            // current choices switch off stay out of it. Their values are kept,
            // the note below says how many there are, and "Mở hết" shows them.
            if (state.paramMode === 'compact' && (parameter.advanced || isInactive(parameter))) return false
            if (state.paramQuery.trim() === '') return true
            const haystack = `${parameter.label} ${parameter.id} ${GROUP_LABEL[group.id] ?? group.id}`
            return matchesAllWords(haystack, state.paramQuery)
          }),
        }))
        // A group with no matching row is hidden outright while filtering.
        .filter((group) => group.rows.length > 0),
    [groups, state.paramMode, state.paramQuery],
  )

  const groupIds = groups.map((group) => group.id)
  const hiddenAdvanced = groups.reduce(
    (sum, group) => sum + group.all.filter((parameter) => parameter.advanced).length,
    0,
  )
  const hiddenInactive = groups.reduce(
    (sum, group) => sum + group.all.filter((parameter) => !parameter.advanced && isInactive(parameter)).length,
    0,
  )

  const importMesh = useAsyncAction(async () => {
    const file = await chooseFile(ACCEPT_MESH)
    if (!file) return
    return bridge.importFile(file, 'mesh')
  }, { success: 'Đã nhận tệp lưới. Bấm Áp dụng để ghép vào mô hình.' })

  // UI-C02: both Apply buttons send the same mesh.apply command, and the dirty
  // state is the list of unapplied fields the core publishes — never a counter
  // the interface keeps for itself.
  const applyMesh = useAsyncAction(async () => {
    await run({ type: 'mesh.apply', unit: meshUnit, ...(!separatePart ? { targetId: meshTarget } : {}), ...(meshMaterial ? { materialId: meshMaterial } : {}) }, { success: 'Đã gửi lệnh áp dụng khối nhập.' })
  })

  const mesh = snapshot.project.importedMesh
  const unapplied = mesh.unappliedFields
  const dirty = unapplied.length > 0

  const applyButton = (position: 'top' | 'bottom') => (
    <div className="row" key={position}>
      <Button
        variant={dirty ? 'primary' : 'default'}
        icon="check"
        style={dirty ? { borderColor: 'var(--warn)', background: 'var(--warn)', color: '#241503' } : undefined}
        disabled={applyMesh.pending}
        disabledReason={
          writeBlocked ?? meshOperationReason ?? (mesh.present ? !meshUnit ? 'Chọn đơn vị của tệp nhập.' : separatePart && !meshMaterial ? 'Chọn vật liệu cho phần nhập rời.' : !separatePart && !meshTarget ? 'Chọn khối đích cần hàn hoặc trừ.' : null : 'Chưa có khối nhập nào để áp dụng.')
        }
        onClick={() => void applyMesh.run()}
      >
        Áp dụng khối nhập
      </Button>
      {dirty ? (
        <span className="chip chip--warn fc-border">
          Chưa áp dụng ({unapplied.length} thay đổi)
        </span>
      ) : null}
    </div>
  )

  if (parameters.length === 0) {
    // Two different causes, two different sentences. With no document the list
    // is empty because there is no project to publish parameters for — not
    // because a source or a product type is missing.
    return gate.hasProject ? (
      <div className="empty">
        <strong className="empty__title">Chưa có thông số nào được công bố</strong>
        <p className="muted" style={{ margin: 0 }}>
          Nhân công bố nhóm thông số sau khi có nguồn và loại sản phẩm. Giá trị bạn đã đặt vẫn được
          giữ ngay cả khi hàng đang ẩn.
        </p>
        <Button icon="image" onClick={() => actions.setSection('source', true)}>
          Mở khu Ảnh nguồn
        </Button>
      </div>
    ) : (
      <div className="empty">
        <strong className="empty__title">Chưa mở dự án nào</strong>
        <p className="muted" style={{ margin: 0 }}>
          {gate.reason}
        </p>
        <Button icon="plus" onClick={() => actions.setSection('source', true)}>
          Tới bước tạo dự án
        </Button>
      </div>
    )
  }

  return (
    <div className="stack">
      <TextField
        inputId={searchId}
        label="Lọc thông số"
        type="search"
        value={state.paramQuery}
        placeholder="Tên thông số, tìm được khi bỏ dấu"
        onChange={actions.setParamQuery}
      />

      <div className="row" role="group" aria-label="Hiển thị nhóm thông số">
        <Button
          size="small"
          aria-pressed={state.paramMode === 'all'}
          icon={state.paramMode === 'all' ? 'eye' : 'filter'}
          onClick={() => actions.setParamMode(state.paramMode === 'all' ? 'compact' : 'all')}
        >
          {state.paramMode === 'all' ? 'Đang hiện tất cả' : 'Đang gọn'}
        </Button>
        <Button size="small" icon="chevronDown" onClick={() => actions.setAllGroups(groupIds, false)}>
          Mở hết
        </Button>
        <Button size="small" icon="chevronUp" onClick={() => actions.setAllGroups(groupIds, true)}>
          Thu gọn
        </Button>
      </div>
      {state.paramMode === 'compact' && hiddenAdvanced + hiddenInactive > 0 ? (
        <p className="muted-3" style={{ margin: 0 }} data-hidden-rows={hiddenAdvanced + hiddenInactive}>
          Chế độ gọn đang ẩn {hiddenAdvanced} điều khiển nâng cao
          {hiddenInactive > 0 ? ` và ${hiddenInactive} điều khiển không hiệu lực với lựa chọn hiện tại` : ''}.
          Giá trị của chúng vẫn được giữ.
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <div className="empty">
          <strong className="empty__title">Không có thông số nào khớp</strong>
          <p className="muted" style={{ margin: 0 }}>
            Bỏ bớt từ khóa, hoặc bật “Đang hiện tất cả” nếu điều khiển bạn tìm nằm ngoài chế độ gọn.
          </p>
          <Button icon="close" onClick={() => actions.setParamQuery('')}>
            Xóa bộ lọc
          </Button>
        </div>
      ) : null}

      {filtered.map((group) => {
        const derivedRows = group.rows.some((parameter) => parameter.derivedLabel)
        return (
        <CollapsibleGroup
          key={group.id}
          title={GROUP_LABEL[group.id] ?? group.id}
          color={GROUP_COLOR[group.id] ?? 'var(--ln2)'}
          open={isGroupOpen(state, group.id, !FOLDED_BY_DEFAULT.has(group.id))}
          onToggle={() => actions.setGroupOpen(group.id, !isGroupOpen(state, group.id, !FOLDED_BY_DEFAULT.has(group.id)))}
          count={`${group.rows.length}/${group.all.length}`}
          note={
            group.id === 'imported_mesh' ? (
              <div className="stack">
                <p className="muted" style={{ margin: 0 }}>
                  Ghép một lưới STL hoặc OBJ vào mô hình. Tệp gốc luôn được giữ; cách ghép và vật
                  liệu cần xác nhận trước khi nhân áp dụng.
                </p>
                <Button
                  icon="upload"
                  disabled={importMesh.pending}
                  disabledReason={
                    writeBlocked ?? (meshImport.available ? null : meshImport.reason)
                  }
                  onClick={() => void importMesh.run()}
                >
                  Chọn tệp STL hoặc OBJ
                </Button>
                <div className="row">
                  <span className="chip chip--muted fc-border">
                    {mesh.present ? 'Đã nhận khối nhập' : 'Chưa có khối nhập'}
                  </span>
                  {mesh.triangles === undefined ? null : (
                    <span className="chip chip--muted fc-border">
                      {formatNumber(mesh.triangles, 0)} tam giác
                    </span>
                  )}
                  {mesh.boundsMm === undefined ? null : (
                    <span className="chip chip--muted fc-border">
                      {mesh.boundsMm.map((value) => formatNumber(value)).join(' × ')} mm
                    </span>
                  )}
                </div>
                {mesh.present ? (
                  <>
                    <label className="stack">Đơn vị của tệp nhập
                      <select className="select" value={meshUnit} onChange={e => setMeshUnit(e.target.value)} disabled={!!writeBlocked}>
                        <option value="">Chọn đơn vị…</option>
                        <option value="millimeter">Milimét (mm)</option><option value="centimeter">Centimét (cm)</option>
                        <option value="meter">Mét (m)</option><option value="inch">Inch</option><option value="foot">Foot</option><option value="micron">Micromét (µm)</option>
                      </select>
                    </label>
                    {!separatePart ? <label className="stack">Khối đích
                      <select className="select" value={meshTarget} onChange={e => setMeshTarget(e.target.value)} disabled={!!writeBlocked}>
                        <option value="">Chọn khối đích…</option>
                        <option value="@main-body" disabled={meshTargets.filter(b => b.mainBody).length !== 1}>Thân chính của sản phẩm</option>
                        {retainedTarget ? <option value={meshTarget}>Đích đã chọn trong mô hình gốc</option> : null}
                        {meshTargets.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                      </select>
                    </label> : null}
                    <label className="stack">Vật liệu của khối nhập
                      <select className="select" value={meshMaterial} onChange={e => setMeshMaterial(e.target.value)} disabled={!!writeBlocked}>
                        <option value="">{separatePart ? 'Chọn vật liệu…' : 'Dùng vật liệu khối đích'}</option>
                        {snapshot.project.materials.filter(m => !m.excluded && m.product?.active !== false).map(m => <option key={m.id} value={m.id}>{materialName(m)}</option>)}
                      </select>
                    </label>
                    <p className="muted-3" style={{ margin: 0 }}>{separatePart ? 'Thêm khối nhập thành phần riêng và giữ nguyên các khối đã dựng.' : 'Chọn thân chính hoặc một khối trong mô hình đã dựng.'}</p>
                    {applyButton('top')}
                    {dirty ? (
                      <span className="reason">
                        Thông số chưa áp dụng: {unapplied.join(', ')}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null
          }
        >
          {group.rows.map((parameter) => (
            <ParameterRow key={parameter.id} parameter={parameter} writeBlocked={writeBlocked} />
          ))}
          {group.id === 'imported_mesh' && mesh.present ? applyButton('bottom') : null}
          {derivedRows ? (
            <p className="muted-3" style={{ margin: 0 }}>
              Số mm ≈ do nhân suy từ lịch lớp; chưa xác minh hình học và độ khớp.
            </p>
          ) : null}
        </CollapsibleGroup>
        )
      })}

      <p className="muted-3" style={{ margin: 0 }}>
        Ô số nhận cả dấu phẩy và dấu chấm thập phân; giá trị được gửi nguyên văn cho nhân.
      </p>
    </div>
  )
}
