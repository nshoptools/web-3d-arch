/**
 * The gate every control that acts on a project goes through.
 *
 * `project.write` is about storage and the lease; it is `true` for a signed-in
 * user with writable storage and *no document open*. Whether a document exists
 * is a separate question, and the core answers every command with
 * `PROJECT_REQUIRED` until it does. Both gates are stated, the project one
 * first, because it is the one with a way forward.
 */
import { useCapability, useSnapshot } from './bridge.tsx'
import { CAP } from './registry.ts'
import { hasProject, NO_PROJECT_REASON } from './project-state.ts'

export interface ProjectGate {
  hasProject: boolean
  /** Why a project command cannot be sent, or null when it can. */
  reason: string | null
  /** The same answer for controls that also need write access. */
  writeReason: string | null
}

export function useProjectGate(): ProjectGate {
  const snapshot = useSnapshot()
  const write = useCapability(CAP.projectWrite)
  const open = hasProject(snapshot.project)
  const reason = open ? null : NO_PROJECT_REASON
  return {
    hasProject: open,
    reason,
    writeReason: reason ?? (write.available ? null : write.reason),
  }
}
