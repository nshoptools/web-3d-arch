# Source assembly semantics 1 — 2026-09-08

Height bindings and interval coordinates are superseded by [semantics2 ADR-002](ADR-002-height-faces.md). The geometry formulas and stable IDs below are retained.

Implementation decision under the user's technical authorization. Specs 1.0.1
MOD-03 / GEO-01–03 leave the four height formulas and band/core mapping open
(O-02). These choices are explicit versioned product semantics, not historical
formulas recovered from transient drafts. Mechanical wave2 remains frozen.

Let A be the disjoint canonical artwork union, Ai a colored region, P the body
support, H=plateT for clicky and baseH otherwise, D=artH, C=flatTop, R=rimH when
enabled and applicable. Coordinates below start at source body bottom; mechanics
adds the manufacturing datum for cap/charm. No preview transform enters here.

* noi: body P[0,H], rim P[H,H+R], Ai[H+R,H+R+Di].
* chim: body (P-A)[0,H], colored Ai[R,H-D], rim A[0,R]. Without rim R=0.
  The colored columns provide the actual recessed floor; the open well above
  them is intentional. H-D-R must be positive. flatTop is retained inactive.
* phang: body P[0,H-C-R], rim P[H-C-R,H-C], top mosaic Ai and P-A [H-C,H].
  Background uses rim material when enabled, otherwise body. Positive floor required.
* phang2: body P[0,H], rim P[H,H+R], same flat mosaic [H+R,H+R+C].

Thus phang reserves color inside H; phang2 adds a color cap to H. These are
different accepted semantics. Rim is a support tier, not an epsilon around colors.
Rim flags on clicky/lego are retained inactive. Every material partition uses the
same A, P and exact interval planes. Missing geometry is never filled by a fallback.

Noi splitObj permits explicit per-region artH overrides. Inactive overrides remain
in caller data and receive diagnostics. layerBand assigns increasing heights by
sorted (slot, RGBA, semantic ID) material rank, equal materials share a band. The
rank-th automatic top is rank * artH above the art datum (for layers: one span of
rank * count, so the first layer occurs once). Explicit object heights win.
bandCore fills each column below its colored cap with body material; cap thickness
is bandCap measured downward from that column's exact top. A cap thicker than a
column is invalid, never clamped. These bands control visible heights; this API
does not claim a one-filament-per-layer print optimization.

The source long-edge size is applied once to main XY, centered at its source bbox.
Text overlays arrive in final design mm from the font/layout worker. size excludes
body margin. silhouette uses outward round offset of filled outer contours;
weld applies a round closing of radius weld/2, unioned with its input (no erosion
of the original support). fillHoles=false then subtracts the original artwork
holes; original art holes always survive above the support. round/square use the
padded bbox; circle encloses that bbox. cornerR must fit and the body must contain
the entire artwork; invalid combinations are rejected without clamping. minFeature
is a support-width diagnostic using a library inward offset per connected body
component; an empty erosion produces an explicit pad proposal, never removes a
small source accent. It does not certify every local neck width.

Text base is a rounded padded bbox of the prepared glyph union. Counters remain
in the glyph tier, while a base deliberately supports disconnected accents. Bed
text starts at 0. On-model text without base requires full face contact at the
highest source surface. With base, its footprint must stay inside P; its support
fills from the actual stepped surfaces to a level top at sourceMaxZ+baseHeight.
Boolean subtraction of the existing source, interval by interval, prevents hidden
overlap and avoids floating support. Attachment footprint is the union at the
actual lowest text/base interval, with exact full extent; it is not a bbox proxy.
Intersecting independent text assemblies are rejected with their IDs.

Source datums 128..134 are a semantic extension to mechanics ABI2. No struct is
changed. The supplied optional bridge patch only admits these tags on delegated
source fields; mechanics still checks exact recipe records. Source assembly checks
their concrete intervals. Existing mechanical datums retain all their meanings.
Use the declared bridge capability before passing extended records to mechanics;
unpatched wave2 rejects them. Manual mm records with existing tags need no patch.

Layer span = boundary(reference+count)-boundary(reference), boundary(0)=0,
boundary(n>0)=h0+(n-1)h. Values use integer 1e6 units/mm. Source-relative datums
identify an interval start (or top for downward recess/cap), not an instruction
to snap a plane to an absolute printer layer. Nonzero reference is explicit.
Bed datum cannot identify an elevated source span. All effective parameter tags,
values, provenance and user origins are emitted intact; upstream IDs1..7 must
match exactly. All input arrays remain borrowed and unchanged.

Material precedence: per-region USER override, then USER role palette, then
prepared region material; support roles use their palette. Stable IDs derive from
source ID, input region/text ID, stage and band, never vector position or RGBA.
Changes in source shape preserve semantic identity where the feature persists.
