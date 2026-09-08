# Source component acceptance — semantics1

Implementation evidence, not configured independent review or full application/physical acceptance.

| Feature | Requirement | Actual oracle | Result |
|---|---|---|---|
| noi: Raised colors, overrides and nominal Z | MOD-03 / GEO-02 | 264*2.4 + 200*.8 = 793.6 mm3; explicit 1.7/5.5/1.85 mm retained | pass in component scope |
| chim: Recessed colored floor with intentional open well | MOD-03 / GEO-02 | 264*2.4 - 200*.8 = 473.6 mm3; probes above floor are empty | pass in component scope |
| phang: Color mosaic inside body height | MOD-03 | 633.6 mm3 total, top at2.4 mm | pass in component scope |
| phang2: Added flat color mosaic | MOD-03 | 897.6 mm3 total, top at3.4 mm | pass in component scope |
| body: Silhouette, rounded/capsule, circle and square | GEO-01 / MOD-03 | Analytic rectangle/capsule/circle area, three sizes and tolerances | pass in component scope |
| holes: Original art holes and explicit body-hole policy | GEO-01 / AT-020.3 | 4 mm2 counter through all four modes; material/void probes | pass in component scope |
| disconnected: Accents, weld and support-width proposals | SRC-04 / GEO-01 | No accent deletion; explicit component erosion diagnostic/proposal | pass in component scope |
| rim: Distinct support material and interval | MOD-03 | 264*.6 mm3 added only in defined additive modes; exact layer spans | pass in component scope |
| bands-core: Material height bands and body-colored core | MOD-03 | 873.6 mm3; separate core/cap probes; no clamping of overrides | pass in component scope |
| text: Prepared glyphs, text base and stepped support | SRC-04 / MOD-02 | Analytic rounded base area; source subtraction; positive face contact | pass in component scope |
| bed-text: Bed Z independent of body datum and preview | SRC-04 / ABI-01 | Text/base min Z0, max1.4, group2 identity preview; tray collision rejected | pass in component scope |
| schedule: First/regular and feature-relative spans | GEO-02 / AT-021.2/.4 | h0=.27, h=.16/.20/.25; no vertex snap or input mutation | pass in component scope |
| materials: User role/region values and provenance | MOD-02 | User region wins; role overrides and uint64 source identity retained | pass in component scope |
| contacts: Actual 3D contacts and exact shared source boundaries | GEO-01 / AT-020.2 | 8 mm2 vertical face and two100 mm2 horizontal contacts; disjoint Z not contact | pass in component scope |
| products: Prepared source across five product executors | MOD-01 | All four modes on all five products with normal supporting source footprints | pass in component scope |
| bevel-groove: Source/slab preservation through existing feature executor | MOD-03 / GEO-03 | Actual top profiles and groove radial oracle; final blind-bore wall guard is separate pending remediation | pass in component scope |
| invalid: Typed invalid input, proposals, budgets and cancellation | MOD-03 / ABI-01 | No partial source/mesh publication; input parameters stay unchanged | pass in component scope |
| seeded: Reproducible numerical corner cases | QA-01 / QA-04 | 24 seed0x5a17c0de analytic size/height/pad combinations; per-case reproducers | pass in component scope |

Native140/140 and WASM140/140; mechanics bridge regressions13/13 each; domain bindings13/13. Complete per-case links and scope limits are in acceptance.json and the checked evidence manifests. Field checks are not counted as complete feature acceptance.
