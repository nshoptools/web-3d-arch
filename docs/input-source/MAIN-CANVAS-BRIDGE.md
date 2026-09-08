# Bounded main-thread color bridge

The host may explicitly install this bridge when a qualified Worker renderer is unavailable. It returns real COLRv1/CBDT RGBA to the source Worker. Source extraction, complete paint graph retention, layout, proposal hashing and confirmation remain in that Worker. This module creates no UI component, project state, history, geometry, PNG encoding or network/file access.

The qualified Windows Playwright runtimes are Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6. Chromium and Firefox already support the normal Worker renderer. WebKit's Worker has no usable OffscreenCanvas 2D on this toolchain; that capability remains an explicit gap. Its separately installed main-thread bridge uses a detached HTML canvas and renders the original Noto color font and CBDT PNG.

## Host and Worker wiring

Install one private MessageChannel for one source Worker. Supply the host's qualified runtime identity, exact allowed font catalog records and an authoritative revision callback. Transfer only the other port to the existing Worker.

~~~js
// Main thread. This is an explicit host choice, not an automatic fallback.
import {attachMainThreadColorRenderer} from './input/index.mjs';

const channel = new MessageChannel();
const service = attachMainThreadColorRenderer(channel.port1, {
  engine: hostQualifiedEngine,
  version: hostQualifiedVersion,
  sources: [exactNotoColrv1CatalogEntry, exactNotoCbdtCatalogEntry],
  isCurrent: expected =>
    expected.sourceId === currentSource.id &&
    expected.revision === currentSource.revision,
  onTiming: recordNativeOperationTiming,
  maxSyncMs: 100,
  maxFontSetupMs: 500,
  deadlineMs: 10000,
});
existingSourceWorker.postMessage({type: 'install-color-renderer'}, [channel.port2]);
// On source-Worker teardown: service.dispose().
~~~

~~~js
// Existing DedicatedWorker, in the host's port-install message handler.
import {createColorRendererClient, createTextSourceAdapter}
  from './input/index.mjs';

const colorRenderer = createColorRendererClient(event.ports[0]);
const adapter = createTextSourceAdapter({
  readBytes: hostReadCatalogBytes,
  collections: hostSelectedCatalogCollections,
  createFontSource: hostSharedHarfBuzzFontFactory,
  renderer: colorRenderer,
});
// Existing prepare(command, control) and confirm(command, control) apply.
// On teardown: colorRenderer.dispose(). The host also disposes its service.
~~~

The host explicitly chooses the requested raster resolution; use 256 or 512 pixels per edge within these bounds. A 513-pixel request returns a source-preserving renderer gap with no conversion proposal. The bridge never silently reduces resolution or switches artwork/font. If a previously offered conversion used the Worker renderer, a bridge preview is a new derivative with a distinct renderer identity and proposal hash; confirmation must refer to the exact new proposal.

The existing input contract still owns SVG: original SVG bytes go to the validated parser, never this canvas bridge. The parent can use its separate portable canonical-contour preview and CompressionStream PNG encoder. This bridge returns RGBA only.

## Qualification and native behavior

Main-thread OffscreenCanvas availability is checked separately from Worker availability, including an actual 2D context. If usable, it is selected. Otherwise a detached HTMLCanvasElement is created without insertion into the document. On this pinned Firefox Windows runtime, HTML canvas font advances differ from the verified HarfBuzz run, while main-thread OffscreenCanvas preserves them. The measured-advance guard stays unchanged and rejects mismatches; no metric correction or looser tolerance hides them. WebKit uses its actual detached HTML canvas, whose tested advances agree.

The browser's native color-font renderer receives FontFace bytes with their actual SHA-256 checked against the host allowlist. It evaluates the original COLRv1 font, including gradient, clip, transform and compositing operations. The complete validated HarfBuzz graph and encoded font remain in the Worker output. Only bounded render metadata, source token and a fresh copy of the original font cross the port. Native rendering has the same qualified restrictions as the Worker adapter: palette zero, no variable color axes, and a verified single selected token. Other requests report a renderer gap.

