import { useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { useStepNavigation } from '../core/step-nav.ts'
import { hasProject } from '../core/project-state.ts'
import { Button } from '../components/Button.tsx'
import { Icon } from '../components/Icon.tsx'
import { AccountMenu } from '../account/AccountMenu.tsx'
import { HelpMenu } from './HelpMenu.tsx'

const STEP_LABEL: Record<1 | 2, string> = {
  1: 'Nguồn & màu',
  2: 'Mô hình 3D',
}

/**
 * The one bar that is on screen in both states of the interface.
 *
 * On the start screen it carries only identity: brand, network state, help and
 * account. With a project open it adds the project name with its save state,
 * the two step chips, quick search and exactly one primary action — the thing
 * to do next (build, rebuild, open the model, export). No action here is
 * repeated elsewhere on the same screen.
 */
export function TopBar({ inert = false }: { inert?: boolean }) {
  const snapshot = useSnapshot()
  const actions = useUiActions()
  const run = useRunCommand()
  const nav = useStepNavigation()
  const { project } = snapshot
  const projectOpen = hasProject(project)
  const step = nav.step
  const unsaved = projectOpen && project.savedRevision !== project.revision

  return (
    <header className={`topbar app__top fc-border${projectOpen ? '' : ' topbar--start'}`} inert={inert}>
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true">
          W3
        </span>
        <span className="topbar__names">
          <span className="topbar__name">web&#8209;3d&#8209;arch</span>
          {!projectOpen ? (
            <span className="topbar__sub">Thiết kế chi tiết in 3D nhiều màu từ ảnh, chữ và emoji</span>
          ) : null}
        </span>
      </div>

      {projectOpen ? (
        <>
          <button
            type="button"
            className="topbar__project fc-border"
            title="Mở khu Thư viện: đổi tên, lưu và sao lưu dự án này"
            onClick={() => actions.setSection('library', true)}
          >
            <Icon name="folder" size={15} />
            <span className="topbar__project-name">{project.name || 'Dự án chưa đặt tên'}</span>
            <span className={`chip ${unsaved ? 'chip--warn' : 'chip--muted'} fc-border`} data-project-saved={unsaved ? 'false' : 'true'}>
              {unsaved ? 'chưa lưu' : 'đã lưu'}
            </span>
          </button>

          {/* Step 2 belongs to the model, not to the source: the core only
              accepts `project.step: 2` while it is holding a built model, and a
              successful build is what puts the workspace there. */}
          <ol className="topbar__steps" aria-label="Hai bước thiết kế">
            {([1, 2] as const).map((value) => {
              const isCurrent = step === value
              const blocked = nav.stepReason(value)
              const status = nav.stepStatus(value)
              return (
                <li key={value}>
                  <Button
                    size="small"
                    variant={isCurrent ? 'primary' : 'default'}
                    aria-current={isCurrent ? 'step' : undefined}
                    disabledReason={blocked}
                    reasonHidden
                    data-step-chip={value}
                    data-step-status={status}
                    icon={
                      isCurrent
                        ? 'chevronRight'
                        : blocked
                          ? 'lock'
                          : value === 2 && nav.modelStale
                            ? 'redo'
                            : value === 2
                              ? 'check'
                              : 'chevronLeft'
                    }
                    title={value === 1 && step === 2 ? nav.backNote : undefined}
                    onClick={() => nav.goToStep(value)}
                  >
                    <span>
                      Bước {value} · {STEP_LABEL[value]}
                    </span>
                    {/* UI-01: the state is carried by a word as well as by the
                        icon and the colour, never by colour alone. */}
                    <span className="chip chip--muted fc-border" style={{ marginInlineStart: 4 }}>
                      {status}
                    </span>
                  </Button>
                </li>
              )
            })}
          </ol>
        </>
      ) : null}

      <span className="topbar__spacer" />

      <div className="topbar__tools">
        {projectOpen ? (
          <Button
            size="small"
            icon="search"
            keyHint="Ctrl K"
            onClick={() => actions.openSearch(true)}
            aria-keyshortcuts="Control+K"
          >
            Tìm nhanh
          </Button>
        ) : null}

        <span
          className={`chip ${snapshot.online ? 'chip--ok' : 'chip--warn'} fc-border`}
          title={snapshot.online ? 'Đang trực tuyến' : 'Đang ngoại tuyến'}
        >
          <Icon name={snapshot.online ? 'online' : 'offline'} size={14} />
          {snapshot.online ? 'Trực tuyến' : 'Ngoại tuyến'}
        </span>

        {projectOpen && step === 2 && nav.modelStale ? (
          <Button
            size="small"
            icon="cube"
            disabledReason={nav.busy ? 'Nhân đang chạy một việc. Chờ xong hoặc bấm Hủy trong khung xem.' : null}
            reasonHidden
            onClick={() => void run({ type: 'geometry.build' }, { announce: 'Đã gửi lệnh dựng lại 3D.' })}
          >
            Dựng lại 3D
          </Button>
        ) : null}

        {projectOpen ? (
          // One action, whatever the step needs next: build, rebuild a stale
          // model, open the model that already exists, or export. The label says
          // which, so the button never lies about what it does. The shortcut is
          // advertised here and nowhere else.
          <Button
            size="small"
            variant="primary"
            icon={
              nav.advanceKind === 'open-step2'
                ? 'chevronRight'
                : nav.advanceKind === 'export'
                  ? 'download'
                  : 'cube'
            }
            keyHint="Ctrl ⏎"
            aria-keyshortcuts="Control+Enter"
            data-advance={nav.advanceKind}
            disabledReason={nav.advanceReason}
            reasonHidden
            onClick={() => nav.advance()}
          >
            {nav.advanceLabel}
          </Button>
        ) : null}

        <HelpMenu />
        <AccountMenu />
      </div>
    </header>
  )
}
