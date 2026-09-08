/**
 * Pure readings of `AppSnapshot`. Nothing here decides anything on the core's
 * behalf: every function answers a question the snapshot already carries an
 * answer to, so the same question is never answered two different ways in two
 * components.
 */
import type {
  AppSnapshot,
  ExportOption,
  ExportPrerequisite,
  ProjectView,
} from '../../contracts/app-bridge.ts'
import { diagnosticText } from './text.ts'

/** No document is open: `ProjectView.id` is the empty string, not a placeholder. */
export function hasProject(project: ProjectView): boolean {
  return project.id !== ''
}

export const NO_PROJECT_REASON =
  'Chưa có dự án nào đang mở. Tạo một dự án và chọn loại sản phẩm trước, rồi quay lại bước này.'

/**
 * Whether the core is publishing a *visible built model*.
 *
 * Contract 0.3 publishes this directly: `visibleModelRevision` is the domain
 * revision of the retained displayed model and is `null` before a build or
 * after a project is opened. So the presence of a model is one field, not an
 * inference.
 *
 * Nothing else is consulted. `blocks` is not evidence — a lease with zero blocks
 * is legal and a source alone can publish blocks. `step === 2` is not evidence
 * either; it is the thing being gated. And `stats.triangles` is a *measurement*
 * of the lease, which the earlier build had to lean on only because the lease
 * itself was not published. It is not the same statement: the controller may
 * hold a lease whose triangle count it has not measured, and the two would then
 * disagree about whether step 2 can be opened at all.
 */
export function hasVisibleModel(project: ProjectView): boolean {
  return project.visibleModelRevision !== null
}

/**
 * "The model on screen belongs to an older revision than the project."
 *
 * Read from the field the controller publishes for it, never inferred from an
 * export refusal. Deriving it from export reasons was only ever a stand-in for
 * a field that did not exist yet, and contract 0.3 makes that stand-in wrong as
 * well as indirect: a source SVG or a renderer PNG is *not* gated on a matching
 * mesh, so as soon as those formats stay enabled over a stale model the
 * "some format is refused with VISIBLE_MODEL_STALE" test starts answering a
 * different question from the one asked.
 *
 * `visibleModelStale` is already false when there is no retained model, so no
 * separate "has a model" clause is needed here.
 */
export function modelIsStale(project: ProjectView): boolean {
  return project.visibleModelStale
}

/**
 * What the model on screen is, in one sentence, when there is anything to say.
 *
 * Only revisions the controller published are printed. `project.revision` is the
 * document; `visibleModelRevision` is the lease being drawn. They are different
 * numbers and are never presented as one.
 */
export function visibleModelNote(project: ProjectView): string | null {
  if (project.visibleModelRevision === null) return null
  return project.visibleModelStale
    ? `Mô hình đang hiển thị dựng từ bản sửa ${project.visibleModelRevision}; dự án đang ở bản sửa ` +
        `${project.revision}.`
    : `Mô hình đang hiển thị dựng từ bản sửa ${project.visibleModelRevision}, khớp bản sửa hiện tại.`
}

/**
 * The rescue package: the whole project as bytes, so local work survives a lost
 * session. The controller publishes it as `project` with the extension
 * `arch-project.zip`, and `exportFile` also answers to the two older ids it kept
 * as aliases. The interface picks the published option by meaning and then calls
 * that option's own id — it never invents an exporter id or a file name.
 */
const RESCUE_IDS: readonly string[] = ['project', 'rescue-project', 'raw-project']
const RESCUE_EXTENSION = 'arch-project.zip'

export function isRescueExport(option: ExportOption): boolean {
  if (RESCUE_IDS.includes(option.id)) return true
  return option.extension.toLowerCase().replace(/^\./, '').endsWith(RESCUE_EXTENSION)
}

/**
 * The option to offer as "save my work out of here". When more than one matches,
 * an enabled one wins: the point of this button is the copy that can actually be
 * written right now.
 */
