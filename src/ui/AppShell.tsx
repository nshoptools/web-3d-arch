import { useCallback, useEffect } from 'react'
import type { ToolId, WorkspaceSection } from '../contracts/app-bridge.ts'
import {
  settingText,
  useBridge,
  useCapabilities,
  useResultHandler,
  useRunCommand,
  useSetting,
  useSnapshot,
} from './core/bridge.tsx'
import { useUi, useUiActions } from './core/ui-state.tsx'
import { useStepNavigation } from './core/step-nav.ts'
import { hasProject, NO_PROJECT_REASON } from './core/project-state.ts'
import { useShortcuts } from './core/useShortcuts.ts'
import { MQ_COMPACT, useMediaQuery } from './core/useMediaQuery.ts'
import { SECTIONS, SETTING, TOOLS_2D, VIEW_ACTIONS } from './core/registry.ts'
import { sectionNavItems } from './layout/section-nav.ts'
import { ACCEPT_SOURCE, chooseFile } from './core/file-dialog.ts'
import { TopBar } from './layout/TopBar.tsx'
import { SectionTabs } from './layout/SectionTabs.tsx'
import { Panel } from './layout/Panel.tsx'
import { Stage } from './stage/Stage.tsx'
import { BlockPopup } from './stage/BlockPopup.tsx'
import { StartScreen } from './start/StartScreen.tsx'
import { QuickSearch } from './search/QuickSearch.tsx'
import { DialogHost } from './dialogs/DialogHost.tsx'
import { LiveRegions, Toasts } from './components/Feedback.tsx'

const SECTION_IDS = new Set<string>(SECTIONS.map((section) => section.id))
const TOOL_IDS = new Set<string>(TOOLS_2D.map((tool) => tool.id))

/**
 * Commands that still make sense on the start screen, before any project is
 * open. Everything else acts on a project and is refused with the same reason
 * the buttons give, so the keyboard never walks around a gate (UI-05).
 */
const WITHOUT_PROJECT = new Set(['app.shortcuts', 'app.diagnostics'])

/** ACC-03/API allow 10..48 px; anything outside that is not applied blindly. */
const FONT_SIZE_MIN = 10
const FONT_SIZE_MAX = 48
const FONT_SIZE_BASE = 14

function uiScaleFrom(raw: string | null): number {
  if (raw === null) return 1
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 1
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, parsed))
  return clamped / FONT_SIZE_BASE
}

/**
 * Two states, one shell (UI-01). With no project the start screen is the whole
 * interface under the top bar; with a project the workspace — rail, panel,
 * stage — takes its place. The core decides which, through `project.id`.
 */
