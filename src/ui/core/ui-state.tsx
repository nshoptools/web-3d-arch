/**
 * Presentation state only: which section is open, what the user typed into a
 * search box, which drawer/dialog is on screen, which rows are expanded.
 *
 * No project data, no derived geometry, no validation, no history and no
 * secret is stored here. Everything that belongs to the project lives behind
 * AppBridge and arrives through the snapshot.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react'
import type { AppCommand, Diagnostic, WorkspaceSection } from '../../contracts/app-bridge.ts'
import type { ContextStamp } from './request-context.ts'

export type Tone = 'success' | 'warning' | 'error' | 'info'

export interface ToastItem {
  id: string
  tone: Tone
  text: string
  detail?: string
}

export interface LogItem {
  id: string
  tone: Tone
  text: string
  detail?: string
  code?: string
  at: string
}

/** The one sign-in surface, in the mode the situation calls for (ACC-01). */
export type SignInMode = 'sign-in' | 'invite' | 'reauth'

export type DialogSpec =
  | { kind: 'settings' }
  | { kind: 'ai-connections' }
  | { kind: 'costs' }
  | { kind: 'members' }
  | { kind: 'policy' }
  | { kind: 'about' }
  | { kind: 'shortcuts' }
  | { kind: 'diagnostics' }
  | { kind: 'sign-in'; mode: SignInMode }
  | { kind: 'sign-out' }
  | { kind: 'export-choice' }
  | { kind: 'ai-generate' }
  /**
   * A command the core refused pending confirmation. The diagnostic that came
   * with the refusal travels with it: the dialog is the only place that failure
   * is shown, so dropping it would leave the user with a title and no reason.
   */
  | { kind: 'confirm'; title: string; changes: string[]; retry: AppCommand; diagnostic: Diagnostic; context: ContextStamp }

export interface DialogEntry {
  id: string
  spec: DialogSpec
}

/**
 * Where the block popup sits on screen. Which block it edits is *not* stored
 * here: contract 0.3 publishes `project.selection`, and the popup reads that
 * (UI-C04). The interface keeps only the placement, which is presentation.
 */
export interface PopupPlacement {
  x: number
  y: number
}

export interface UiState {
  section: WorkspaceSection
  panelCollapsed: boolean
  drawerOpen: boolean
  searchOpen: boolean
  /** Collapsed parameter/overlay groups, remembered per group id. */
  groupClosed: Record<string, boolean>
  paramQuery: string
  paramMode: 'compact' | 'all'
  materialSelected: string | null
  /** Two-step delete: which key is armed, if any. */
  armedDelete: string | null
  emojiHardPrintFilter: boolean
  blockPopup: PopupPlacement | null
  toasts: ToastItem[]
  log: LogItem[]
  dialogs: DialogEntry[]
  announcement: string
  alert: string
}

export type UiAction =
  | { type: 'section'; section: WorkspaceSection; openDrawer?: boolean }
  | { type: 'panel-collapsed'; value: boolean }
  | { type: 'drawer'; open: boolean }
  | { type: 'search'; open: boolean }
  | { type: 'group-toggle'; id: string }
  | { type: 'group-set'; id: string; open: boolean }
  | { type: 'group-set-all'; ids: string[]; closed: boolean }
  | { type: 'param-query'; value: string }
  | { type: 'param-mode'; value: 'compact' | 'all' }
  | { type: 'material-select'; id: string | null }
  | { type: 'arm-delete'; key: string | null }
  | { type: 'emoji-hardprint'; value: boolean }
  | { type: 'block-popup'; value: PopupPlacement | null }
  | { type: 'toast-add'; toast: ToastItem }
  | { type: 'toast-remove'; id: string }
  | { type: 'log-add'; item: LogItem }
  | { type: 'log-clear' }
  | { type: 'dialog-open'; entry: DialogEntry }
  /** Always by id: "close me" must never mean "close whatever is on top". */
  | { type: 'dialog-close'; id: string }
  | { type: 'dialog-close-all' }
  | { type: 'announce'; text: string }
  | { type: 'alert'; text: string }

