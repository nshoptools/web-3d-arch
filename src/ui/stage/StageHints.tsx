import { useSnapshot } from '../core/bridge.tsx'
import { TOOLS_2D } from '../core/registry.ts'
import { sourceNextStep } from '../core/project-state.ts'

/**
 * One contextual hint for the frame, drawn in the stage's bottom-left band at
 * every width (UI-03). Short on purpose: it names the next step or the next
 * gesture, not the whole manual — the shortcut sheet and the tool tooltips
 * carry the rest.
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
    // A picture or an emoji is kept as it came in until its colour regions are
    // separated; until then there is nothing to paint on and nothing to build.
    // Each next step is one button, named here with the same words it carries.
    const next = sourceNextStep(project)
    if (next !== null) {
      return next.kind === 'convert' ? (
        <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }} data-hint="convert-first">
          Bước tiếp: bấm “{next.label}” trên thanh trên (hoặc trong bảng công cụ) và xác nhận. Sau đó
          còn một bước tách vùng màu rồi mới sửa vùng và dựng 3D được.
        </span>
      ) : (
        <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }} data-hint="segment-first">
          Bước tiếp: bấm “{next.label}” trên thanh trên và xác nhận kết quả tách. Có vùng màu rồi mới
          sửa vùng và dựng 3D được.
        </span>
      )
    }
    if (project.sourceCanvas !== null && !project.sourceCanvas.editable) {
      return (
        <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }} data-hint="read-only">
          Nguồn đang ở chế độ chỉ xem. Dựng 3D được ngay; muốn tô, xóa hay cắt vùng thì bấm “Chuyển
          sang ảnh raster để sửa” trong bảng công cụ.
        </span>
      )
    }
    return (
      <span className="chip chip--glass fc-border" style={{ whiteSpace: 'normal' }}>
        {tool ? `${tool.label} (${tool.key}): ${tool.behaviour}` : 'Chọn một công cụ để sửa vùng.'}
        {' '}Giữ phím cách để dời khung, lăn chuột để phóng.
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
