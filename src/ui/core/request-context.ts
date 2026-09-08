import type { AppBridge } from '../../contracts/app-bridge.ts'
import { accountIdentity, projectIdentity } from './identity.ts'

export interface ContextStamp {
  readonly account: number
  readonly project: number
  readonly active: boolean
}

/** Observe every bridge notification, including A → B → A within one React
 * batch. Matching the final IDs alone cannot revive an earlier request. */
export function createRequestContext(bridge: Pick<AppBridge, 'getSnapshot' | 'subscribe'>) {
  let accountKey = accountIdentity(bridge.getSnapshot())
  let projectKey = projectIdentity(bridge.getSnapshot())
  let account = 0, project = 0, navigation = 0, active = false, subscription = 0
  let unsubscribe: (() => void) | null = null
  const listeners = new Set<() => void>()
  const notify = () => { for (const listener of [...listeners]) listener() }
  const next = (n: number) => {
    if (n === Number.MAX_SAFE_INTEGER) throw new Error('UI_CONTEXT_EXHAUSTED')
    return n + 1
  }
  function observe(publish = true) {
    const beforeAccount = account, beforeProject = project
    const snapshot = bridge.getSnapshot()
    const a = accountIdentity(snapshot), p = projectIdentity(snapshot)
    if (a !== accountKey) { account = next(account); accountKey = a }
    if (p !== projectKey) { project = next(project); projectKey = p }
    if (publish && (account !== beforeAccount || project !== beforeProject)) notify()
  }
  function read(): ContextStamp {
    observe(false)
    return { account, project, active }
  }
  function start() {
    unsubscribe?.()
    const id = ++subscription
    account = next(account); project = next(project); active = true
    observe(false)
    unsubscribe = bridge.subscribe(() => observe())
    notify()
    return () => {
      if (subscription !== id || !active) return
      unsubscribe?.(); unsubscribe = null; active = false
      account = next(account); project = next(project)
      notify()
    }
  }
  return {
    start, read,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    key() { const s = read(); return `${s.account}:${s.project}:${s.active}` },
    isCurrent(stamp: ContextStamp) { const current = read(); return current.active && stamp.active && current.account === stamp.account && current.project === stamp.project },
    beginNavigation() { navigation = next(navigation); return navigation },
    isCurrentNavigation(id: number) { return active && navigation === id },
  }
}
export type RequestContext = ReturnType<typeof createRequestContext>
