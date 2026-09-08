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

export interface ParameterRowProps {
  parameter: ParameterView
  writeBlocked: string | null
}

/**
 * One row, one parameter ID, one command. The export section and the parameter
 * section both render this component, so two UI paths to the same field never
 * become two sources of truth (06-danh-muc-thong-so.md).
 */
export function ParameterRow({ parameter, writeBlocked }: ParameterRowProps) {
  const run = useRunCommand()
  const controlId = useId()
  const blocked =
    writeBlocked ?? (parameter.enabled ? null : (parameter.reason ?? 'Điều khiển đang bị khóa.'))

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

  if (parameter.kind === 'boolean') {
    // A checkbox carries its own value; no second column repeats it (UI-04).
    return (
      <div className="prow" data-overridden={parameter.overridden}>
        <div className="prow__full">
          <CheckField
            inputId={controlId}
            label={parameter.label}
            checked={parameter.value === true}
            disabledReason={blocked}
            {...(parameter.derivedLabel ? { hint: parameter.derivedLabel } : {})}
            onChange={(checked) => void commit(checked)}
          />
          <span className="prow__id">{parameter.id}</span>
        </div>
        {parameter.overridden ? <div className="prow__control">{reset}</div> : null}
      </div>
    )
  }

  if (parameter.kind === 'select') {
    return (
      <div className="prow" data-overridden={parameter.overridden}>
        <label className="prow__label" htmlFor={controlId}>
          {parameter.label}
          <span className="prow__id"> · {parameter.id}</span>
        </label>
        <div className="prow__control">
          <SelectField
            inputId={controlId}
            label={parameter.label}
            externalLabel
            value={String(parameter.value)}
            options={(parameter.options ?? []).map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            disabledReason={blocked}
            onChange={(value) => void commit(value)}
          />
          {parameter.overridden ? reset : null}
        </div>
        {parameter.derivedLabel ? (
          <div className="prow__full muted-3">{parameter.derivedLabel}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="prow" data-overridden={parameter.overridden}>
      <label className="prow__label" htmlFor={controlId}>
        {parameter.label}
        <span className="prow__id"> · {parameter.id}</span>
      </label>
      <div className="prow__control">
        <NumberField
          inputId={controlId}
          label={parameter.label}
          externalLabel
          value={String(parameter.value)}
          unit={parameter.unit}
          {...(parameter.min === undefined ? {} : { min: parameter.min })}
          {...(parameter.max === undefined ? {} : { max: parameter.max })}
          {...(parameter.step === undefined ? {} : { step: parameter.step })}
          disabledReason={blocked}
          onCommit={commit}
        />
        {parameter.overridden ? reset : null}
      </div>
      {parameter.derivedLabel ? (
        // The layer chip is whatever the core says it is; the UI does not
        // multiply a layer count by an assumed layer height (MOD-03).
        <div className="prow__full">
          <span className="chip chip--muted fc-border">{parameter.derivedLabel}</span>
        </div>
      ) : null}
    </div>
  )
}
