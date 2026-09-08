# Permanent raster app tests

Entry point: [run.ps1](run.ps1). It stages current main components/controller,
the selected existing main root Module, and these tests into the assigned run.
No production source, root transport, dependency or checked fixture is modified.

Read [commands](../../docs/raster-app/COMMANDS.md),
[API](../../docs/raster-app/API.md), and
[scope/evidence](../../docs/raster-app/ACCEPTANCE.md).
Normal suite: Node plus Chromium/Firefox/WebKit Workers, one Module per host.

Set ARCH_KERNEL_MODULE to the existing in-repo arch-kernel.mjs; its matching sibling
arch-kernel.wasm is required. No binary from a historical sidecar is bundled.
Absent/wrong exports are prerequisites failures, never simulated PASS results.

The Worker host invokes the production createRasterOperations/createRasterDispatcher
hooks plus buildProductRecipe and owns only test RPC routing. The callback suite
builds a real default product and checks separate ModelLease ownership through
consumer completion/cancel/reset/logout. It keeps the standalone path and unapproved
proposal gate covered. The type suite requires release() for product consumers. It does not patch or qualify EngineClient's
parent-owned raster RPC integration. Controller flows use current main
SourceOperations/ProposalOperations with an explicit in-memory persistence/epoch
harness and a deterministic test editing effect, not a backend security oracle.

Each label creates a fresh immutable staging snapshot. Outputs, browser profiles and
downloads stay inside the selected run. Choose a new label to rerun. The suite checks
fixture hashes and detects parent input changes during staging. Reports retain exact
component, module, controller, test and fixture hashes.
