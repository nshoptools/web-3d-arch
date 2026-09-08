import { useSnapshot, useAsyncAction, useBridge, useRunCommand, useCapability } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { hasProject, NO_PROJECT_REASON } from '../core/project-state.ts'
import { ACCEPT_SOURCE, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { CreateProjectCard } from './CreateProjectCard.tsx'
import { TextControls } from '../text/TextControls.tsx'
import { EmojiPicker } from '../emoji/EmojiPicker.tsx'
import { formatNumber } from '../core/text.ts'

const KIND_LABEL = {
  raster: 'Ảnh raster',
  svg: 'SVG vector',
  text: 'Khối chữ',
  emoji: 'Emoji',
} as const

export function SourceSection() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const source = snapshot.project.source
  const write = useCapability(CAP.projectWrite)
  const ai = useCapability(CAP.aiGenerate)
  const clipboard = useCapability(CAP.clipboard)
  const projectOpen = hasProject(snapshot.project)
  /**
   * Without a project the core refuses every source command with
   * PROJECT_REQUIRED, so that refusal is stated up front and is what blocks the
   * buttons — ahead of `project.write`, which is about a different thing.
   */
  const writeBlocked = !projectOpen ? NO_PROJECT_REASON : write.available ? null : write.reason

  const groupOpen = (id: string, fallback = true) => isGroupOpen(state, id, fallback)
  const toggle = (id: string, fallback = true) => actions.setGroupOpen(id, !groupOpen(id, fallback))

  const importSource = useAsyncAction(async () => {
    const file = await chooseFile(ACCEPT_SOURCE)
    if (!file) return
    return bridge.importFile(file, 'source')
  }, { success: 'Đã nhận tệp nguồn.' })

  const removeSource = useAsyncAction(async () => {
    await run(
      { type: 'source.remove' },
      { success: 'Đã xóa nguồn. Hoàn tác được bằng Ctrl+Z.' },
    )
  })

  return (
    <div className="stack">
      {!projectOpen ? (
        <CreateProjectCard idPrefix="w3a-create-project" />
      ) : source === null ? (
        <div className="empty">
          <strong className="empty__title">Chưa có nguồn thiết kế</strong>
          <p className="muted" style={{ margin: 0 }}>
            Chọn một trong ba lối bắt đầu. Chữ hoặc emoji hợp lệ cũng đủ để thoát trạng thái rỗng,
            không bắt buộc phải có ảnh raster.
          </p>
          <div className="row">
            <Button
              variant="primary"
              icon="upload"
              disabled={importSource.pending}
              disabledReason={writeBlocked}
              onClick={() => void importSource.run()}
            >
              Tải tệp ảnh hoặc SVG
            </Button>
            <Button
              icon="sparkle"
              onClick={() =>
                document.getElementById('w3a-source-emoji')?.scrollIntoView({ block: 'nearest' })
              }
            >
              Chọn emoji
            </Button>
            <Button
              icon="text"
              onClick={() => document.getElementById('w3a-source-text')?.scrollIntoView({ block: 'nearest' })}
            >
              Gõ chữ
            </Button>
          </div>
        </div>
      ) : (
        <div className="card fc-border">
          <div className="row">
            {source.previewUrl ? (
              <img
                src={source.previewUrl}
                alt=""
                width={44}
                height={44}
                style={{ borderRadius: 'var(--r1)', background: '#fff', objectFit: 'contain' }}
              />
            ) : null}
            <div className="grow">
              <strong style={{ overflowWrap: 'anywhere' }}>{source.name}</strong>
              <div className="muted">{KIND_LABEL[source.kind]}</div>
            </div>
          </div>
          <div className="row">
            {source.widthMm !== undefined && source.heightMm !== undefined ? (
              <span className="chip chip--muted fc-border">
                {formatNumber(source.widthMm)} × {formatNumber(source.heightMm)} mm
              </span>
            ) : (
              <span className="chip chip--muted fc-border">Kích thước do nhân báo khi dựng</span>
            )}
            <span className="chip chip--muted fc-border">ID {source.id}</span>
          </div>
          <p className="muted-3" style={{ margin: 0 }}>
            Nguồn vector giữ đơn vị và bounds của chính nó; xem trước không phải nguồn dựng mesh.
          </p>
          <div className="row">
            <Button
              icon="trash"
              variant="danger"
              disabled={removeSource.pending}
              disabledReason={writeBlocked}
              onClick={() => void removeSource.run()}
            >
              Xóa nguồn
            </Button>
            <span className="muted-3">Xóa nguồn là lệnh dự án, hoàn tác được.</span>
          </div>
        </div>
      )}

      <CollapsibleGroup
        title="Tải tệp"
        color="var(--sec-source)"
        open={groupOpen('source-import')}
        onToggle={() => toggle('source-import')}
      >
        <Button
          block
          id="w3a-source-import"
          icon="upload"
          keyHint="Ctrl O"
          disabled={importSource.pending}
          disabledReason={writeBlocked}
          onClick={() => void importSource.run()}
        >
          {importSource.pending ? 'Đang nhận tệp…' : 'Chọn tệp từ máy'}
        </Button>
        <p className="muted" style={{ margin: 0 }}>
          Kéo thả tệp lên khung xem cũng được. Dán bằng Ctrl+V hoạt động khi con trỏ không ở trong
          một ô nhập.
        </p>
        {!clipboard.available ? <span className="reason">Dán: {clipboard.reason}</span> : null}
        <p className="muted-3" style={{ margin: 0 }}>
          Trần theo LIM-01: ảnh 32 MB, SVG 16 MB, lưới STL/OBJ 64 MB. Vượt trần bị từ chối trước
          khi ghi, trạng thái cũ được giữ nguyên.
        </p>
      </CollapsibleGroup>

      <CollapsibleGroup
        title="Tạo ảnh bằng AI"
        color="var(--sec-source)"
        open={groupOpen('source-ai', false)}
        onToggle={() => toggle('source-ai', false)}
      >
        <p className="muted" style={{ margin: 0 }}>
          Mở tab này không gửi gì cả. Prompt và ảnh tham chiếu chỉ rời máy khi bạn bấm Tạo.
        </p>
        <Button
          block
          icon="sparkle"
          variant={ai.available ? 'primary' : 'default'}
          // A generated image is applied to a project, so the same gate applies
          // here as to every other source path.
          disabledReason={writeBlocked ?? (ai.available ? null : ai.reason)}
          onClick={() => actions.openDialog({ kind: 'ai-generate' })}
        >
          {ai.available ? 'Mở trang tạo ảnh' : 'Kết nối AI của bạn'}
        </Button>
        {!ai.available ? (
          <Button block icon="key" onClick={() => actions.openDialog({ kind: 'ai-connections' })}>
            Thêm khóa API của bạn
          </Button>
        ) : null}
      </CollapsibleGroup>

      <div id="w3a-source-text">
        <CollapsibleGroup
          title="Chữ"
          color="var(--sec-source)"
          open={groupOpen('source-text')}
          onToggle={() => toggle('source-text')}
          count="8 thông số · 2 công tắc"
        >
          <TextControls place="panel" />
        </CollapsibleGroup>
      </div>

      <div id="w3a-source-emoji">
        <CollapsibleGroup
          title="Emoji"
          color="var(--sec-source)"
          open={groupOpen('source-emoji')}
          onToggle={() => toggle('source-emoji')}
        >
          <EmojiPicker />
        </CollapsibleGroup>
      </div>
    </div>
  )
}
