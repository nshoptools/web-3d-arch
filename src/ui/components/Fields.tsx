/**
 * Form primitives.
 *
 * Numeric entry keeps the exact characters the user typed and hands that raw
 * string to the bridge (MOD-03). The interface never parses a value, never
 * rounds it onto a step grid and never rewrites the field after a rejected
 * command: a rejected value stays on screen next to its diagnostic so it can be
 * corrected.
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

export interface CommitResult {
  ok: boolean
  message?: string
  /** The draft awaits explicit consent; it is neither committed nor invalid. */
  awaitingConfirmation?: true
}

/**
 * `null` means **no verdict**: the answer that came back was not this field's to
 * act on, because the caller's own fence says it belongs to another account,
 * another document or a request that is no longer the one on screen. The field
 * then keeps exactly what the person has, shows nothing, and clears nothing —
 * the same no-op the internal commit owner performs when the box has moved on.
 */
export type Commit = (raw: string) => Promise<CommitResult | null> | CommitResult | null

/**
 * Who owns the field when a commit answers.
 *
 * A commit is asynchronous, and the caret is not. Between sending a value and
 * hearing about it the user can type again, press Enter again, or drag the
 * slider ten more times — and the answer that then arrives is an answer about a
 * value that is no longer in the box. Writing it back is what produces the two
 * symptoms this guards: a rejection stamping an old string over what is being
 * typed, and a success wiping a newer draft because "it committed".
 *
 * Two counters, because there are two ways to lose ownership:
 *
 * - `commits` — a newer commit was started (Enter twice, a slider drag).
 * - `edits`   — the user typed after this commit was sent.
 *
 * Losing ownership is a **no-op, not an error**: nothing is shown, nothing is
 * reverted, and the field keeps exactly what the person is typing. The value
 * that was sent was still sent, and the core's answer to it stands; what this
 * refuses to do is repaint the field with it.
 */
function useCommitOwner() {
  const commits = useRef(0)
  const edits = useRef(0)
  const submitted = useRef<{ raw: string; edit: number } | null>(null)
  return useMemo(
    () => ({
      /** Call from onChange: the text in the box is now the user's newer work. */
      edited: () => {
        edits.current += 1
      },
      /** Take a ticket for a commit about to be sent. */
      begin: (raw?: string) => {
        if (raw !== undefined) submitted.current = { raw, edit: edits.current }
        commits.current += 1
        return { commit: commits.current, edit: edits.current }
      },
      /** Blur must not repeat the same submission made by Enter or a slider. */
      submitted: (raw: string) => submitted.current?.raw === raw && submitted.current.edit === edits.current,
      owns: (ticket: { commit: number; edit: number }) =>
        commits.current === ticket.commit && edits.current === ticket.edit,
    }),
    [],
  )
}

interface FieldFrameProps {
  id: string
  label: ReactNode
  labelHidden?: boolean
  /** The caller already renders a <label for> for this control. */
  externalLabel?: boolean
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  reason?: string | null
}

