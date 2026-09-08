import { useState } from 'react'
import type { SettingView } from '../../contracts/app-bridge.ts'
import {
  settingText,
  useAsyncAction,
  useBridge,
  useCapability,
  useResultHandler,
  useRunCommand,
  useSetting,
  useSnapshot,
} from '../core/bridge.tsx'
import { CAP, SETTING } from '../core/registry.ts'
import { ACCEPT_PRESET, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { Dialog } from '../components/Dialog.tsx'
import { CheckField, SelectField } from '../components/Fields.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { PrinterPicker } from '../sections/PrinterPicker.tsx'
import { PrinterProfileLibrary } from '../sections/PrinterProfileLibrary.tsx'

type Scope = SettingView['scope']

const SCOPE_LABEL: Record<Scope, string> = {
  system: 'hệ thống',
  user: 'cá nhân',
  device: 'thiết bị này',
  project: 'dự án',
}

const SOURCE_LABEL: Record<SettingView['effectiveFrom'], string> = {
  default: 'mặc định',
  system: 'chính sách hệ thống',
  user: 'mặc định cá nhân',
  device: 'thiết bị này',
  project: 'snapshot dự án',
}

function ScopeTag({ setting, fallback }: { setting: SettingView | null; fallback: Scope }) {
  const scope = setting?.scope ?? fallback
  return (
    <span
      className="chip chip--muted fc-border"
      title={
        setting
          ? `Phạm vi: ${SCOPE_LABEL[scope]} · giá trị đang dùng đến từ ${SOURCE_LABEL[setting.effectiveFrom]}`
          : `Phạm vi: ${SCOPE_LABEL[scope]} · nhân chưa công bố giá trị`
      }
    >
      {SCOPE_LABEL[scope]}
    </span>
  )
}

/** The published state of one key, in the words the user needs (ACC-03). */
function settingNote(setting: SettingView | null): string {
  if (!setting) return 'Nhân chưa công bố giá trị của mục này trong snapshot.'
  if (setting.policyBlocked) {
    return (
      setting.reason ??
      'Chính sách hệ thống đang chặn giá trị này. Giá trị cũ được giữ nguyên, không bị sửa ngầm.'
    )
  }
  return `Đang dùng giá trị từ ${SOURCE_LABEL[setting.effectiveFrom]}.`
}

/**
 * Personal settings (ACC-03, UI-C05, UI-C06).
 *
 * Every control shows the value the snapshot publishes, not the value this form
 * last sent: a refused write leaves the old value on screen. Import and reset
 * are their own confirmed commands — the core parses the document and enforces
 * the limits, and no secret ever travels through this dialog.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const handleResult = useResultHandler()
  const mirror = useCapability(CAP.mirror)
  const [mirrorPending, setMirrorPending] = useState(false)

  const units = useSetting(SETTING.units)
  const language = useSetting(SETTING.language)
  const fontSize = useSetting(SETTING.fontSize)
  const calibration = useSetting(SETTING.calibrationProfiles)

  const [replaceArmed, setReplaceArmed] = useState(false)
  const [resetArmed, setResetArmed] = useState(false)
  const [openGroups, setOpenGroups] = useState({
    display: true,
    machine: false,
    data: false,
    published: false,
  })

  const send = useAsyncAction(async (values: Record<string, string | number | boolean>) => {
    await run({ type: 'settings.update', values }, { success: 'Đã gửi cài đặt.' })
  })

  const importJson = useAsyncAction(async (mode: 'merge' | 'replace') => {
    const file = await chooseFile(ACCEPT_PRESET)
    if (!file) return
    // The shell reads the bytes; the core parses, validates and limits them.
    // The interface never interprets a settings document itself (UI-C06).
    const document_ = await file.text()
    await run(
      { type: 'settings.import', mode, document: document_, confirmed: true },
      {
        success: mode === 'merge' ? 'Đã gửi bản gộp cài đặt.' : 'Đã gửi bản nạp thay cài đặt.',
      },
    )
    setReplaceArmed(false)
  })

  const resetSettings = useAsyncAction(async () => {
    await run(
      { type: 'settings.reset', confirmed: true },
      { success: 'Đã gửi lệnh đặt lại cài đặt cá nhân.' },
    )
    setResetArmed(false)
  })

  const settingsExport = snapshot.exports.find((option) => option.id.includes('settings'))
  const exportJson = useAsyncAction(
    async () => (settingsExport ? bridge.exportFile(settingsExport.id) : undefined),
    { announce: 'Đã gửi yêu cầu xuất cài đặt.' },
  )

  const fontSizeValue = settingText(fontSize) ?? ''
  const unitsValue = settingText(units) ?? ''
  const languageValue = settingText(language) ?? ''
  const calibrationCount = Array.isArray(calibration?.value) ? calibration.value.length : null

  return (
    <Dialog
      title="Cài đặt cá nhân"
      wide
      onClose={onClose}
      description="Mỗi mục ghi rõ phạm vi hiệu lực và nơi giá trị đang dùng đến từ đâu. Giá trị giao diện trên thiết bị không làm đổi hình học dự án."
      footer={
        <Button variant="primary" onClick={onClose}>
          Đóng
        </Button>
      }
    >
      <CollapsibleGroup
        title="Hiển thị và trợ năng"
        open={openGroups.display}
        onToggle={() => setOpenGroups((value) => ({ ...value, display: !value.display }))}
      >
        <div className="row">
          <div className="grow">
            <SelectField
              label="Cỡ chữ giao diện"
              value={fontSizeValue}
              options={[
                ...(fontSizeValue === '' || ['14', '16', '18', '22'].includes(fontSizeValue)
                  ? []
                  : [{ value: fontSizeValue, label: `${fontSizeValue} px (nhân đang đặt)` }]),
                ...(fontSizeValue === ''
                  ? [{ value: '', label: 'Nhân chưa công bố', disabled: true }]
                  : []),
                { value: '14', label: '14 px — mặc định' },
                { value: '16', label: '16 px — lớn' },
                { value: '18', label: '18 px — rất lớn' },
                { value: '22', label: '22 px — tối đa của bản dựng này' },
              ]}
              disabledReason={fontSize?.policyBlocked ? settingNote(fontSize) : null}
              hint={`${settingNote(fontSize)} Trang vẫn cuộn được ở mức phóng chữ 200% của trình duyệt, độc lập với mục này.`}
              onChange={(value) => {
                if (value === '') return
                void send.run({ [SETTING.fontSize]: Number(value) })
              }}
            />
          </div>
          <ScopeTag setting={fontSize} fallback="user" />
        </div>

        <div className="row">
          <div className="grow">
            <SelectField
              label="Đơn vị hiển thị"
              value={unitsValue}
              options={[
                ...(unitsValue === ''
                  ? [{ value: '', label: 'Nhân chưa công bố', disabled: true }]
                  : []),
                { value: 'mm', label: 'Milimet (mm)' },
                { value: 'in', label: 'Inch (in)' },
              ]}
              disabledReason={units?.policyBlocked ? settingNote(units) : null}
              hint={`${settingNote(units)} Đơn vị do nhân quy đổi; giao diện không tự đổi số.`}
              onChange={(value) => {
                if (value === '') return
                void send.run({ [SETTING.units]: value })
              }}
            />
          </div>
          <ScopeTag setting={units} fallback="user" />
        </div>

        <div className="row">
          <div className="grow">
            <SelectField
              label="Ngôn ngữ"
              value={languageValue}
              options={[
                ...(languageValue === ''
                  ? [{ value: '', label: 'Nhân chưa công bố', disabled: true }]
                  : []),
                { value: 'vi', label: 'Tiếng Việt' },
                { value: 'en', label: 'English' },
              ]}
              disabledReason={language?.policyBlocked ? settingNote(language) : null}
              hint={settingNote(language)}
              onChange={(value) => {
                if (value === '') return
                void send.run({ [SETTING.language]: value })
              }}
            />
          </div>
          <ScopeTag setting={language} fallback="user" />
        </div>

        <p className="muted-3" style={{ margin: 0 }}>
          Giao diện tôn trọng thiết lập hệ thống của bạn về giảm chuyển động, tăng tương phản và
          màu bắt buộc; không có công tắc riêng để ghi đè chúng.
        </p>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Máy in và hồ sơ hiệu chuẩn"
        open={openGroups.machine}
        onToggle={() => setOpenGroups((value) => ({ ...value, machine: !value.machine }))}
      >
        <PrinterPicker idPrefix="w3a-settings" />
        <PrinterProfileLibrary />
        <div className="row">
          <span className="grow muted">Hồ sơ hiệu chuẩn đã lưu</span>
          <span className="chip chip--muted fc-border">
            {calibrationCount === null ? 'nhân chưa công bố' : `${calibrationCount} hồ sơ`}
          </span>
          <ScopeTag setting={calibration} fallback="user" />
        </div>
        <p className="muted-3" style={{ margin: 0 }}>
          Hồ sơ hiệu chuẩn gắn với đúng máy, nozzle, vật liệu và bản slicer. Không tự áp sang máy
          khác chỉ vì cùng tài khoản. Đây là một danh mục khác với thư viện hồ sơ máy in ở trên.
          Không bản dựng nào ở đây có màn sửa hồ sơ: cấu trúc hồ sơ do nhân định nghĩa, giao diện
          chỉ nhập, hiển thị, tải về và xóa.
        </p>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Dữ liệu cài đặt"
        open={openGroups.data}
        onToggle={() => setOpenGroups((value) => ({ ...value, data: !value.data }))}
      >
        <Button
          icon="download"
          disabled={exportJson.pending}
          disabledReason={
            settingsExport
              ? settingsExport.enabled
                ? null
                : (settingsExport.reason ?? 'Đường xuất cài đặt đang bị chặn.')
              : 'Nhân chưa đăng ký đường xuất JSON cài đặt trong bản dựng này.'
          }
          onClick={() => void exportJson.run()}
        >
          Xuất JSON cài đặt
        </Button>
        <Button
          icon="upload"
          disabled={importJson.pending}
          onClick={() => void importJson.run('merge')}
        >
          Gộp JSON vào cài đặt hiện có
        </Button>
        <div className="stack">
          <Button
            icon="upload"
            variant={replaceArmed ? 'danger' : 'default'}
            disabled={importJson.pending}
            disabledReason={replaceArmed ? null : 'Xác nhận bên dưới trước khi nạp thay.'}
            onClick={() => void importJson.run('replace')}
          >
            Nạp thay toàn bộ cài đặt
          </Button>
          <CheckField
            label="Tôi hiểu tác động của nạp thay"
            checked={replaceArmed}
            hint="Nạp thay bỏ mọi mặc định cá nhân hiện có và thay bằng nội dung tệp. Dự án đã lưu không bị sửa. Bản JSON không chứa khóa API hay định danh phiên."
            onChange={setReplaceArmed}
          />
        </div>
        <div className="stack">
          <Button
            icon="refresh"
            variant={resetArmed ? 'danger' : 'default'}
            disabled={resetSettings.pending}
            disabledReason={resetArmed ? null : 'Xác nhận bên dưới trước khi đặt lại.'}
            onClick={() => void resetSettings.run()}
          >
            Về mặc định gốc
          </Button>
          <CheckField
            label="Tôi hiểu tác động của đặt lại"
            checked={resetArmed}
            hint="Đặt lại xóa mặc định cá nhân của bạn. Thông tin kết nối AI và sổ chi phí không bị đụng tới."
            onChange={setResetArmed}
          />
        </div>
        <p className="muted-3" style={{ margin: 0 }}>
          Thông tin kết nối AI nằm ở kho riêng, không nằm trong JSON này. Xuất hay đặt lại cài đặt
          không đụng tới khóa của bạn.
        </p>
      </CollapsibleGroup>

      <div className="card fc-border">
        <div className="row">
          <strong className="grow">Thư mục sao lưu song song</strong>
          <ScopeTag setting={null} fallback="device" />
        </div>
        <Button
          icon="folder"
          disabled={mirrorPending}
          disabledReason={mirror.available ? null : mirror.reason}
          onClick={() => {
            // File System Access needs the activation of *this* gesture, so the
            // bridge call is made straight from the click with nothing awaited
            // before it (UI-C09).
            setMirrorPending(true)
            bridge
              .pickMirrorDirectory()
              .then((result) => {
                handleResult(result, { success: 'Đã chọn thư mục sao lưu song song.' })
              })
              .catch((cause: unknown) => {
                handleResult({
                  ok: false,
                  diagnostic: {
                    code: 'MIRROR_PICK_FAILED',
                    severity: 'error',
                    message: 'Không mở được hộp chọn thư mục.',
                    detail: cause instanceof Error ? cause.message : String(cause),
                  },
                })
              })
              .finally(() => setMirrorPending(false))
          }}
        >
          {mirrorPending ? 'Đang chờ hộp chọn…' : 'Chọn thư mục'}
        </Button>
        <p className="muted-3" style={{ margin: 0 }}>
          Bấm Hủy trong hộp chọn của trình duyệt không đổi thư mục nào và không đụng tới dự án. Bản
          sao song song là bản thêm, không thay bản lưu chính của ứng dụng.
        </p>
      </div>

      <CollapsibleGroup
        title="Giá trị nhân đang công bố"
        open={openGroups.published}
        onToggle={() => setOpenGroups((value) => ({ ...value, published: !value.published }))}
        count={`${snapshot.settings.length} khóa`}
      >
        {snapshot.settings.length === 0 ? (
          <p className="muted">Nhân chưa công bố cài đặt nào trong snapshot này.</p>
        ) : (
          <ul className="list-reset stack">
            {snapshot.settings.map((setting) => (
              <li key={setting.key} className="row">
                <code className="diag__code grow" style={{ overflowWrap: 'anywhere' }}>
                  {setting.key}
                </code>
                <span className="chip chip--muted fc-border">{SCOPE_LABEL[setting.scope]}</span>
                <span className="chip chip--muted fc-border">
                  từ {SOURCE_LABEL[setting.effectiveFrom]}
                </span>
                {setting.policyBlocked ? (
                  <span className="chip chip--warn fc-border">policy-blocked</span>
                ) : null}
                {setting.reason ? <span className="reason">{setting.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <p className="muted-3" style={{ margin: 0 }}>
          Đây là bảng đọc: mọi ô ở trên lấy giá trị từ đúng danh sách này, nên trạng thái của biểu
          mẫu không bao giờ được coi là cài đặt đã lưu.
        </p>
      </CollapsibleGroup>
    </Dialog>
  )
}
