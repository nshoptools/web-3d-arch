/**
 * What a confirmation actually commits to.
 *
 * `CommandResult.confirmation` carries a title, a change list and a retry — and
 * no reversibility flag. So the interface must not invent one. What it can do
 * honestly is read the retry's own command type: the contract says which
 * commands are project edits that land in the undo history, and which ones are
 * requests to the server, a file write or a permission change that the history
 * of a project has nothing to do with.
 *
 * Anything else — above all `proposal.accept`, where the effect is whatever the
 * core is proposing — is reported as "the core decides", not as "undoable".
 */
import type { AppCommand } from '../../contracts/app-bridge.ts'

export type EffectScope = 'project-history' | 'outside-history' | 'core-decides'

export interface ConfirmEffect {
  scope: EffectScope
  text: string
}

/** Commands that go through `edit()` and therefore become a history step. */
const IN_HISTORY: readonly AppCommand['type'][] = [
  'project.rename',
  'project.product',
  'parameter.set',
  'parameter.reset',
  'text.update',
  'text.remove',
  'material.update',
  'material.reset',
  'editor.tool',
  'editor.settings',
  'source.remove',
  'mesh.apply',
  'printer.select',
  'export.configure',
  'preset.apply',
]

/** Commands whose effect is outside the project's undo history entirely. */
const OUTSIDE_HISTORY: readonly AppCommand['type'][] = [
  'project.delete',
  'settings.update',
  'settings.import',
  'settings.reset',
  'policy.update',
  'emoji.favorite',
  'ai.apply-result',
  'ai.cancel',
  'ai.close-unknown',
  'ai.budget',
  'preset.save',
  'preset.delete',
  // UI-C11. All three act on the personal settings store, never on the open
  // document: `docs/app/printer-profile-ui.md` states it directly — "Xóa/thay
  // cài đặt không nằm trong undo dự án." Accepting an imported profile writes a
  // settings record, deleting removes one, and exporting writes a file. None of
  // them produces a history step, so none may be described as undoable.
  'printer.profile-accept',
  'printer.profile-delete',
  'printer.profile-export',
]

const CORE_DECIDES =
  'Chưa có gì được thực thi. Hiệu lực sau khi áp dụng đúng bằng danh sách thay đổi ở trên và do ' +
  'nhân quyết định: có lượt chỉ sửa dữ liệu dự án nên hoàn tác được, nhưng cũng có lượt ghi tệp ra ' +
  'máy, gọi mạng hoặc cắt bớt lịch sử — những việc đó không hoàn tác được. Giao diện không hứa thay nhân.'

const IN_HISTORY_TEXT =
  'Đây là một thay đổi của dự án. Sau khi áp dụng, nó nằm trong lịch sử và hoàn tác được bằng Ctrl+Z, ' +
  'trừ khi nhân báo đã phải rút ngắn lịch sử.'

const OUTSIDE_TEXT =
  'Thao tác này không nằm trong lịch sử hoàn tác của dự án. Lệnh gửi lên máy chủ, thay đổi quyền, ' +
  'xuất tệp hoặc xóa dữ liệu có hiệu lực ngay và không có bước hoàn tác nào trong giao diện.'

export function confirmEffect(command: AppCommand): ConfirmEffect {
  if (IN_HISTORY.includes(command.type)) return { scope: 'project-history', text: IN_HISTORY_TEXT }
  if (OUTSIDE_HISTORY.includes(command.type)) return { scope: 'outside-history', text: OUTSIDE_TEXT }
  return { scope: 'core-decides', text: CORE_DECIDES }
}

/** Neutral wording for the success toast: the core accepted, nothing more. */
export const CONFIRM_ACCEPTED = 'Đã áp dụng thay đổi.'
