/**
 * The settings a format publishes for itself (UI-C10, contract 0.3
 * `ExportOption.configuration`).
 *
 * What this file is careful about, in the order the acceptance states it:
 *
 * - It renders the published list and nothing else. No direction the controller
 *   did not send, no unit it did not name, no limit it did not state, no
 *   default filled in behind the person's back.
 * - It sends the characters that were typed. A decimal comma, a Vietnamese
 *   name, a character the format cannot carry — all of it reaches the
 *   controller exactly as entered, and the controller is the one that parses,
 *   ranges and stores it (MOD-03/EXP-01).
 * - It sends on a deliberate act — Enter, leaving the box, ticking a box,
 *   choosing from a list — never on a keystroke.
 * - It carries the project revision the person was actually looking at, so an
 *   edit made against one state cannot be quietly applied to another.
 * - An answer that comes back after the account, the document or the request
 *   moved writes nothing here.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ExportFieldView, ExportOption } from '../../contracts/app-bridge.ts'
import { useRunCommand, useProjectContextKey } from '../core/bridge.tsx'
import { requestKey } from '../core/identity.ts'
import { useRequestOwner } from '../core/request-owner.ts'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import {
  exportFieldRangeNote,
  exportFieldReason,
  type ExportConfigurationView,
} from '../core/export-config.ts'
import { CollapsibleGroup } from '../components/Group.tsx'
import {
  CheckField,
  DraftTextField,
  NumberField,
  SelectField,
  type CommitResult,
} from '../components/Fields.tsx'

export interface ExportConfigurationProps {
  option: ExportOption
  /** Passed in rather than re-read, so the caller decides it is present. */
  configuration: ExportConfigurationView
  /** Why no project edit can be committed at all, or null. */
  writeBlocked: string | null
  /** The caller owns the fold when it lays the settings out under its own row. */
  open?: boolean
  onToggle?: () => void
}

export function ExportConfiguration({ option, configuration, writeBlocked, open: openProp, onToggle }: ExportConfigurationProps) {
  const { state } = useUi()
  const actions = useUiActions()
  const groupId = `export-config-${option.id}`
  const open = openProp ?? isGroupOpen(state, groupId)
  const { fields } = configuration
  const contextKey = useProjectContextKey()

  return (
    <CollapsibleGroup
      title={
        <>
          Cài đặt<span className="u-visually-hidden"> của đường xuất này</span>
        </>
      }
      color="var(--sec-export)"
      open={open}
      onToggle={onToggle ?? (() => actions.setGroupOpen(groupId, !open))}
      count={`${fields.length} thiết lập`}
    >
      <div
        className="stack"
        data-export-config={option.id}
        data-export-config-revision={configuration.projectRevision}
        data-export-config-fields={fields.length}
      >
        {fields.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nhân mở khu cài đặt cho đường xuất này nhưng chưa công bố thiết lập nào trong đó.
          </p>
        ) : null}
        {fields.map((field) => (
          <ExportFieldRow
            key={`${contextKey}:${option.id}:${field.id}:${field.kind}`}
            optionId={option.id}
            configuration={configuration}
            field={field}
            writeBlocked={writeBlocked}
          />
        ))}
        <p className="muted-3" style={{ margin: 0 }}>
          Thuộc riêng đường xuất “{option.label}”; lưu vào dự án như một lần sửa.
        </p>
      </div>
    </CollapsibleGroup>
  )
}

interface ExportFieldRowProps {
  optionId: string
  configuration: ExportConfigurationView
  field: ExportFieldView
  writeBlocked: string | null
}

