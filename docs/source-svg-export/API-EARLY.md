# Source SVG export early API 1

Implementation only, isolated run 20260908-source-svg-export-wave1.
Owner writes only src/integration/source-svg-export.mjs + .d.mts, tests/source-svg-export
and docs/source-svg-export in work/source-svg-export. Parent/Boole/Halley keep their files.

## Construction / lifecycle

createSourceSVGExport({context, kernel, sources, sourceContexts?}) returns
{describe, acquire, refresh, reset, dispose}. describe/acquire implement EXACT current
Ohm SourceSnapshotProvider. context is the same ApplicationContext getter with
assetsMap; userId/projectId/sessionKey/headHash/current domain state are authority.
model may be null throughout. kernel is the existing operation/ensureRuntime
service, sources the existing createApplicationSources result. No new Module,
client or native generation. sourceContexts is a possible additive validated
source helper from Halley; no dependency on a completed 3D product.

refresh({control}) copies source/metadata/current materials/text and all referenced
dependency byte arrays BEFORE hashing/await, revalidates native source regions,
binds current full material identities, and privately caches owned SVG bytes and
the exact descriptor. Text/mono emoji are freshly shaped by the existing same-
Module prepareSource/prepareText and compared with committed numeric SVG/frame/
font/artwork provenance. Stored derived metadata and a self-hash are not proof.
Raster replays existing prepareRecipe against original/current RGBA, exact stored
processing/consent and all 31 actual packet buffers; no new consent is made.

describe(currentContext) is synchronous: ready ONLY for this private checked
cache/current source ID+revision+rawHash/dependency bytes/material state/session.
No model/final-scene/3D gate is introduced. acquire(descriptor,{...ProviderControl,
assets}) accepts only the current descriptor, owns dependency copies and returns
{serializeSVG(options,control),release}. Result exact Ohm:
{bytes,key,sourceId,sourceRevision,rawHash,provenance,changes?}.

SourceSVGOptions remain {filename,inspection,units:'source',side:'source',
color:'source'}. No option grants parser bypass. Ohm binds actual output SHA and
turns actual semantic changes into its existing prepared exporter proposal.

Parent hooks: await refresh after committing/importing/restoring/reopening source,
text/artifacts/material recolor/exclusion or accepted raster edits; recalculate
formats afterward. Reset immediately at access/project changes and engine
retirement. Getters must become null on logout. sessionKey must change on
epoch/projectContextGeneration reset, including A -> B -> A. Pending work checks
source/head/authority after every await and before/after acquisition/serialization.

## Concrete serialization routes

1. Revalidated original SVG or regenerated numeric text SVG can retain complete
   curves/paint/fill-rule/transforms while it represents the CURRENT committed
   source regions and material selection. Original-copy alone is insufficient.
2. Current material recolor/exclusion is explicit full materialId -> committed
   sourceKey/contextKey/nativeKey binding using product-material contract. No
   color/order/truncated hash assigns identity. Where original paint ownership
   cannot be edited without ambiguity, export native validated visible regions as
   a concrete candidate and report curve/clip/paint flattening in changes.
3. Accepted raster/color graph emits the actual indexed region contours including
   holes/islands in one source frame. It never exports stale original artwork.
   Original graph/font/artwork/RGBA hashes and accepted reduction remain provenance.
   Any NEW approximation is an explicit output-hash-bound proposal.
4. Unsupported original active/external SVG remains an actionable parser failure.
   Color gradients/alpha are never silently stripped or replaced with monochrome.
   Unaccepted raster conversion remains a source decision, not an export bypass.

Bounds will align with Ohm: <=256 positive-byte dependency records, sum <=64 MiB,
output <=16 MiB; existing source parser/graph/text limits can be stricter. No
main-thread waits, network, filesystem or source/settings mutation in provider.

## Relay requested to Halley (no direct edit)

Current product-source-contexts closes manufacturingTextSVG and withCanonical;
sourceGeometry/rasterSourceGeometry export only hashes, dropping their decoded
rings. Please consider an additive source-only withValidatedRegions(input, consume)
or equivalent callback exposing OWNED validated contours/source bytes + canonical
region metadata without requiring product height/domainRecord/3D model. Reuse
same native parser and raster replay, not a second parser/boolean. Exported
manufacturingTextSVG would avoid duplicating the existing framing rule, but must
not turn a stored forged numeric SVG/frame into trusted output: compare against
fresh same-Module text shaping. I can provide a focused proposed patch after
matching the finalized remediation boundary; my candidate will not edit Halley's file.

I will implement normal existing routes and test actual Worker RPC now; this is
not a request to keep source export permanently disabled pending new architecture.
