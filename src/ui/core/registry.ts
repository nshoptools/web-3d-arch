/**
 * One registry for sections, tools, viewport actions, commands and the key
 * table. UI-05 and DAT-03 require the rail, the mobile tabs, the shortcut
 * sheet and the quick-search palette to be generated from the same data, so
 * nothing here may be duplicated in a component.
 */
import type { ProductId, ToolId, WorkspaceSection } from '../../contracts/app-bridge.ts'
import type { IconName } from '../components/Icon.tsx'

export interface SectionDef {
  id: WorkspaceSection
  label: string
  sub: string
  color: string
  icon: IconName
  key: '1' | '2' | '3' | '4' | '5' | '6'
  /** Sections that only make sense once a build exists are gated, with a reason. */
  step: 1 | 2 | 'both'
}

export const SECTIONS: readonly SectionDef[] = [
  {
    id: 'source',
    label: 'Ảnh nguồn',
    sub: 'Tải ảnh, tạo bằng AI, gõ chữ hoặc chọn emoji',
    color: 'var(--sec-source)',
    icon: 'image',
    key: '1',
    step: 'both',
  },
  {
    id: 'product',
    label: 'Sản phẩm',
    sub: 'Loại sản phẩm và mẫu',
    color: 'var(--sec-product)',
    icon: 'cube',
    key: '2',
    step: 'both',
  },
  {
    id: 'materials',
    label: 'Lớp màu',
    sub: 'Vùng màu, vật liệu và khe filament',
    color: 'var(--sec-materials)',
    icon: 'layers',
    key: '3',
    step: 'both',
  },
  {
    id: 'parameters',
    label: 'Thông số',
    sub: 'Kích thước, chiều cao, lỗ và lắp ghép',
    color: 'var(--sec-parameters)',
    icon: 'sliders',
    key: '4',
    step: 'both',
  },
  {
    id: 'export',
    label: 'Xuất file',
    sub: '3MF, STL, SVG và PNG',
    color: 'var(--sec-export)',
    icon: 'download',
    key: '5',
    step: 'both',
  },
  {
    id: 'library',
    label: 'Thư viện',
    sub: 'Tên, lưu, dự án đã lưu và sao lưu',
    color: 'var(--sec-library)',
    icon: 'library',
    key: '6',
    step: 'both',
  },
]

export const SECTION_BY_ID = new Map(SECTIONS.map((section) => [section.id, section]))

/**
 * How one gesture of this tool is captured on the source canvas, following
 * `docs/editing/API.md`:
 *
 * - `seed`   one seed point per region (paint, heal region)
 * - `stroke` a dragged chain of points (line, erase, cut)
 * - `knots`  clicked knots, finished explicitly (curve)
 * - `box`    exactly two points, from and to (crop)
 */
export type ToolCapture = 'seed' | 'stroke' | 'knots' | 'box'

export interface ToolDef {
  id: ToolId
  label: string
  key: string
  icon: IconName
  behaviour: string
  capture: ToolCapture
  /** Local keys the tool owns while it is active; never global shortcuts. */
  localKeys?: string
}

