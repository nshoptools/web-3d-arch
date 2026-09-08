/**
 * Pure readings of the additive export members of contract 0.3
 * (`ExportOption.configuration`, `ExportFieldView`, `ExportReceiptView`).
 *
 * Nothing here parses a number, rounds a value, invents a limit or decides what
 * a field *means*. Every function answers a question the snapshot already
 * carries an answer to, so the interface and the checks read it the same way.
 */
import type { ExportFieldView, ExportOption, ExportReceiptView, Verdict } from '../../contracts/app-bridge.ts'
import { VERDICT_TONE } from './text.ts'

/** The settings block a format published, or null when it published none. */
export type ExportConfigurationView = NonNullable<ExportOption['configuration']>

/**
 * A format with no `configuration` keeps the older interface exactly: contract
 * 0.3 is additive, and an omitted block is "this build publishes no settings
 * for this path", never "show an empty settings box".
 */
export function exportConfiguration(option: ExportOption): ExportConfigurationView | null {
  return option.configuration ?? null
}

/** True while at least one published format carries a settings block. */
export function hasExportConfiguration(exports: readonly ExportOption[]): boolean {
  return exports.some((option) => option.configuration !== undefined)
}

/**
 * Why a settings control cannot be changed, or null when it can.
 *
 * Two clauses and only two. Write access comes first because changing an export
 * flag is a project commit (EXP-01/DAT-01), and after it the field's own
 * published `enabled`/`reason`. **`option.enabled` is deliberately not
 * consulted**: a format shut for a missing mesh still has settings that must be
 * readable and correctable — that is the whole point of UI-C10.
 */
export function exportFieldReason(field: ExportFieldView, writeBlocked: string | null): string | null {
  if (writeBlocked) return writeBlocked
  if (field.enabled) return null
  return field.reason ?? 'Nhân đang khóa thiết lập này.'
}

/**
 * The published limits of a numeric field, as one sentence, or null when the
 * controller published none. Only what it sent is printed: no assumed minimum,
 * no assumed step, no unit conversion.
 */
export function exportFieldRangeNote(field: ExportFieldView): string | null {
  if (field.kind !== 'number') return null
  const unit = field.unit ? ` ${field.unit}` : ''
  const bounds =
    field.min !== undefined && field.max !== undefined
      ? `Miền ${field.min}–${field.max}${unit}`
      : field.min !== undefined
        ? `Tối thiểu ${field.min}${unit}`
        : field.max !== undefined
          ? `Tối đa ${field.max}${unit}`
          : null
  const step = field.step !== undefined ? `bước ${field.step}${unit}` : null
  if (!bounds && !step) return null
  return [bounds, step].filter(Boolean).join(' · ')
}

/** The chip class for a verdict, from the table the rest of the UI already uses. */
export function verdictChipClass(verdict: Verdict): string {
  return `chip chip--${VERDICT_TONE[verdict]} fc-border`
}

/**
 * How a receipt describes its own intent. The flag is the controller's; the
 * interface never derives it from a verdict or from the label on a button.
 */
export function receiptIntentLabel(receipt: ExportReceiptView): string {
  return receipt.inspection ? 'lượt xuất để kiểm tra' : 'lượt xuất thường'
}
