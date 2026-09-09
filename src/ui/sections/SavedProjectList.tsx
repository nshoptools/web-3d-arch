import { useEffect } from 'react'
import { useAsyncAction, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP, PRODUCTS } from '../core/registry.ts'
import { Button } from '../components/Button.tsx'
import { formatBytes, formatDateTime } from '../core/text.ts'

const DELETE_WINDOW_MS = 4000
const PRODUCT_LABEL = new Map(PRODUCTS.map((item) => [item.id, item.label]))

/**
 * The saved projects of this account on this browser, as the core publishes
 * them. One list for the start screen and the library panel, so both offer the
 * same entries, the same two-step delete and the same storage figures.
 */
export function SavedProjectList({
  showStorage = true,
  emptyHint,
}: {
  showStorage?: boolean
  /** Extra sentence for the empty state, when the surface has one to add. */
  emptyHint?: string
}) {
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const { library, storage, project } = snapshot

  useEffect(() => {
    if (!state.armedDelete) return
    const timer = setTimeout(() => actions.armDelete(null), DELETE_WINDOW_MS)
    return () => clearTimeout(timer)
  }, [actions, state.armedDelete])

  const openProject = useAsyncAction(async (id: string) => {
    await run({ type: 'project.open', id }, { announce: 'Đã mở dự án.' })
  })

  const deleteProject = useAsyncAction(async (id: string) => {
    await run({ type: 'project.delete', id, confirmed: true }, { success: 'Đã xóa dự án.' })
    actions.armDelete(null)
  })

  return (
    <div className="stack" data-saved-projects={library.length}>
      {library.length === 0 ? (
        <div className="empty">
          <strong className="empty__title">Chưa có dự án nào được lưu</strong>
          <p className="muted" style={{ margin: 0 }}>
            {emptyHint ??
              'Dự án được lưu trong trình duyệt này, theo đúng địa chỉ đang mở. Một địa chỉ hoặc trình duyệt khác có kho riêng.'}
          </p>
        </div>
      ) : (
        <ul className="list-reset stack" aria-label="Dự án đã lưu">
          {library.map((entry) => {
            const armed = state.armedDelete === `project:${entry.id}`
            const isOpen = entry.id === project.id
            return (
              <li key={entry.id} className="card fc-border project-row" style={{ padding: 10 }} data-project-id={entry.id}>
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
                    <span className="project-row__thumb" aria-hidden="true">
                      {(entry.name || '?').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="grow">
                    <strong style={{ overflowWrap: 'anywhere' }}>{entry.name}</strong>
                    <div className="muted-3">
                      {PRODUCT_LABEL.get(entry.product) ?? entry.product} · {formatDateTime(entry.updatedAt)}
                      {entry.sizeBytes === undefined ? '' : ` · ${formatBytes(entry.sizeBytes)}`}
                    </div>
                    {entry.backup ? (
                      <div className="muted-3">
                        Bản sao gần nhất: bản sửa {entry.backup.revision} lúc {formatDateTime(entry.backup.at)}
                      </div>
                    ) : null}
                  </div>
                  {isOpen ? <span className="chip chip--ok fc-border">đang mở</span> : null}
                </div>
                <div className="row">
                  <Button
                    size="small"
                    icon="folder"
                    variant={isOpen ? 'default' : 'primary'}
                    disabled={openProject.pending}
                    disabledReason={writeBlocked}
                    reasonHidden
                    onClick={() => void openProject.run(entry.id)}
                  >
                    {isOpen ? 'Mở lại' : 'Mở'}
                  </Button>
                  <Button
                    size="small"
                    icon="trash"
                    variant={armed ? 'danger' : 'default'}
                    disabled={deleteProject.pending}
                    disabledReason={writeBlocked}
                    reasonHidden
                    onClick={() => {
                      if (armed) void deleteProject.run(entry.id)
                      else actions.armDelete(`project:${entry.id}`)
                    }}
                  >
                    {armed ? 'Xóa?' : 'Xóa'}
                  </Button>
                  {armed ? (
                    <span className="muted-3" role="status">
                      Bấm “Xóa?” lần nữa trong 4 giây để xóa hẳn. Esc để hủy.
                    </span>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {writeBlocked ? <span className="reason">{writeBlocked}</span> : null}
      {showStorage ? (
        <div className="row">
          <span className="chip chip--muted fc-border">
            Kho trình duyệt: {formatBytes(storage.usedBytes)}
            {storage.quotaBytes === null ? '' : ` / ${formatBytes(storage.quotaBytes)}`} (ước lượng)
          </span>
          {storage.warning ? <span className="reason">{storage.warning}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
