import { useSnapshot, useAsyncAction, useBridge, useRunCommand, useCapability } from '../core/bridge.tsx'
import { isGroupOpen, useUi, useUiActions } from '../core/ui-state.tsx'
import { CAP } from '../core/registry.ts'
import { ACCEPT_SOURCE, chooseFile } from '../core/file-dialog.ts'
import { Button } from '../components/Button.tsx'
import { CollapsibleGroup } from '../components/Group.tsx'
import { TextControls } from '../text/TextControls.tsx'
import { EmojiPicker } from '../emoji/EmojiPicker.tsx'
import { formatNumber } from '../core/text.ts'
import { emojiGlyphOf } from '../core/names.ts'

const KIND_LABEL = {
  raster: 'Ảnh raster',
  svg: 'SVG vector',
  text: 'Khối chữ',
  emoji: 'Emoji',
} as const

/**
 * The source of the design: one of a file, a block of text, an emoji or an AI
 * image. The four ways in are groups; only the file group starts open, the
 * others open when chosen so the panel is not a wall of controls before the
 * first choice is made.
 */
export function SourceSection() {
  const snapshot = useSnapshot()
  const bridge = useBridge()
  const run = useRunCommand()
  const actions = useUiActions()
  const { state } = useUi()
  const source = snapshot.project.source
  const write = useCapability(CAP.projectWrite)
  const ai = useCapability(CAP.aiGenerate)
  const writeBlocked = write.available ? null : write.reason

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
      { success: 'Đã bỏ nguồn. Hoàn tác được bằng Ctrl+Z.' },
    )
  })

  return (
    <div className="stack">
      {source === null ? (
        // The three ways in are offered once, on the empty frame of the stage;
        // the panel only says which groups below do the same thing.
        <p className="muted" style={{ margin: 0 }} data-source-empty="true">
          Chưa có nguồn. Chọn một cách bên dưới.
        </p>
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
              <strong style={{ overflowWrap: 'anywhere' }} title={source.name}>
                {source.kind === 'emoji' && emojiGlyphOf(source.name) ? `Emoji ${emojiGlyphOf(source.name)}` : source.name}
              </strong>
              <div className="muted">
                {KIND_LABEL[source.kind]}
                {source.widthMm !== undefined && source.heightMm !== undefined
                  ? ` · ${formatNumber(source.widthMm)} × ${formatNumber(source.heightMm)} mm`
                  : ''}
              </div>
            </div>
          </div>
          <div className="row">
            <Button
              size="small"
              icon="upload"
              disabled={importSource.pending}
              disabledReason={writeBlocked}
              reasonHidden
              onClick={() => void importSource.run()}
            >
              Thay bằng tệp khác
            </Button>
            <Button
              size="small"
              icon="trash"
              variant="danger"
              disabled={removeSource.pending}
              disabledReason={writeBlocked}
              reasonHidden
              onClick={() => void removeSource.run()}
            >
              Bỏ nguồn
            </Button>
            <span className="muted-3">Hoàn tác được bằng Ctrl+Z.</span>
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
          Ảnh PNG, JPG, WebP; SVG; hoặc lưới STL, OBJ. Kéo thả vào khung xem hay dán bằng Ctrl+V
          cũng được.
        </p>
        <details className="details">
          <summary>Giới hạn kích thước tệp</summary>
          <p className="muted-3">
            Ảnh tối đa 32 MB, SVG 16 MB, lưới STL/OBJ 64 MB. Tệp vượt giới hạn bị từ chối trước
            khi ghi; dự án giữ nguyên.
          </p>
        </details>
      </CollapsibleGroup>

      <div id="w3a-source-text">
        <CollapsibleGroup
          title="Chữ"
          color="var(--sec-source)"
          open={groupOpen('source-text', source?.kind === 'text')}
          onToggle={() => toggle('source-text', source?.kind === 'text')}
        >
          <TextControls place="panel" />
        </CollapsibleGroup>
      </div>

      <div id="w3a-source-emoji">
        <CollapsibleGroup
          title="Emoji"
          color="var(--sec-source)"
          open={groupOpen('source-emoji', source?.kind === 'emoji')}
          onToggle={() => toggle('source-emoji', source?.kind === 'emoji')}
        >
          <EmojiPicker />
        </CollapsibleGroup>
      </div>

      <CollapsibleGroup
        title="Tạo ảnh bằng AI"
        color="var(--sec-source)"
        open={groupOpen('source-ai', false)}
        onToggle={() => toggle('source-ai', false)}
      >
        <p className="muted" style={{ margin: 0 }}>
          Mở nhóm này không gửi gì đi. Mô tả và ảnh tham chiếu chỉ rời máy khi bạn bấm Tạo, sau khi
          xem báo giá.
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
    </div>
  )
}
