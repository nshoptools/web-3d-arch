# Release API1

All paths passed to CLI are explicit absolute local paths inside the repository.
Dot-source tools/project-env.ps1 with the caller's Seat/RunId before any write.
Node24.19.0 is required. No npm install, HTTP lookup, Vite config, source discovery
or environment-file loading occurs.

~~~text
node tools/release/cli.mjs pin-runtime <runtime-root> <new-runtime-lock.json>
node tools/release/cli.mjs build <input.json> <new-artifact-dir>
node tools/release/cli.mjs verify <artifact-dir> <release-manifest-sha256>
node tools/release/cli.mjs configure <operator.json> <new-config-dir>
node tools/release/operator.mjs <config-dir> <config-seal-sha256> backend validate-config
node tools/release/operator.mjs <config-dir> <config-seal-sha256> backend serve
node tools/release/operator.mjs <config-dir> <config-seal-sha256> host serve
~~~

CLI success is a bounded JSON status; failure exits1 with only error.code.
No input path, stack, environment, secret or arbitrary provider error is logged.
Existing maintenance/recovery CLI exit2 continues to mean held/non-complete.

## Builder input

Exact arch-release-input/1 fields:

~~~ts
type FilePin = {file:string;sha256:string;bytes:number};
type BuildInput = {
 version:'arch-release-input/1';
 frontendRoot:string;
 frontend:{
   entry:string; document:string; // exact public JS/MJS and HTML URLs
   assets:Array<FilePin & {url:string;cache:'revalidate'|'immutable';licenseIds:string[]}>;
   navigations:Record<string,string>; // '/' -> document; no inferred SPA fallback
   references:Array<{from:string;to:string}>; // explicit dynamic imports/Workers/fetch/style resources
 };
 engine:{
   moduleUrl:string;wasmUrl:string;binaryRequest:string;
   abi:number;semantics:number;source:number;
 };
 library:{
   root:string;
   catalog:FilePin;deployment:FilePin;artwork:FilePin;receipt:FilePin;ready:FilePin;
 };
 runtimeRoot:string;runtimeLock:FilePin;
 licenses:Array<{
   id:string;spdx:string;source:string;revision:string;file:string;sha256:string;bytes:number;
 }>;
};
~~~

Frontend file paths are relative to frontendRoot. URLs remain exactly supplied;
bundled JS/CSS/HTML bytes are never rewritten. Main's Vite build is a separate
parent-owned step. No bare imports, sourcemaps, sourceURL, inline script, dev/test
asset paths or unknown MIME. Parsed static imports must resolve to declared files.
Computed dynamic paths must be declared by the producer and verified by the final
app smoke; the packager does not claim whole-program analysis.

The unified engine selects exactly one declared WASM. The wrapper must contain
the literal unchanged relative binaryRequest, and that request must resolve to
wasmUrl. Binary syntax is validated and import/export descriptors recorded without
executing a native operation. abi/semantics/source are producer pins, not an inferred
compatibility proof. The parent uses its existing single Module and source adapter;
this tool does not load another engine instance.

library file pins use exactly source-library/{catalog,deployment,artwork,build-receipt,
ready}.json. The four original config files are copied byte-for-byte. ready must
bind exactly those four files and every resource from original deployment1.
Each resource is read only from its declared deployment path, checked by exact
hash/length and then copied with the release transport URL. File existence or a
ready label without matching content does not establish validity.

runtimeLock is an absolute FilePin returned by pin-runtime; its files are the exact
explicit list in runtime-files.mjs, node24.19.0/databaseSchema5. It pins private host/
server modules and original codec notices. Private runtime code is never a public
bundler input. A parent runtime change requires a newly checked lock and artifact.
licenses files are absolute original legal notices with explicit id/SPDX/source/
revision metadata. Each frontend and engine asset requires at least one licenseId.
The tool does not invent a distribution license for project-owned code.

Builder output is a new directory, initially staged under the same parent. It copies
only explicit files, rechecks each input while copying, writes the deterministic
release manifest, verifies the full artifact, then renames into an absent destination.
A publish-lock prevents duplicate publishers for the same destination. Failures
retain unfinished staging for diagnosis and never publish a partial destination.
Existing output is refused. Public file hashes are independent of output directory and file timestamps;
the raw input document hash is separately
recorded, so changing its bytes intentionally changes release identity.

