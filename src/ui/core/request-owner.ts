/**
 * May the answer that just came back still write here?
 *
 * Every asynchronous call in this interface is made *about* something the user
 * can see: a project, an account, a prompt, a filter, a page cursor. Between the
 * call and its answer any of those can move. An answer that lands after the move
 * is not wrong — the core really did answer, and on a success it really did act
 * — but it is an answer about work that is no longer on screen, and writing it
 * into the screen turns it into a lie.
 *
 * The rule this module encodes is the one `source-canvas-state.tsx` already
 * applies to `editSource`, generalised so every surface states it the same way:
 *
 *   an answer may write only while it still holds the newest ticket **and** the
 *   identity it was sent under is still the one in front of the user.
 *
 * Three verdicts, because "not mine" has two different meanings:
 *
 * - `owner`      — apply it.
 * - `superseded` — same person, same document; a newer request of this kind was
 *                  started, or the input it was about has been edited since.
 *                  This is a **stale no-op, not an error**: nothing is shown as
 *                  a failure, the request is kept in the reviewable log with its
 *                  own code, and whatever the user is doing now is untouched.
 * - `foreign`    — the account or the document changed. The payload may belong
 *                  to a *different person*, so it is neither rendered nor logged
 *                  with its contents; only the fact that a superseded answer was
 *                  dropped is recorded.
 *
 * `foreign` is decided before `superseded` on purpose: it is the stronger
 * statement and the one with a privacy consequence.
 *
 * What this does **not** do: it never re-sends, never cancels, and never claims
 * anything about what the core did with the request it is dropping. A prepared,
 * submitted or committed turn stays exactly as the core recorded it.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { AppSnapshot } from '../../contracts/app-bridge.ts'
import { useBridge, useRequestContext } from './bridge.tsx'
import { useUiActions } from './ui-state.tsx'
import { CLAIM_CODE, droppedAnswerText, accountIdentity, projectIdentity, type RequestClaim } from './identity.ts'
import type { ContextStamp } from './request-context.ts'

export interface RequestTicket {
  /** Monotonic per owner: only the newest ticket may write. */
  readonly serial: number
  /** Account/document identity, read from the live snapshot when the call began. */
  readonly identity: string
  /** What the request was about, in the user's own visible terms. */
  readonly key: string
  readonly context: ContextStamp
}

export interface RequestOwner {
  /** Take the next ticket for a call that is about to be sent. */
  begin: (key?: string) => RequestTicket
  /**
   * Verdict for an answer that has just come back. `liveKey` overrides the key
   * this hook was rendered with, for the rare caller that holds a fresher one
   * than the last render published.
   */
  claim: (ticket: RequestTicket, liveKey?: string) => RequestClaim
  /**
   * Abandon whatever is outstanding. A later answer for it can then only be
   * `superseded` (or `foreign`), never `owner`. Used when the user explicitly
   * starts over, and when a surface is reset.
   */
  release: () => void
  /** The ticket serial currently allowed to write; 0 before the first send. */
  currentSerial: () => number
}

export function useRequestOwner(
  currentKey = '',
  identityOf: (snapshot: AppSnapshot) => string = projectIdentity,
): RequestOwner {
  const bridge = useBridge()
  const requests = useRequestContext()
  const serialRef = useRef(0)
  useEffect(() => () => { serialRef.current += 1 }, [])
  // Assigned during render, so it is already the new key by the time an answer
  // to a request the user has edited since can settle.
  const keyRef = useRef(currentKey)
  keyRef.current = currentKey
  const identityRef = useRef(identityOf)
  identityRef.current = identityOf

  const begin = useCallback(
    (key = keyRef.current): RequestTicket => {
      serialRef.current += 1
      return {
        serial: serialRef.current,
        // Read from the bridge, not from a rendered snapshot: a promise can
        // settle in the same batch as the snapshot that invalidates it, before
        // React has run a single effect.
        identity: identityRef.current(bridge.getSnapshot()),
        key,
        context: requests.read(),
      }
    },
    [bridge, requests],
  )

  const claim = useCallback(
    (ticket: RequestTicket, liveKey?: string): RequestClaim => {
      const current = requests.read()
      if (!current.active || !ticket.context.active || current.account !== ticket.context.account) return 'foreign'
      if (identityRef.current !== accountIdentity && current.project !== ticket.context.project) return 'foreign'
      if (identityRef.current(bridge.getSnapshot()) !== ticket.identity) return 'foreign'
      if (serialRef.current !== ticket.serial) return 'superseded'
      if ((liveKey ?? keyRef.current) !== ticket.key) return 'superseded'
      return 'owner'
    },
    [bridge, requests],
  )

  const release = useCallback(() => {
    serialRef.current += 1
  }, [])

  const currentSerial = useCallback(() => serialRef.current, [])

  return useMemo(
    () => ({ begin, claim, release, currentSerial }),
    [begin, claim, currentSerial, release],
  )
}

export type { RequestClaim } from './identity.ts'

/**
 * Record a dropped answer in the session log, in the one wording every surface
 * uses. Returns nothing: a dropped answer changes no state anywhere.
 */
export function useDroppedAnswerLog(): (
  claim: Exclude<RequestClaim, 'owner'>,
  what: string,
) => void {
  const actions = useUiActions()
  return useCallback(
    (claim, what) => {
      actions.logEvent('info', droppedAnswerText(claim, what), { code: CLAIM_CODE[claim] })
    },
    [actions],
  )
}
