/**
 * Readable names for the things the core identifies by id.
 *
 * The core labels product roles by their id (`body`, `rim`…), adopted source
 * regions by their key (`adopted:1`) and model blocks by their semantic id
 * (`source:slab:…`, `mech:keyring`). A person reads a name; the id stays
 * available in accessible descriptions, technical details and the log.
 */
import type { MaterialView, ProductId, ProjectView } from '../../contracts/app-bridge.ts'

/** The native roles a product prints, as `src/integration/product-transactions.mjs` lists them. */
/**
 * The emoji a source file stands for, read from the name the emoji adapter
 * gives its selection file (`emoji-<collection>-<hex[-hex]>.arch-emoji.json`).
 * Null when the name is not of that shape; nothing is guessed from bytes.
 */
export function emojiGlyphOf(name: string): string | null {
  const match = /^emoji-.+?-([0-9a-f]{4,6}(?:-[0-9a-f]{4,6})*)\.arch-emoji\.json$/i.exec(name)
  if (!match) return null
  try {
    return String.fromCodePoint(...match[1].split('-').map((hex) => Number.parseInt(hex, 16)))
  } catch {
    return null
  }
}

export const PRODUCT_ROLES: Record<ProductId, readonly string[]> = {
  keychain: ['body', 'rim', 'artwork', 'text', 'textBase'],
  clicky: ['body', 'stem', 'tray', 'artwork', 'text', 'textBase'],
  strap: ['body', 'rim', 'artwork', 'text', 'textBase'],
  lego: ['body', 'rim', 'artwork', 'text', 'textBase'],
  charm: ['body', 'rim', 'skirt', 'fastener', 'artwork', 'text', 'textBase'],
}

export const ROLE_NAME: Record<string, string> = {
  body: 'Đế và thân',
  artwork: 'Hình nguồn',
  rim: 'Viền',
  skirt: 'Diềm',
  fastener: 'Chốt cài',
  stem: 'Trụ và gân',
  tray: 'Khay switch',
  text: 'Chữ',
  textBase: 'Đế chữ',
}

/** The role family of a material row, as the contract enumerates it. */
export const MATERIAL_ROLE_LABEL: Record<MaterialView['role'], string> = {
  region: 'vùng màu của nguồn',
  body: 'thân',
  text: 'chữ',
  textBase: 'đế chữ',
  stem: 'trụ',
  tray: 'khay',
  other: 'phần khác',
}

const ADOPTED = /^adopted:(\d+)$/

/** What to call a material row: the region number or the role's name. */
export function materialName(material: Pick<MaterialView, 'label' | 'role'>): string {
  const adopted = ADOPTED.exec(material.label)
  if (adopted) return `Vùng màu ${adopted[1]}`
  return ROLE_NAME[material.label] ?? material.label
}

/** The native role a material row stands for, when the core published one. */
export function materialRole(material: MaterialView): string | null {
  return material.product?.nativeRole ?? (ROLE_NAME[material.label] ? material.label : null)
}

/** Whether a material row belongs to the product type that is open. */
export function materialBelongsTo(material: MaterialView, product: ProductId): boolean {
  if (material.role === 'region' || ADOPTED.test(material.label)) return true
  const role = materialRole(material)
  if (!role) return true
  return (PRODUCT_ROLES[product] ?? []).includes(role)
}

const MECH_NAME: Record<string, string> = {
  keyring: 'Vòng móc',
  eyelet: 'Vòng móc',
  stem: 'Trụ MX',
  tray: 'Khay switch',
  brick: 'Ngàm khối',
  lego: 'Ngàm khối',
  strap: 'Lỗ luồn dây',
  slot: 'Slot dây',
  charm: 'Nút charm',
  fastener: 'Chốt cài',
  skirt: 'Diềm',
}

const BLOCK_KIND_LABEL: Record<string, string> = {
  body: 'thân',
  text: 'chữ',
  region: 'vùng màu',
  other: 'phần khác',
}

/**
 * A readable name for a model block. The material it carries names it first;
 * a mechanical feature is named by its family; anything else keeps its kind.
 */
export function blockName(
  block: { id: string; label: string; kind: string; materialId: string | null },
  materials: readonly MaterialView[],
): string {
  const mech = /^mech:([a-z]+)/i.exec(block.id)
  if (mech) return MECH_NAME[mech[1]!.toLowerCase()] ?? `Chi tiết cơ khí ${mech[1]}`
  if (block.id.startsWith('mesh:')) return 'Khối nhập'
  if (block.id.startsWith('text')) return block.kind === 'text' ? 'Chữ' : 'Đế chữ'
  const material = block.materialId ? materials.find((item) => item.id === block.materialId) : null
  if (material) return materialName(material)
  if (block.label && block.label !== block.id) return block.label
  return block.kind === 'region' ? 'Vùng màu' : block.kind === 'body' ? 'Thân' : 'Khối'
}

/** Name plus kind, for a list where several blocks share a name. */
export function blockLabel(
  block: { id: string; label: string; kind: string; materialId: string | null },
  materials: readonly MaterialView[],
): string {
  return `${blockName(block, materials)} · ${BLOCK_KIND_LABEL[block.kind] ?? block.kind}`
}

/** The readable form of a selection published by the core. */
export function selectionName(project: ProjectView): string | null {
  const selection = project.selection
  if (!selection) return null
  const block = project.blocks.find((item) => item.id === selection.blockId)
  return block ? blockName(block, project.materials) : selection.label
}
