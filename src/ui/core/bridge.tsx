/**
 * The only door between the interface and the application core.
 *
 * The UI reads AppSnapshot and sends AppCommand. It never recomputes geometry,
 * never re-runs domain validation and never decides on the user's behalf: a
 * failed command shows its diagnostic, and a command that comes back asking for
 * confirmation opens a dialog that lists the changes and waits for a choice.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type {
  AppBridge,
  AppCommand,
  AppSnapshot,
  Capability,
  CommandResult,
  Diagnostic,
  SettingView,
} from '../../contracts/app-bridge.ts'
import { useUiActions, type Tone } from './ui-state.tsx'
import { diagnosticText } from './text.ts'
import { createRequestContext, type ContextStamp, type RequestContext } from './request-context.ts'
import {
  accountIdentity,
  CLAIM_CODE,
  droppedAnswerText,
  projectIdentity,
  type RequestClaim,
} from './identity.ts'

const BridgeContext = createContext<AppBridge | null>(null)
const RequestContextContext = createContext<RequestContext | null>(null)

export function BridgeProvider({ bridge, children }: { bridge: AppBridge; children: ReactNode }) {
  const requests = useMemo(() => createRequestContext(bridge), [bridge])
  useLayoutEffect(() => requests.start(), [requests])
  return <BridgeContext.Provider value={bridge}><RequestContextContext.Provider value={requests}>{children}</RequestContextContext.Provider></BridgeContext.Provider>
}

export function useRequestContext(): RequestContext {
  const context = useContext(RequestContextContext)
  if (!context) throw new Error('Request context requires BridgeProvider')
  return context
}

/** A render key driven by every context notification, including batched ABA. */
export function useProjectContextKey(): string {
  const requests = useRequestContext()
  return useSyncExternalStore(requests.subscribe, requests.key, requests.key)
}

export function useBridge(): AppBridge {
  const bridge = useContext(BridgeContext)
  if (!bridge) throw new Error('useBridge must be used inside <BridgeProvider>')
  return bridge
}

export function useSnapshot(): AppSnapshot {
  const bridge = useBridge()
  const subscribe = useCallback((listener: () => void) => bridge.subscribe(listener), [bridge])
  const read = useCallback(() => bridge.getSnapshot(), [bridge])
  return useSyncExternalStore(subscribe, read, read)
}

const SEVERITY_TONE: Record<Diagnostic['severity'], Tone> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
}

export interface RunOptions {
  /** Shown only when the command actually succeeded. */
  success?: string
  /** Text pushed to the polite live region on success. */
  announce?: string
  /** Set false to keep a failure out of the toast stack (it is still logged). */
  toastOnError?: boolean
  /** Additional field/request ownership, checked before any shared feedback. */
  claimResult?: () => RequestClaim
}

export type RunCommand = (command: AppCommand, options?: RunOptions) => Promise<CommandResult>

/**
 * A refusal that needs a fresh authentication before it can succeed (ACC-01,
 * API 403 REAUTH_REQUIRED). The code is kept verbatim in the log and the toast;
 * what changes is that the user is also offered the way back in.
 */
export function isReauthRequired(diagnostic: Diagnostic): boolean {
  return diagnostic.code.toUpperCase().includes('REAUTH')
}

/** Shared failure handling for dispatch() and for the async bridge calls. */
export function useResultHandler() {
  const actions = useUiActions()
  const requests = useRequestContext()
  return useCallback(
    (result: CommandResult, options: RunOptions = {}) => {
      if (result.ok) {
        if (options.success) {
          actions.toast('success', options.success)
          actions.logEvent('success', options.success)
        }
        if (options.announce) actions.announce(options.announce)
        return result
      }

      const { diagnostic } = result
      const tone = SEVERITY_TONE[diagnostic.severity]
      // The core's `message` is often the bare code. The log keeps it exactly as
      // received; only the sentence shown to a person is put into words, and a
      // code with no entry in the table falls back to that same message.
      const spoken = diagnosticText(diagnostic.code, diagnostic.message)
      // Every failure is kept in the reviewable log, not only in a toast.
      actions.logEvent(tone, diagnostic.message, {
        ...(diagnostic.detail ? { detail: diagnostic.detail } : {}),
        code: diagnostic.code,
      })

      if (result.confirmation) {
        // The diagnostic travels into the dialog instead of into a toast: the
        // dialog is where the user is looking, and the code is the only thing
        // that says *why* the core stopped. The dialog replaces any earlier
        // confirmation rather than stacking on top of it.
        actions.openDialog({
          kind: 'confirm',
          context: requests.read(),
          title: result.confirmation.title,
          changes: result.confirmation.changes,
          retry: result.confirmation.retry,
          diagnostic,
        })
        actions.announce(`Cần xác nhận: ${result.confirmation.title}`)
        return result
      }

      if (options.toastOnError !== false) {
        // The code stays on screen as the detail, so the sentence never hides
        // which refusal it is — unless the sentence *is* the code, in which
        // case printing it twice says nothing more.
        actions.toast(
          tone,
          spoken,
          diagnostic.detail ?? (spoken === diagnostic.code ? undefined : diagnostic.code),
        )
      }
      // A REAUTH refusal keeps its code and message, and additionally opens the
      // one door that can resolve it. Nothing is retried automatically.
      if (isReauthRequired(diagnostic)) {
        actions.openDialog({ kind: 'sign-in', mode: 'reauth' })
      }
      if (diagnostic.severity === 'error') actions.alert(spoken)
      else actions.announce(spoken)
      return result
    },
    [actions, requests],
  )
}

