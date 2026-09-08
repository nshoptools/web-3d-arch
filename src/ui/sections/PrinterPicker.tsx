/**
 * Printer selection (EXP-02, UI-C01).
 *
 * Contract 0.3 publishes the list in `AppSnapshot.printers` and takes
 * `printer.select`. The "qualified" badge is repeated from the core row and is
 * never inferred from a name: it only ever means the exact machine, nozzle,
 * material and slicer build that were actually tested.
 *
 * Since UI-C11 there is a second, unrelated thing called a profile: the personal
 * library in `AppSnapshot.printerProfiles`. The two are joined here by one
 * sentence and nothing else — choosing a machine does not apply a profile,
 * importing a profile does not choose a machine, and the interface never
 * matches one to the other by name.
 */
import { useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { CAP } from '../core/registry.ts'
import { invalidProfileCount } from '../core/printer-profile.ts'
import { SelectField } from '../components/Fields.tsx'

export function PrinterPicker({ idPrefix }: { idPrefix: string }) {
  const snapshot = useSnapshot()
  const run = useRunCommand()
  const printerList = useCapability(CAP.printerList)
  const { printer, printers } = snapshot
  // Absent means an older bridge, not an empty library, so nothing is said at
  // all rather than "you have 0 profiles" (UI-C11).
  const profiles = snapshot.printerProfiles

  const blocked = printerList.available
    ? printers.length === 0
      ? 'Nhân đã công bố năng lực chọn máy in nhưng danh sách máy in đang trống.'
      : null
    : printerList.reason

  return (
    <div className="stack">
      <div className="row">
        <span className="grow">
          <strong>{printer.label}</strong>
          <span className="muted-3"> · {printer.filamentSlots} khe filament</span>
        </span>
        <span className={`chip ${printer.qualified ? 'chip--ok' : 'chip--warn'} fc-border`}>
          {printer.qualified ? 'hồ sơ đã kiểm' : 'hồ sơ chưa kiểm'}
        </span>
      </div>
      <SelectField
        inputId={`${idPrefix}-printer`}
        label="Máy in đang chọn"
        value={printer.id ?? ''}
        options={[
          ...(printer.id === null
            ? [{ value: '', label: 'Chưa gắn ID máy — máy in chung', disabled: true }]
            : []),
          ...printers.map((item) => ({
            value: item.id,
            label: `${item.label} · ${item.filamentSlots} khe · ${
              item.qualified ? 'hồ sơ đã kiểm' : 'hồ sơ chưa kiểm'
            }`,
          })),
        ]}
        disabledReason={blocked}
        hint="Danh sách do nhân công bố. Nhãn “đã kiểm” chỉ áp cho đúng máy, nozzle, vật liệu và bản slicer đã thử; không suy sang máy khác."
        onChange={(value) => {
          if (value === '') return
          void run({ type: 'printer.select', id: value }, { success: 'Đã gửi lệnh đổi máy in.' })
        }}
      />
      {printers.length > 0 ? (
        <span className="muted-3">
          {printers.filter((item) => item.qualified).length}/{printers.length} máy có hồ sơ đã kiểm.
        </span>
      ) : null}
      {profiles ? (
        <span
          className="muted-3"
          data-printer-profile-summary={profiles.enabled ? profiles.items.length : 'blocked'}
        >
          Thư viện hồ sơ máy in cá nhân của bạn:{' '}
          {profiles.enabled
            ? `${profiles.items.length} hồ sơ đã nhập${
                invalidProfileCount(profiles) > 0
                  ? `, ${invalidProfileCount(profiles)} trong đó nhân báo lỗi`
                  : ''
              }`
            : 'nhân đang không mở thư viện này'}
          . Nằm ở Cài đặt cá nhân → “Máy in và hồ sơ hiệu chuẩn”. Nhãn “đã kiểm” ở trên nói về máy
          in, không phải về hồ sơ trong thư viện; hồ sơ trong thư viện không tự áp cho máy đang
          chọn và giao diện không tự khớp hồ sơ với máy theo tên.
        </span>
      ) : null}
    </div>
  )
}
