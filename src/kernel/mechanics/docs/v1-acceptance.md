# Mechanical component acceptance — semantics2

Implementation measurements; no whole-application, configured-review, slicer or physical-fit qualification.

| Feature | Numeric oracle | Native / WASM |
|---|---|---|
| Body, holes and disconnected components | 20x10x2.4 volume 480; 4x4 hole volume 441.6; disconnected island retained | pass in stated component scope |
| Body/tray eyelets with open bore | 8/4 mm annulus; positive contact, bore opening, explicit-zero rejection | pass in stated component scope |
| Explicit text footprint eyelet | Host 7001; center (33,6.5), open bore, positive annulus contact; missing host invalid | pass in stated component scope |
| Circular and horizontal/vertical capsule bore | 4 mm diameter, independent axis/offset/rotation probes, positive floor/roof | pass in stated component scope |
| Capsule, oblique and corner-mouth chamfer | Axial lead .6; radius 2.3 at depth .3; angles 0/30/45/90/120; capsule extension retained | pass in stated component scope |
| Blind/sparse grid, bosses, hollow/cross slots/tabs | 40x30 grid 15/7/3 bores; diameter 4.9/5.5/5.5; depth 1.8; roof and openings | pass in stated component scope |
| Default-on semicircular external border groove | R=.8, auto center 2.8, numeric cross sections/analytic volume; literal user zero retained; holes/islands/colors/concave corner | pass in stated component scope |
| Hollow cap, skirt and ribs | Open underside, hollow interior, wall probes, three sizes 26/40/64; skirt zero disables | pass in stated component scope |
| MX post, collar and cross socket | 5.5 mm socket/1.85 mm collar; open tip and positive roof; cross enlarges by 2*clr | pass in stated component scope |
| Switch tray cavities, floor, wall, stop, eyelet and travel | 1.7 mm pin pocket; positive floor; nested pocket probes; continuous printed-solid sweep plus independent sections at five travel states | pass in stated component scope |
| Integral/separate flange, neck, pin, socket and chamfer | 14.5 mm flange; 6 mm pin; diametral clearance; integral/separate bounds and probes | pass in stated component scope |
| Round/chamfer/step exposed tops | Independent round/chamfer volume and sections; true h0/h step intervals, positive floor, concave rolling corner | pass in stated component scope |
| Text/base bevel independent of main body | Round/chamfer/steps; body volume unchanged; counter/dot and user colors remain | pass in stated component scope |
| Material/Z preservation and shared boundaries | Joined bevel across Z=1.4 material transition; seam x=0 within 1e-12; independent-valley option; disjoint Z kept; interior overlap invalid | pass in stated component scope |
| Role and per-source bevel overrides | User role/slab slot/color/u64 provenance retained; disabled bevel remains; orphan override invalid | pass in stated component scope |
| Nominal mm and datum interval schedule | h .16/.20/.25, h0 separate; 12 layers=.16+11*.20=2.36; nominal 2.4/1.7/5.5/1.85 retained; wrong datum invalid | pass in stated component scope |
| Declared clearance signs and conventions | Positive enlarges void; negative rejected; tray gap zero rejected; one-side versus diametral measured | pass in stated component scope |
| Signed pin/hole/surface flattening | Three sizes and .001/.0005/.0001 tolerances; actual radial/cross-section measurements, analytic bounds and source preservation | pass in stated component scope |
| Preview separate; proposals never mutate | Assembly flag leaves binary mesh SHA identical; export gate separate; proposed values require accepted new request | pass in stated component scope |
| Invalid input, resource guards and seeded combinations | No mesh on invalid/proposal/cancel; finite/domain/source guards; seeds 0x6d656368 (24) and 0x6d656332 (12) with reproducers | pass in stated component scope |
| Generation-tagged single-use control | Before/stale/wrong-generation tests on both; separate native in-flight observers; no partial mesh | pass in stated component scope |

19/19 baseline groups,199 scenarios per target;83 added remediation cases per target;140 frozen source integration cases per target;22 domain checks;3 native cancellation observers. Current records replace the old unsafe literal-Z0 groove expectation with rejection plus a wider valid control. Seven findings and exact scope are in remediation-acceptance.json and ADR-003. Per-field metadata coverage is not counted as complete feature acceptance.