/** EDT-01. Order and keys are normative. */
export const TOOLS_2D: readonly ToolDef[] = [
  {
    id: 'paint',
    label: 'Tô màu',
    key: 'B',
    icon: 'brush',
    capture: 'seed',
    behaviour: 'Bấm một điểm mồi; nhân loang vùng cùng màu từ điểm đó và đổi vật liệu.',
  },
  {
    id: 'line',
    label: 'Vẽ nét',
    key: 'V',
    icon: 'line',
    capture: 'stroke',
    behaviour: 'Kéo một nét có bề rộng; giữ Shift để bám ngang/dọc/45°.',
  },
  {
    id: 'curve',
    label: 'Đường cong',
    key: 'U',
    icon: 'curve',
    capture: 'knots',
    behaviour: 'Bấm từng điểm nút; nhân nội suy đường cong qua các nút đó.',
    localKeys: 'Enter hoặc bấm đúp kết thúc · Backspace bỏ nút cuối · Esc hủy nét đang vẽ',
  },
  {
    id: 'erase',
    label: 'Xóa',
    key: 'X',
    icon: 'eraser',
    capture: 'stroke',
    behaviour: 'Kéo một nét; gộp màu hoặc cắt thủng theo chế độ đang chọn.',
  },
  {
    id: 'cut',
    label: 'Đường cắt',
    key: 'C',
    icon: 'scissors',
    capture: 'stroke',
    behaviour: 'Kéo một nét để xẻ vùng; giữ Shift để bám hướng.',
  },
  {
    id: 'crop',
    label: 'Khung cắt',
    key: 'K',
    icon: 'crop',
    capture: 'box',
    behaviour: 'Kéo từ góc này sang góc kia; chữ nhật hoặc elip, giữ phần trong hoặc ngoài.',
    localKeys: 'Shift khi kéo cho khung vuông/tròn',
  },
  {
    id: 'heal',
    label: 'Vá hở',
    key: 'H',
    icon: 'patch',
    capture: 'seed',
    behaviour: 'Bấm một điểm mồi trong lỗ cần vá; màu chọn tay hoặc lấy theo vùng bao.',
  },
]

/** Tools that share the colour sequence (EDT-01). */
export const TOOLS_WITH_COLOUR: readonly ToolId[] = ['paint', 'line', 'curve', 'heal']
/** Tools that share the "gộp màu / cắt thủng" mode (EDT-01). */
export const TOOLS_WITH_CUT_MODE: readonly ToolId[] = ['erase', 'cut', 'crop']

/** Mirrors the `viewport.action` union of contract 0.3. */
export type ViewportActionId =
  | 'fit'
  | 'center'
  | 'top'
  | 'front'
  | 'perspective'
  | 'explode'
  | 'toggle-grid'
  | 'toggle-measure'

export interface ViewActionDef {
  id: ViewportActionId
  label: string
  key: string
  icon: IconName
  scope: 'both' | 'step2'
  /** Capability the action needs, when it is gated by one (UI-C01). */
  capability?: string
  hint?: string
}

export const VIEW_ACTIONS: readonly ViewActionDef[] = [
  { id: 'fit', label: 'Vừa khung', key: 'F', icon: 'fit', scope: 'both' },
  { id: 'toggle-grid', label: 'Lưới', key: 'G', icon: 'grid', scope: 'step2' },
  { id: 'top', label: 'Nhìn từ trên', key: 'T', icon: 'top', scope: 'step2' },
  { id: 'perspective', label: 'Nghiêng', key: 'I', icon: 'iso', scope: 'step2' },
  { id: 'front', label: 'Nhìn trước', key: 'P', icon: 'front', scope: 'step2' },
  {
    id: 'center',
    label: 'Giữa bàn',
    key: 'C',
    icon: 'center',
    scope: 'step2',
    // UI-C03: centring on the bed is its own action and is not "fit camera".
    capability: 'viewport.center-bed',
    hint: 'Đặt mô hình vào giữa bàn in. Khác với Vừa khung, vốn chỉ dời máy ảnh.',
  },
  { id: 'toggle-measure', label: 'Đo', key: 'M', icon: 'ruler', scope: 'step2' },
]

export const PRODUCTS: readonly { id: ProductId; label: string; sub: string }[] = [
  { id: 'keychain', label: 'Móc khóa', sub: 'Tấm 2,5D có lỗ móc và gờ.' },
  { id: 'clicky', label: 'Nắp phím keycap', sub: 'Trụ tương thích kiểu MX và khay switch.' },
  { id: 'strap', label: 'Dây đeo', sub: 'Lỗ luồn dây và slot.' },
  { id: 'lego', label: 'Ngàm khối', sub: 'Lưới lỗ ngàm, rãnh và tai gióng.' },
  { id: 'charm', label: 'Charm cài dép', sub: 'Nút cài, cổ và vành.' },
]

export type CommandGroup =
  | 'Khu vực'
  | 'Bước'
  | 'Lịch sử'
  | 'Công cụ 2D'
  | 'Khung xem'
  | 'Tệp và dự án'
  | 'Tài khoản'
  | 'Trợ giúp'

