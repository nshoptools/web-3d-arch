# Source assembly semantics 2: actual manufacturing faces

2026-09-08. Implements GEO-02 of docs/specs/03-ky-thuat.md. This replaces only the height-binding/interval interpretation in ADR-001; its four source styles, XY composition, material precedence and ownership remain.

ABI1 structs, pointer widths and slab kinds are unchanged. arch_source_semantics_version() and ArchSourceView.semantics_version return2. Mechanics ABI2 requires semantics3 for the same delegated downward-span interpretation; source datum extension remains1. These are component capabilities, not root runtime ABI changes.

Let B(0)=0 and B(n)=first_nm+(n-1)*regular_nm, in integer 1e6 units/mm. All declared bindings (every layers record; MM with any nonzero datum/reference) must name the actual face AND satisfy B(reference)=manufacturingFace exactly on this decimal grid. Floating representation allowance only admits the representation of an exact stored decimal; it does not change the original value or move geometry.

MM datum0/reference0 is the existing ABI convention for an unspecified binding. It retains nominal geometry. Derived interval metadata resolves the face and its matching boundary; when none exists it emits reference UINT32_MAX and diagnostic109 OFF_GRID_DATUM_CONVERSION_UNAVAILABLE. This is metadata only, never an input sentinel or a proposal. Source intervals have no conversion-delta fields. There is no zero-delta conversion proposal and no implicit first-layer/reference replacement. Input parameter, region override, text and provenance records remain byte-for-byte unchanged.

A declared tag must match the semantic face (a different coplanar tag is invalid). BED is an alias only for an actual bed0 face. Declared tags and references are reported intact. Unspecified MM gets separately derived metadata; originals remain available in the input audit tables.

| Feature | Resolved face in manufacturing Z | Direction |
|---|---|---|
| baseH | body_datum_z (body.bottom) | up |
| clicky plateT | max(postH,skirtH), cap.underside | up |
| noi artH | body_datum_z+H+R, art.bottom | up |
| rimH | body_datum_z plus its style-dependent rim support floor | up |
| phang flatTop | body_datum_z+H-C, flat.bottom | up |
| phang2 flatTop | body_datum_z+H+R, flat.bottom | up |
| chim artH | body_datum_z+H, recess.top | down |
| bandCap | exact manufacturing top of that column, core-cap.top | down |
| model text/base | body_datum_z+source top / text base top | up |
| detached text/base | bed0 / detached base top | up |

Up span: (B(ref+count)-B(ref))/1e6. Down span: (B(ref)-B(ref-count))/1e6; underflow rejects. A recess must leave its specified positive floor; a core cap must fit its own column. Flat-inset/rim bottoms are solved from the exact style formula and then checked against their declared lower face, not rewritten to a convenient boundary.

A layer band is one up span of count*rank from the shared art bottom. Equal materials share rank. A global explicit core-cap reference must match every column top to which it applies; different top heights require unspecified nominal MM or a future per-column accepted binding API. V1 does not invent per-column references. Inactive per-region relief overrides remain their raised-relief records and are retained; active overrides validate their own face.

Intervals now report MANUFACTURING Z for all features; source slabs and attachment extents retain body-local coordinates for kinds0..3 and bed-local coordinates for kinds4/5. This distinction matters for clicky and integral charm. Contacts were already manufacturing Z. Parent should gate interval interpretation on semantics2, retain source audit metadata before destroying the source result, and keep the usual root snapshot lease. No new instance, allocator or root ABI is introduced.

Example: h0=.16/h=.20, base12 layers from bed => H2.36. Art4 layers from art.bottom/ref12 => [2.36,3.16]. Ref0 falsely names bed0 and is rejected. With h0=.25 the exact same counts/ref give [2.45,3.25]. Nominal MM2.4 remains2.4; a declared art.bottom/ref12 at h0=.16 is invalid, while unspecified MM retains its geometry and reports unavailable conversion.

Tests retain the old accepted requests against frozen implementations, verify failure buffers/old owners, and check volumes/planes with independent analytic oracles. See R2-FIXTURE-ADJUDICATION.md for the precise reason each historical invalid binding is no longer a positive fixture. No printer/slicer/physical fit qualification follows from these results.
