import { useAsyncAction, useBridge, useCapability, useSnapshot } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { ACCEPT_PROJECT, chooseFile } from '../core/file-dialog.ts'
import { useRebuildAfterOpen } from '../core/open-project.ts'
import { Button } from '../components/Button.tsx'
import { CreateProjectCard } from '../sections/CreateProjectCard.tsx'
import { SavedProjectList } from '../sections/SavedProjectList.tsx'

/**
 * The state before any project is open.
 *
 * Nothing in the workspace can act without a project — the core answers every
 * source, parameter and save command with PROJECT_REQUIRED — so instead of
 * showing six empty sections around a blurred stage, the interface shows the
 * only two things that can happen next: create a project, or open one. The
 * workspace with its rail, panel and stage appears once the core publishes a
 * project id (see AppShell).
 */
export function StartScreen() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const actions = useUiActions()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason
  const { session, library } = snapshot

  const rebuild = useRebuildAfterOpen()
  const importProject = useAsyncAction(
    async () => {
      const file = await chooseFile(ACCEPT_PROJECT)
      if (!file) return
      const result = await bridge.importFile(file, 'project')
      if (!result.ok) return result
      // The package of a project still in the library opens that project and
      // says so as a diagnostic; the success sentence must not claim otherwise.
      const latest = bridge.getSnapshot().diagnostics.at(-1)
      if (latest?.code === 'PACKAGE_PROJECT_EXISTS') {
        actions.toast('info', latest.message)
        await rebuild()
        return
      }
      await rebuild()
      return result
    },
    { success: 'Đã mở gói dự án.', announce: 'Đã mở gói dự án.' },
  )

  if (session.status === 'checking') {
    return (
      <main className="start app__stage" id="w3a-main" tabIndex={-1} aria-label="Màn hình bắt đầu">
        <div className="start__inner start__inner--narrow">
          <div className="card fc-border start__card" role="status">
            <strong className="card__title">Đang kiểm tra phiên đăng nhập…</strong>
            <p className="muted" style={{ margin: 0 }}>
              Ứng dụng đang hỏi máy chủ xem bạn đã đăng nhập chưa. Việc này thường mất chưa tới một
              giây.
            </p>
          </div>
        </div>
      </main>
    )
  }

  if (session.status === 'signed-out' || session.status === 'expired') {
    const expired = session.status === 'expired'
    return (
      <main className="start app__stage" id="w3a-main" tabIndex={-1} aria-label="Màn hình bắt đầu">
        <div className="start__inner start__inner--narrow">
          <header className="start__head">
            <h1 className="start__title">{expired ? 'Phiên đã hết hạn' : 'Đăng nhập để bắt đầu'}</h1>
            <p className="start__lead">
              {expired
                ? 'Đăng nhập lại để tiếp tục thiết kế. Dự án đã lưu trong trình duyệt này vẫn còn nguyên.'
                : 'Đây là ứng dụng nội bộ: không có đăng ký công khai và không có mật khẩu riêng của website. Việc đăng nhập đi qua nhà cung cấp định danh của nhóm, ngay trên tab này.'}
            </p>
          </header>
          <div className="card fc-border start__card">
            <Button
              variant="primary"
              icon="user"
              onClick={() => actions.openDialog({ kind: 'sign-in', mode: expired ? 'reauth' : 'sign-in' })}
            >
              {expired ? 'Đăng nhập lại' : 'Đăng nhập'}
            </Button>
            {library.length > 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                {library.length} dự án đã lưu sẽ hiện ra sau khi đăng nhập.
              </p>
            ) : null}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="start app__stage" id="w3a-main" tabIndex={-1} aria-label="Màn hình bắt đầu">
      <div className="start__inner">
        <header className="start__head">
          <h1 className="start__title">Bắt đầu</h1>
          <p className="start__lead">
            Chọn loại sản phẩm, thêm ảnh, chữ hoặc emoji, dựng mô hình 3D rồi xuất tệp để in.
          </p>
        </header>

        <div className="start__grid">
          <section className="card fc-border start__card" aria-labelledby="w3a-start-create-title">
            <h2 id="w3a-start-create-title" className="card__title" style={{ margin: 0 }}>
              Tạo dự án mới
            </h2>
            <CreateProjectCard variant="start" idPrefix="w3a-create-project" />
          </section>

          <section className="card fc-border start__card" aria-labelledby="w3a-start-open-title">
            <h2 id="w3a-start-open-title" className="card__title" style={{ margin: 0 }}>
              Mở dự án đã lưu
            </h2>
            <SavedProjectList showStorage={library.length > 0} />
            <div className="divider" />
            <Button
              icon="upload"
              disabled={importProject.pending}
              disabledReason={writeBlocked}
              onClick={() => void importProject.run()}
            >
              {importProject.pending ? 'Đang mở gói…' : 'Mở từ gói dự án (.arch-project.zip)'}
            </Button>
            <p className="muted-3" style={{ margin: 0 }}>
              Gói dự án là bản sao lưu do chính ứng dụng này xuất ra. Nội dung được kiểm tra toàn vẹn
              trước khi mở; gói hỏng sẽ bị từ chối và không tạo dự án nào.
            </p>
          </section>
        </div>

      </div>
    </main>
  )
}
