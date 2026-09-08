import { useState } from 'react'
import type { Diagnostic, ProductId } from '../../contracts/app-bridge.ts'
import { useAsyncAction, useBridge, useCapability, useRunCommand, useSnapshot } from '../core/bridge.tsx'
import { useUi, useUiActions, type SourceIntent } from '../core/ui-state.tsx'
import { CAP, PRODUCTS } from '../core/registry.ts'
import { hasProject } from '../core/project-state.ts'
import { ACCEPT_PROJECT, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { SelectField } from '../components/Fields.tsx'
import { diagnosticText } from '../core/text.ts'

/**
 * Creating a project is the first door of the two-step flow.
 *
 * With no document open the core answers `PROJECT_REQUIRED` to every source,
 * parameter and save command, so the interface must lead here instead of firing
 * a command it knows will be refused. This card owns nothing but the choice: the
 * product type goes into `project.create`, the package goes into `importFile`,
 * and whether either succeeded is the core's answer, never an assumption made
 * here.
 *
 * A refusal stays on screen with its code until the user acts on it — a toast
 * that has scrolled away is not a way back in.
 */

const PENDING_REASON = 'Đang chờ nhân trả lời lượt trước.'

const INTENT_OPTIONS: { value: SourceIntent; label: string; anchor: string | null }[] = [
  { value: 'file', label: 'Tải tệp ảnh hoặc SVG', anchor: 'w3a-source-import' },
  { value: 'emoji', label: 'Chọn emoji', anchor: 'w3a-source-emoji' },
  { value: 'text', label: 'Gõ chữ', anchor: 'w3a-source-text' },
  { value: 'none', label: 'Không mở gì, tôi tự chọn', anchor: null },
]

export function CreateProjectCard({ idPrefix = 'w3a-create' }: { idPrefix?: string }) {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const write = useCapability(CAP.projectWrite)
  const writeBlocked = write.available ? null : write.reason

  const [product, setProduct] = useState<ProductId>(PRODUCTS[0]?.id ?? 'keychain')
  const [failure, setFailure] = useState<{ action: 'create' | 'import'; diagnostic: Diagnostic } | null>(
    null,
  )

  const intent = state.sourceIntent

  /**
   * After the core confirms the project exists, take the user to the task they
   * were reaching for. The file chooser is *not* opened from here: that click
   * already spent its user activation on "Tạo dự án", and a chooser opened after
   * an await is blocked by the browser. The button is focused instead.
   */
  const openIntendedTask = () => {
    const target = INTENT_OPTIONS.find((option) => option.value === intent)
    if (!target?.anchor) return
    actions.setSection('source', true)
    requestAnimationFrame(() => {
      const node = document.getElementById(target.anchor as string)
      node?.scrollIntoView({ block: 'nearest' })
      const focusable =
        node instanceof HTMLButtonElement
          ? node
          : (node?.querySelector<HTMLElement>('button, input, textarea, select') ?? null)
      focusable?.focus()
    })
  }

  const createProject = useAsyncAction(async () => {
    const result = await run({ type: 'project.create', product }, { toastOnError: false })
    if (result.ok) {
      setFailure(null)
      actions.announce('Nhân đã tạo dự án mới.')
      openIntendedTask()
      return
    }
    // A confirmation is already a dialog; only a plain refusal belongs inline.
    if (!result.confirmation) setFailure({ action: 'create', diagnostic: result.diagnostic })
  })

  const importProject = useAsyncAction(async () => {
    const file = await chooseFile(ACCEPT_PROJECT)
    if (!file) return
    const result = await bridge.importFile(file, 'project')
    if (result.ok) {
      setFailure(null)
      actions.announce('Nhân đã nhận gói dự án.')
      return
    }
    if (!result.confirmation) setFailure({ action: 'import', diagnostic: result.diagnostic })
    // Reported inline; the shared handler would only repeat it as a toast.
  })

  const open = hasProject(snapshot.project)

  return (
    <div className="card fc-border" data-create-project="true" id={idPrefix}>
      <strong className="card__title">{open ? 'Dự án mới' : 'Bắt đầu bằng một dự án'}</strong>
      <p className="muted" style={{ margin: 0 }}>
        {open
          ? 'Tạo thêm một dự án khác. Dự án đang mở không bị đóng cho tới khi nhân xác nhận đã tạo xong.'
          : 'Nguồn, thông số, màu và lưu đều thuộc về một dự án. Khi chưa có dự án nào đang mở, nhân từ chối các lệnh đó với mã PROJECT_REQUIRED, nên hãy chọn loại sản phẩm và tạo dự án trước.'}
      </p>

      <SelectField
        inputId={`${idPrefix}-product`}
        label="Loại sản phẩm"
        value={product}
        options={PRODUCTS.map((item) => ({ value: item.id, label: `${item.label} — ${item.sub}` }))}
        disabledReason={writeBlocked}
        hint="Loại sản phẩm quyết định bộ thông số và ràng buộc lắp ghép. Đổi lại sau được, và nhân sẽ hỏi trước khi đổi."
        onChange={(value) => setProduct(value as ProductId)}
      />

      <SelectField
        inputId={`${idPrefix}-intent`}
        label="Sau khi tạo xong, mở"
        value={intent}
        options={INTENT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        hint="Chỉ là đường điều hướng: giao diện không tự gửi lệnh nguồn thay bạn."
        onChange={(value) => actions.setSourceIntent(value as SourceIntent)}
      />

      {/* Soft-disabled while pending: a `disabled` button drops focus, which
          matters most on the control someone just pressed. */}
      <Button
        icon="plus"
        variant={open ? 'default' : 'primary'}
        disabledReason={writeBlocked ?? (createProject.pending ? PENDING_REASON : null)}
        reasonHidden={writeBlocked === null}
        onClick={() => void createProject.run()}
      >
        {createProject.pending ? 'Đang tạo…' : 'Tạo dự án'}
      </Button>

      <div className="divider" />

      <Button
        icon="upload"
        disabledReason={writeBlocked ?? (importProject.pending ? PENDING_REASON : null)}
        reasonHidden={writeBlocked === null}
        onClick={() => void importProject.run()}
      >
        {importProject.pending ? 'Đang nhận gói…' : 'Mở gói dự án đã có'}
      </Button>
      <p className="muted-3" style={{ margin: 0 }}>
        Gói cứu do chính ứng dụng này xuất ra ({'*'}.arch-project.zip). Nhân kiểm schema, đường dẫn,
        CRC và SHA-256 rồi mới tạo bản sao; hỏng ở bước nào thì không có dự án nào được tạo.
      </p>

      {failure ? (
        <div className="diag diag--error fc-border" role="alert" data-create-failure={failure.action}>
          <div className="diag__head">
            <span className="diag__sev">
              {failure.action === 'create' ? 'Tạo dự án thất bại' : 'Mở gói dự án thất bại'}
            </span>
            <code className="diag__code">{failure.diagnostic.code}</code>
          </div>
          <div className="diag__msg">
            {diagnosticText(failure.diagnostic.code, failure.diagnostic.message)}
          </div>
          {failure.diagnostic.detail ? (
            <div className="diag__detail">{failure.diagnostic.detail}</div>
          ) : null}
          <div className="row">
            <Button
              size="small"
              icon="redo"
              disabledReason={
                createProject.pending || importProject.pending ? PENDING_REASON : null
              }
              reasonHidden
              onClick={() => {
                if (failure.action === 'create') void createProject.run()
                else void importProject.run()
              }}
            >
              Thử lại
            </Button>
            <Button size="small" onClick={() => setFailure(null)}>
              Bỏ qua thông báo
            </Button>
            <Button
              size="small"
              icon="dots"
              onClick={() => actions.openDialog({ kind: 'diagnostics' })}
            >
              Mở nhật ký
            </Button>
          </div>
          <p className="muted-3" style={{ margin: 0 }}>
            Không có dự án nào được tạo. Thông báo này ở lại cho tới khi bạn thử lại hoặc tự bỏ qua.
          </p>
        </div>
      ) : null}
    </div>
  )
}
