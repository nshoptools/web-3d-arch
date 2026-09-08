# AppBridge 0.3 — visible model, proposal and export contract

Implemented by [the controller](../../src/app/controller.mjs), with public types
in [app-bridge.ts](../../src/contracts/app-bridge.ts). The lifecycle rules below
apply to all source, geometry and export adapters.

## Exact additive public contract
```ts
type ExportPrerequisite = 'committed-source' | 'renderer' | 'matching-model' | 'project-bytes';
interface ProjectView {
  // Added; controller always supplies both.
  visibleModelRevision: number | null;
  visibleModelStale: boolean;
}
interface ExportOption {
  prerequisite?: ExportPrerequisite;
  reasonCode?: string;
  // Existing enabled/reason fields retained.
}
type DiscardCommand = { type: 'proposal.discard'; id: string };
```
ContractVersion remains '0.3'. visibleModelRevision is the manufacturing/domain
revision of the retained visible lease, never its transport generation or current
project revision. No model => null/false. A retained older model => old revision/true.
Preview builds do not alter these fields. Navigation does not alter revisions.

Discard targets the exact ID from confirmation.retry.id. It consumes a pending source,
conversion, geometry, export, product-switch or history-budget proposal, releases
resources once, aborts its owned job, and emits without committing/history changes.
It never clears a newer proposal for a stale ID (STALE_CONFIRMATION). Once acceptance
has started, it rejects APPROVAL_IN_PROGRESS; it does not pretend to roll back a
commit already being accepted. Ordinary invalidation/job cancellation still cancels
in-flight work. UI should await discard before reporting a dialog actually dismissed.

## Export adapter additions (arch-app-adapters/1)
```ts
interface ExportContext {
  state: DomainState; model: ModelLease | null;
  renderer: { available: boolean };
}
interface ExportFormat extends ExportOption {
  prerequisite?: 'committed-source' | 'renderer' | 'matching-model';
}
interface ExportAdapter {
  formats(input: ExportContext): ExportFormat[];
  export(input: Control & ExportContext & {
    formatId: string;
    prerequisite: 'committed-source' | 'renderer' | 'matching-model';
    assets: ReadonlyMap<string, Uint8Array>;
  }): Promise<ExportArtifact | ExportProposal>;
}
```
Omitted prerequisite keeps the existing matching-model gate (safe legacy compatibility).
Unknown declarations fail closed. An adapter must explicitly opt source SVG into
committed-source and must itself validate that it can serialize the committed regions.
The controller requires a committed source and its retained bytes, not a built mesh.
Source assets are copied, state is frozen, and an unpromoted preview is never passed.
renderer requires a live viewport.webgl capability plus exporter-enabled readiness;
it does not require a mesh at the current project revision. Its optional model is the
retained displayed model and carries its original ticket: screenshots must not claim
to depict the current design when that model is stale. Renderer/frame capture remains
the exporter’s responsibility; this delta adds no PNG/SVG codec or fake capability.
matching-model requires a completed visible lease for the current project/revision.
Mesh-only gates (unapplied mesh edits) do not block committed-source/renderer exports.
All routes retain current-user/lease and asynchronous job/epoch publication checks.
Exporter formats must be enumerated even when model is null; parent composition must
forward this context to extensions before returning early for unavailable native STL.

## Reasons and UI fixture
Every disabled export receives nonempty readable reason plus stable reasonCode.
Enabled exports and editable sourceCanvas omit reason. Disabled rescue uses
PROJECT_REQUIRED or PROJECT_LOCKED and does not require a fresh edit lease for
previously authorized rescue bytes. Parameter choices omit empty/enabled reason;
locked choices explain the access gate. No exporter is enabled by a reason cleanup.

Opus can update its mock with visibleModelRevision:null/visibleModelStale:false before
a build, then revision/false after promotion, then the same revision/true after edits.
Use proposal.discard on explicit dismissal; do not infer staleness from export reasons.
The final candidate will include typed examples and targeted controller/browser tests.

EditorGesture.projectRevision already includes editor settings and material changes.
Capture projectRevision/sourceRevision at pointer start; submit those original values.
The controller rejects changed revisions before starting the editing adapter, rather
than silently applying new editor/material settings to an older gesture.
