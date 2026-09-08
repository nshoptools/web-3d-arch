# Assigned final-export acceptance

The checked corpus contains **112 cases each on native and WASM**, including
32 seed-reproducible numeric cases and expected rejections. The **80 non-fuzz
cases** also run in one real same-Module Dedicated Worker per Chromium, Firefox
and WebKit. These are implementation tests for the three assigned exporters,
not whole-product/spec completion or a configured independent review.

The machine-readable [acceptance matrix](acceptance.json) maps each component
behavior to requirements, exact case IDs and independent measurements. Each
row is checked against final native/WASM records by `tools/check-evidence.mjs`.
Expected rejection/inspection cases are not counted as valid geometry passes.

| Scope | Measured acceptance |
|---|---|
|Union STL (FE-01/02)|Overlapping boxes produce 1500 mm3, not 2000; shared faces/identical boxes, holes, blind roof and disconnected solids pass written-file topology, volume/bbox and opening probes.|
|Material ZIP (FE-03/04)|Explicit same/different `(slot,color)` pairs give the expected 1/2 groups. Same-pair solids union; other pairs keep common axes and source IDs. Positive material overlap blocks normal export; disjoint Z is accepted despite identical XY.|
|Final SVG (FE-05..08)|Post-CSG opening/roof, cut across a material seam, exact boundary Z, empty Z gap, color, front/back, inch/mm and .16/.20/.25 explicit sequences match analytic areas/probes.|
|Export pose (FE-09)|Common pattern-down/resting Z0 and reflection preserve volume, expected part offsets and correct written normals; scale and invalid pose combinations reject.|
|Numbers/gates (FE-10..14)|Small nonzero geometry, f32 error/collapse, stale mapping/revision, upstream invalid gates, invalid command values and resource/32-bit overflow paths reject without publication. Valid nearby controls pass.|
|Ownership/cancel (FE-15/16)|23 native and 25 WASM ownership checks; 25 also in each browser. Five native cancel thresholds and one real in-flight tagged cancellation per browser preserve source and old readers; charges return to zero.|
|Parity/tooling (FE-17..19)|112 native/WASM result pairs, four helper contract checks, two actual WASM helper calls and recorded dependency/hash verification.|

Independent file checks reopen binary STL and ZIP/SVG bytes, not just Manifold
status. They use root `tests/oracles/mesh-oracle.mjs` plus this component's
analytic volumes/bounds, written-normal cross products, vertical opening rays,
SVG shoelace/nonzero-winding probes and the printing module's separate ZIP/XML
readers. Oracle source hashes are recorded with every suite. The small SVG
oracle parser only reads this encoder's M/L/Z output; it is test code, not a
product geometry parser or triangulator.

Native/WASM parity inspects 128 STL mesh-file instances across both targets;
two are the intentional failing-topology inspection case. Thus the counter
`independentMeshOracleParts` denotes inspected files, not 128 topology passes
or 128 independent shapes. Duplicated browser/platform cases also do not count
as additional independent geometries. Reproducers retain fixture ID, command
bytes/settings and seed where applicable.

The handoff reports final hashes and observed numeric deltas. Read
[DECISIONS](DECISIONS.md) for the admitted domain and resource/numerical policy.
The required normal paths above generate real geometry. No unsupported branch
substitutes a source slab section for a final-mesh section or concatenates
intersecting STL shells. This service accepts the parent's completed final mesh
and invalid upstream gate; it does not repair mechanics/source R2. Full UI/RPC,
source SVG/PNG/3MF, slicer/physical results and general whole-pipeline error
qualification remain explicitly parent-owned/outside this handoff.
