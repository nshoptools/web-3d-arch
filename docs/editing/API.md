# Standalone API and parent integration

Import src/editing/index.mjs in a Dedicated Worker. index.d.mts provides checked TypeScript declarations. The optional src/editing/worker.mjs implements the message protocol. No bundler, React, WASM, or library is needed for this candidate.

## Core example

~~~js
import {VERSION, createEditor, encodeUndo} from './src/editing/index.mjs';

// Adapter already decoded, bounded and converted a confirmed derivative.
// Parent retains original file bytes and verifies their SHA-256.
const editor = await createEditor({
  source: {
    id: 'source/1', hash: originalFileSha256,
    adapterId: 'confirmed-rgba-adapter', adapterVersion: '1',
  },
  image: {width, height, data: rgba, colorSpace: 'srgb', alphaMode: 'straight'},
});
const base = editor.token();
const gesture = {
  version: VERSION, id: 'gesture/42', expected: base,
  tool: 'line', points: [{x: 1.5, y: 2.5}, {x: 9.5, y: 2.5}],
  color: [255, 0, 0, 255], width: 3, brush: 'round', snap: 'none',
};
const preview = await editor.prepare(gesture, {
  signal: abortController.signal,
  onProgress: p => postMessage({type: 'progress', progress: p}),
});
// preview.image is provisional; preview.undoBytes is exact binary payload size.
// Controller resolves its history budget and verifies its project revision here.
// If the gesture is cancelled: editor.cancel(gesture.id), then publish nothing.
const result = editor.commit(gesture.id, liveControllerSourceToken);
if (result.undo) {
  const payload = encodeUndo(result.undo);
  // Controller owns storage transaction, history budget, and final UI publication.
}
~~~

Important: do not pass the cached base token as a substitute for checking the controller's current source. Independent project changes need the parent's project-wide conflict check too. A result acknowledges an in-memory CPU edit; it does not mean “saved”.

## Commands

All commands require version='arch-raster-edit/1', id (1–160 bounded identifier characters), expected token and tool. Unknown top-level fields are rejected. Positions are objects with x/y and optional pressure in [0,1]. Default opacity=255 is common. Colors are [r,g,b] or [r,g,b,a] integer bytes.

| Tool | Required tool-specific fields | Options/defaults |
| --- | --- | --- |
| paint | seeds:[Point], color | tolerance=0, connectivity=4 (or 8), blend='replace' (or 'source-over') |
| line / curve | points:[Point], color | width=1, brush='round' (or 'square'), snap='none' (or '45'), blend='source-over' (or 'replace') |
| erase / cut | points:[Point] | width/brush/snap as above; mode='hole' (or 'merge'); merge color='auto' or explicit opaque RGB[A] |
| crop | from:Point, to:Point | shape='rectangle' (or 'ellipse'), keep='inside' (or 'outside'), square=false, shared mode/color |
| heal region | seeds:[Point] | method='region', color='auto' or explicit, allowExterior=false |
| heal brush | method='brush', points:[Point] | width/brush/snap, color='auto' or explicit |
| heal all gaps | method='all-gaps', maxGapPx, pixelSizeMm | color='auto' or explicit |

The curve renderer stores the draft point list: add knot on click; Backspace removes last; Enter/double-click sends one completed command; Escape discards the local draft and cancels its prepared/running ID if present. Nothing is sent per pointer move that automatically commits a history entry. Pressure and the affine transform are captured in image coordinates for the gesture. Do not derive pixel width from subsequent zoom changes.

Helpers: imageToDevice / deviceToImage take a six-number affine matrix; snap45 implements Shift snapping; pressureScale converts missing/explicit pressure; gapFromDesign resolves an isotropic design threshold to integer pixels. See ADR-001 for rounding and coverage rules. UI palette widgets, pointer capture, keyboard handling, pan/pinch, original comparison layout, and accessibility remain Opus work.

## Results and replay

- token(): sourceId, sourceHash, originalHash, revision, hash; immutable record.
- snapshot(): copied current image plus token/source/version. original(): copied initial bounded raster plus its hash/source/version.
- prepare(command, control): {status:'prepared', id, expected, image, hash, changedBounds, changedPixels, undoBytes}. Only one preparation can be retained.
- commit(id, currentToken): {status:'committed'|'unchanged', id, token, image, changedBounds, changedPixels, undo}.
- cancel(id): true if a running/prepared transaction was found. A draft not submitted to the core needs no cancel request.
- replay(payload, 'undo'|'redo', currentToken, control): verifies and commits a whole rectangle patch. Returns changed image, new monotonic token, and undo=null; this does not add another user history entry.
- encodeUndo / decodeUndo / undoByteLength support exact binary storage and budget accounting. Payloads are also structured-clone-compatible.

Bounds are {x,y,width,height} in the unchanged image coordinate system and are minimal over byte-changed pixels. Empty changes return null. Revision does not increase for no-ops. No automatic source replacement, canvas resizing, event deduplication, or persistent undo stack exists. Gesture IDs identify a pending transaction; the controller supplies unique IDs and durable retry policy.

## Worker transport

Create new Worker(new URL('./src/editing/worker.mjs', import.meta.url), {type:'module'}). Every request includes requestId. Supported operations:

~~~js
{type:'init', requestId, input:{source,image,revision:0}}
{type:'snapshot', requestId, original:false}
{type:'prepare', requestId, command, control:{maxWork:100000000}}
{type:'commit', requestId, gestureId, expected:currentToken}
{type:'apply', requestId, command} // authoritative single-editor convenience
{type:'cancel', requestId, gestureId}
{type:'replay', requestId, payload, direction:'undo', expected:currentToken}
~~~

Responses are {type:'progress', requestId, progress}, {type:'result', requestId, result}, or {type:'error', requestId, error:{code,message,details}}. init returns version/limits/token and may be called once. A new source uses a new Worker. Shared input buffers are rejected. Ordinary input arrays may be transferred; all returned image and undo buffers are independently owned and transferred by the adapter. Reading or altering a returned array cannot mutate the editor. Control over messages supports maxWork/checkpointWork only; cancellation is a message, not a serialized AbortSignal/callback.

Load this processor under the parent's managed Worker/COI policy. The copy/transfer protocol is a deliberate scoped pixel-buffer ownership choice documented in ADR-001; it is not an implicit fallback that bypasses the parent's SAB/WASM geometry gate. Browser tests used COOP same-origin and COEP require-corp. A Worker timeout/termination and restoring a stored project remain parent controller responsibilities.

## Stable error codes

INVALID_INPUT, VERSION_MISMATCH, CORE_UNAVAILABLE (missing Web Crypto), RESOURCE_LIMIT, BUSY, REVISION_CONFLICT, CANCELLED, NO_TRANSACTION, PAYLOAD_MISMATCH, EXTERIOR_REGION, NO_BOUNDARY_COLOR. Transport adds NOT_INITIALIZED, ALREADY_INITIALIZED and INTERNAL_ERROR. Do not label these as unsupported tools: all seven raster tools operate in their normal/default cases.
