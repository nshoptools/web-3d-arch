# Printer library hardening — final binding delta

Run: 20260908-printer-library-hardening. Baseline: inputs/main-preimages.json, with the runtime addendum for the unchanged backend JPEG module/license.
Implementation and self-tests only; inherited Astra/max, fast/service tier not exposed or verified.

The existing UI-C11 command and snapshot shapes remain unchanged. No UI/native changes.

## Accepted behavioral binding
- A row key is opaque and scoped to the exact settings capture and access lifecycle. It is no longer index + canonical-record hash. It stays stable within the same capture; any new settings object/ETag/revision, account epoch, or reset invalidates it. UI uses the key and settingsRevision from one current snapshot at click time; do not construct, persist, or replay them.
- Import accept requires the private prepared ID, confirmed:true, exact settings object/revision/ETag, user and monotonic access epoch. No time TTL is promised. Only the latest prepared import is retained; no native lease.
- Delete confirmed:true must come from the private prepared delete retry. UI-C11 already requests confirmed:false first. A new import/delete preparation, settings/account change or reset invalidates the previous preparation.
- Import is cloud personal settings, independent of an open project. Export of a profile creates no project ExportReceipt and does not assert OS persistence.
- Invalid legacy/forward records remain displayable, removable and downloadable as normalized JSON using their current opaque key. A malformed/null ID cannot become a valid imported profile. Invalid row arrays may be incomplete; do not invent a slot join.
- Valid slot arrays remain parallel: index i means slot i+1; slotExtruders[i] is a physical head numbered from 1. nozzleDiametersMm index i is physical head i+1.
- qualified stays false. importedFileAvailable means only that the incoming profile-file bytes are present and match their raw hash and the sealed profile record; it does not prove vendor provenance, slicing or fit.

## Factory composition (additive)
createPrinterProfileLibrary({context, write, download, preflight = async () => {}, onChange})

context() returns null or {userId, epoch, settings, etag}. epoch is a monotonic nonnegative safe integer. settings is an immutable schemaVersion:1 snapshot with revision >= 0; ETag is exactly quoted r<revision>. Replace settings objects rather than mutating nested values.

preflight(capture, signal?) returns Promise<void> or throws. capture contains the captured userId, epoch, settings, revision, etag and a private lifecycle counter. The controller binds this callback to its actual online-only session preflight when present. It does not call a local project-write guard and does not authorize from navigator.onLine. The manager rechecks the exact capture after awaiting the callback, before write/download, and checks identity/cancellation after completion.

write(values, capture) must perform the authenticated same-origin own-settings CAS against capture.etag. Only printerProfiles/printerProfileSources are passed as changes. The controller performs the exact pre-write guard and merges with the unchanged personal settings snapshot. An identity change after a server commit prevents old UI completion; it cannot roll back a commit already accepted for the old account.

download({bytes, filename, mimeType, signal}) may throw/cancel. Reset aborts outstanding download signals and increments lifecycle; a transport ignoring abort cannot turn late completion into success. The OS may already have accepted a download before cancellation. The current production download uses an anchor; no new synchronous picker is introduced.

## Vietnamese diagnostics
src/app/profile-messages.mjs exports a fixed bounded PROFILE_MESSAGES map. common.mjs maps codes to those strings without rendering arbitrary error.message/details. Row invalid reasons use the same fixed messages. Codes and confirmation.retry remain machine-readable and unchanged for UI handling.

## Durable UI decisions correction
In docs/app/printer-profile-ui-decisions.md, replace the old stability claim in the Key row with:
“Key opaque thuộc đúng capture cài đặt/tài khoản. Có thể đổi khi tải lại cài đặt, đổi revision/quyền hoặc reset, kể cả byte và vị trí hàng không đổi. Dùng key và settingsRevision từ cùng snapshot hiện tại lúc bấm; không suy lại key từ ID, index, hash hoặc màu.”
Parent owns that document; this candidate does not overwrite it.