export const initialUiState: UiState = {
  section: 'source',
  panelCollapsed: false,
  drawerOpen: false,
  searchOpen: false,
  groupClosed: {},
  paramQuery: '',
  paramMode: 'compact',
  materialSelected: null,
  armedDelete: null,
  emojiHardPrintFilter: false,
  blockPopup: null,
  toasts: [],
  log: [],
  dialogs: [],
  announcement: '',
  alert: '',
}

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'section':
      return {
        ...state,
        section: action.section,
        drawerOpen: action.openDrawer ?? state.drawerOpen,
        // Opening a section reveals the panel on every layout: on a compact
        // one through the drawer, on desktop by un-collapsing it. Without this
        // a rail click while the panel is collapsed does nothing visible.
        panelCollapsed: action.openDrawer ? false : state.panelCollapsed,
        armedDelete: null,
      }
    case 'panel-collapsed':
      return { ...state, panelCollapsed: action.value }
    case 'drawer':
      return { ...state, drawerOpen: action.open }
    case 'search':
      return { ...state, searchOpen: action.open }
    case 'group-toggle':
      return {
        ...state,
        groupClosed: { ...state.groupClosed, [action.id]: !state.groupClosed[action.id] },
      }
    case 'group-set':
      return { ...state, groupClosed: { ...state.groupClosed, [action.id]: !action.open } }
    case 'group-set-all': {
      const next = { ...state.groupClosed }
      for (const id of action.ids) next[id] = action.closed
      return { ...state, groupClosed: next }
    }
    case 'param-query':
      return { ...state, paramQuery: action.value }
    case 'param-mode':
      return { ...state, paramMode: action.value }
    case 'material-select':
      return { ...state, materialSelected: action.id }
    case 'arm-delete':
      return { ...state, armedDelete: action.key }
    case 'emoji-hardprint':
      return { ...state, emojiHardPrintFilter: action.value }
    case 'block-popup':
      return { ...state, blockPopup: action.value }
    case 'toast-add':
      return { ...state, toasts: [...state.toasts, action.toast].slice(-4) }
    case 'toast-remove':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.id) }
    case 'log-add':
      return { ...state, log: [action.item, ...state.log].slice(0, 200) }
    case 'log-clear':
      return { ...state, log: [] }
    case 'dialog-open': {
      // Two kinds may only ever have one instance on screen.
      //
      // `confirm`: the core keeps at most one live proposal — it discards the
      // previous one before publishing a new one — so two confirmation dialogs
      // would be two consent requests for one proposal, and the older one could
      // only ever be refused.
      //
      // `sign-in`: ACC-01 has one sign-in surface. Two routes can reach it for
      // the same refusal (the shared REAUTH handling in `useResultHandler`, and
      // a screen that also shows the refusal itself with its own way back in),
      // and stacking them would put an identical dialog behind an identical
      // dialog with nothing to tell them apart.
      const kind = action.entry.spec.kind
      const dialogs =
        kind === 'confirm' || kind === 'sign-in'
          ? state.dialogs.filter((entry) => entry.spec.kind !== kind)
          : state.dialogs
      return { ...state, dialogs: [...dialogs, action.entry] }
    }
    case 'dialog-close':
      return { ...state, dialogs: state.dialogs.filter((entry) => entry.id !== action.id) }
    case 'dialog-close-all':
      return { ...state, dialogs: [] }
    case 'announce':
      return { ...state, announcement: action.text }
    case 'alert':
      return { ...state, alert: action.text }
    default:
      return state
  }
}

/**
 * Effective open state of a collapsible group. A group that has never been
 * touched falls back to `defaultOpen`; toggling then stores an explicit value.
 */
export function isGroupOpen(state: UiState, id: string, defaultOpen = true): boolean {
  const closed = state.groupClosed[id]
  return closed === undefined ? defaultOpen : !closed
}

let sequence = 0
export function uid(prefix: string): string {
  sequence += 1
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : String(sequence).padStart(8, '0')
  return `${prefix}-${sequence}-${random}`
}

