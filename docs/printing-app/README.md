# Printing application binding

Implementation candidate, run 20260908-printing-app-wave1. This document and the
declaration are the final contract; API-EARLY.md remains the original coordination
note. Promote only the new files named by the checked delta, not copied dependencies.

## Entry and ownership

Import createPrintingAdapters from src/integration/printing-adapters.mjs.
The returned object implements both AppAdapters.printing and Ohm's
ExportBindings.printing. It imports the existing printing profile, material and
schedule validators and actual domain schedule validator. It performs no network,
filesystem, UI, project/history mutation, geometry build, archive serialization,
Module initialization or native generation allocation.

Constructor bindings are synchronous getters/identities:

| Binding | Contract |
| --- | --- |
| settings() | null after access loss; otherwise {userId,sessionKey,settings:controller.remote.settings}. The settings wrapper has schemaVersion:1, revision, values. Account authority is independent of whether a project/model exists. |
| context() | The same ApplicationContext getter supplied to Ohm: current state, userId, projectId, sessionKey, headHash, model, optional exportOptions. Null when that project is unavailable. |
| kernelLeases | The parent's existing WeakMap<ModelLease,KernelRecord>. Never copy or replace root/client. |
| finalScene(record,context) | Huygens' trusted private, current FinalSceneEvidence getter. Missing or unready evidence blocks only selected target preparation. |
| runtime(record,context) | Explicit checked same-runtime printing evidence described below. Method presence or a ready RPC without a printing bit is insufficient. |

sessionKey is an opaque identity changed at every authentication/access reset,
including user A -> B -> A. Do not persist it, reconstruct it from userId, or reuse
it after logout. Use the identical authority object in both getters. headHash is
the exact lowercase 64-hex domain fingerprint expected by the captured Ohm API.

The controller can call list() with no project/model and still receive valid
machine profiles. refresh().selection will separately report unavailable model
or project evidence.

## Parent-owned hooks

~~~js
const printing = createPrintingAdapters({
  settings() {
    const authority = getCurrentAuthority(); // existing parent-owned auth gate
    return authority ? {
      userId: authority.userId,
      sessionKey: authority.sessionKey,
      settings: controller.remote.settings,
    } : null;
  },
  context, // identical getter used by the exporter
  kernelLeases: kernel.kernelLeases,
  finalScene: (record, ctx) => finalSceneGetter(record, ctx),
  runtime: (record, ctx) => checkedPrintingRuntime(record, ctx),
});
// Supply printing in AppAdapters and in createExportAdapters({..., printing}).
~~~

The names getCurrentAuthority/finalSceneGetter/checkedPrintingRuntime above are
explicit host hooks, not new controller methods.

1. After remote.refresh, settingsUpdate, importSettings or resetSettings completes,
   await printing.list() and publish the returned printers only if the parent
   authority is still current. The captured controller calls list at sign-in;
   parent must add refreshes after these other settings operations.
2. After committing printer selection, material/slot or schedule changes, applying
   a model, or replacing final-scene/runtime evidence, await printing.refresh(),
   then recalculate export formats. Preparation never applies a profile's layer
   heights to the project.
3. Immediately on account/access/project reset call printing.reset() and clear
   parent printer/format presentation. On access loss both getters must immediately
   report unauthorized. Teardown calls dispose(). Do not let an older async result
   republish the old account's presentation.
4. Ohm calls describe(adapterId, currentContext) synchronously. It returns the
   exact prepared descriptor only while all relevant inputs remain current. On
   failure it returns a typed Unavailable. The host must refresh; there is no
   automatic fallback to an older preparation.

list(options?) returns Promise<PrinterView[]> and validates current settings on
every call. refresh({signal}?) returns
{version:'arch-printing-app/1',printers,diagnostics,selection}. Both clear the
previous private preparation before new work. Concurrent refreshes supersede
older ones. Cancellation rejects with CANCELLED and publishes no new preparation.
describe, reset and dispose are synchronous. None releases the parent's lease.

## Imported profiles and source preservation

The real backend settings validator is src/server/settings.mjs, not src/backend.
Its schemaVersion 1 values.printerProfiles array permits at most 50 records.
Each executable record must have exactly {payload,sha256}, where payload is the
existing PrinterProfile schemaVersion 1. The lowercase SHA-256 seals the existing
canonical payload; it is not the hash of arbitrary whitespace in imported JSON.
Use the established settings import/update route and preserve original source
assets/provenance separately. This binding does not rehash or repair an import.

The existing validator currently supports BambuStudio 02.08.02.60 / Bambu Lab P1S
and SnapmakerOrca 2.2.1 / Snapmaker U1 with its explicit 0.4 mm nozzle and slot/head
requirements. Unsupported machines, versions or nozzles remain unavailable with
diagnostics; no machine profile is bundled or inserted by this binding.

Valid unique profiles produce {id:payload.id,label,filamentSlots,qualified:false}.
IDs are exact, case-sensitive strings; aliases outside payload are rejected.
Duplicate IDs reject every conflicting record rather than selecting by order.
Invalid records remain unchanged in settings and are omitted from the executable
list; refresh diagnostics retain bounded index/id/reasonCode/reason information.

The sealed profile payload/hash and source/rights metadata are preserved in the
selected descriptor. Original source byte storage remains with the importing
host. The adapter has no source-byte input and therefore explicitly reports
profileSourceBytesVerified:false. A source hash or rights label cannot prove
license authorization, vendor approval, slicer compatibility or physical fit.
Imported qualified/calibration/fit claims never become qualification evidence.

