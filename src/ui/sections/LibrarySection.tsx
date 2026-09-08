import { useEffect, useState } from 'react'
import { useAsyncAction, useBridge, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP, PRODUCTS } from '../core/registry.ts'
import { projectIdentity } from '../core/identity.ts'
import {
  exportReasonText,
  findRescueExport,
  hasProject,
  NO_PROJECT_REASON,
} from '../core/project-state.ts'
import { ACCEPT_PROJECT, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { TextField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { CreateProjectCard } from './CreateProjectCard.tsx'
import { formatBytes, formatDateTime } from '../core/text.ts'

const DELETE_WINDOW_MS = 4000
const PRODUCT_LABEL = new Map(PRODUCTS.map((item) => [item.id, item.label]))

export function LibrarySection() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const write = useCapability(CAP.projectWrite)
  const mirror = useCapability(CAP.mirror)
  const writeBlocked = write.available ? null : write.reason
  const { library, project, exports, storage, session } = snapshot
  const projectOpen = hasProject(project)
  /** Commands on *this* project need a project first, then write access. */
  const projectBlocked = !projectOpen ? NO_PROJECT_REASON : writeBlocked

  /**
   * The rename box belongs to one document of one account. Both the draft and
   * the refusal shown next to it are keyed on that identity: a rename refused
   * for the project that was open is not a fact about the project open now, and
   * a name typed for one project is not a name for another that happens to be
   * called the same thing.
   */
  const identity = projectIdentity(snapshot)
  const [name, setName] = useState(project.name)

  useEffect(() => {
    setName(project.name)
    // `identity` is a dependency on purpose: two projects can share a name, and
    // switching between them must still drop the draft.
  }, [identity, project.name])

  useEffect(() => {
    if (!state.armedDelete) return
    const timer = setTimeout(() => actions.armDelete(null), DELETE_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [actions, state.armedDelete])

  const saveProject = useAsyncAction(async () => {
    await run({ type: 'project.save' }, { success: 'Đã ghi nhận commit lưu dự án.' })
  })

  const openProject = useAsyncAction(async (id: string) => {
    await run({ type: 'project.open', id })
  })

  const deleteProject = useAsyncAction(async (id: string) => {
    await run({ type: 'project.delete', id, confirmed: true }, { success: 'Đã xóa dự án.' })
    actions.armDelete(null)
  })

  const importProject = useAsyncAction(
    async () => {
      const file = await chooseFile(ACCEPT_PROJECT)
      if (!file) return
      return bridge.importFile(file, 'project')
    },
    { success: 'Đã nhận gói dự án.' },
  )

  /**
   * The rescue package (FND-02). The controller publishes it as `project` with
   * the extension `arch-project.zip` and still answers to two older ids, so the
   * option is picked out of the published list by meaning and then called by its
   * own id. `exportFile` gates it on the store's rescue capability alone — never
   * on `project.write` — so a session whose lease has expired can still get its
   * work out, and this button must not add a gate the core does not have.
   */
  const rescueExport = findRescueExport(exports)
  const exportRescue = useAsyncAction(
    async () => (rescueExport ? bridge.exportFile(rescueExport.id) : undefined),
    { announce: 'Đã gửi yêu cầu xuất gói dự án.' },
  )
  const rescueBlocked = rescueExport
    ? rescueExport.enabled
      ? null
      : exportReasonText(
          rescueExport,
          projectOpen
            ? 'Nhân đang không mở đường cứu gói dự án cho dự án này.'
            : 'Gói cứu đóng gói dự án đang mở; hiện chưa có dự án nào được mở.',
        )
    : 'Snapshot hiện tại không công bố đường xuất gói dự án nào.'

  /**
   * When the session can no longer own design work, this group holds the only
   * action left that matters, so it opens by itself instead of hiding behind a
   * collapsed header. A user who folds it keeps that choice.
   */
  const rescueUrgent = session.status === 'expired' || session.status === 'offline-lease'

  const unsaved = projectOpen && project.savedRevision !== project.revision

  return (
    <div className="stack">
      {/* With no document open, `revision 0` and `savedRevision null` are the
          core's placeholders, not this user's work. Claiming "unsaved changes"
          about a project that does not exist would be inventing a fact. */}
      {projectOpen ? (
        <div className="card fc-border">
          {/* Keyed on the identity, so the field — including the refusal it is
              showing — is a fresh one for a different document or account, and
              an answer still in flight for the previous one lands nowhere. */}
          <TextField
            key={identity}
            label="Tên dự án"
            value={name}
            maxLength={120}
            disabledReason={projectBlocked}
            onChange={setName}
            onCommit={async (raw) => {
              if (raw === project.name) return { ok: true }
              const result = await run({ type: 'project.rename', name: raw }, { toastOnError: false })
              return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
            }}
          />
          <div className="row">
            <span className={`chip ${unsaved ? 'chip--warn' : 'chip--ok'} fc-border`}>
              {unsaved ? 'Có thay đổi chưa lưu' : 'Đã lưu'}
            </span>
            <span className="muted-3">
              Bản sửa {project.revision}
              {project.savedRevision === null
                ? ' · chưa từng lưu'
                : ` · đã lưu ${project.savedRevision}`}
            </span>
          </div>
          <Button
            icon="save"
            variant={unsaved ? 'primary' : 'default'}
            keyHint="Ctrl S"
            disabled={saveProject.pending}
            disabledReason={projectBlocked}
            onClick={() => void saveProject.run()}
          >
            Lưu dự án
          </Button>
          <p className="muted-3" style={{ margin: 0 }}>
            “Đã lưu” chỉ hiện sau khi commit được xác nhận. Thao tác trong vài trăm mili giây cuối
            trước sự cố có thể chưa nằm trong commit.
          </p>
        </div>
      ) : (
        <div className="empty">
          <strong className="empty__title">Chưa mở dự án nào</strong>
          <p className="muted" style={{ margin: 0 }}>
            Tên, bản sửa và lệnh lưu thuộc về một dự án đang mở. Tạo một dự án bên dưới, hoặc mở một
            dự án đã lưu trong danh sách.
          </p>
        </div>
      )}

      <CreateProjectCard idPrefix="w3a-create-library" />

      <CollapsibleGroup
        title="Dự án đã lưu"
        color="var(--sec-library)"
        open={isGroupOpen(state, 'library-list')}
        onToggle={() => actions.setGroupOpen('library-list', !isGroupOpen(state, 'library-list'))}
        count={`${library.length}/40`}
      >
        {library.length === 0 ? (
          <div className="empty">
            <strong className="empty__title">Thư viện trống</strong>
            <p className="muted" style={{ margin: 0 }}>
              Nếu bạn từng lưu dự án ở một địa chỉ hoặc cổng khác, kiểm tra lại địa chỉ đó. Giao
              diện không dò dữ liệu ở origin khác và không khẳng định dữ liệu ở đó còn hay mất.
            </p>
          </div>
        ) : (
          <ul className="list-reset stack">
            {library.map((entry) => {
              const armed = state.armedDelete === `project:${entry.id}`
              return (
                <li key={entry.id} className="card fc-border" style={{ padding: 10 }}>
                  <div className="row">
                    {entry.previewUrl ? (
                      <img
                        src={entry.previewUrl}
                        alt=""
                        width={40}
                        height={40}
                        style={{ borderRadius: 'var(--r1)', background: '#fff', objectFit: 'contain' }}
                      />
                    ) : (
                      <span className="chip chip--muted fc-border">chưa có ảnh</span>
                    )}
                    <div className="grow">
                      <strong style={{ overflowWrap: 'anywhere' }}>{entry.name}</strong>
                      <div className="muted-3">
                        {PRODUCT_LABEL.get(entry.product) ?? entry.product} ·{' '}
                        {formatDateTime(entry.updatedAt)}
                        {entry.sizeBytes === undefined
                          ? ''
                          : ` · ${formatBytes(entry.sizeBytes)} (ước lượng)`}
                      </div>
                      {/* UI-C11: whether a copy exists is information from the
                          core, not an assumption about the local commit. */}
                      <div className="muted-3">
                        {entry.backup
                          ? `Bản sao gần nhất: bản sửa ${entry.backup.revision} lúc ${formatDateTime(entry.backup.at)}`
                          : 'Chưa có bản sao nào được xác nhận'}
                      </div>
                    </div>
                  </div>
                  <div className="row">
                    <Button
                      size="small"
                      icon="folder"
                      disabled={openProject.pending}
                      // `open()` runs the same write guard as an edit, so a
                      // locked store blocks it for a stated reason.
                      disabledReason={writeBlocked}
                      onClick={() => void openProject.run(entry.id)}
                    >
                      Mở
                    </Button>
                    <Button
                      size="small"
                      icon="trash"
                      variant={armed ? 'danger' : 'default'}
                      disabled={deleteProject.pending}
                      disabledReason={writeBlocked}
                      onClick={() => {
                        if (armed) void deleteProject.run(entry.id)
                        else actions.armDelete(`project:${entry.id}`)
                      }}
                    >
                      {armed ? 'Xóa?' : 'Xóa'}
                    </Button>
                    {armed ? (
                      <span className="muted-3" role="status">
                        Bấm lại trong 4 giây. Esc hoặc đổi mục sẽ hủy.
                      </span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <div className="row">
          <span className="chip chip--muted fc-border">
            Đang dùng {formatBytes(storage.usedBytes)}
            {storage.quotaBytes === null
              ? ' · hạn mức chưa xác định'
              : ` / ${formatBytes(storage.quotaBytes)}`}
          </span>
          <span className="chip chip--muted fc-border">số ước lượng</span>
        </div>
        {storage.warning ? <span className="reason">{storage.warning}</span> : null}
        <p className="muted-3" style={{ margin: 0 }}>
          Mức dùng và hạn mức của origin do nhân báo. Đây là ước lượng của kho trình duyệt, không
          phải dung lượng ổ đĩa.
        </p>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Sao lưu và gói dự án"
        color="var(--sec-library)"
        open={isGroupOpen(state, 'library-backup', rescueUrgent)}
        onToggle={() =>
          actions.setGroupOpen('library-backup', !isGroupOpen(state, 'library-backup', rescueUrgent))
        }
        count={rescueUrgent ? 'đường cứu dữ liệu' : undefined}
      >
        <Button
          icon="download"
          data-export-rescue={rescueExport?.id ?? 'none'}
          disabled={exportRescue.pending}
          disabledReason={rescueBlocked}
          onClick={() => void exportRescue.run()}
        >
          {rescueExport
            ? `Xuất gói dự án (${rescueExport.extension})`
            : 'Xuất gói dự án'}
        </Button>
        <p className="muted-3" style={{ margin: 0 }}>
          Đường cứu này chỉ phụ thuộc vào kho dữ liệu cục bộ, không phụ thuộc quyền ghi dự án: khi
          phiên hết hạn và không sửa được gì nữa, nút này vẫn lấy được dữ liệu ra nếu nhân còn công
          bố nó là dùng được.
        </p>
        <div className="divider" />
        <Button
          icon="upload"
          disabled={importProject.pending}
          disabledReason={writeBlocked}
          onClick={() => void importProject.run()}
        >
          Nhập gói dự án
        </Button>
        <Button
          icon="folder"
          disabledReason={mirror.available ? null : mirror.reason}
          onClick={() => actions.openDialog({ kind: 'settings' })}
        >
          Thư mục sao lưu song song
        </Button>
        <p className="muted-3" style={{ margin: 0 }}>
          Gói mang đủ font, ảnh và lưới được tham chiếu; nhân kiểm schema, đường dẫn, CRC và
          SHA-256 trước khi cam kết. Lỗi được rollback, không tạo dự án thiếu font.
        </p>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Cài đặt và trợ giúp"
        color="var(--sec-library)"
        open={isGroupOpen(state, 'library-help')}
        onToggle={() => actions.setGroupOpen('library-help', !isGroupOpen(state, 'library-help'))}
      >
        <Button block icon="gear" onClick={() => actions.openDialog({ kind: 'settings' })}>
          Cài đặt cá nhân
        </Button>
        <Button block icon="key" onClick={() => actions.openDialog({ kind: 'ai-connections' })}>
          Kết nối AI
        </Button>
        <Button block icon="coin" onClick={() => actions.openDialog({ kind: 'costs' })}>
          Chi phí của tôi
        </Button>
        <Button block icon="dots" onClick={() => actions.openDialog({ kind: 'diagnostics' })}>
          Nhật ký và chẩn đoán
        </Button>
        <Button block icon="help" onClick={() => actions.openDialog({ kind: 'shortcuts' })}>
          Bảng phím tắt
        </Button>
        <Button block icon="info" onClick={() => actions.openDialog({ kind: 'about' })}>
          Giới thiệu, bản dựng và giấy phép
        </Button>
      </CollapsibleGroup>
    </div>
  )
}
