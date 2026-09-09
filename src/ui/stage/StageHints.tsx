import { useSnapshot } from '../core/bridge.tsx'
import { TOOLS_2D } from '../core/registry.ts'

/**
 * One contextual hint for the frame, drawn in the stage's bottom-left band at
 * every width (UI-03). Short on purpose: it names the next gesture, not the
 * whole manual — the shortcut sheet and the tool tooltips carry the rest.
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
          Kéo thả ảnh hoặc SVG vào khung này, dán bằng Ctrl+V, hoặc dùng khu Ảnh nguồn để gõ chữ và
          chọn emoji.
        </span>
      )
    }
    return (
      <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }}>
        {tool ? `${tool.label} (${tool.key}): ${tool.behaviour}` : 'Chọn một công cụ để sửa vùng.'}
        {tool?.localKeys ? ` ${tool.localKeys}.` : ''} Giữ phím cách để dời khung, lăn chuột để phóng.
      </span>
    )
  }

  return (
    <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }}>
      Chuột trái xoay, chuột phải dời, lăn để phóng. F vừa khung; M bật thước đo trên lưới (không
      phải phép đo vật in).
    </span>
  )
}