## Schedule and material agreement

state.content.app.printerId selects the exact imported profile ID.
state.schedule must pass actual domain validation, including its canonical hash.
FinalSceneEvidence.projectScheduleHash must equal that domain hash. Profile-origin
heights require the same selected profileId. The adapter seals a printing
constant-first-regular schedule using exactly those first/regular mm values and
user/profile origins, selected profile ID and selected profile hash, then invokes
the printing schedule validator. It never silently takes default profile heights.

Every final-scene part must have explicit partIndex, sourceIndex, semanticId,
sourceSemanticIds, full materialId, uint32 materialSourceId, slot and RGBA. Join by
full materialId to current state.content.app.materials. The material must exist,
be included, and have exactly matching explicit slot and opaque color. No ID or
slot is derived from color, order, label or truncated numeric hashes.

Polymer and physical head come from the selected sealed profile's explicit
settings.filament_type[slot-1] and printer.slotExtruders[slot-1]. The host must
commit/confirm that slot mapping; choosing a UI profile alone does not remap it.
Existing validateMaterials preserves distinct full IDs as aliases only for an
identical same-slot color/type mapping. Same colors in different slots stay
distinct. Conflicting native IDs, duplicated part/semantic IDs, absent/excluded
materials, translucent colors, slot conflicts or profile mismatch block target
preparation. Original parts/source provenance stays with final-scene evidence.

## Runtime and export boundary

Supply a ready runtime getter result only after the parent has checked its
actual Module pair and same-Module printing service:

~~~js
{
  version: 'arch-printing-runtime/1', status: 'ready', key,
  client: record.client, epoch: record.client.epoch,
  runtimeABI: 2, printingABI: 1, kernelPrintingABI: 2,
  moduleSha256, wasmSha256, evidenceId
}
~~~

key/evidenceId identify that concrete verification; hashes identify exact actual
bytes. The client/root/live epoch must agree. A separately initialized Module,
different client, disposed client, stale epoch or absent proof is unavailable.
The adapter validates this trusted receipt; it does not manufacture verification.
Serializable provenance excludes the client object.

Ohm owns ticket/revision/lease checks, mesh checks, operation scheduling and the
existing client.export3MF(root, request, {generation,format:'project'}) call.
The real parent Worker acquires and consumes its own reader; primary leases stay
with the parent. Export job generation and native operation generation are distinct
and remain with their existing owners. This adapter allocates neither.

A ready descriptor contains key, runtimeAvailable:true, the exact sealed
printerProfile, adapted sealed schedule, explicit materialTable and provenance.
The key binds account access sequence, settings revision/profiles, full domain
state, current model/evidence/runtime and selected profile/schedule/materials.
describe checks these again, including model/root lifetime, and never substitutes
geometry, profile or source bytes.

Current target service is inspection-only. Ordinary target 3MF is blocked by Ohm
without explicit inspection intent; an unverified mesh can produce the earlier
MESH_INSPECTION_REQUIRED gate. Valid inspection uses the real service and outputs
real project 3MF. There is no automatic inspection flag or consent creation.
Profile schema validation and real serialization do not qualify slicer acceptance,
bed placement, calibration or physical fit. All these remain explicit unverified/
unqualified fields. Missing target preparation does not gate independent STL.

## Limits and actionable failures

Copied JSON is bounded to 2 MiB UTF-8 per settings/state/evidence/selection copy,
100,000 nodes and depth 24; the existing canonical validator can impose stricter
per-object key limits. Profiles <=50, participating parts <=128, distinct active
materials <=64, project material records <=4096. Profile/part/semantic identities,
strings, finite integers, arrays and colors have additional checks in the source.
There is no RSS or wall-clock deadline claim. Copies, canonicalization and their
guards are synchronous bounded metadata work; SHA validation awaits Web Crypto.
Geometry/export CPU and memory limits remain with the existing Worker/service.

| Code/group | Host action |
| --- | --- |
| PRINTING_SIGNED_OUT / SETTINGS_REQUIRED | Clear private UI; reload authorized current settings. |
| PROFILE_REQUIRED / DUPLICATE / INVALID, SNAPSHOT_HASH, UNSUPPORTED_* | Select or explicitly replace/correct the imported profile; retain failed data for inspection. Never auto-reseal damaged provenance. |
| PRINTING_PROJECT_SCHEDULE_MISMATCH / PROFILE_MISMATCH | Commit the intended schedule/profile and rebuild; do not edit only the export snapshot. |
| PRINTING_MATERIAL_UNMAPPED / CONFLICT / NATIVE_ID_COLLISION | Resolve current full-ID/slot/native mapping in the parent domain transaction and regenerate evidence. |
| PRINTING_RUNTIME_UNVERIFIED / FINAL_EVIDENCE_REQUIRED | Obtain current checked same-runtime/final-scene evidence. Do not infer success from method existence. |
| PRINTING_REFRESH_REQUIRED / CONTEXT_STALE / REFRESH_SUPERSEDED | Discard late work and prepare the exact current context. |
| CANCELLED / DISPOSED / DATA_LIMIT / DATA_ONLY | Cancel publication, use current binding, or reduce/correct input within explicit limits. |

There is no calibration workflow, printer connection, slicer execution, UI
composition, new profile source importer, general geometry qualification or
physical-print proof in this delta. Those remain parent/product boundaries.
