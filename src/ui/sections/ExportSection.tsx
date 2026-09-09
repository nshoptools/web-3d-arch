import { useMemo, useState } from 'react'
import type { ExportOption, ExportPrerequisite } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import {
  exportPrerequisite,
  exportReasonText,
  isRescueExport,
  modelIsStale,
  PREREQUISITE_LABEL,
  visibleModelNote,
} from '../core/project-state.ts'
import { Button } from '../components/Button.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { VERDICT_LABEL } from '../core/text.ts'
import { exportConfiguration } from '../core/export-config.ts'
import { ExportConfiguration } from './ExportConfiguration.tsx'
import { ExportReceipts } from './ExportReceipts.tsx'
import { GROUP_COLOR, GROUP_LABEL, ParameterRow } from './ParameterRow.tsx'
import { PrinterPicker } from './PrinterPicker.tsx'

/**
 * The paths a person sees here, grouped by what the file is for. The rescue
 * package belongs to the library and the settings file to the account: both
 * are reachable there and are not listed as ways to export the model.
 */
type ExportGroup = 'print' | 'picture'

const GROUP_TITLE: Record<ExportGroup, string> = {
  print: 'Từ mô hình 3D',
  picture: 'Từ nguồn và khung xem',
}

const GROUP_NOTE: Record<ExportGroup, string> = {
  print: 'Tệp in và mặt cắt, lấy từ mô hình đã dựng khớp bản sửa hiện tại. STL theo mm, không lưu màu; ZIP kèm bảng kê tệp ↔ khe.',
  picture: 'Không cần mô hình: SVG nguồn đọc nguồn đã chốt, ảnh PNG chụp khung xem đang hiển thị.',
}

function groupOf(option: ExportOption): ExportGroup | null {
  if (isRescueExport(option) || option.id === 'settings') return null
  const prerequisite = exportPrerequisite(option)
  if (prerequisite === 'account-settings' || prerequisite === 'project-bytes') return null
  return prerequisite === 'matching-model' ? 'print' : 'picture'
}

/** Whether a mesh verdict is a fact about this path at all. */
function verdictApplies(prerequisite: ExportPrerequisite): boolean {
  return prerequisite === 'matching-model'
}

