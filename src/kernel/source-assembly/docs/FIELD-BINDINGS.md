# Source field bindings, semantics 1

Height bindings and interval coordinates are superseded by [semantics2 ADR-002](ADR-002-height-faces.md). The geometry formulas and stable IDs below are retained.

IDs are the frozen mechanics ABI2 catalog IDs. Every returned recipe record
preserves field ID, mode, origin, datum, reference/count, value and provenance.
No output mesh or JSON context substitutes for these records.

| IDs / keys | Execution and ownership |
|---|---|
| 1 k, 2 res, 3 smooth, 4 minA, 5 denoise, 6 eps, 7 tension | Decoder/vectorization/source-preparation owner; require seven exact upstream binding records. This library does not repeat those transformations. |
| 8 size | Main source bbox long edge → uniform scale and center, applied once through a shared-coordinate map. Text overlays are prepared in final mm. |
| 9 outline | 0 silhouette, 1 rounded frame, 2 bounding circle, 3 square. Formula in ADR. |
| 10 cornerR | Physical XY radius of rounded frame; invalid if it cannot fit or frame misses original artwork. Equality to half short side is a capsule/circle via library hull. |
| 11 offset | Outward body margin in mm; original art geometry does not grow. |
| 12 weld | Disk closing radius weld/2, union original support, with explicitly bounded derived-support regularization. Convex closing is exactly the identity. |
| 13 minFeature | Component inward-offset support-width check; failed erosion gives a diagnostic and offset proposal. No artwork deletion, automatic acceptance or local-neck certification. |
| 14 fillHoles | False subtracts original art holes from support P. True fills body holes only; glyph/color contours are retained. |
| 23 baseH / 24 plateT | Exact source base interval, reuse mechanical body-bottom / cap-underside tag. Mechanics translates source coordinates to the physical cap/charm datum. |
| 25 artMode | Four actual disjoint material/Z formulas, ADR semantics1. |
| 26 flatTop | phang / phang2 colored cap thickness, tag130 source:flat.bottom. Inactive otherwise. |
| 27 artH | noi relief from tag128 source:art.bottom; chim downward depth from tag131 source:recess.top. |
| 28 rimOn / 29 rimH | Distinct support tier, keychain/strap/charm; tag129 source:rim.bottom. Other product flags remain inactive, not erased. |
| 30 splitObj | Activate per-region explicit artH only for noi. Original override records remain in view.input_regions when inactive. |
| 31 layerBand | Noi automatic per-material height rank, user height overrides retained. |
| 32 bandCore / 33 bandCap | Body-material lower column plus colored cap, tag132 source:core-cap.top. Reject cap exceeding its column. |
| 15..20 bevel controls | Mechanics wave2 executor; prepared slabs preserve materials and expose stable target IDs via lineage. Parent can copy the borrowed source descriptor and attach its ArchMechBevelOverride array without changing the result. |
| 21 layerH | Must match authoritative schedule.regular_nm; no second schedule. |
| 22 layerStep | UI increment, retained; never a mesh precision or vertex snap. |
| 34..128 mechanical/migration fields | Passed intact to mechanics. Their validation/geometry/preview behavior remains its contract; this source API does not claim imported-mesh CSG support. |

ArchSourceRegion.height is an artH record with its own provenance and optional
user override flag. ArchSourceText.height/base_height are separate typed records
under their text-group semantic ID (field_id=0, not an invented catalog field).
Tags133 and134 identify the resolved text/text-base start surface. The parent's
font/layout worker has already applied font, size, text placement, tracking,
line spacing and curvature. Text base pad/round/height are performed here.

The generated lineage table keeps input source ID, generated slab ID, material
provenance, stage and band. Input audit records retain original region materials,
height values and text settings. Copy needed audit records into the root snapshot
before destroying this result. Source provenance and material provenance are
separate; neither is replaced with an array index or color.

`src/source-datums.mjs` provides stable string→tag mappings for the parent domain
adapter. Existing frozen mechanics domain-adapter does not know these new strings;
parent must extend its datum map (or construct C records in the helper). Manual mm
records with datum/reference metadata should retain that optional metadata in the
adapter too. Do not convert layer values to mm merely to bypass an older adapter.
