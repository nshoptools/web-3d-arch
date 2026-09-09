import { useId } from 'react'
import type { ParameterView } from '../../contracts/app-bridge.ts'
import { useRunCommand } from '../core/bridge.tsx'
import { Button } from '../components/Button.tsx'
import { CheckField, NumberField, SelectField } from '../components/Fields.tsx'

/** The eleven groups of 06-danh-muc-thong-so.md, plus the export flags. */
export const GROUP_LABEL: Record<string, string> = {
  color: 'Màu & chi tiết',
  shape: 'Kích thước & dáng',
  height: 'Chiều cao',
  keyring: 'Lỗ móc',
  brick: 'Ngàm khối',
  charm: 'Charm',
  strap: 'Dây đeo',
  cap: 'Thân keycap',
  stem: 'Trụ MX',
  tray: 'Khay switch',
  imported_mesh: 'Khối nhập',
  export: 'Tùy chọn xuất',
}

export const GROUP_COLOR: Record<string, string> = {
  color: 'var(--sec-materials)',
  shape: 'var(--sec-parameters)',
  height: 'var(--sec-parameters)',
  keyring: 'var(--sec-product)',
  brick: 'var(--sec-product)',
  charm: 'var(--sec-product)',
  strap: 'var(--sec-product)',
  cap: 'var(--sec-product)',
  stem: 'var(--sec-product)',
  tray: 'var(--sec-product)',
  imported_mesh: 'var(--sec-library)',
  export: 'var(--sec-export)',
}

export const GROUP_ORDER = Object.keys(GROUP_LABEL)

/** The controller's stock sentence for a row it keeps but does not apply. */
const INACTIVE_REASON = 'Tham số được giữ lại nhưng đang không có hiệu lực.'
/** Said once per row as a short chip instead of a repeated sentence. */
const INACTIVE_SHORT = 'không hiệu lực với lựa chọn hiện tại'
/** The schema's fallback increment, which is not a step a person would type. */
const EPSILON_STEP = '0.000001'

const UNIT_LABEL: Record<string, string> = {
  layers: 'lớp',
  mm: 'mm',
  deg: '°',
  '°': '°',
  percent: '%',
}

/** The automatic height modes the controller names by id. */
const AUTO_MODE_LABEL: Record<string, string> = {
  'body-height': 'theo chiều cao thân',
  'art-height': 'theo chiều cao hoạ tiết',
  'plate-height': 'theo chiều cao mặt',
}

export function optionLabel(option: { value: string; label: string }): string {
  const auto = /^auto:(.+)$/.exec(option.value)
  if (auto) return `Tự động (${AUTO_MODE_LABEL[auto[1]!] ?? auto[1]})`
  return option.label
}

/** What the derived chip says: the millimetres alone. The caveat is printed once per group. */
export function derivedValue(label: string | undefined): string | null {
  if (!label) return null
  const mm = /^([\d.,]+)\s*mm/.exec(label)
  return mm ? `≈ ${mm[1]!.replace('.', ',')} mm` : label
}

export interface ParameterRowProps {
  parameter: ParameterView
  writeBlocked: string | null
}

/**
 * One row, one parameter ID, one command. The export section and the parameter
 * section both render this component, so two UI paths to the same field never
 * become two sources of truth (06-danh-muc-thong-so.md).
 *
 * A row the controller keeps but does not apply (`enabled: false` with the
 * stock reason) stays readable and says so with one short chip; the sentence
 * is kept on the control's accessible description.
 */
export function ParameterRow({ parameter, writeBlocked }: ParameterRowProps) {
  const run = useRunCommand()
  const controlId = useId()
  const inactive = !parameter.enabled && (parameter.reason ?? '') === INACTIVE_REASON
  const blocked =
    writeBlocked ?? (parameter.enabled ? null : (parameter.reason ?? 'Điều khiển đang bị khóa.'))
  const unit = parameter.unit ? (UNIT_LABEL[parameter.unit] ?? parameter.unit) : null
  const step = parameter.step === EPSILON_STEP ? undefined : parameter.step
  const derived = derivedValue(parameter.derivedLabel)

  const commit = async (value: string | boolean) => {
    const result = await run(
      { type: 'parameter.set', id: parameter.id, value },
      { toastOnError: false },
    )
    return result.ok ? { ok: true } : { ok: false, message: result.diagnostic.message }
  }

  const reset = (
    <Button
      size="small"
      icon="refresh"
      aria-label={`Về mặc định: ${parameter.label}`}
      disabledReason={blocked}
      reasonHidden
      onClick={() => void run({ type: 'parameter.reset', id: parameter.id })}
    >
      Mặc định
    </Button>
  )
  const inactiveChip = inactive ? (
    <span className="chip chip--muted fc-border prow__inactive" title={INACTIVE_REASON}>
      {INACTIVE_SHORT}
    </span>
  ) : null

  if (parameter.kind === 'boolean') {
    // A checkbox carries its own value; no second column repeats it (UI-04).
    return (
      <div className="prow" data-overridden={parameter.overridden} data-parameter-id={parameter.id} data-inactive={inactive ? 'true' : 'false'}>
        <div className="prow__full">
          <CheckField
            inputId={controlId}
            label={parameter.label}
            checked={parameter.value === true}
            disabledReason={inactive ? null : blocked}
            {...(parameter.derivedLabel ? { hint: parameter.derivedLabel } : {})}
            onChange={(checked) => void commit(checked)}
          />
        </div>
        {inactive || parameter.overridden ? (
          <div className="prow__full row">
            {inactiveChip}
            {parameter.overridden ? reset : null}
          </div>
        ) : null}
      </div>
    )
  }

  if (parameter.kind === 'select') {
    return (
      <div className="prow" data-overridden={parameter.overridden} data-parameter-id={parameter.id} data-inactive={inactive ? 'true' : 'false'}>
        <label className="prow__label" htmlFor={controlId}>
          {parameter.label}
        </label>
        <div className="prow__control">
          <SelectField
            inputId={controlId}
            label={parameter.label}
            externalLabel
            value={String(parameter.value)}
            options={(parameter.options ?? []).map((option) => ({
              value: option.value,
              label: optionLabel(option),
            }))}
            disabledReason={inactive ? INACTIVE_REASON : blocked}
            onChange={(value) => void commit(value)}
          />
          {parameter.overridden ? reset : null}
        </div>
        {inactive || derived ? (
          <div className="prow__full row">
            {inactiveChip}
            {derived ? <span className="chip chip--muted fc-border">{derived}</span> : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="prow" data-overridden={parameter.overridden} data-parameter-id={parameter.id} data-inactive={inactive ? 'true' : 'false'}>
      <label className="prow__label" htmlFor={controlId}>
        {parameter.label}
      </label>
      <div className="prow__control">
        <NumberField
          inputId={controlId}
          label={parameter.label}
          externalLabel
          value={String(parameter.value)}
          unit={unit}
          {...(parameter.min === undefined ? {} : { min: parameter.min })}
          {...(parameter.max === undefined ? {} : { max: parameter.max })}
          {...(step === undefined ? {} : { step })}
          disabledReason={inactive ? INACTIVE_REASON : blocked}
          onCommit={commit}
        />
        {parameter.overridden ? reset : null}
      </div>
      {inactive || derived ? (
        // The layer chip is whatever the core says it is; the UI does not
        // multiply a layer count by an assumed layer height (MOD-03).
        <div className="prow__full row">
          {inactiveChip}
          {derived ? <span className="chip chip--muted fc-border">{derived}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