function FieldFrame({
  id,
  label,
  labelHidden,
  externalLabel,
  hint,
  error,
  reason,
  children,
}: FieldFrameProps) {
  return (
    <div className="field">
      {/* Two <label for> elements pointing at one control would concatenate
          into a doubled accessible name, so the caller-owned case renders none. */}
      {externalLabel ? null : (
        <label className={labelHidden ? 'u-visually-hidden' : 'field__label'} htmlFor={id}>
          {label}
        </label>
      )}
      {children}
      {hint ? (
        <span className="muted" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="muted" id={`${id}-error`} style={{ color: 'var(--err)' }}>
          {error}
        </span>
      ) : null}
      {reason ? (
        <span className="reason" id={`${id}-reason`}>
          {reason}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Ids of every description a control should carry, in reading order.
 *
 * The unit and the published range are part of that description, not decoration
 * beside it: a person reading the field through its control has no other way to
 * learn the scale the value is in or the limits it will be judged against
 * (UI-04). `extra` carries ids of notes a caller prints itself, so a range the
 * section lays out in its own row still reaches the same reader.
 */
function describedBy(
  id: string,
  parts: {
    hint?: unknown
    unit?: unknown
    range?: unknown
    error?: unknown
    reason?: unknown
    extra?: string | undefined
  },
) {
  return (
    [
      parts.hint ? `${id}-hint` : null,
      parts.unit ? `${id}-unit` : null,
      parts.range ? `${id}-range` : null,
      parts.error ? `${id}-error` : null,
      parts.reason ? `${id}-reason` : null,
      parts.extra ?? null,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  )
}

/**
 * The list a refused `<select>` shows.
 *
 * A refusal is not a style. Leaving every published choice in the list would
 * let a key, a pointer or a dispatched event move the control onto a value the
 * snapshot does not hold, and the only thing standing between that and a
 * command would be the handler's own guard. Reducing the list to the value the
 * snapshot holds removes the move itself: there is nowhere else to go.
 *
 * When the published list does not contain that value — an older option, a
 * value the controller has since retired — the list is left exactly as it came.
 * Inventing an option to hold the value would mean writing a label the
 * controller never sent, and an empty list would hide what it did send. The
 * change handler refuses either way.
 */
function lockedOptions<T extends { value: string }>(options: T[], value: string): T[] {
  const current = options.filter((option) => option.value === value)
  return current.length > 0 ? current : options
}

/** Slider position only. Never used to produce the value sent to the bridge. */
function forSlider(raw: string): number | null {
  const normalised = raw.replace(',', '.').trim()
  if (normalised === '') return null
  const parsed = Number(normalised)
  return Number.isFinite(parsed) ? parsed : null
}

export interface NumberFieldProps {
  label: ReactNode
  value: string
  onCommit: Commit
  unit?: string | null
  min?: string | undefined
  max?: string | undefined
  step?: string | undefined
  hint?: ReactNode
  labelHidden?: boolean
  disabledReason?: string | null
  slider?: boolean
  inputId?: string
  externalLabel?: boolean
  /**
   * Ids of notes the caller prints itself — a unit or a published range laid
   * out in its own row. They are appended to this control's description so the
   * same words reach someone reading the field through the control.
   */
  descriptionIds?: string
  /** Fired when the person changes the text, before anything is sent. */
  onEdit?: () => void
  /** Draft committed or explicitly discarded; a new edit gets a fresh base. */
  onDraftReset?: () => void
}

export function NumberField({
  label,
  value,
  onCommit,
  unit,
  min,
  max,
  step,
  hint,
  labelHidden,
  disabledReason,
  slider = true,
  inputId,
  externalLabel,
  descriptionIds,
  onEdit,
  onDraftReset,
}: NumberFieldProps) {
  const autoId = useId()
  const id = inputId ?? autoId
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastValue = useRef(value)
  const owner = useCommitOwner()

  // An external change (undo, preset, another surface) wins over a clean field,
  // but never overwrites text the user is still editing.
  useEffect(() => {
    if (lastValue.current !== value) {
      lastValue.current = value
      if (draft === null) setError(null)
    }
  }, [draft, value])

  const shown = draft ?? value
  const disabled = Boolean(disabledReason)

  const commit = async (raw: string) => {
    if (disabled) return
    if (raw === value) {
      owner.edited()
      setDraft(null)
      onDraftReset?.()
      setError(null)
      return
    }
    const ticket = owner.begin(raw)
    const result = await onCommit(raw)
    // The answer is about `raw`. If the box has moved on since, it says nothing
    // about what is in it now, so it neither writes nor complains.
    if (!owner.owns(ticket)) return
    // No verdict: the caller's fence dropped the answer. Same no-op.
    if (!result) return
    if (result.ok) {
      setDraft(null)
      onDraftReset?.()
      setError(null)
    } else if (result.awaitingConfirmation) {
      setError(null)
    } else {
      setDraft(raw)
      setError(result.message ?? 'Giá trị bị từ chối.')
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void commit(event.currentTarget.value)
    } else if (event.key === 'Escape' && draft !== null) {
      event.preventDefault()
      event.stopPropagation()
      // Escape is itself an edit: it is the user saying "this is the value
      // now", so an answer still in flight loses the field to it.
      owner.edited()
      setDraft(null)
      onDraftReset?.()
      setError(null)
    }
  }

  // Printed only when the controller published both ends; nothing here invents
  // a bound, converts a unit or reads the value to decide what to say.
  const hasRange = min !== undefined && max !== undefined
  const sliderValue = forSlider(shown)
  const sliderMin = min !== undefined ? forSlider(min) : null
  const sliderMax = max !== undefined ? forSlider(max) : null
  const sliderStep = step !== undefined ? forSlider(step) : null
  const canSlide =
    slider && !disabled && sliderMin !== null && sliderMax !== null && sliderValue !== null

  return (
    <FieldFrame
      id={id}
      label={label}
      {...(labelHidden === undefined ? {} : { labelHidden })}
      {...(externalLabel === undefined ? {} : { externalLabel })}
      {...(hint === undefined ? {} : { hint })}
      error={error}
      reason={disabledReason ?? null}
    >
      <div className="field__row">
        {canSlide ? (
          <input
            className="slider"
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={sliderStep ?? 'any'}
            value={sliderValue}
            aria-label={`${typeof label === 'string' ? label : 'Giá trị'} — thanh trượt`}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              void commit(event.target.value)
            }}
          />
        ) : null}
        <input
          id={id}
          className="input input--num"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={shown}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, {
            hint,
            unit,
            range: hasRange,
            error,
            reason: disabledReason,
            extra: descriptionIds,
          })}
          // readOnly rather than disabled: the control stays focusable, so the
          // reason attached to it is actually reachable (UI-04).
          readOnly={disabled}
          aria-disabled={disabled || undefined}
          onChange={(event) => {
            owner.edited()
            onEdit?.()
            setDraft(event.target.value)
          }}
          onBlur={(event) => {
            if (draft === null) return
            if (draft === value) {
              // Back to the snapshot value: drop the draft so a later external
              // change is not masked by a stale string. This is a deliberate
              // reset of the field, so an answer still in flight loses it.
              owner.edited()
              setDraft(null)
              onDraftReset?.()
              setError(null)
              return
            }
            if (!owner.submitted(event.target.value)) void commit(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        {unit ? (
          <span className="field__unit" id={`${id}-unit`}>
            {unit}
          </span>
        ) : null}
      </div>
      {hasRange ? (
        <span className="muted-3" id={`${id}-range`}>
          Miền {min}–{max}
          {unit ? ` ${unit}` : ''}
          {step !== undefined ? ` · bước ${step}` : ''}
        </span>
      ) : null}
    </FieldFrame>
  )
}

export interface TextFieldProps {
  label: ReactNode
  value: string
  onChange: (value: string) => void
  onCommit?: Commit
  placeholder?: string
  hint?: ReactNode
  labelHidden?: boolean
  disabledReason?: string | null
  type?: 'text' | 'email' | 'password' | 'search'
  autoComplete?: string
  multiline?: boolean
  rows?: number
  maxLength?: number
  inputId?: string
  required?: boolean
  error?: string | null
  externalLabel?: boolean
}

export function TextField({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  hint,
  labelHidden,
  disabledReason,
  type = 'text',
  autoComplete = 'off',
  multiline = false,
  rows = 3,
  maxLength,
  inputId,
  required,
  error,
  externalLabel,
}: TextFieldProps) {
  const autoId = useId()
  const id = inputId ?? autoId
  const disabled = Boolean(disabledReason)
  const [commitError, setCommitError] = useState<string | null>(null)
  const owner = useCommitOwner()

  const shown = error ?? commitError

  const shared = {
    id,
    value,
    placeholder,
    // Focusable while refused, so the reason can be read (UI-04).
    readOnly: disabled,
    'aria-disabled': disabled || undefined,
    required,
    maxLength,
    autoComplete,
    'aria-invalid': shown ? (true as const) : undefined,
    'aria-describedby': describedBy(id, { hint, error: shown, reason: disabledReason }),
    'data-text-entry': 'true' as const,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      owner.edited()
      setCommitError(null)
      onChange(event.target.value)
    },
    onBlur: () => {
      if (!onCommit) return
      // The refusal has to reach the user; dropping the result would make a
      // rejected rename look like it succeeded. What it must not do is attach
      // that refusal to text the user has since replaced — or to a different
      // subject, when the caller's own fence says the answer is not theirs.
      const ticket = owner.begin()
      void Promise.resolve(onCommit(value)).then((result) => {
        if (!owner.owns(ticket)) return
        if (!result) return
        setCommitError(result.ok || result.awaitingConfirmation ? null : (result.message ?? 'Giá trị bị từ chối.'))
      })
    },
  }

  return (
    <FieldFrame
      id={id}
      label={label}
      {...(labelHidden === undefined ? {} : { labelHidden })}
      {...(externalLabel === undefined ? {} : { externalLabel })}
      {...(hint === undefined ? {} : { hint })}
      error={shown ?? null}
      reason={disabledReason ?? null}
    >
      {multiline ? (
        <textarea className="textarea" rows={rows} {...shared} />
      ) : (
        <input className="input" type={type} spellCheck={type === 'text'} {...shared} />
      )}
    </FieldFrame>
  )
}

export interface SelectFieldProps {
  label: ReactNode
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
  hint?: ReactNode
  labelHidden?: boolean
  disabledReason?: string | null
  inputId?: string
  className?: string
  externalLabel?: boolean
  /** A refusal the caller owns, tied to this control by aria-describedby. */
  error?: string | null
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hint,
  labelHidden,
  disabledReason,
  inputId,
  className = '',
  externalLabel,
  error,
}: SelectFieldProps) {
  const autoId = useId()
  const id = inputId ?? autoId
  const disabled = Boolean(disabledReason)
  return (
    <FieldFrame
      id={id}
      label={label}
      {...(labelHidden === undefined ? {} : { labelHidden })}
      {...(externalLabel === undefined ? {} : { externalLabel })}
      {...(hint === undefined ? {} : { hint })}
      error={error ?? null}
      reason={disabledReason ?? null}
    >
      {/* Native select: keyboard behaviour and the forced-colors arrow come for
          free. Refused is said with aria-disabled rather than the native flag,
          which would take the control out of the tab order and the reason with
          it — the same rule Button, TextField and NumberField already follow
          (UI-04). The refusal itself is not a style: the list is reduced to the
          value the snapshot holds, so no key, pointer or dispatched event has
          another value to move to, and a change that still arrives is dropped
          rather than sent. */}
      <select
        id={id}
        className={`select ${className}`.trim()}
        value={value}
        aria-disabled={disabled || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { hint, error, reason: disabledReason })}
        onChange={(event) => {
          if (disabled) return
          onChange(event.target.value)
        }}
      >
        {(disabled ? lockedOptions(options, value) : options).map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  )
}

export interface CheckFieldProps {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: ReactNode
  disabledReason?: string | null
  inputId?: string
  /** A refusal the caller owns, tied to this control by aria-describedby. */
  error?: string | null
}

export function CheckField({
  label,
  checked,
  onChange,
  hint,
  disabledReason,
  inputId,
  error,
}: CheckFieldProps) {
  const autoId = useId()
  const id = inputId ?? autoId
  const disabled = Boolean(disabledReason)
  return (
    <div className="field">
      {/* The label and the box together form the target, not the 16 px box. */}
      <label className="check" htmlFor={id}>
        {/* Refused is said with aria-disabled rather than the native flag, which
            would take the box out of the tab order and the reason with it: the
            row would then hold no focusable control at all, and the explanation
            for an unavailable setting could not be reached by Tab or by forms
            mode (UI-04). This is the rule Button, TextField, NumberField and
            SelectField already follow.

            The refusal is enforced, not painted. `preventDefault` on the click
            is what a pointer, Space and a dispatched `click()` all end at, so
            the box never toggles; the change handler refuses as well, for a
            `change` event dispatched straight at the control. Nothing here
            reverts a box after the fact — it is never allowed to move. */}
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-disabled={disabled || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, { hint, error, reason: disabledReason })}
          onClick={(event) => {
            if (disabled) event.preventDefault()
          }}
          onChange={(event) => {
            if (disabled) return
            onChange(event.target.checked)
          }}
        />
        <span>{label}</span>
      </label>
      {hint ? (
        <span className="muted" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="muted" id={`${id}-error`} style={{ color: 'var(--err)' }}>
          {error}
        </span>
      ) : null}
      {disabledReason ? (
        <span className="reason" id={`${id}-reason`}>
          {disabledReason}
        </span>
      ) : null}
    </div>
  )
}

export interface DraftTextFieldProps {
  label: ReactNode
  value: string
  onCommit: Commit
  hint?: ReactNode
  labelHidden?: boolean
  disabledReason?: string | null
  placeholder?: string
  maxLength?: number
  inputId?: string
  className?: string
  spellCheck?: boolean
  externalLabel?: boolean
  /**
   * Ids of notes the caller prints itself — the unit the controller named for
   * this field, laid out in its own row. Appended to this control's
   * description, for the same reason `NumberField` carries one (UI-04).
   */
  descriptionIds?: string
  /** Fired when the person changes the text, before anything is sent. */
  onEdit?: () => void
  /** Draft committed or explicitly discarded; a new edit gets a fresh base. */
  onDraftReset?: () => void
}

/**
 * Single-line text that is owned by the snapshot but edited locally. The value
 * is sent on Enter or blur; a refused value stays on screen next to its reason
 * so it can be corrected, and Escape restores the snapshot value.
 */
export function DraftTextField({
  label,
  value,
  onCommit,
  hint,
  labelHidden,
  disabledReason,
  placeholder,
  maxLength,
  inputId,
  className = '',
  spellCheck = false,
  externalLabel,
  descriptionIds,
  onEdit,
  onDraftReset,
}: DraftTextFieldProps) {
  const autoId = useId()
  const id = inputId ?? autoId
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const disabled = Boolean(disabledReason)
  const shown = draft ?? value
  const owner = useCommitOwner()

  const commit = async (raw: string) => {
    // Same guard as NumberField. A field can be refused *after* a draft was
    // started — the snapshot publishes enabled:false while the person is
    // typing — and the blur or Enter that follows would otherwise send a value
    // for a setting the core has already said is locked. The draft stays on
    // screen beside its reason instead (UI-04).
    if (disabled) return
    if (raw === value) {
      owner.edited()
      setDraft(null)
      onDraftReset?.()
      setError(null)
      return
    }
    const ticket = owner.begin(raw)
    const result = await onCommit(raw)
    // Same rule as NumberField: an answer about `raw` may not repaint a box
    // that has moved on. Losing the field is a no-op, never a reported error.
    if (!owner.owns(ticket)) return
    if (!result) return
    if (result.ok) {
      setDraft(null)
      onDraftReset?.()
      setError(null)
    } else if (result.awaitingConfirmation) {
      setError(null)
    } else {
      setDraft(raw)
      setError(result.message ?? 'Giá trị bị từ chối.')
    }
  }

  return (
    <FieldFrame
      id={id}
      label={label}
      {...(labelHidden === undefined ? {} : { labelHidden })}
      {...(externalLabel === undefined ? {} : { externalLabel })}
      {...(hint === undefined ? {} : { hint })}
      error={error}
      reason={disabledReason ?? null}
    >
      <input
        id={id}
        className={`input ${className}`.trim()}
        type="text"
        value={shown}
        placeholder={placeholder}
        maxLength={maxLength}
        spellCheck={spellCheck}
        autoComplete="off"
        readOnly={disabled}
        aria-disabled={disabled || undefined}
        data-text-entry="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, {
          hint,
          error,
          reason: disabledReason,
          extra: descriptionIds,
        })}
        onChange={(event) => {
          owner.edited()
          onEdit?.()
          setDraft(event.target.value)
        }}
        onBlur={(event) => {
          if (draft !== null && !owner.submitted(event.target.value)) void commit(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit(event.currentTarget.value)
          } else if (event.key === 'Escape' && draft !== null) {
            event.preventDefault()
            event.stopPropagation()
            owner.edited()
            setDraft(null)
            onDraftReset?.()
            setError(null)
          }
        }}
      />
    </FieldFrame>
  )
}
