import { useEffect, useState } from 'react'
import { useAsyncAction, useBridge, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { projectIdentity } from '../core/identity.ts'
import { exportReasonText, findRescueExport } from '../core/project-state.ts'
import { ACCEPT_PROJECT, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { TextField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { CreateProjectCard } from './CreateProjectCard.tsx'
import { SavedProjectList } from './SavedProjectList.tsx'

/**
 * The project itself: its name, whether it is saved, the other projects of
 * this account and the rescue package. Settings, AI connections and help live
 * in the account and help menus of the top bar, not here.
 */
export function LibrarySection() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const write = useCapability(CAP.projectWrite)
  const mirror = useCapability(CAP.mirror)
  const writeBlocked = write.available ? null : write.reason
  const { library, project, exports, session } = snapshot

  /**
   * The rename box belongs to one document of one account. Both the draft and
   * the refusal shown next to it are keyed on that identity: a rename refused
   * for the project that was open is not a fact about the project open now.
   */
  const identity = projectIdentity(snapshot)
  const [name, setName] = useState(project.name)

  useEffect(() => {
    setName(project.name)
    // `identity` is a dependency on purpose: two projects can share a name, and
    // switching between them must still drop the draft.
  }, [identity, project.name])

  const saveProject = useAsyncAction(async () => {
    await run({ type: 'project.save' }, { success: 'Đã lưu dự án.' })
  })

  const importProject = useAsyncAction(
    async () => {
      const file = await chooseFile(ACCEPT_PROJECT)
      if (!file) return
      return bridge.importFile(file, 'project')
    },
    { success: 'Đã mở gói dự án.' },
  )

  /**
   * The rescue package (FND-02). The controller publishes it as `project` with
   * the extension `arch-project.zip`; the option is picked out of the published
   * list by meaning and then called by its own id. `exportFile` gates it on the
   * store's rescue capability alone — never on `project.write` — so a session
   * whose lease has expired can still get its work out.
   */
  const rescueExport = findRescueExport(exports)
  const exportRescue = useAsyncAction(
    async () => (rescueExport ? bridge.exportFile(rescueExport.id) : undefined),
    { announce: 'Đã gửi yêu cầu xuất gói dự án.' },
  )
  const rescueBlocked = rescueExport
    ? rescueExport.enabled
      ? null
      : exportReasonText(rescueExport, 'Chưa xuất được gói dự án cho dự án này.')
    : 'Bản dựng này chưa công bố đường xuất gói dự án.'

  /**
   * When the session can no longer own design work, this group holds the only
   * action left that matters, so it opens by itself.
   */
  const rescueUrgent = session.status === 'expired' || session.status === 'offline-lease'
  const unsaved = project.savedRevision !== project.revision

  return (
    <div className="stack">
      <div className="card fc-border">
        {/* Keyed on the identity, so the field — including the refusal it is
            showing — is a fresh one for a different document or account. */}
        <TextField
          key={identity}
          label="Tên dự án"
          value={name}
          maxLength={120}
          disabledReason={writeBlocked}
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
            {project.savedRevision === null ? ' · chưa từng lưu' : ` · đã lưu ${project.savedRevision}`}
          </span>
        </div>
        <Button
          icon="save"
          variant={unsaved ? 'primary' : 'default'}
          keyHint="Ctrl S"
          disabled={saveProject.pending}
          disabledReason={writeBlocked}
          onClick={() => void saveProject.run()}
        >
          Lưu dự án
        </Button>
        <p className="muted-3" style={{ margin: 0 }}>
          Mỗi thay đổi được ghi vào kho trình duyệt ngay; “Lưu” đánh dấu bản sửa hiện tại là bản đã
          lưu.
        </p>
      </div>

      <CollapsibleGroup
        title="Dự án đã lưu"
        color="var(--sec-library)"
        open={isGroupOpen(state, 'library-list')}
        onToggle={() => actions.setGroupOpen('library-list', !isGroupOpen(state, 'library-list'))}
        count={`${library.length}/40`}
      >
        <SavedProjectList />
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Dự án mới"
        color="var(--sec-library)"
        open={isGroupOpen(state, 'library-create', false)}
        onToggle={() =>
          actions.setGroupOpen('library-create', !isGroupOpen(state, 'library-create', false))
        }
      >
        <CreateProjectCard idPrefix="w3a-create-library" variant="compact" />
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
          {rescueExport ? `Xuất gói dự án (${rescueExport.extension})` : 'Xuất gói dự án'}
        </Button>
        <p className="muted-3" style={{ margin: 0 }}>
          Gói chứa toàn bộ dự án kèm font, ảnh và lưới đã dùng. Xuất được cả khi phiên đã hết hạn,
          miễn là dữ liệu còn trong trình duyệt.
        </p>
        <div className="divider" />
        <Button
          icon="upload"
          disabled={importProject.pending}
          disabledReason={writeBlocked}
          onClick={() => void importProject.run()}
        >
          Mở từ gói dự án
        </Button>
        <Button
          icon="folder"
          disabledReason={mirror.available ? null : mirror.reason}
          onClick={() => actions.openDialog({ kind: 'settings' })}
        >
          Thư mục sao lưu song song
        </Button>
        <p className="muted-3" style={{ margin: 0 }}>
          Gói được kiểm tra toàn vẹn trước khi mở; gói hỏng bị từ chối và không tạo dự án nào.
        </p>
      </CollapsibleGroup>
    </div>
  )
}