/* ------------------------------------------------------- answers that landed late */

/**
 * The context a call was sent in, so its answer can prove it still owns the
 * screen. It carries the *kind* of request for the log and never its contents.
 */
export interface SentRequest {
  readonly account: string
  readonly project: string
  readonly what: string
  readonly context: ContextStamp
  readonly instance: number
}

export interface ResultOwner {
  begin: (what: string) => SentRequest
  /**
   * Runs the shared failure/success handling only while the answer still
   * belongs to what is on screen. Returns `null` when the answer was dropped,
   * so a caller can skip its own state writes with one check.
   */
  settle: (sent: SentRequest, result: CommandResult, options?: RunOptions) => CommandResult | null
  /** The verdict alone, for a caller that reports the drop itself. */
  claim: (sent: SentRequest, allowProjectChange?: boolean) => RequestClaim
}

/**
 * Toasts, alerts and — above all — a confirmation dialog are effects on the
 * *screen*, not on a project. A command answered after the user signed in as
 * somebody else or opened another document must not put any of them there: a
 * confirmation whose retry would then be applied to the document now open is
 * not a stale message, it is the wrong consent question.
 *
 * A dropped answer is still recorded. The core did answer, and on a success it
 * did act on the project that was open then; hiding that would be its own kind
 * of lie. What is dropped is the claim on the screen, not the fact.
 */
export function useResultOwner(): ResultOwner {
  const bridge = useBridge()
  const requests = useRequestContext()
  const instance = useRef(0)
  useEffect(() => () => { instance.current += 1 }, [])
  const actions = useUiActions()
  const handle = useResultHandler()

  const begin = useCallback(
    (what: string): SentRequest => {
      const snapshot = bridge.getSnapshot()
      return { account: accountIdentity(snapshot), project: projectIdentity(snapshot), what, context: requests.read(), instance: instance.current }
    },
    [bridge, requests],
  )

  // Read from the bridge rather than from a rendered snapshot: a promise can
  // settle in the same batch as the snapshot that invalidates it.
  const claim = useCallback(
    (sent: SentRequest, allowProjectChange = false): RequestClaim => {
      const live = bridge.getSnapshot()
      const current = requests.read()
      if (!current.active || !sent.context.active || current.account !== sent.context.account || accountIdentity(live) !== sent.account) return 'foreign'
      if (instance.current !== sent.instance) return 'superseded'
      if (!allowProjectChange && (current.project !== sent.context.project || projectIdentity(live) !== sent.project)) return 'superseded'
      return 'owner'
    },
    [bridge, requests],
  )

  const settle = useCallback(
    (sent: SentRequest, result: CommandResult, options?: RunOptions) => {
      const contextual = claim(sent)
      const verdict = contextual === 'owner' ? (options?.claimResult?.() ?? 'owner') : contextual
      if (verdict !== 'owner') {
        actions.logEvent('info', droppedAnswerText(verdict, sent.what), {
          code: CLAIM_CODE[verdict],
        })
        return null
      }
      return handle(result, options ?? {})
    },
    [actions, claim, handle],
  )

  return useMemo(() => ({ begin, claim, settle }), [begin, claim, settle])
}

/**
 * Commands whose whole purpose is to move the context. Their answer arrives in
 * the world they created, so it is never "an answer for the previous project".
 */
const CONTEXT_COMMANDS: ReadonlySet<AppCommand['type']> = new Set([
  'project.create',
  'project.open',
  'project.delete',
])

