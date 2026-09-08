import { useMemo } from 'react'
import type { ExportPrerequisite } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useCapability, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import {
  exportPrerequisite,
  exportReasonText,
  modelIsStale,
  PREREQUISITE_LABEL,
  PREREQUISITE_NOTE,
  visibleModelNote,
} from '../core/project-state.ts'
import { Button } from '../components/Button.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { VERDICT_LABEL } from '../core/text.ts'
import { exportConfiguration, hasExportConfiguration } from '../core/export-config.ts'
import { ExportConfiguration } from './ExportConfiguration.tsx'
import { ExportReceipts } from './ExportReceipts.tsx'
import { GROUP_COLOR, GROUP_LABEL, ParameterRow } from './ParameterRow.tsx'
import { PrinterPicker } from './PrinterPicker.tsx'

/**
 * The refusal codes contract 0.3 names for an export gate. The list is the
 * contract's, not a wish list of the interface: a code the contract does not
 * define is not described here as if the core published it. What a *given*
 * option is actually refused for arrives on that option as `reasonCode`.
 */
const REASON_CODES: readonly { id: string; text: string }[] = [
  { id: 'PROJECT_REQUIRED', text: 'Chưa có dự án nào đang mở.' },
  { id: 'PROJECT_LOCKED', text: 'Kho dữ liệu của dự án đang không cho thao tác này.' },
  { id: 'NO_SNAPSHOT', text: 'Chưa có bản dựng hoàn tất nào.' },
  { id: 'STALE_REVISION', text: 'Mô hình đã dựng thuộc bản sửa cũ hơn dự án hiện tại.' },
  { id: 'UNAPPLIED_MESH_EDIT', text: 'Khối nhập còn thay đổi chưa Áp dụng.' },
  { id: 'UNSUPPORTED_EXPORTER', text: 'Đường xuất hoặc định dạng chưa được đăng ký.' },
  {
    id: 'EXPORT_REQUIREMENT_CHANGED',
    text: 'Điều kiện của đường xuất đổi khi lượt xuất đang chạy, nên nhân không công bố kết quả.',
  },
]

const PREREQUISITE_ORDER: readonly ExportPrerequisite[] = [
  'committed-source',
  'renderer',
  'matching-model',
  'project-bytes',
]

