# Printing app early API1

Implementation only, own run20260908-printing-app-wave1. Release-packaging and
prior candidates stay frozen. No independent/configured review claim.

Candidate owns only src/integration/printing-adapters.mjs + .d.mts, tests/printing-app
and docs/printing-app. Parent owns controller/remote/application/project changes.

Proposed constructor:

~~~js
const printing = createPrintingAdapters({
  settings: () => authorized ? {
    userId: controller.session.user.id,
    sessionKey, // opaque; NEW identity on each auth/access reset, never reused
    settings: controller.remote.settings // schemaVersion, revision, values
  } : null,
  context, // exact same synchronous ApplicationContext getter as Ohm
  kernelLeases: kernel.kernelLeases,
  finalScene: qualification.describe, // Huygens' trusted private evidence
  runtime: (record, context) => runtimePrintingEvidence(record, context),
});
adapters.printing = printing; // version/capabilities/list()
exportBindings.printing = printing; // synchronous describe(adapterId, context)
~~~

settings.values.printerProfiles is an array of EXACT sealed
{payload:PrinterProfile(schemaVersion1),sha256} snapshots accepted by existing
printing validateProfile. No wrapper ID/alias fallback, fixture default, system
profile discovery or silent profile rehash. Duplicate IDs block selection rather
than picking the first. Invalid/unsupported imported records remain in settings;
bounded diagnostics explain why they are not executable. Valid unique records are
listed with id=payload.id, label, filamentSlots and qualified:false. Hash validity
does not prove slicer/bed/physical qualification.

list() re-reads/validates current settings on every call. refresh() also returns
the profile list, diagnostics and the selected printing preparation status.
It validates profiles and selected schedule asynchronously before publishing a
private snapshot. describe() is synchronous for Ohm; it only returns a prepared
descriptor while settings revision/content, user/session, selected app.printerId,
domain state/head/model/root and final-scene/runtime evidence still match.
Otherwise it returns a typed Unavailable, never an older snapshot.

Parent hooks:
1. After remote.refresh/settingsUpdate/importSettings/resetSettings, await
   printing.list(), then publish printers only if the parent auth epoch still
   matches. The current controller only calls list at sign-in; these are minimal
   parent-owned refresh hooks.
2. After printer selection, domain schedule/material edit, model promotion or
   Huygens qualification change: await printing.refresh(), then recompute export
   formats. Provider preparation does not mutate domain/settings/history.
3. On account/access/project reset call printing.reset(); on teardown dispose().
   Logout must immediately make both getters null. Every async publication checks
   current authority again. No cached user data can survive reset or user ABA.

Schedule preparation uses actual domain validateSchedule(state.schedule); no
createSchedule defaults or profile height application. It creates a sealed
printing constant-first-regular snapshot containing the same first/regular mm,
user/profile origins, selected profile ID/hash, then calls existing printing
validateSchedule. Huygens finalScene.projectScheduleHash must equal the actual
domain hash. Profile-derived heights require matching profileId. Applying a profile
to a project remains an explicit controller/domain transaction.

Material binding proposal uses Huygens FinalSceneEvidence.parts as the authority:
full materialId, materialSourceId, semanticId, explicit slot, RGBA and partIndex.
It joins by full materialId to current state.content.app.materials (label/color/slot,
not excluded) and checks exact color/slot agreement. Polymer and physical extruder
come ONLY from that selected sealed profile's explicit filament_type[slot-1] and
printer.slotExtruders[slot-1]. It never discovers a slot/material ID by color,
order, part index or truncated hash. Existing validateMaterials checks aliases
and same-slot conflicts. Missing IDs, native ID collisions, translucent colors,
unmapped slots or stale bindings make only dependent printing unavailable.
No new Huygens field is required; parent should confirm this explicit slot join.

runtime(record,context) is an explicit trusted evidence getter because the current
root ready RPC has no printing bit. Proposed ready shape:
{version:'arch-printing-runtime/1',status:'ready',key,client,epoch,
 runtimeABI:2,printingABI:1,kernelPrintingABI:2,
 moduleSha256,wasmSha256,evidenceId}.
client must be the exact shared kernel record.client; epoch is its live epoch.
Hashes/evidenceId must identify actual same-module service qualification. Method
presence alone cannot create readiness. No second Module/client/generation counter.

A ready printing descriptor matches Ohm's exact PrintingDescriptor:
{status:'ready',key,runtimeAvailable:true,printerProfile,schedule,materialTable,
 provenance}. key changes with settings/session/head/material/qualification input.
Ohm still performs its validators, exact ticket/lease checks and operation ->
client.export3MF(root,request,{generation,format:'project'}) in the existing Worker.
Printing adapter does not execute geometry, serialize a substitute archive or
release the caller lease.

Current printing service is inspection-only. Ordinary target export remains
blocked by Ohm without explicit inspection intent. qualified is always false in
this bounded adapter; provenance retains slicer/fit/bed/calibration unverified.
Valid explicit inspection may create a real project 3MF using the actual service.
Missing target evidence does not disable independent STL export.

Settings compatibility: actual backend is src/server/settings.mjs. schemaVersion1
accepts printerProfiles array max50; backend quota and forbidden-scope validation
remain authoritative. Imported calibrationProfiles are not adopted as proof.
Adapter enforces bounded JSON and printing validation too; it performs no I/O and
never persists or repairs imported data.

Exact declaration, fixtures, commands and measured limitations will accompany the
frozen handoff. Test pair is explicitly copied from current root implementation
module, mjs65c5bfc.../wasmf13bdd..., with exact hash verification.