export function AppShell() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const handleResult = useResultHandler()
  const actions = useUiActions()
  const { state } = useUi()
  const compact = useMediaQuery(MQ_COMPACT)
  const capabilities = useCapabilities()
  const fontSize = useSetting(SETTING.fontSize)
  const uiScale = uiScaleFrom(settingText(fontSize))
  const nav = useStepNavigation()
  const step = snapshot.project.step
  const projectOpen = hasProject(snapshot.project)

  const modalOpen = state.dialogs.length > 0 || state.searchOpen
  const drawerModal = projectOpen && compact && state.drawerOpen

  // The drawer flag is only meaningful on a compact layout. A rail click on the
  // desktop sets it (the same reducer serves both), and without this it would
  // survive a resize and cover the stage the moment the window narrows. The
  // layout change itself closes it; a person re-opens it from the tabs.
  useEffect(() => {
    actions.openDrawer(false)
  }, [actions, compact])

  // A build that lands on step 2 is the moment to look at the model, not at
  // the source panel: on a compact layout the drawer is closed for it (UI-03).
  useEffect(() => {
    if (compact && step === 2) actions.openDrawer(false)
  }, [actions, compact, step])

  // "No project is open" is answered the moment one is: the toast that said it
  // must not sit on top of the project it is now wrong about.
  useEffect(() => {
    if (!projectOpen) return
    for (const toast of state.toasts) {
      if (toast.text === NO_PROJECT_REASON) actions.dismissToast(toast.id)
    }
  }, [actions, projectOpen, state.toasts])

  const onCommand = useCallback(
    (commandId: string) => {
      // One gate, stated the same way for every route into it.
      const refuse = (reason: string) => {
        actions.announce(reason)
        actions.toast('warning', reason)
      }
      if (!projectOpen && !WITHOUT_PROJECT.has(commandId) && !commandId.startsWith('account.')) {
        refuse(NO_PROJECT_REASON)
        return
      }
      if (commandId.startsWith('section.')) {
        const id = commandId.slice('section.'.length)
        if (!SECTION_IDS.has(id)) return
        // The same gate the rail applies, so the keyboard and quick search
        // cannot walk around it silently.
        const item = sectionNavItems(snapshot).find((entry) => entry.section.id === id)
        if (item?.disabledReason) {
          refuse(item.disabledReason)
          return
        }
        actions.setSection(id as WorkspaceSection, true)
        if (!compact) actions.setPanelCollapsed(false)
        return
      }
      if (commandId.startsWith('tool.')) {
        const id = commandId.slice('tool.'.length)
        if (TOOL_IDS.has(id)) void run({ type: 'editor.tool', tool: id as ToolId })
        return
      }
      if (commandId.startsWith('view.')) {
        const id = commandId.slice('view.'.length)
        const action = VIEW_ACTIONS.find((item) => item.id === id)
        if (!action) return
        if (action.capability) {
          const capability = capabilities.get(action.capability)
          if (!capability?.available) {
            // The key is bound, so the reason has to be spoken rather than
            // swallowed (UI-05).
            refuse(capability?.reason ?? `Khung xem chưa hỗ trợ thao tác “${action.label}” lúc này.`)
            return
          }
        }
        void run({ type: 'viewport.action', action: action.id })
        return
      }

      switch (commandId) {
        case 'app.search':
          actions.openSearch(true)
          break
        case 'app.panel-toggle':
          if (compact) actions.openDrawer(!state.drawerOpen)
          else actions.setPanelCollapsed(!state.panelCollapsed)
          break
        case 'source.pick':
          // The result has to be reported like any other command; dropping it
          // would make a refused import look like nothing happened.
          void chooseFile(ACCEPT_SOURCE)
            .then(async (file) => {
              if (!file) return
              const result = await bridge.importFile(file, 'source')
              handleResult(result, { success: 'Đã nhận tệp nguồn.' })
            })
            .catch((cause: unknown) => {
              handleResult({
                ok: false,
                diagnostic: {
                  code: 'IMPORT_FAILED',
                  severity: 'error',
                  message: 'Không nhận được tệp nguồn.',
                  detail: cause instanceof Error ? cause.message : String(cause),
                },
              })
            })
          break
        case 'step.next':
          // Exactly the primary button of the top bar, through the same hook:
          // build, rebuild a stale model, open the model that exists, or open
          // the valid export choices (FND-03, UI-03).
          if (nav.advanceReason) refuse(nav.advanceReason)
          else nav.advance()
          break
        case 'history.undo':
          void run({ type: 'history.undo' })
          break
        case 'history.redo':
          void run({ type: 'history.redo' })
          break
        case 'project.save':
          void run({ type: 'project.save' }, { success: 'Đã lưu dự án.' })
          break
        case 'app.shortcuts':
          actions.openDialog({ kind: 'shortcuts' })
          break
        case 'app.diagnostics':
          actions.openDialog({ kind: 'diagnostics' })
          break
        case 'account.settings':
          actions.openDialog({ kind: 'settings' })
          break
        case 'account.ai':
          actions.openDialog({ kind: 'ai-connections' })
          break
        case 'account.costs':
          actions.openDialog({ kind: 'costs' })
          break
        case 'account.members':
          actions.openDialog({ kind: 'members' })
          break
        case 'account.policy':
          actions.openDialog({ kind: 'policy' })
          break
        case 'account.reauth':
          actions.openDialog({ kind: 'sign-in', mode: 'reauth' })
          break
        case 'account.signout':
          actions.openDialog({ kind: 'sign-out' })
          break
        default:
          break
      }
    },
    [
      actions,
      bridge,
      capabilities,
      compact,
      handleResult,
      nav,
      projectOpen,
      run,
      snapshot,
      state.drawerOpen,
      state.panelCollapsed,
    ],
  )

  // Global shortcuts stand down while a modal layer owns the keyboard.
  useShortcuts({ step, enabled: !modalOpen, onCommand })

  // Escape peels one layer at a time: the block popup first, then an armed
  // delete, then the drawer. Modals handle their own Escape.
  useEffect(() => {
    if (modalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (state.blockPopup) {
        actions.setBlockPopup(null)
      } else if (state.armedDelete) {
        actions.armDelete(null)
      } else if (drawerModal) {
        actions.openDrawer(false)
      } else {
        return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actions, drawerModal, modalOpen, state.armedDelete, state.blockPopup])

  const backgroundInert = drawerModal

  return (
    // The user's published fontSize drives the whole type scale from here, so
    // it inherits into the dialogs and disappears with the tree on dispose.
    <div
      className="ui-scale-host"
      style={{ display: 'contents', ['--ui-scale' as string]: String(uiScale) } as never}
    >
      <button
        type="button"
        className="u-skip-link"
        onClick={() => {
          const main = document.getElementById('w3a-main')
          main?.focus({ preventScroll: true })
          main?.scrollIntoView({ block: 'start' })
        }}
      >
        {projectOpen ? 'Bỏ qua thanh điều hướng, tới khung thiết kế' : 'Bỏ qua thanh trên, tới phần bắt đầu'}
      </button>

      <div style={{ display: 'contents' }} {...(modalOpen ? { inert: true } : {})}>
        <div
          className="app"
          data-mode={projectOpen ? 'workspace' : 'start'}
          data-step={step}
          data-section={state.section}
          data-panel-collapsed={state.panelCollapsed ? 'true' : 'false'}
        >
          <TopBar inert={backgroundInert} />
          {projectOpen ? (
            <>
              <SectionTabs variant="rail" inert={backgroundInert} />
              <Panel />
              <Stage inert={backgroundInert} />
              <SectionTabs variant="mobile" inert={backgroundInert} />
              {drawerModal ? (
                <button
                  type="button"
                  className="backdrop"
                  aria-label="Đóng bảng thiết lập"
                  onClick={() => actions.openDrawer(false)}
                />
              ) : null}
            </>
          ) : (
            <StartScreen />
          )}
        </div>
        {projectOpen ? <BlockPopup /> : null}
      </div>

      {state.searchOpen ? (
        <QuickSearch onClose={() => actions.openSearch(false)} onCommand={onCommand} />
      ) : null}
      <DialogHost />
      <Toasts />
      <LiveRegions />
    </div>
  )
}
