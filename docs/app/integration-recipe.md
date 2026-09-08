# Reference integration recipe — AppBridge 0.3

Copy the checked src/app files beside main src/domain, src/storage, src/editing and src/contracts. Browser ESM has no added runtime dependency. Read adapters.d.mts and editing-client.d.mts for the concrete interfaces. Do not copy tests or analytical helpers into product code.

The parent factory owns one actual EngineClient and one transport counter shared by source preview, geometry builds and native exports. The controller ticket is echoed unchanged by every adapter result. Native generation can advance several times within that ticket.

```js
import {createAppController, createEngineAdapter, createThreeViewportAdapter,
  createRasterEditingAdapter, VERSION} from './app/index.mjs';
import {EngineClient} from './core/engine-client.mjs';
import {readArchSnapshot} from './viewport/arch-view.mjs';
import {ThreeViewport} from './viewport/three-viewport.mjs';

// Trusted deployment configuration, not project/settings/query data:
const moduleURL = new URL('./core/build/arch-core.mjs', import.meta.url);
if (moduleURL.origin !== location.origin) throw Error('URL_ORIGIN_BLOCKED');
let client, transportGeneration = 0;
const roots = new WeakMap();
const nextTransportGeneration = () => ++transportGeneration;
const live = () => client ??= new EngineClient({moduleURL});

// Probe the actual runtime before advertising availability.
// Deployment supplies the real compiled module path and handles start failure.
await live().start();
const engine = createEngineAdapter({
  client: {build: (...args) => live().build(...args), cancel: () => live().cancel()},
  readArchSnapshot, kernelLeases: roots, nextTransportGeneration,
  identity: verifiedEngineIdentity, selectRecipe: actualValidatedRecipe
});
const editing = createRasterEditingAdapter({
  workerURL: new URL('./editing/worker.mjs', import.meta.url),
  encodePNG: portableWorkerPNGEncoder
});
let controller;
const viewport = createThreeViewportAdapter({
  ThreeViewport,
  onSelection: blockId => void controller.dispatch({type:'selection.set',blockId}),
  onDiagnostic: reportParentDiagnostic,
  onCapabilitiesChanged: publishParentCapabilityChange
});
const exporter = {
  version: VERSION,
  capabilities: [{id:'export.stl',available:true}],
  formats: nativeFormatChoices,
  async export({ticket,model,formatId,signal,onProgress}) {
    if (formatId !== 'stl') throw Object.assign(Error(), {code:'EXPORT_UNSUPPORTED'});
    const root = roots.get(model);
    if (!root) throw Object.assign(Error(), {code:'LEASE_RELEASED'});
    const abort = () => void live().cancel();
    signal.addEventListener('abort',abort,{once:true});
    try {
      if (signal.aborted) throw Object.assign(Error(), {code:'CANCELLED'});
      // Deployment selects the validated part through its own explicit format policy.
      const bytes = await live().exportSTL(root,selectedNativePart,
        {generation:nextTransportGeneration()});
      if (signal.aborted) throw Object.assign(Error(), {code:'CANCELLED'});
      return {version:VERSION,ticket,bytes,mimeType:'model/stl',filename:'project.stl'};
    } finally {signal.removeEventListener('abort',abort);}
  }
};
controller = createAppController({
  origin:location.origin, deviceId:currentDeviceId,
  adapters:{
    engine,viewport,editing,exporter,source:actualSourceAdapter,
    printing:qualifiedPrinterCatalog,download:actualFileDelivery,
    // Reset all private adapters, including externally owned source/codec Workers.
    async reset() {
      client?.dispose(); client = null;
      editing.reset();
      await actualSourceAdapter.reset();
      await portableWorkerPNGEncoder.reset();
      viewport.clearPrivateState();
    }
  }
});
await controller.initialize();
```

Identifiers such as actualValidatedRecipe and portableWorkerPNGEncoder are explicit binding parameters, not implementations or successful placeholders. The actual parent module URL and engine identity come from its checked build manifest; the path above is illustrative and must be resolved to that manifest. Pure SVG extrusion helper requires authorizeScope; do not authorize products with unimplemented mechanics/text/slabs.

When source preview is available, return {version:VERSION,ticket,kind:'svg',metadata,preview:{width,height,pixelSizeMm,png,mediaType:'image/png'}}. Preserve the SVG kind and original file bytes. Do not set raster unless returning an actual editable derivative. Source conversion always uses source.convert then proposal.accept. An approximation in any source/build/export adapter returns its declared proposal union and explicit changes.

Controller.attachViewport(host) returns a cleanup function; use it for every mount. It replays visible model and selection. Old cleanup functions are idempotent and cannot destroy a newer renderer. Controller retains the lease across detach. Calling controller.dispose() ends the controller identity lifetime; it is not a component viewport cleanup.

Use subscribe/getSnapshot with one controller per identity lifetime. Snapshots are immutable and their reference changes only on emit. UI owns gestures and presentation, sends complete source-pixel gestures once, and never edits controller documents directly. All expected-revision/CAS decisions stay in the controller/storage.

The public clock is externally provided, with monotonic elapsed-time protection inside controller. resumeOffline accepts an externally verified lease assertion; it is not an untrusted signed-file parser. A reload must re-establish the trust boundary through the host, never deserialize a boolean verified flag from project/settings/local tokens.

Ed25519 default verification is required. If the deployment approves the separately documented authenticated online HTTPS assertion policy for WebKit, explicitly set allowAuthenticatedLeaseResponse:true and surface its capability. It does not authorize offline self-assertion, other-user data or expired edits.

Provider settings/credential policies and source/font libraries may be unavailable. Preserve real capability reasons. Missing or future project schemas appear in controller.unrecognizedProjects and are raw-exportable; the 0.3 typed normal library has no unknown-product union. Parent UI should offer a rescue entry for this extension, without inventing a product.