export function findRescueExport(exports: readonly ExportOption[]): ExportOption | null {
  const matches = exports.filter(isRescueExport)
  return matches.find((option) => option.enabled) ?? matches[0] ?? null
}

/** True while the core still offers the rescue copy, whatever the session says. */
export function rescueAvailable(snapshot: AppSnapshot): boolean {
  return findRescueExport(snapshot.exports)?.enabled === true
}

/**
 * The colour SVG of the *source* — the step-1 shortcut. Only ids that mean that
 * exact thing are accepted: a section SVG is a different artefact and must never
 * be substituted for it. When the build registers no such exporter the caller
 * says so plainly instead of blaming the core for a name the UI invented.
 */
const SOURCE_SVG_IDS: readonly string[] = ['export.svg.source', 'svg-source', 'svg.source']

export function findSourceSvgExport(exports: readonly ExportOption[]): ExportOption | null {
  return exports.find((option) => SOURCE_SVG_IDS.includes(option.id)) ?? null
}

/* -------------------------------------------------------------- export gates */

/**
 * What a format needs before it can run, as the *controller* declares it.
 *
 * Contract 0.3 makes the prerequisite a published property of each format, so
 * the interface stops assuming that "export" means "mesh". An omitted
 * declaration keeps the older `matching-model` gate, which is the safe legacy
 * reading the contract specifies — never the permissive one.
 */
export function exportPrerequisite(option: ExportOption): ExportPrerequisite {
  return option.prerequisite ?? 'matching-model'
}

/** Short name of a prerequisite, for a chip next to the format. */
export const PREREQUISITE_LABEL: Record<ExportPrerequisite, string> = {
  'committed-source': 'cần nguồn đã chốt',
  renderer: 'cần khung xem đang chạy',
  'matching-model': 'cần mô hình khớp bản sửa',
  'project-bytes': 'cần byte đã lưu cục bộ',
  'account-settings': 'cần đăng nhập và kết nối mạng',
}

/**
 * What that prerequisite actually means, in the terms the contract states it.
 * These sentences describe the gate the controller applies; they never promise
 * that the resulting file is printable, correct or verified.
 */
export const PREREQUISITE_NOTE: Record<ExportPrerequisite, string> = {
  'committed-source':
    'Đường xuất này đọc nguồn đã chốt cùng byte gốc được giữ lại. Nó không cần mô hình đã dựng và ' +
    'không bị chặn vì mô hình đang hiển thị thuộc bản dựng cũ.',
  renderer:
    'Đường xuất này cần khung xem 3D đang chạy và exporter đang bật. Nó không cần lưới khớp bản ' +
    'sửa hiện tại; ảnh chụp có thể là mô hình cũ, và khi đó nó không phải hình của thiết kế hiện tại.',
  'matching-model':
    'Đường xuất này cần đúng mô hình đã dựng của bản sửa hiện tại, và các thay đổi trên khối nhập ' +
    'phải đã được Áp dụng.',
  'project-bytes':
    'Đường xuất này đóng gói byte đã lưu ở kho cục bộ. Nó không cần mô hình và không cần quyền ghi ' +
    'dự án.',
  'account-settings':
    'Đường xuất này tải cài đặt cá nhân của tài khoản đang đăng nhập. Không cần mở dự án.',
}

/**
 * The sentence to show for an export option.
 *
 * `reasonCode` is the stable code and `reason` is the readable sentence the
 * controller wrote — contract 0.3 publishes both, so the interface stops
 * passing `reason` through the diagnostic table as if it were a code. When the
 * controller only sent a code, the table still puts it into words; when it sent
 * neither, the caller's fallback is used rather than an invented cause.
 */
export function exportReasonText(option: ExportOption, fallback: string): string {
  const written = option.reason?.trim()
  if (written) return written
  const code = option.reasonCode?.trim()
  return code ? diagnosticText(code, fallback) : fallback
}