function rejectedCall(cause: unknown): CommandResult {
  return { ok: false, diagnostic: { code: 'BRIDGE_CALL_REJECTED', severity: 'error',
    message: 'Lệnh không hoàn tất được.', detail: cause instanceof Error ? cause.message : String(cause) } }
}

export function useRunCommand(): RunCommand {
  const bridge = useBridge()
  const requests = useRequestContext()
  const actions = useUiActions()
  const handle = useResultHandler()
  const owner = useResultOwner()
  return useCallback(
    async (command, options) => {
      const sent = owner.begin(`lệnh ${command.type}`)
      if (CONTEXT_COMMANDS.has(command.type)) {
        const navigation = requests.beginNavigation()
        let result: CommandResult
        try { result = await bridge.dispatch(command) } catch (cause) { result = rejectedCall(cause) }
        const verdict = owner.claim(sent, true)
        if (verdict !== 'owner' || !requests.isCurrentNavigation(navigation)) {
          const claim = verdict === 'foreign' ? 'foreign' : 'superseded'
          actions.logEvent('info', droppedAnswerText(claim, 'chuyển dự án'), { code: CLAIM_CODE[claim] })
          return result
        }
        return handle(result, options ?? {})
      }
      let result: CommandResult
      try { result = await bridge.dispatch(command) } catch (cause) { result = rejectedCall(cause) }
      owner.settle(sent, result, options ?? {})
      // The caller still receives what the core said. Whether it may act on it
      // is its own question, asked with its own ticket; what this hook decides
      // is only whether the shared surfaces may speak.
      return result
    },
    [bridge, handle, owner, requests, actions],
  )
}

/**
 * Wraps an asynchronous bridge call with a pending flag so the UI can block a
 * double click at the interface layer. It does not replace the idempotency the
 * backend owns (AI-03); it only stops the second click from ever being sent.
 *
 * Return the CommandResult **only** for raw bridge calls (importFile, signIn,
 * selectEmoji…). A work function built on useRunCommand must return undefined:
 * that path already logged, toasted or opened the confirmation dialog, and
 * returning the result again would report the same failure twice.
 */
export function useAsyncAction<Args extends unknown[]>(
  work: (...args: Args) => Promise<CommandResult | void>,
  options: RunOptions = {},
): { pending: boolean; run: (...args: Args) => Promise<void> } {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const owner = useResultOwner()
  const optionsRef = useRef(options)
  optionsRef.current = options

  const run = useCallback(
    async (...args: Args) => {
      if (busy.current) return
      busy.current = true
      setPending(true)
      const sent = owner.begin('thao tác đang chờ')
      const sentOptions = optionsRef.current
      try {
        const result = await work(...args)
        if (result) owner.settle(sent, result, sentOptions)
      } catch (cause) {
        // A rejected bridge call is reported like any other failure instead of
        // becoming an unhandled rejection the user never sees.
        owner.settle(
          sent,
          rejectedCall(cause),
          sentOptions,
        )
      } finally {
        busy.current = false
        setPending(false)
      }
    },
    [owner, work],
  )

  return { pending, run }
}

export function useCapabilities(): Map<string, Capability> {
  const snapshot = useSnapshot()
  return useMemo(
    () => new Map(snapshot.capabilities.map((capability) => [capability.id, capability])),
    [snapshot.capabilities],
  )
}

export interface CapabilityState {
  available: boolean
  reason: string
}

const NOT_PUBLISHED = 'Nhân chưa công bố năng lực này trong snapshot hiện tại.'

/**
 * A capability the snapshot does not mention is treated as unavailable with a
 * stated reason — never as available by default.
 */
export function useCapability(id: string, fallbackReason = NOT_PUBLISHED): CapabilityState {
  const capabilities = useCapabilities()
  const capability = capabilities.get(id)
  if (!capability) return { available: false, reason: fallbackReason }
  return {
    available: capability.available,
    reason: capability.available ? '' : (capability.reason ?? fallbackReason),
  }
}

/**
 * Settings as the core publishes them (UI-C05). The interface reads the stored
 * value from here and never treats what a form is holding as a saved setting;
 * a key the snapshot does not carry is absent, not defaulted silently.
 */
export function useSettings(): Map<string, SettingView> {
  const snapshot = useSnapshot()
  return useMemo(
    () => new Map(snapshot.settings.map((setting) => [setting.key, setting])),
    [snapshot.settings],
  )
}

export function useSetting(key: string): SettingView | null {
  return useSettings().get(key) ?? null
}

/** The published string form of a setting, or null when it is not published. */
export function settingText(setting: SettingView | null): string | null {
  if (!setting) return null
  const { value } = setting
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}
