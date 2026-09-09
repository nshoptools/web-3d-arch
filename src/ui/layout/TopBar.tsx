import { useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUi, useUiActions } from '../core/ui-state.tsx'
import { MQ_COMPACT, useMediaQuery } from '../core/useMediaQuery.ts'
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
/** The same two steps where the long words cost a whole row (≤ 1400 px). */
const STEP_SHORT: Record<1 | 2, string> = {
  1: 'Nguồn',
  2: '3D',
}

/**
 * The one bar that is on screen in both states of the interface.
 *
 * On the start screen it carries only identity: brand, network state, help and
 * account. With a project open it adds the project name with its save state,
 * the two step chips, quick search and exactly one primary action — the thing
 * to do next (build, rebuild, open the model, export). No action here is
 * repeated elsewhere on the same screen.
 *
 * Above 1180 px the bar is one row and its height never changes: what does
 * not fit folds into an icon with an accessible name, never onto a second
 * row, so switching sections never moves the frame below it (UI-01).
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
  const { state } = useUi()
  const compact = useMediaQuery(MQ_COMPACT)
  // With the export panel already on screen, its per-format buttons are the
  // action; a second "export" button here would be the same action twice on
  // one screen (UI-01). The bar keeps the shortcut binding, not the button.
  const panelShowsExport =
    state.section === 'export' && (compact ? state.drawerOpen : !state.panelCollapsed)
  const showAdvance = projectOpen && !(nav.advanceKind === 'export' && panelShowsExport)

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
                    title={
                      value === 1 && step === 2
                        ? nav.backNote
                        : `Bước ${value} · ${STEP_LABEL[value]} · ${status}`
                    }
                    onClick={() => nav.goToStep(value)}
                  >
                    <span className="topbar__step-long">
                      Bước {value} · {STEP_LABEL[value]}
                    </span>
                    <span className="topbar__step-short" aria-hidden="true">
                      {value} · {STEP_SHORT[value]}
                    </span>
                    {/* UI-01: the state is carried by a word as well as by the
                        icon and the colour, never by colour alone. */}
                    <span className="chip chip--muted fc-border topbar__step-status">{status}</span>
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
            aria-label="Tìm nhanh"
            title="Tìm nhanh thông số, lệnh, mẫu, công cụ (Ctrl K)"
          >
            <span className="topbar__search-label">Tìm nhanh</span>
          </Button>
        ) : null}

        <span
          className={`chip ${snapshot.online ? 'chip--ok' : 'chip--warn'} fc-border topbar__online`}
          data-online={snapshot.online ? 'true' : 'false'}
          title={snapshot.online ? 'Đang trực tuyến' : 'Đang ngoại tuyến'}
          role="status"
        >
          <Icon name={snapshot.online ? 'online' : 'offline'} size={14} />
          <span className="topbar__online-label">{snapshot.online ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
        </span>

        {projectOpen && step === 2 && nav.modelStale ? (
          <Button
            size="small"
            icon="cube"
            disabledReason={nav.busy ? 'Nhân đang chạy một việc. Chờ xong hoặc bấm Hủy trong khung xem.' : null}
            reasonHidden
            data-rebuild="true"
            onClick={() => void run({ type: 'geometry.build' }, { announce: 'Đã gửi lệnh dựng lại 3D.' })}
          >
            Dựng lại 3D
          </Button>
        ) : null}

        {showAdvance ? (
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
                  : nav.advanceKind === 'source-step'
                    ? 'refresh'
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