export interface KeyBinding {
  /** KeyboardEvent.key comparison value, already lower-cased for letters. */
  key: string
  ctrl?: boolean
  shift?: boolean
  /** Single-character keys are refused inside text entry and during IME. */
  single: boolean
  /**
   * Combinations that would fight the caret's own editing keys. Set for undo
   * and redo so a text field keeps its native history (UI-05).
   */
  blockInTextEntry?: boolean
  display: string
}

export interface CommandDef {
  id: string
  label: string
  group: CommandGroup
  /** 'both' means the command is offered in step 1 and step 2. */
  scope: 1 | 2 | 'both'
  bindings: KeyBinding[]
  hint?: string
}

const combo = (
  display: string,
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; blockInTextEntry?: boolean } = {},
): KeyBinding => ({
  key,
  ctrl: mods.ctrl ?? false,
  shift: mods.shift ?? false,
  single: false,
  ...(mods.blockInTextEntry ? { blockInTextEntry: true } : {}),
  display,
})

const letter = (display: string, key: string): KeyBinding => ({
  key,
  ctrl: false,
  shift: false,
  single: true,
  display,
})

export const COMMANDS: readonly CommandDef[] = [
  {
    id: 'app.search',
    label: 'Tìm nhanh',
    group: 'Trợ giúp',
    scope: 'both',
    bindings: [combo('Ctrl/Cmd + K', 'k', { ctrl: true }), letter('/', '/')],
    hint: 'Phím / chỉ hoạt động ngoài vùng nhập.',
  },
  {
    id: 'app.panel-toggle',
    label: 'Gập hoặc mở bảng thiết lập',
    group: 'Khu vực',
    scope: 'both',
    bindings: [letter('\\', '\\')],
  },
  ...SECTIONS.map<CommandDef>((section) => ({
    id: `section.${section.id}`,
    label: `Mở khu ${section.label}`,
    group: 'Khu vực',
    scope: 'both',
    bindings: [letter(section.key, section.key)],
  })),
  {
    id: 'source.pick',
    label: 'Chọn tệp nguồn',
    group: 'Tệp và dự án',
    scope: 'both',
    bindings: [combo('Ctrl/Cmd + O', 'o', { ctrl: true })],
  },
  {
    id: 'step.next',
    label: 'Đi tiếp bước sau',
    group: 'Bước',
    scope: 'both',
    bindings: [combo('Ctrl/Cmd + Enter', 'enter', { ctrl: true })],
  },
  {
    id: 'history.undo',
    label: 'Hoàn tác',
    group: 'Lịch sử',
    scope: 'both',
    bindings: [
      combo('Ctrl/Cmd + Z', 'z', { ctrl: true, blockInTextEntry: true }),
      letter('Z', 'z'),
    ],
    hint: 'Phím Z đơn hoạt động ở cả hai bước, ngoài vùng nhập.',
  },
  {
    id: 'history.redo',
    label: 'Làm lại',
    group: 'Lịch sử',
    scope: 'both',
    bindings: [combo('Ctrl/Cmd + Shift + Z', 'z', { ctrl: true, shift: true, blockInTextEntry: true })],
  },
  ...TOOLS_2D.map<CommandDef>((tool) => ({
    id: `tool.${tool.id}`,
    label: `Công cụ ${tool.label}`,
    group: 'Công cụ 2D',
    scope: 1,
    bindings: [letter(tool.key, tool.key.toLowerCase())],
    hint: tool.behaviour,
  })),
  ...VIEW_ACTIONS.map<CommandDef>((action) => ({
    id: `view.${action.id}`,
    label: action.label,
    group: 'Khung xem',
    scope: action.scope === 'both' ? 'both' : 2,
    bindings: [letter(action.key, action.key.toLowerCase())],
    ...(action.hint ? { hint: action.hint } : {}),
  })),
  {
    id: 'project.save',
    label: 'Lưu dự án',
    group: 'Tệp và dự án',
    scope: 'both',
    bindings: [combo('Ctrl/Cmd + S', 's', { ctrl: true })],
  },
  {
    id: 'app.shortcuts',
    label: 'Bảng phím tắt',
    group: 'Trợ giúp',
    scope: 'both',
    bindings: [],
  },
  {
    id: 'app.diagnostics',
    label: 'Nhật ký và chẩn đoán',
    group: 'Trợ giúp',
    scope: 'both',
    bindings: [],
  },
  {
    id: 'account.settings',
    label: 'Cài đặt cá nhân',
    group: 'Tài khoản',
    scope: 'both',
    bindings: [],
  },
  { id: 'account.ai', label: 'Kết nối AI', group: 'Tài khoản', scope: 'both', bindings: [] },
  { id: 'account.costs', label: 'Chi phí của tôi', group: 'Tài khoản', scope: 'both', bindings: [] },
  { id: 'account.members', label: 'Quản lý thành viên', group: 'Tài khoản', scope: 'both', bindings: [] },
  { id: 'account.policy', label: 'Chính sách hệ thống', group: 'Tài khoản', scope: 'both', bindings: [] },
  {
    id: 'account.reauth',
    label: 'Xác thực lại',
    group: 'Tài khoản',
    scope: 'both',
    bindings: [],
    hint: 'Mở lại nhà cung cấp định danh trong cùng tab; thao tác bị từ chối trước đó không tự chạy lại.',
  },
  { id: 'account.signout', label: 'Đăng xuất', group: 'Tài khoản', scope: 'both', bindings: [] },
]