function ExportFieldRow({ optionId, configuration, field, writeBlocked }: ExportFieldRowProps) {
  const controlId = useId()
  const run = useRunCommand()
  // One owner per field: a second field committing must not silence this one's
  // answer, and a newer commit on *this* field must.
  const owner = useRequestOwner(requestKey(['export.configure', optionId, field.id]))

  // Only the always-on controls keep a refusal here; a text or number box keeps
  // its own, next to the characters that were refused.
  const [refusal, setRefusal] = useState<string | null>(null)

  const publishedRevision = configuration.projectRevision
  const revisionRef = useRef(publishedRevision)
  revisionRef.current = publishedRevision

  /**
   * The revision the person was editing against.
   *
   * Capture on the first dirty edit and keep it until that draft succeeds or is
   * explicitly discarded. An intervening snapshot or later keystroke cannot
   * adopt a new base for the same draft. Click controls have no dirty interval.
   */
  const editedRevision = useRef<number | null>(null)
  const noteEdit = useCallback(() => {
    owner.release()
    editedRevision.current ??= revisionRef.current
  }, [owner])
  const resetDraft = useCallback(() => { owner.release(); editedRevision.current = null }, [owner])

  // A new published revision is a new base. A refusal recorded against the old
  // one is no longer about what is on screen, so it goes.
  const seenRevision = useRef(publishedRevision)
  useEffect(() => {
    if (seenRevision.current === publishedRevision) return
    seenRevision.current = publishedRevision
    setRefusal(null)
  }, [publishedRevision])

  const blocked = exportFieldReason(field, writeBlocked)

  const send = useCallback(
    async (value: string | boolean): Promise<CommitResult | null> => {
      const projectRevision = editedRevision.current ?? revisionRef.current
      const ticket = owner.begin()
      const result = await run(
        { type: 'export.configure', id: optionId, projectRevision, field: field.id, value },
        // The refusal belongs beside the control, not in a toast stack. It is
        // still logged, and a confirmation still opens its dialog, both under
        // the shared fence in useRunCommand.
        { toastOnError: false, claimResult: () => owner.claim(ticket) },
      )
      const claim = owner.claim(ticket)
      // useRunCommand has already recorded this drop exactly once.
      if (claim !== 'owner') return null
      if (!result.ok && result.confirmation) return { ok: false, awaitingConfirmation: true }
      return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
    },
    [field.id, optionId, owner, run],
  )

  /** For the controls whose click *is* the confirmation. */
  const commitNow = useCallback(
    async (value: string | boolean) => {
      setRefusal(null)
      const result = await send(value)
      if (!result) return
      setRefusal(result.ok || result.awaitingConfirmation ? null : (result.message ?? 'Giá trị bị từ chối.'))
    },
    [send],
  )

  const rangeNote = exportFieldRangeNote(field)
  /**
   * The published limits and the unit are laid out in their own row, beside the
   * control rather than inside it. That is a layout choice, and it must not
   * decide who gets to read them: the ids below are handed to the control so
   * the same words reach someone reading the field through it (UI-04, UI-R1-07).
   * Nothing is derived here — the note is printed only when the controller
   * published something to put in it.
   */
  const rangeNoteId = `${controlId}-note-range`
  const unitNoteId = `${controlId}-note-unit`
  const rowProps = {
    className: 'prow',
    'data-export-field': field.id,
    'data-export-field-kind': field.kind,
    'data-export-field-enabled': field.enabled ? 'true' : 'false',
  } as const

  if (field.kind === 'boolean') {
    return (
      <div {...rowProps}>
        <div className="prow__full">
          <CheckField
            inputId={controlId}
            label={field.label}
            checked={field.value === true}
            disabledReason={blocked}
            error={refusal}
            {...(field.hint ? { hint: field.hint } : {})}
            onChange={(checked) => void commitNow(checked)}
          />
        </div>
      </div>
    )
  }

  if (field.kind === 'select') {
    return (
      <div {...rowProps}>
        <label className="prow__label" htmlFor={controlId}>
          {field.label}
        </label>
        <div className="prow__control">
          <SelectField
            inputId={controlId}
            label={field.label}
            externalLabel
            value={String(field.value)}
            options={(field.options ?? []).map((choice) => ({
              value: choice.value,
              label: choice.label,
            }))}
            disabledReason={blocked}
            error={refusal}
            {...(field.hint ? { hint: field.hint } : {})}
            onChange={(value) => void commitNow(value)}
          />
        </div>
      </div>
    )
  }

  if (field.kind === 'number') {
    return (
      <div {...rowProps}>
        <label className="prow__label" htmlFor={controlId}>
          {field.label}
        </label>
        <div className="prow__control">
          <NumberField
            inputId={controlId}
            label={field.label}
            externalLabel
            value={String(field.value)}
            unit={field.unit ?? null}
            // No slider: a drag would send a value per step, and these settings
            // are committed once, when the person says so.
            slider={false}
            disabledReason={blocked}
            {...(rangeNote ? { descriptionIds: rangeNoteId } : {})}
            {...(field.hint ? { hint: field.hint } : {})}
            onEdit={noteEdit}
            onDraftReset={resetDraft}
            onCommit={send}
          />
        </div>
        {rangeNote ? (
          <div className="prow__full muted-3" id={rangeNoteId} data-export-field-range>
            {rangeNote}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div {...rowProps}>
      <label className="prow__label" htmlFor={controlId}>
        {field.label}
      </label>
      <div className="prow__control">
        <DraftTextField
          inputId={controlId}
          label={field.label}
          externalLabel
          className="grow"
          value={String(field.value)}
          disabledReason={blocked}
          {...(field.unit ? { descriptionIds: unitNoteId } : {})}
          {...(field.hint ? { hint: field.hint } : {})}
          onEdit={noteEdit}
          onDraftReset={resetDraft}
          onCommit={send}
        />
      </div>
      {field.unit ? (
        <div className="prow__full muted-3" id={unitNoteId} data-export-field-unit>
          Đơn vị nhân dùng cho trường này: {field.unit}
        </div>
      ) : null}
    </div>
  )
}