For CBDT, the Worker extracts and hashes the real embedded PNG from the verified original font. The main endpoint checks the declared original-font hash against its allowlist, verifies the actual PNG SHA-256 and validates encoded/decoded dimensions. The trusted private Worker is responsible for the association between that PNG and its font; the main endpoint does not load another HarfBuzz instance to repeat extraction. No monochrome, system font or placeholder is substituted.

Repeatable pixels/proposal hashes are tested within each qualified engine/version/host stack, not across different browser stacks. Returned provenance distinguishes main-thread-native-font-image/1 from browser-font-and-image/1 and records the actual canvas backend, bridge version and requested policy. Nondeterministic wall-clock timing stays in the telemetry callback, outside artifact/proposal hashes.

## Bounds, cancellation and ownership

| Bound | Enforced value |
| --- | --- |
| Preview | 5..512 pixels per edge; 262,144 pixels / 1,048,576 RGBA bytes |
| Original COLRv1 font sent to main | 8,000,000 bytes |
| Main font cache | At most two faces and 8,000,000 source bytes total; no eviction |
| Embedded PNG | 1,048,576 encoded bytes; 1,048,576 decoded pixels |
| COLRv1 complexity | At most 4,096 already validated paint operations |
| Allowed source records | 1..64 exact font entries |
| Outstanding requests | One per client/service; no queue |
| Revision/cancel polling | 16 ms in the waiting Worker client |
| Deadline | Default/maximum 10 seconds; cooperative |
| Observed render-call budget | Default/maximum 100 ms per instrumented synchronous render call |
| Observed font setup budget | Default/maximum 500 ms aggregate synchronous setup time per request |

The Worker copies source bytes before transfer, so its cache/original output is not detached. The main endpoint rehashes those actual bytes. Main font objects are lazily loaded and matched asynchronously, cached within the bound, and removed from document.fonts on service.dispose(). To select a third color font, dispose and reattach with the intended source allowlist. Canvas backing stores are reduced to 1×1 after each request and never enter the DOM. PNG ImageBitmaps are closed.

Both endpoints check the source/revision token; the Worker also checks its AbortSignal/adapter cancellation. Cancellation and deadline messages invalidate pending work; responses for another request ID or an expired request cannot publish a conversion. A main native call cannot be interrupted by JavaScript. Structural caps limit its input, timing telemetry measures the actual calls, and a call over the soft budget rejects the result after it returns. FontFace construction/loading/registration/matching share a separate 500 ms aggregate synchronous budget per request; other instrumented render calls have a 100 ms individual budget. Cold Firefox font construction exceeded 100 ms in the first complete rerun; a data-font loading probe did not avoid synchronous cost, so it was not adopted. Chromium/Firefox should prefer their already working Worker renderer. Neither native budget nor the 10 second deadline is a hard preemption or frame-latency guarantee. Parent source-Worker termination and overall memory policy remain necessary.

Font/canvas internals can allocate more than the explicit source/RGBA counters. Both sides temporarily own byte copies, and native font/bitmap caches add memory. These limits are practical product limits, not a global native heap proof. A private trusted port and allowlist are part of this contract; do not expose the service to arbitrary window messages.

Native font loading follows the [CSS Font Loading interface](https://drafts.csswg.org/css-font-loading/#fontface-interface). The qualified bridge uses exact binary FontFace input, without a data URL or object URL.

## Evidence and acceptance boundary

Each pinned browser executes 31 bridge checks: 26 real Worker-to-main renderer/proposal checks plus five host checks. They cover original Noto COLRv1/CBDT, representative ZWJ/flags/selectors, the synthetic linear/radial/sweep/clip/group/reflect/alpha/tied-stop font, repeat hashes, confirmation, cancel/stale behavior, explicit resource gaps, source allowlist/byte integrity and cleanup. Node adds 10 protocol/lifecycle checks with a test endpoint. Browser evidence records actual sample PNGs, main-thread animation frames and native operation timings.

The seven WebKit checks that specifically require direct Worker canvas rendering still report unsupported. The 31 bridge checks exercise the separate real renderer; they do not relabel the Worker capability.

Color reduction, alpha/background policy, removal of small islands and material assignment are not performed here. The host confirms the exact source-to-RGBA proposal and separately confirms any later reduction. No source-wide approximation bound, manufacturing geometry, mesh or physical fit is verified by these previews.
