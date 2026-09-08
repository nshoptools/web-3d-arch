import { useEffect } from 'react'
import type { Diagnostic } from '../../contracts/app-bridge.ts'
import { diagnosticText, SEVERITY_LABEL } from '../core/text.ts'
import { useUi, useUiActions, type ToastItem } from '../core/ui-state.tsx'
import { Button } from './Button.tsx'
import { Icon, type IconName } from './Icon.tsx'

const TOAST_ICON: Record<ToastItem['tone'], IconName> = {
  success: 'check',
  warning: 'warning',
  error: 'error',
  info: 'info',
}

const TOAST_PREFIX: Record<ToastItem['tone'], string> = {
  success: 'Đã xong',
  warning: 'Cảnh báo',
  error: 'Lỗi',
  info: 'Thông tin',
}

/** Success and info fade; warnings and errors wait for the user (UI-05). */
const AUTO_DISMISS_MS = 6000

function Toast({ toast }: { toast: ToastItem }) {
  const actions = useUiActions()
  const transient = toast.tone === 'success' || toast.tone === 'info'

  useEffect(() => {
    if (!transient) return
    const timer = setTimeout(() => actions.dismissToast(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [actions, toast.id, transient])

  return (
    <div className={`toast toast--${toast.tone} fc-border`}>
      <span className="toast__icon" aria-hidden="true">
        <Icon name={TOAST_ICON[toast.tone]} size={16} />
      </span>
      <span className="toast__text">
        <strong>{TOAST_PREFIX[toast.tone]}: </strong>
        {toast.text}
        {toast.detail ? <span className="muted"> — {toast.detail}</span> : null}
      </span>
      <Button
        variant="ghost"
        size="small"
        icon="close"
        iconOnly
        aria-label={`Đóng thông báo: ${toast.text}`}
        onClick={() => actions.dismissToast(toast.id)}
      />
    </div>
  )
}

export function Toasts() {
  const { state } = useUi()
  if (state.toasts.length === 0) return null
  return (
    // Announcements go through the dedicated live regions, so this stack is
    // silent for screen readers instead of repeating every message twice.
    <div className="toasts" aria-live="off">
      {state.toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

/**
 * Two regions: a polite one for status changes and an assertive one used
 * sparingly for errors (UI-06). Text only changes when something new happened,
 * so nothing is re-read on every frame.
 */
export function LiveRegions() {
  const { state } = useUi()
  return (
    <>
      <div className="u-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {state.announcement}
      </div>
      <div className="u-visually-hidden" role="alert" aria-live="assertive" aria-atomic="true">
        {state.alert}
      </div>
    </>
  )
}

export interface ProgressBarProps {
  /** null means the stage reports no measurable progress. */
  value: number | null
  label: string
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const percent = value === null ? null : Math.max(0, Math.min(100, Math.round(value * 100)))
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-valuetext={percent === null ? 'Chưa đo được tiến độ' : `${percent}%`}
    >
      <div
        className={`progress__bar${percent === null ? ' progress__bar--indeterminate' : ''}`}
        style={percent === null ? undefined : { inlineSize: `${percent}%` }}
      />
    </div>
  )
}

export function DiagnosticItem({ diagnostic }: { diagnostic: Diagnostic }) {
  // The core often sends the code as the message. The card shows the sentence
  // and keeps the code beside it; the core's own message is only repeated when
  // it says something the code does not.
  const spoken = diagnosticText(diagnostic.code, diagnostic.message)
  const rawIsCode = diagnostic.message === diagnostic.code
  return (
    <div className={`diag diag--${diagnostic.severity} fc-border`} data-diagnostic={diagnostic.code}>
      <div className="diag__head">
        <span className="diag__sev">{SEVERITY_LABEL[diagnostic.severity]}</span>
        <code className="diag__code">{diagnostic.code}</code>
        {diagnostic.requirementId ? (
          <span className="muted-3">Yêu cầu {diagnostic.requirementId}</span>
        ) : null}
      </div>
      <div className="diag__msg">{spoken}</div>
      {!rawIsCode && spoken !== diagnostic.message ? (
        <div className="diag__detail">Nhân báo: {diagnostic.message}</div>
      ) : null}
      {diagnostic.detail ? <div className="diag__detail">{diagnostic.detail}</div> : null}
    </div>
  )
}

export function DiagnosticList({
  diagnostics,
  emptyText = 'Không có chẩn đoán nào.',
}: {
  diagnostics: readonly Diagnostic[]
  emptyText?: string
}) {
  if (diagnostics.length === 0) return <p className="muted">{emptyText}</p>
  return (
    <div className="stack">
      {diagnostics.map((diagnostic, index) => (
        <DiagnosticItem key={`${diagnostic.code}-${index}`} diagnostic={diagnostic} />
      ))}
    </div>
  )
}
