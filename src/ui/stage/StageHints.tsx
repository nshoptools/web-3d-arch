import { useSnapshot } from '../core/bridge.tsx'
import { TOOLS_2D } from '../core/registry.ts'

/**
 * Contextual hint text. Rendered on the next-action bar above 1180 CSS px and
 * inside the stage at or below it, from this one component so the two never
 * drift (UI-03).
 */
export function StageHints() {
  const snapshot = useSnapshot()
  const { project } = snapshot
  // The editor view is the one place the active tool is read from (UI-C05).
  const tool = TOOLS_2D.find((item) => item.id === snapshot.editor.tool)

  if (project.step === 1) {
    if (project.source === null) {
      return (
        <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }}>
          Kéo thả ảnh hoặc SVG vào khung này, dán bằng Ctrl+V, hoặc mở khu Ảnh nguồn để gõ chữ và
          chọn emoji.
        </span>
      )
    }
    return (
      <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }}>
        {tool ? `${tool.label} (${tool.key}): ${tool.behaviour}` : 'Chọn một công cụ để sửa vùng.'}
        {tool?.localKeys ? ` ${tool.localKeys}.` : ''} Giữ Shift để bám 45°, Alt hoặc phím cách để
        dời khung, lăn chuột để phóng. Mỗi cử chỉ hoàn chỉnh mới được gửi đi một lần.
      </span>
    )
  }

  return (
    <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }}>
      Xoay bằng chuột trái, dời bằng chuột phải hoặc hai ngón, lăn để phóng. F vừa khung, M đo trên
      lưới tessellation — không phải phép đo vật in.
    </span>
  )
}