function fileNameOf(option: ExportOption): string | null {
  const field = option.configuration?.fields.find((item) => item.kind === 'text' && /tên tệp|filename/i.test(item.label))
  return field ? String(field.value) : null
}

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

  const run = useRunCommand()
  /** The last format that produced a file, so the section can say what a download does and does not do. */
  const [exported, setExported] = useState<{ id: string; label: string } | null>(null)
  const runExport = useAsyncAction(
    async (id: string) => {
      const result = await bridge.exportFile(id)
      if (result.ok) setExported({ id, label: exports.find((option) => option.id === id)?.label ?? id })
      return result
    },
    { announce: 'Đã gửi yêu cầu xuất tệp.' },
  )
  const saveProject = useAsyncAction(async () => {
    await run({ type: 'project.save' }, { success: 'Đã lưu dự án.' })
  })
  const unsaved = project.savedRevision !== project.revision

  const stale = modelIsStale(project)
  const modelLine = visibleModelNote(project)
  const hasModel = project.visibleModelRevision !== null

  const groups = useMemo(() => {
    const byGroup: Record<ExportGroup, ExportOption[]> = { print: [], picture: [] }
    for (const option of exports) {
      const group = groupOf(option)
      if (group) byGroup[group].push(option)
    }
    return byGroup
  }, [exports])

  const printerOpen = isGroupOpen(state, 'export-printer', false)

  return (
    <div className="stack">
      {/* What the model on screen is, once, at the top: the one fact every
          print path depends on. */}
      {!hasModel ? (
        <div className="empty" data-export-model="none">
          <strong className="empty__title">Chưa có mô hình để xuất</strong>
          <p className="muted" style={{ margin: 0 }} data-export-config-model>
            Dự án đang ở bản sửa {project.revision}, chưa có mô hình đã dựng. Dựng 3D ở bước 1
            trước; ảnh PNG và SVG nguồn vẫn xuất được mà không cần mô hình.
          </p>
        </div>
      ) : stale ? (
        <div className="card fc-border" data-export-model="stale">
          <strong style={{ color: 'var(--warn)' }}>Mô hình đang hiển thị thuộc bản dựng cũ</strong>
          <p className="muted" style={{ margin: 0 }} data-export-config-model>
            {modelLine} Dựng lại để các đường xuất mô hình mở lại.
          </p>
          <Button
            size="small"
            icon="cube"
            variant="primary"
            disabledReason={snapshot.job ? 'Nhân đang chạy một việc. Chờ xong hoặc bấm Hủy trong khung xem.' : null}
            reasonHidden
            onClick={() => void run({ type: 'geometry.build' }, { announce: 'Đã gửi lệnh dựng lại 3D.' })}
          >
            Dựng lại 3D
          </Button>
        </div>
      ) : (
        <p className="muted-3" style={{ margin: 0 }} data-export-model="current" data-export-config-model>
          {modelLine}
        </p>
      )}

      {/* A downloaded file is not a saved project: the two are different
          things, and the sentence says which one just happened (audit). */}
      {exported ? (
        <div className="card fc-border" role="status" data-export-followup={unsaved ? 'unsaved' : 'saved'}>
          <strong>Đã tải về: {exported.label}</strong>
          <p className="muted" style={{ margin: 0 }}>
            {unsaved
              ? 'Tệp đã nằm trong thư mục tải về, nhưng dự án chưa được lưu. Lưu để giữ bản sửa này trong thư viện.'
              : 'Tệp đã nằm trong thư mục tải về; dự án đã được lưu ở bản sửa hiện tại.'}
          </p>
          {unsaved ? (
            <Button
              size="small"
              icon="save"
              variant="primary"
              keyHint="Ctrl S"
              disabled={saveProject.pending}
              disabledReason={writeBlocked}
              reasonHidden
              onClick={() => void saveProject.run()}
            >
              Lưu dự án
            </Button>
          ) : null}
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
      ) : null}

      {(['print', 'picture'] as const).map((group) =>
        groups[group].length > 0 ? (
          <section key={group} className="stack" aria-labelledby={`w3a-export-group-${group}`} data-export-group={group}>
            <div>
              <h3 id={`w3a-export-group-${group}`} className="panel__title" style={{ margin: 0, ['--section-color' as string]: 'var(--sec-export)' } as never}>
                {GROUP_TITLE[group]}
              </h3>
              <p className="muted-3" style={{ margin: '2px 0 0' }}>{GROUP_NOTE[group]}</p>
            </div>
            <ul className="list-reset stack">
              {groups[group].map((option) => {
                const prerequisite = exportPrerequisite(option)
                const configuration = exportConfiguration(option)
                const verdict = verdictApplies(prerequisite)
                const risky = verdict && (option.verdict === 'fail' || option.verdict === 'unverified')
                const label = option.enabled && risky ? 'Xuất để kiểm tra' : 'Xuất'
                const fileName = fileNameOf(option)
                const groupId = `export-config-${option.id}`
                const configOpen = isGroupOpen(state, groupId, false)
                return (
                  <li
                    key={option.id}
                    data-export-id={option.id}
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
                      {verdict && hasModel ? (
                        <span
                          className={`chip ${
                            option.verdict === 'pass'
                              ? 'chip--ok'
                              : option.verdict === 'fail'
                                ? 'chip--err'
                                : 'chip--muted'
                          } fc-border`}
                          title="Kết quả kiểm mesh của mô hình đang hiển thị"
                        >
                          {VERDICT_LABEL[option.verdict]}
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
                      {fileName ? (
                        <span className="muted-3" style={{ overflowWrap: 'anywhere' }} data-export-filename>
                          {fileName}
                        </span>
                      ) : null}
                    </div>
                    {option.enabled && risky ? (
                      <p className="muted" style={{ margin: 0, color: 'var(--warn)' }}>
                        ⚠ Kết quả kiểm hình học là “{VERDICT_LABEL[option.verdict]}”: tệp viết ra hợp lệ nhưng
                        chưa bảo đảm in được.
                      </p>
                    ) : null}
                    {/* A renderer capture over a stale lease is a picture of the
                        older model. Saying so is the contract's requirement, not a
                        reason to disable the format. */}
                    {option.enabled && prerequisite === 'renderer' && stale ? (
                      <p className="muted" style={{ margin: 0, color: 'var(--warn)' }}>
                        ⚠ Ảnh chụp lấy mô hình đang hiển thị, thuộc bản dựng cũ.
                      </p>
                    ) : null}
                    {/* The settings a path publishes stay readable and correctable
                        while the path itself is shut for some other cause; they
                        start folded, with the file name shown beside the button. */}
                    {configuration ? (
                      <ExportConfiguration
                        option={option}
                        configuration={configuration}
                        writeBlocked={writeBlocked}
                        open={configOpen}
                        onToggle={() => actions.setGroupOpen(groupId, !configOpen)}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null,
      )}

      <CollapsibleGroup
        title="Máy in cho bản xuất"
        color="var(--sec-export)"
        open={printerOpen}
        onToggle={() => actions.setGroupOpen('export-printer', !printerOpen)}
        count={printer.id ? printer.label : 'chưa chọn'}
      >
        <PrinterPicker idPrefix="w3a-export" />
        <Button size="small" icon="gear" onClick={() => actions.openDialog({ kind: 'settings' })}>
          Cài đặt máy in và hồ sơ hiệu chuẩn
        </Button>
      </CollapsibleGroup>

      {exportFlags.length > 0 ? (
        <CollapsibleGroup
          title={GROUP_LABEL.export ?? 'Tùy chọn xuất'}
          color={GROUP_COLOR.export ?? 'var(--sec-export)'}
          open={isGroupOpen(state, 'export-flags', false)}
          onToggle={() => actions.setGroupOpen('export-flags', !isGroupOpen(state, 'export-flags', false))}
          count={`${exportFlags.length} điều khiển`}
        >
          {exportFlags.map((parameter) => (
            <ParameterRow key={parameter.id} parameter={parameter} writeBlocked={writeBlocked} />
          ))}
          <p className="muted-3" style={{ margin: 0 }}>
            Cùng các điều khiển này nằm trong khu Thông số, nhóm “Tùy chọn xuất”.
          </p>
        </CollapsibleGroup>
      ) : null}

      <ExportReceipts />

      <p className="muted-3" style={{ margin: 0 }}>
        Gói cứu hộ dự án nằm ở khu Thư viện; tệp cài đặt cá nhân nằm trong menu tài khoản.
      </p>
    </div>
  )
}
