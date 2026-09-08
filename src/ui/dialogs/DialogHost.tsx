import { useLayoutEffect } from 'react'
import { useRequestContext, useProjectContextKey } from '../core/bridge.tsx'
import { useUi, useUiActions, type DialogEntry } from '../core/ui-state.tsx'
import { ConfirmDialog, DiagnosticsDialog, ExportChoiceDialog, ShortcutsDialog } from './CoreDialogs.tsx'
import { SettingsDialog } from '../account/SettingsDialog.tsx'
import {
  AboutDialog,
  AIConnectionsDialog,
  CostsDialog,
  MembersDialog,
  PolicyDialog,
} from '../account/AccountDialogs.tsx'
import { SignInDialog, SignOutDialog } from '../auth/AuthDialogs.tsx'
import { AIGenerateDialog } from '../ai/AIGenerateDialog.tsx'

function DialogFor({ entry, onClose }: { entry: DialogEntry; onClose: () => void }) {
  const { spec } = entry
  switch (spec.kind) {
    case 'settings':
      return <SettingsDialog onClose={onClose} />
    case 'ai-connections':
      return <AIConnectionsDialog onClose={onClose} />
    case 'costs':
      return <CostsDialog onClose={onClose} />
    case 'members':
      return <MembersDialog onClose={onClose} />
    case 'policy':
      return <PolicyDialog onClose={onClose} />
    case 'about':
      return <AboutDialog onClose={onClose} />
    case 'shortcuts':
      return <ShortcutsDialog onClose={onClose} />
    case 'diagnostics':
      return <DiagnosticsDialog onClose={onClose} />
    case 'sign-in':
      return <SignInDialog mode={spec.mode} onClose={onClose} />
    case 'sign-out':
      return <SignOutDialog onClose={onClose} />
    case 'export-choice':
      return <ExportChoiceDialog onClose={onClose} />
    case 'ai-generate':
      return <AIGenerateDialog onClose={onClose} />
    case 'confirm':
      return (
        <ConfirmDialog
          title={spec.title}
          changes={spec.changes}
          retry={spec.retry}
          diagnostic={spec.diagnostic}
          context={spec.context}
          onClose={onClose}
        />
      )
    default:
      return null
  }
}

/**
 * The dialog stack. Escape closes the top layer first because each dialog
 * handles the key on its own node, and the layer under it stays untouched.
 */
export function DialogHost() {
  const { state } = useUi()
  const actions = useUiActions()
  const requests = useRequestContext()
  const contextKey = useProjectContextKey()
  useLayoutEffect(() => {
    const stale = state.dialogs.filter(entry => entry.spec.kind === 'confirm' && !requests.isCurrent(entry.spec.context))
    if (!stale.length) return
    for (const entry of stale) actions.closeDialog(entry.id)
    actions.logEvent('info', 'Yêu cầu xác nhận cũ đã được gỡ vì ngữ cảnh dự án hoặc tài khoản đã đổi.', { code: 'CONFIRMATION_CONTEXT_CHANGED' })
    actions.announce('Yêu cầu xác nhận cũ đã được gỡ. Không có gì được áp dụng.')
  }, [actions, contextKey, requests, state.dialogs])
  const visible = state.dialogs.filter(entry => entry.spec.kind !== 'confirm' || requests.isCurrent(entry.spec.context))
  return (
    <>
      {visible.map((entry) => (
        <DialogFor key={entry.id} entry={entry} onClose={() => actions.closeDialog(entry.id)} />
      ))}
    </>
  )
}