## Separate transport and parent entry hook

tools/release/source-transport.mjs is pure ESM usable in a browser/Worker or bundled
by the parent. Its validator dependency in vendor/source-library.mjs is an exact
copy of the frozen original; it always receives ORIGINAL deployment1 JSON.

~~~ts
type ReleaseTransport = {
 version:'arch-release-transport/1';
 catalogSha256:string; deploymentSha256:string; totalUniqueBytes:number;
 records:Array<{
   sha256:string;bytes:number;sourceMediaType:string;wireMime:string;url:string;
 }>;
};
~~~

SVG and plain text use source-assets/<original-sha>.bin and application/octet-stream.
Original mediaType, SHA, byte length, artwork, aliases, IDs, variations and legal
provenance are unchanged. XML would use the same inert rule only if accepted by the
original validator; the frozen deployment1 validator presently rejects XML media.
PNG stays .png/image/png, fonts .ttf/font/ttf and JSON .json/application/json;
wire JSON includes the existing host UTF-8 charset. No SVG host MIME expansion.
Every one of the7,751 current previews is an actual PNG.

~~~js
import {materializeReleaseSourceLibrary} from './tools/release/source-transport.mjs';
// The parent fetches these exact byte descriptors from release-bindings.json,
// checks their declared hashes/lengths, then supplies owned bounded Uint8Arrays:
const sourceLibrary = await materializeReleaseSourceLibrary({
 catalogBytes, deploymentBytes, transportBytes,
 origin: location.origin, basePath:'/'
});
// Exactly {catalog,assetURLs,origin}; assetURLs retain semantic mediaType
// but verified original SVG/text URLs now end in .bin.
// Pass to existing createSourceCatalog/application composition.
~~~

No fetch, DOM, objectURL, innerHTML, geometry, renderer or WASM instance in this helper.
Do not give rewritten .bin deployment records to frozen materializeSourceLibrary.
The separate map binds original catalog/deployment byte hashes; unknown fields,
duplicate/conflicting records, wrong URL/MIME/size/hash, missing records and unsafe
origin/basePath fail. Config byte bound64MiB each; source record encoded bound16MB
stays in the original validator. This does not imply .bin works in an img element.

public/release-bindings.json contains arch-release-bindings/1, entry, exact engine
descriptor/module/wasm hashes, and library document URLs/hashes/lengths. The parent
can fetch this fixed path and bind its final entry. Other library config URLs are
content-addressed. It contains no backend/config/identity state or test selector.

## Artifact and operator

public-manifest.json keeps exact host schema1/asset record fields and MIME/cache
checks. release-manifest.json (arch-release-package/1) enumerates all public/private
files and carries the input/runtime/library/module/license pins. Its SHA is the
external verification argument. Public buildId derives from the public manifest
entries and exact navigations. New runtime-only bytes change the package hash even
if public buildId remains the same. Verify checks all file bytes and rejects extra
files, symlinks/junctions/hardlinks and private file classes.

See operator.example.json: all real paths/issuer/owner/client registration and TLS
are operator inputs. configure checks existing host TLS/key/name/time, strict IdP
shape and runtime config without network/bind, then emits configuration.json,
host.json, runtime.json and config-seal.json in a new private directory.
Keys can be absent only so the explicit generate-keys action can create fresh
material; existing database recovery needs the ORIGINAL corresponding key set.
validate-config checks actual key versions/decryption and schema5 under writer.lock.

The operator wrapper verifies the sealed config and whole package, clears inherited
BACKEND_/HOST_ routing/selection/bootstrap values, sets only configured values and
dispatches existing private CLIs in the same foreground process. It preserves only
the existing OIDC client secret and explicit backup/restore/recovery evidence/hash
environment variables. AI providers default disabled; the only explicit selector
is xai-imagine, per-user BYOK only. A serve action runs existing offline validate-
config first. No system service or alternate test identity/provider path is exposed.

Dependency files (TLS/IdP/policy/key material) are private operator-managed inputs:
changing them requires operator validation and should be recorded in the private
deployment log. They are never copied into the release. File permissions0600 are
not a Windows ACL policy. Runbook documents shutdown, locks, recovery and rollback.
