# Printing acceptance mapping and boundaries

| Requested behavior / existing requirement | Implementation and evidence | Boundary |
| --- | --- | --- |
| AppController printing.list + Ohm printing.describe | One typed factory; actual interfaces compile; tests/printing-app/types.mts and remote tests. | Parent adds settings/selection/evidence/reset hooks and presentation. |
| Current user settings; schema compatibility | Actual src/server/settings.mjs schemaVersion1 printerProfiles; every list reads current remote.settings. Tests cover update/import/reset/ABA/stale async work. | No controller/backend edits or settings persistence in this delta. |
| Versioned profile and source provenance | Exact sealed record validation; profile payload/hash and source/rights retained; altered hash/version/nozzle/duplicates rejected. | Raw slicer-source bytes stay with host; profileSourceBytesVerified=false. No default profile or license assertion. |
| MOD-02 material mapping | Full materialId, explicit native uint32/slot join from current final-scene evidence; current project label/color; selected profile polymer/head. Tests cover same-slot aliases, different-slot same color, U1 head permutation, unmapped and conflicting IDs. | No color/order/truncated-hash identity, automatic material allocation or alias persistence. |
| Actual domain schedule and EXP-01/02 settings | Domain hash validated and compared to final-scene build hash; exact first/regular values and origins sealed against selected profile. Actual archives retain 0.25/0.20 override. | No silent default height application or schedule transaction. |
| Same runtime / exact job context | Adapter uses parent's live WeakMap root/client and explicit runtime proof. Real parent engine-worker RPC in 3 engines, current pair hashes, one runtime per engine. Ohm preserves ticket/version and parent native generation. | No second Module; ready without printing bit is not enough. |
| OUT-01 real target output | Actual service generates Bambu/U1 inspection project 3MF; separate readers inspect actual output plus analytic metrics. | Slicer round-trip/version qualification not performed; no ordinary target qualification inferred. |
| EXP-03 placement / GEO-03 calibration-fit | Provenance keeps bedPlacement/calibration unverified and physicalFit unqualified. Target export remains inspection gated; existing pose restrictions retained. | No bed collision/placement or physical calibration proof. |
| EXT-04 printer profiles | Valid available imported profiles listed qualified:false, no hardcoded product fixture. Invalid records have actionable diagnostics. | Existing supported machine/slicer subset only. No printer communication. |
| Independent fallback | Actual neutral union STL succeeds with missing/invalid target profiles. | Other non-printing gates, such as mesh inspection intent, still apply. |
| Failure/resource behavior | Finite plain JSON/node/depth/byte limits, cancellation, latest-preparation ownership, stale-before-send and post-result rejection, primary bytes retained. | No CPU deadline or RSS cap claim; geometry remains in existing Worker. |

The production delta is metadata preparation and current-context binding. It
creates no manufacturing proof and does not make the final app complete. The
measured output path uses real native/RPC services but explicitly synthetic
upstream final-scene authority in tests. Parent final composition must inject the
actual final-scene getter and runtime qualification evidence.
