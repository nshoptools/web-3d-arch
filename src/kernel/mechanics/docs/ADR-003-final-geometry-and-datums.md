# ADR-003 — final geometry guards and manufacturing datums

Accepted implementation decision, 2026-09-08. Mechanics semantics **2**, engine
0.2.1; input/output layout remains mechanics ABI2, source datum extension1,
ARCH/1 and host runtime ABI2. This is remediation from MECH-R1-001..007, not an
independent review verdict or a physical-fit qualification.

The base is frozen mechanics `f09a6fc371be0af0` plus the three-file source bridge
in frozen source assembly `6c293f65714fffea`. Source composition and that frozen
delivery are unchanged. See the final delta manifest for file ownership.

## Final cavity contract (001)

After bevel, groove, hollow, flexure cuts and material partition, the executor
reunites the **actual resulting parts** per manufacturing group for measurement.
It checks the full volume of required walls and openings, using pinned Manifold
set operations. It never treats the planar source-edge ledger as 3D contact.
These queries do not recolor, inflate, remesh or offset a manufactured part.

- Lego: offset the actual circumscribed bore polygon outward by `legoWall`
  using explicit miter joins (limit2). Protect that annulus for the whole bore
  depth. Hollowing shares these exact boss solids instead of independently
  re-rounding their curves in a second 2D subtraction.
- Lego cross cuts: only the requested union of the two orthogonal rectangles
  is an intentional wall opening. The roof over those rectangles is still
  required. Semantic cross-cut IDs and diagnostic110 record the exemption.
- Charm socket: preserve the actual neck-footprint ring surrounding the bore
  over its depth. Its nominal radial wall is `neckRadius-socketRadius`; this
  preserves the declared host for the mating neck after surface finishing.
- MX: preserve the actual post/collar solids minus the socket. Only positive
  Z segments intersecting the socket constrain its corner radius. The uppermost
  existing segment supplies the source attachment footprint. `collarH=0`
  creates no collar and never uses `postD2` for geometric constraints.

Sacrificial lego tabs also receive the previously declared bore/flexure/hollow
tooling before attachment is checked. This prevents their necks from filling
the last .05 mm of a cross cut in the W40 default test. The manual bottom groove
(`legoRanhZ=0`, R=.8, W40) leaves only .75 mm at an outer bore and is now invalid
for requested `legoWall=.8`; W40.11 is a valid explicit-zero control. No field
value or default is changed. The old baseline expectation for this unsafe
interaction is replaced with rejection plus the analytically wider control.

For each cavity, form the full vertical column over its opening from cavity
ceiling to nominal host top. Subtract the final solid. The lowest missing Z
anywhere in this column bounds the minimum continuous roof. A missing roof at
the cavity ceiling is invalid. This is a whole-region query, not sampled rays.
An entirely present column has its full nominal roof. No printable minimum
roof, machine compensation or physical strength is inferred.

The pinned backend can return contact fragments with vertices/triangles and
zero volume. Residual **query objects only** use `AsOriginal().Simplify(b)`,
where `b=min(1e-7, matingTolerance/1000, exportTolerance/1000)` mm. The library
documents that retained surfaces move less than this tolerance. Its starting
tolerance must fit this budget. There is no absolute volume epsilon. An empty
or exactly zero-volume cleaned residual denotes no measured interior. The
wall/opening predicate has this explicit spatial uncertainty; it is not an
exact-arithmetic certificate. A partially missing roof is conservatively
reduced by `b` before requiring positivity. Whole arbitrary-Boolean error is
still not certified by this local predicate. Manufacturing buffers are never
changed by this cleanup, and no material seam receives an epsilon offset.

`guard:wall-roof:<cavity ID>` is a dependency feature (kind2), not a mesh part.
Its six dimensions are `[cavityCeilingZ, nominalHostTopZ, conservativeRoofMm,
nominalWallMm, intentionalFlexureFlag, queryBudgetMm]`. The MX wall entry is0
because its circular segments have different radii; their actual envelope is
guarded. Invalid final geometry returns `AM_INVALID`, empty manufacturing
buffers and `export_blocked=1`; no parameter is clamped or auto-adjusted.

At most4096 cavity guards, existing2048 part/2M triangle limits and existing
feature budgets apply. Cancellation checkpoints bracket each residual query.
Deferred CSG is forced using `WithContext(...).Status()`. `Simplify`, mesh
reads and other synchronous queries are not claimed to observe that context;
the host watchdog remains necessary.

## Catalog and retained inactive data (002,006,007)

Numeric IDs/defaults remain the126-field immutable catalog. Product masks and
storage quantum now come from the integrated domain schema. Every imported-mesh
field has all-five-product scope. `impOn=1` is rejected as unsupported on all
five products because the imported-mesh executor is owned by the parent.
This is explicit capability rejection, not imported-mesh support.

Native validates count/index integer quantum before any cast. `topBevelSeg=3.9`
is invalid; it is never rounded to3. Decimal dimensions keep the domain1nm
storage grid, distinct from slider increments and curve tolerances. Layer
arithmetic uses integer schedule units. Existing legal nominal1.7/5.5/1.85 mm
values remain unchanged. Inactive collar diameter is range-validated and
retained, but cannot reject geometry for a collar that does not exist.
The additional review observation `ringH` auto mode with stored nonzero data
is rejected; auto requires its declared stored zero.

## Stable datums and conversion proposals (003,004,005)

Datum1 remains `source:body.bottom`, at the source body's manufacturing origin.
For a clicky this is the plate underside `U=max(postH,skirtH)`, also datum2.
New datum11 `mech:cap:skirt.bottom` is `U-skirtH`. The two names never switch
meaning by field. Other physical faces resolve in one request-local registry.
`source:attachment.bottom` resolves the single explicitly selected eyelet host.
Layers and explicit MM metadata must refer to an existing face with exactly
the matching integer schedule boundary. Bed is legal only at actual Z0.

The source bridge already fixed the MM adapter loss. This delivery adds the
exact review reproducer, packed-byte and recipe-binding checks, and native
face/reference validation. Unknown MM datum names are rejected. A wrong
reference layer cannot survive merely because its datum tag is recognized.

ABI2's legacy all-zero MM datum/reference record is unspecified, because it
has no presence flag. It preserves nominal geometry. When the resolved start
face meets a layer boundary, metadata uses that actual reference. Otherwise
`ArchMechInterval.reference_layer=UINT32_MAX`, deltas are unavailable zero
placeholders, and diagnostic109 says no conversion proposal is available.
Callers must not treat those placeholders as a zero-error recommendation.
The parameter record still contains the original input tags and value.

Nearest comparisons and ties use integer schedule units and parity of
`endLayer-referenceLayer`, matching domain. Example:1.5 mm from reference35
on a .2/.2 schedule spans7.5 layers; nearest is8 layers, +.1 mm. Geometry still
ends at8.5 mm. No proposal is applied by this executor.

`arch_mech_semantics_version()` returns2; existing source extension getter
continues to return1. No flat struct changes, native pointer/wasm32 offsets,
source IDs, material origins/provenance or preview ownership changes occur.
