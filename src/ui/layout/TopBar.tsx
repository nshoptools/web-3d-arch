import { useSnapshot, useAsyncAction, useBridge } from '../core/bridge.tsx'
import { useUiActions } from '../core/ui-state.tsx'
import { useStepNavigation } from '../core/step-nav.ts'
import { NO_PROJECT_REASON } from '../core/project-state.ts'
import { Button } from '../components/Button.tsx'
import { Icon } from '../components/Icon.tsx'
import { ACCEPT_SOURCE, chooseFile } from '../core/file-dialog.ts'
import { AccountMenu } from '../account/AccountMenu.tsx'

const STEP_LABEL: Record<1 | 2, string> = {
  1: 'Nguồn & màu',
  2: 'Mô hình 3D',
}

export function TopBar({ inert = false }: { inert?: boolean }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const actions = useUiActions()
  const nav = useStepNavigation()
  const { session } = snapshot
  const step = nav.step

  const sessionReason =
    session.status === 'signed-in' || session.status === 'offline-lease'
      ? null
      : 'Cần đăng nhập trước khi tải nguồn vào không gian cá nhân.'
  const importBlocked = sessionReason ?? (nav.hasProject ? null : NO_PROJECT_REASON)

  const importSource = useAsyncAction(async () => {
    const file = await chooseFile(ACCEPT_SOURCE)
    if (!file) return
    return bridge.importFile(file, 'source')
  }, { success: 'Đã nhận tệp nguồn.', announce: 'Đã nhận tệp nguồn.' })

  return (
    <header className="topbar app__top fc-border" inert={inert}>
      <div className="topbar__brand">
        <span className="topbar__mark" aria-hidden="true">
          W3
        </span>
        <span className="topbar__names">
          <span className="topbar__name">web&#8209;3d&#8209;arch</span>
          <span className="topbar__sub">Thiết kế tham số cho chi tiết in FDM nhiều màu</span>
        </span>
      </div>

      {/* Step 2 belongs to the model, not to the source: the core only accepts
          `project.step: 2` while it is holding a built model, and a successful
          build is what puts the workspace there. The chips report that state
          instead of guessing from `project.source`. */}
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
                // Read from the state, not from the word the state produced:
                // matching a Vietnamese label is a hidden dependency on wording
                // that changes for reasons that have nothing to do with icons.
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

      <span className="topbar__spacer" />

      <div className="topbar__tools">
        <Button
          size="small"
          icon="search"
          keyHint="Ctrl K"
          onClick={() => actions.openSearch(true)}
          aria-keyshortcuts="Control+K"
        >
          Tìm nhanh
        </Button>

        <span
          className={`chip ${snapshot.online ? 'chip--ok' : 'chip--warn'} fc-border`}
          title={snapshot.online ? 'Đang trực tuyến' : 'Đang ngoại tuyến'}
        >
          <Icon name={snapshot.online ? 'online' : 'offline'} size={14} />
          {snapshot.online ? 'Trực tuyến' : 'Ngoại tuyến'}
        </span>

        <Button
          size="small"
          icon="upload"
          keyHint="Ctrl O"
          aria-keyshortcuts="Control+O"
          disabled={importSource.pending}
          disabledReason={importBlocked}
          reasonHidden
          onClick={() => void importSource.run()}
        >
          {importSource.pending ? 'Đang nhận…' : 'Tải nguồn'}
        </Button>

        {/* One action, whatever the step needs next: create a project, build,
            rebuild a stale model, open the model that already exists, or export.
            The label says which, so the button never lies about what it does. */}
        <Button
          size="small"
          variant="primary"
          icon={nav.advanceKind === 'open-step2' ? 'chevronRight' : 'cube'}
          // The shortcut is advertised on exactly one control — the next-action
          // bar — so two focusable buttons never claim the same key.
          data-advance={nav.advanceKind}
          disabledReason={nav.advanceReason}
          reasonHidden
          onClick={() => nav.advance()}
        >
          {nav.advanceLabel}
        </Button>

        <AccountMenu />
      </div>
    </header>
  )
}