export function ExportSection() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const actions = useUiActions()
  const { state } = useUi()
  const write = useCapability(CAP.projectWrite)
  // Only the export *flags* are project edits. Running an export is a read, and
  // FND-02/DAT-01 keep the rescue path open in a read-only tab.
  const writeBlocked = write.available ? null : write.reason
  const { exports, printer, project } = snapshot

  const exportFlags = useMemo(
    () => project.parameters.filter((parameter) => parameter.group === 'export' && parameter.visible),
    [project.parameters],
  )

  const runExport = useAsyncAction(async (id: string) => bridge.exportFile(id), {
    announce: 'Đã gửi yêu cầu xuất tệp.',
  })

  // Which prerequisites this build actually publishes, in a stable order. Only
  // these are explained: the interface does not lecture about a gate that no
  // registered format is subject to.
  const usedPrerequisites = useMemo(() => {
    const present = new Set(exports.map((option) => exportPrerequisite(option)))
    return PREREQUISITE_ORDER.filter((id) => present.has(id))
  }, [exports])

  const stale = modelIsStale(project)
  const modelLine = visibleModelNote(project)
  // Only say something about export settings when this build actually publishes
  // some. A path with no `configuration` keeps the interface it had.
  const configurable = hasExportConfiguration(exports)

  return (
    <div className="stack">
      <div className="card fc-border">
        <div className="row">
          <strong className="grow">Máy in cho bản xuất</strong>
          <span className="muted-3">{printer.id ? printer.id : 'chưa gắn ID máy'}</span>
        </div>
        <PrinterPicker idPrefix="w3a-export" />
        <Button icon="gear" onClick={() => actions.openDialog({ kind: 'settings' })}>
          Mở cài đặt máy in và hiệu chuẩn
        </Button>
      </div>

      {configurable ? (
        <div className="card fc-border" data-export-config-note>
          <strong>Cài đặt xuất là một lần sửa dự án</strong>
          <p className="muted" style={{ margin: 0 }}>
            Lưu một thiết lập xuất làm dự án sang bản sửa mới, nên mô hình đã dựng có thể trở thành
            bản dựng cũ. Giao diện chỉ đọc trạng thái nhân công bố; nó không tự sửa bản sửa nào để
            mô hình trông như còn khớp.
          </p>
          <p className="muted" style={{ margin: 0 }} data-export-config-model>
            {modelLine ?? 'Nhân chưa giữ mô hình nào, nên chưa có bản sửa mô hình để đối chiếu.'}
          </p>
          <div className="export-chips">
            <span className="chip chip--muted fc-border" data-export-config-project-revision={project.revision}>
              dự án ở bản sửa {project.revision}
            </span>
            {snapshot.job ? (
              <span className="chip chip--muted fc-border" data-export-config-job={snapshot.job.state}>
                nhân đang chạy: {snapshot.job.stage}
              </span>
            ) : (
              <span className="chip chip--muted fc-border" data-export-config-job="none">
                nhân không có lượt xử lý nào đang chạy
              </span>
            )}
          </div>
          {writeBlocked ? <span className="reason">{writeBlocked}</span> : null}
        </div>
      ) : null}

      {exports.length === 0 ? (
        <div className="empty">
          <strong className="empty__title">Chưa có đường xuất nào được công bố</strong>
          <p className="muted" style={{ margin: 0 }}>
            Registry xuất do nhân đăng ký trong bản dựng. Khi chưa có, không có đường xuất nào được
            bật ngầm.
          </p>
        </div>
      ) : (
        <ul className="list-reset stack">
          {exports.map((option) => {
            const risky = option.verdict === 'fail' || option.verdict === 'unverified'
            const label = option.enabled && risky ? 'Xuất để kiểm tra' : 'Xuất'
            const prerequisite = exportPrerequisite(option)
            const configuration = exportConfiguration(option)
            return (
              <li
                key={option.id}
                className="card fc-border"
                style={{ padding: 10 }}
                data-export-option={option.id}
                data-export-prerequisite={prerequisite}
                data-export-enabled={option.enabled ? 'true' : 'false'}
                {...(option.reasonCode ? { 'data-export-reason-code': option.reasonCode } : {})}
              >
                <div className="row">
                  <strong className="grow" style={{ overflowWrap: 'anywhere' }}>
                    {option.label}
                  </strong>
                  <span className="chip chip--muted fc-border">{option.extension}</span>
                  <span
                    className={`chip ${
                      option.verdict === 'pass'
                        ? 'chip--ok'
                        : option.verdict === 'fail'
                          ? 'chip--err'
                          : 'chip--muted'
                    } fc-border`}
                  >
                    {VERDICT_LABEL[option.verdict]}
                  </span>
                </div>
                <div className="prow__id">{option.id}</div>
                {/* Each format states its own gate. A source SVG is not shut
                    because no mesh exists, and a renderer capture is not shut
                    because the mesh is behind the document — contract 0.3 gives
                    each format its own prerequisite and the interface prints
                    the one the core declared rather than assuming a mesh. */}
                <div className="row">
                  <span className="chip chip--muted fc-border">
                    {PREREQUISITE_LABEL[prerequisite]}
                  </span>
                  {option.prerequisite === undefined ? (
                    <span className="muted-3">
                      Nhân chưa khai điều kiện cho đường này, nên giao diện áp mức chặt nhất theo hợp
                      đồng: cần mô hình khớp bản sửa.
                    </span>
                  ) : null}
                </div>
                <div className="row">
                  <Button
                    icon="download"
                    variant={option.enabled && !risky ? 'primary' : 'default'}
                    disabled={runExport.pending}
                    // `reason` is a sentence and `reasonCode` is the code:
                    // contract 0.3 publishes both, so neither is passed through
                    // the other's table. An enabled option carries no reason.
                    disabledReason={
                      option.enabled
                        ? null
                        : exportReasonText(option, 'Đường xuất đang bị chặn.')
                    }
                    onClick={() => void runExport.run(option.id)}
                  >
                    {label}
                  </Button>
                  {!option.enabled && option.reasonCode ? (
                    <code className="diag__code">{option.reasonCode}</code>
                  ) : null}
                </div>
                {option.enabled && risky ? (
                  <p className="muted" style={{ margin: 0, color: 'var(--warn)' }}>
                    ⚠ Bản xuất để kiểm tra: serializer viết được tệp hợp lệ, nhưng kết quả kiểm hình
                    học là “{VERDICT_LABEL[option.verdict]}”. Nhãn này không bảo đảm in được.
                  </p>
                ) : null}
                {/* A renderer capture over a stale lease is a picture of the
                    older model. Saying so is the contract's requirement, not a
                    reason to disable the format. */}
                {option.enabled && prerequisite === 'renderer' && stale ? (
                  <p className="muted" style={{ margin: 0, color: 'var(--warn)' }}>
                    ⚠ Ảnh chụp lấy đúng mô hình đang hiển thị, và mô hình đó thuộc bản dựng cũ. Tệp
                    này không phải hình của thiết kế hiện tại.
                  </p>
                ) : null}
                {/* The settings a path publishes stay readable and correctable
                    while the path itself is shut for some other cause: a format
                    refused for a missing mesh is exactly when a person needs to
                    fix the name or the orientation it will use. */}
                {configuration ? (
                  <ExportConfiguration
                    option={option}
                    configuration={configuration}
                    writeBlocked={writeBlocked}
                  />
                ) : null}
                {configuration && risky ? (
                  <p className="muted-3" style={{ margin: 0 }} data-export-intent-note>
                    Nhãn trên nút chỉ mô tả kết quả kiểm của đường xuất này. Ý định “xuất để kiểm
                    tra” là một thiết lập ở trên, do nhân công bố; bấm nút không bật nó thay bạn.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      <ExportReceipts />

      {exportFlags.length > 0 ? (
        <CollapsibleGroup
          title={GROUP_LABEL.export ?? 'Tùy chọn xuất'}
          color={GROUP_COLOR.export ?? 'var(--sec-export)'}
          open={isGroupOpen(state, 'export-flags')}
          onToggle={() => actions.setGroupOpen('export-flags', !isGroupOpen(state, 'export-flags'))}
          count={`${exportFlags.length} điều khiển`}
        >
          {exportFlags.map((parameter) => (
            <ParameterRow key={parameter.id} parameter={parameter} writeBlocked={writeBlocked} />
          ))}
          <p className="muted-3" style={{ margin: 0 }}>
            Cùng các điều khiển này cũng nằm trong khu Thông số, nhóm “Tùy chọn xuất”. Hai đường
            giao diện gọi cùng một parameter ID nên không có hai nguồn sự thật.
          </p>
        </CollapsibleGroup>
      ) : null}

      <CollapsibleGroup
        title="Điều kiện và cửa chặn xuất"
        color="var(--sec-export)"
        open={isGroupOpen(state, 'export-gates', false)}
        onToggle={() =>
          actions.setGroupOpen('export-gates', !isGroupOpen(state, 'export-gates', false))
        }
        count={`${usedPrerequisites.length} điều kiện · ${REASON_CODES.length} mã`}
      >
        <p className="muted" style={{ margin: 0 }}>
          Mỗi đường xuất chỉ áp đúng điều kiện của dữ liệu nó đọc. Chỉ nhóm “cần mô hình khớp bản
          sửa” phụ thuộc vào lưới đã dựng của bản sửa hiện tại; các nhóm khác không bị chặn vì chưa
          dựng hoặc vì mô hình đang hiển thị thuộc bản dựng cũ.
        </p>
        {modelLine ? (
          <p className="muted" style={{ margin: 0 }} data-model-line>
            {modelLine}
          </p>
        ) : (
          <p className="muted" style={{ margin: 0 }} data-model-line>
            Nhân chưa giữ mô hình nào, nên chưa có bản sửa mô hình để đối chiếu.
          </p>
        )}
        <ul className="list-reset stack">
          {usedPrerequisites.map((id) => (
            <li key={id} className="stack" data-prerequisite={id}>
              <div className="row">
                <span className="chip chip--muted fc-border">{PREREQUISITE_LABEL[id]}</span>
                <code className="diag__code grow">{id}</code>
              </div>
              <span className="muted">{PREREQUISITE_NOTE[id]}</span>
            </li>
          ))}
        </ul>
        <div className="divider" />
        <p className="muted" style={{ margin: 0 }}>
          Mã từ chối theo hợp đồng 0.3. Mã áp cho một đường xuất cụ thể nằm ngay trên đường đó.
        </p>
        <ul className="list-reset stack">
          {REASON_CODES.map((gate) => (
            <li key={gate.id} className="row">
              <code className="diag__code">{gate.id}</code>
              <span className="muted grow">{gate.text}</span>
            </li>
          ))}
        </ul>
      </CollapsibleGroup>

      <p className="muted-3" style={{ margin: 0 }}>
        STL không lưu đơn vị hay màu; tệp xuất theo mm và kèm bảng kê tệp ↔ khe. Bảng tầng và bảng
        kê chi tiết do nhân trả về cùng artifact sau khi xuất.
      </p>
    </div>
  )
}
