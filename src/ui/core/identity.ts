/**
 * Who a request was made *by* and *about*.
 *
 * Every asynchronous answer in this interface has to be able to say whether it
 * still belongs to what is on screen. Two questions decide that, and they are
 * not the same question:
 *
 * - **Account identity.** Sign-in state and the internal user id. When this
 *   moves, an answer belongs to a *different person*. It may not be rendered,
 *   and — because a reply body can carry that person's prompts, job ids or
 *   spending — it may not be written into the session log either.
 * - **Project identity.** The account plus the open document. When only this
 *   moves, the answer still belongs to the same person, so it is kept in the
 *   reviewable log while being kept off the screen.
 *
 * Neither identity contains `project.revision`. A revision moves on every edit,
 * and an answer about the project the user is still looking at is not foreign
 * just because a parameter changed while it was in flight — whether the *value*
 * is still applicable is a question for the core, which fences its own commands
 * (EditorGesture.projectRevision, proposal ids, quote hashes).
 *
 * These are pure readings of the snapshot: no React, no bridge, no side effect.
 */
import type { AppSnapshot } from '../../contracts/app-bridge.ts'

/** Sign-in state plus the internal user id (ACC-01 keys data by that id). */
export function accountIdentity(snapshot: AppSnapshot): string {
  const { session } = snapshot
  return JSON.stringify([session.status, session.user?.id ?? ''])
}

/** The account, plus which document is open. An empty id means no document. */
export function projectIdentity(snapshot: AppSnapshot): string {
  return JSON.stringify([accountIdentity(snapshot), snapshot.project.id])
}

const files = new WeakMap<File, number>()
let fileSerial = 0
/** An immutable File object is a UI request identity, never a content hash.
 * Two different byte streams may have identical name/size/time/type metadata. */
export function fileKey(file: File | null | undefined): string {
  if (!file) return 'no-file'
  let serial = files.get(file)
  if (serial === undefined) {
    if (fileSerial === Number.MAX_SAFE_INTEGER) throw new Error('UI_FILE_ID_EXHAUSTED')
    serial = ++fileSerial
    files.set(file, serial)
  }
  return `file:${serial}`
}

/**
 * A request key built from what the user can see. It answers "is the answer
 * that just came back an answer about the request currently on screen?" for
 * forms, where the identity that matters is the *input*, not the document.
 */
export function requestKey(
  parts: readonly (string | number | boolean | null | undefined)[],
): string {
  return JSON.stringify(parts)
}

/* ------------------------------------------------------------ dropped answers */

/**
 * What an answer that has just come back is allowed to do.
 *
 * `superseded` and `foreign` are both "do not write this to the screen", but
 * they are not the same event and must not be reported as one:
 *
 * - `superseded` — same person, same document, but the request it answers is no
 *   longer the request on screen (a newer one was sent, or the input was
 *   edited). A stale no-op, not a failure.
 * - `foreign` — the account or the document changed. The body may belong to a
 *   different person, so nothing of it is rendered *or* logged.
 */
export type RequestClaim = 'owner' | 'superseded' | 'foreign'

/**
 * Log codes for a dropped answer. These are interface codes, not core
 * diagnostics: the core said nothing wrong, the screen moved on. Keeping them
 * distinct is what lets a reviewer tell "the interface ignored an answer" apart
 * from "the core refused".
 */
export const CLAIM_CODE = {
  superseded: 'ANSWER_SUPERSEDED',
  foreign: 'ANSWER_FOR_OTHER_CONTEXT',
} as const

/**
 * The session-log line for a dropped answer.
 *
 * `what` names the *kind* of request ("báo giá AI", "trang sổ chi phí") and
 * never its contents: on a shared device this line can end up in front of the
 * next person to sign in.
 */
export function droppedAnswerText(claim: Exclude<RequestClaim, 'owner'>, what: string): string {
  return claim === 'foreign'
    ? `Một câu trả lời cho ${what} thuộc tài khoản hoặc dự án khác đã về sau khi màn hình đã ` +
        'chuyển ngữ cảnh. Giao diện không hiển thị và không ghi lại nội dung của nó. Việc đã gửi ' +
        'vẫn nằm ở nhân đúng như nhân ghi nhận; giao diện không kết luận nó đã hủy hay không có.'
    : `Một câu trả lời cho ${what} đã về sau khi yêu cầu đó không còn là yêu cầu đang hiển thị. ` +
        'Câu trả lời bị bỏ qua, không phải là lỗi; việc đã gửi vẫn nằm ở nhân đúng như nhân ghi nhận.'
}