export const COMMAND_BY_ID = new Map(COMMANDS.map((command) => [command.id, command]))

/** Extra key rows that describe pointer gestures rather than a key command. */
export const GESTURE_ROWS: readonly { keys: string; scope: string }[] = [
  {
    keys: 'Shift + kéo',
    scope: 'Đặt vị trí theo đối tượng. Mỗi cử chỉ có ô số thay thế trong bảng thông số.',
  },
  {
    keys: 'Escape',
    scope: 'Hủy thao tác hoặc đóng lớp trên cùng trước; không đóng mọi lớp cùng lúc.',
  },
]

/**
 * The capability IDs contract 0.3 declares (UI-C01). Anything the snapshot does
 * not list is treated as "not published" with a stated reason, never as
 * available. No ID is invented here: a control whose capability has no declared
 * ID is gated on the field the contract does publish for it — the reference
 * image control, for example, is gated on `AIProviderView.models[].supportsReference`.
 */
export const CAP = {
  projectWrite: 'project.write',
  webgl: 'viewport.webgl',
  viewportCenterBed: 'viewport.center-bed',
  aiGenerate: 'ai.generate',
  printerList: 'printer.list',
  mirror: 'storage.mirror',
  emoji: 'source.emoji',
  fontImport: 'source.font-import',
  clipboard: 'source.clipboard',
  memberAdmin: 'account.member-admin',
  systemPolicy: 'account.system-policy',
  meshImport: 'mesh.import',
  geometryBuild: 'geometry.build',
} as const

export type CapabilityId = (typeof CAP)[keyof typeof CAP]

/**
 * Setting keys the interface reads back from `AppSnapshot.settings` and writes
 * through `settings.update`. The names follow the user-scope keys of the HTTP
 * contract (docs/backend/API.md); the interface never invents a key to smuggle
 * a command through the settings channel.
 */
export const SETTING = {
  units: 'units',
  language: 'language',
  fontSize: 'fontSize',
  savedPrompts: 'savedPrompts',
  aiSelection: 'aiSelection',
  printerProfiles: 'printerProfiles',
  calibrationProfiles: 'calibrationProfiles',
  panelPreferences: 'panelPreferences',
} as const

/**
 * Editor option keys carried by `editor.settings`. They name the fields the
 * snapshot publishes back in `EditorView`, so what is sent and what is read are
 * the same names. Contract 0.3 added the two healing keys.
 */
export const EDITOR_SETTING = {
  colorMaterialId: 'colorMaterialId',
  cutMode: 'cutMode',
  strokeWidthPx: 'strokeWidthPx',
  healAuto: 'healAuto',
  healAllGaps: 'healAllGaps',
  healThresholdMm: 'healThresholdMm',
} as const