interface UiContextValue {
  state: UiState
  dispatch: Dispatch<UiAction>
}

const UiContext = createContext<UiContextValue | null>(null)

export function UiStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(uiReducer, initialUiState)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export function useUi(): UiContextValue {
  const value = useContext(UiContext)
  if (!value) throw new Error('useUi must be used inside <UiStateProvider>')
  return value
}

export interface UiActions {
  setSection: (section: WorkspaceSection, openDrawer?: boolean) => void
  setPanelCollapsed: (value: boolean) => void
  openDrawer: (open: boolean) => void
  openSearch: (open: boolean) => void
  toggleGroup: (id: string) => void
  setGroupOpen: (id: string, open: boolean) => void
  setAllGroups: (ids: string[], closed: boolean) => void
  setParamQuery: (value: string) => void
  setParamMode: (value: 'compact' | 'all') => void
  selectMaterial: (id: string | null) => void
  armDelete: (key: string | null) => void
  setEmojiHardPrintFilter: (value: boolean) => void
  setBlockPopup: (value: PopupPlacement | null) => void
  toast: (tone: Tone, text: string, detail?: string) => void
  dismissToast: (id: string) => void
  logEvent: (tone: Tone, text: string, options?: { detail?: string; code?: string }) => void
  clearLog: () => void
  openDialog: (spec: DialogSpec) => void
  closeDialog: (id: string) => void
  closeAllDialogs: () => void
  announce: (text: string) => void
  alert: (text: string) => void
}

/** Stable action helpers so components never rebuild handlers on every render. */
export function useUiActions(): UiActions {
  const { dispatch } = useUi()
  const logEvent = useCallback(
    (tone: Tone, text: string, options?: { detail?: string; code?: string }) => {
      dispatch({
        type: 'log-add',
        item: {
          id: uid('log'),
          tone,
          text,
          at: new Date().toISOString(),
          ...(options?.detail ? { detail: options.detail } : {}),
          ...(options?.code ? { code: options.code } : {}),
        },
      })
    },
    [dispatch],
  )

  return useMemo<UiActions>(
    () => ({
      setSection: (section, openDrawer) =>
        dispatch({ type: 'section', section, ...(openDrawer === undefined ? {} : { openDrawer }) }),
      setPanelCollapsed: (value) => dispatch({ type: 'panel-collapsed', value }),
      openDrawer: (open) => dispatch({ type: 'drawer', open }),
      openSearch: (open) => dispatch({ type: 'search', open }),
      toggleGroup: (id) => dispatch({ type: 'group-toggle', id }),
      setGroupOpen: (id, open) => dispatch({ type: 'group-set', id, open }),
      setAllGroups: (ids, closed) => dispatch({ type: 'group-set-all', ids, closed }),
      setParamQuery: (value) => dispatch({ type: 'param-query', value }),
      setParamMode: (value) => dispatch({ type: 'param-mode', value }),
      selectMaterial: (id) => dispatch({ type: 'material-select', id }),
      armDelete: (key) => dispatch({ type: 'arm-delete', key }),
      setEmojiHardPrintFilter: (value) => dispatch({ type: 'emoji-hardprint', value }),
      setBlockPopup: (value) => dispatch({ type: 'block-popup', value }),
      toast: (tone, text, detail) =>
        dispatch({
          type: 'toast-add',
          toast: { id: uid('toast'), tone, text, ...(detail ? { detail } : {}) },
        }),
      dismissToast: (id) => dispatch({ type: 'toast-remove', id }),
      logEvent,
      clearLog: () => dispatch({ type: 'log-clear' }),
      openDialog: (spec) => dispatch({ type: 'dialog-open', entry: { id: uid('dlg'), spec } }),
      closeDialog: (id) => dispatch({ type: 'dialog-close', id }),
      closeAllDialogs: () => dispatch({ type: 'dialog-close-all' }),
      announce: (text) => dispatch({ type: 'announce', text }),
      alert: (text) => dispatch({ type: 'alert', text }),
    }),
    [dispatch, logEvent],
  )
}
