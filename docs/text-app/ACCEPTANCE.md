# Source application acceptance mapping

This maps the bounded implementation to actual analytic/integration tests. It is not a full product acceptance report.

| Requirement | Evidence |
| --- | --- |
| Original font/emoji catalog and trusted deployed URLs | suite.mjs catalog IDs/families/styles, exact emoji sequence, pagination, versioned Vietnamese labels, original mono artwork and missing/duplicate/foreign URL rejection |
| Actual font import and reopen | Real variable/static TTF metadata, names/axes, original owned bytes, current provenance.inputFonts[hash].font restoration and retained-byte shaping |
| Current controller text edits | Vietnamese real glyph curves/PNG change with text; frozen ingest state, line/cluster lineage, selected font variations, canonical mm/pt display conversion |
| Selected emoji | Real outline and COLRv1 selection for smile, skin-tone ZWJ technologist, Vietnamese flag, variation heart and family ZWJ; original alias round-trip |
| SVG/CBDT/COLRv1 source distinctions | Portable source suite covers selected original paths, complete graph/clip/gradient/groups and explicit native gaps; current app catalog preserves the host's explicit source selection |
| Shared Module and exact job lifecycle | One Module factory; ABI check; native control words preserved during import; whole app ticket echo/current guard; stale/cancel/reset/no-queue tests |
| Controller source identity | Actual createSourceContext helper; initial/replacement import0 and edited/repeated same-ID source3→4→5; missing/wrong/stale top-level context rejection |
| Explicit conversion approval | Real raster proposal; exact kind/version/approvalHash/proposalHash descriptor; altered candidate metadata/bytes/context/dimensions rejected; one-use acceptance |
| Flat common receipt | Actual sourceReceipt validator for text and browser emoji; sourceRevision and accepted domain revision distinct; only version/ticket/confirmation/receipt returned |
| Preserve originals and variation provenance | Hash proof across prepare/import/edit/reset; actual font/artwork bytes retained; selected dependencies copied without mesh/history bytes |
| Prepared product input boundary | Explicit persistent u64 text/source/provenance IDs, whole-text glyph/holes/accents, source coordinate system and native profile metadata; missing binding is explicit |
| Browser color and WebKit fallback | Capability probe uses getContext; Chromium/Firefox Worker preview; WebKit private allowlisted bridge yields real pixels; overrun retains explicit gap/no fake bitmap |
| Invalid/resource limits | SFNT bounds, WOFF2/TTC/color-source refusals, actual SHA mismatch, missing sources, shared buffers, finite/layout/axis/u64 limits, deadlines and disposed access |
| Public API compatibility | TypeScript strict consumer test against actual aligned controller declarations; receipt has no result/geometry replacement fields |
| Portable regression without frozen writes | Three test-only runner deltas plus one helper; source regression85Node/144browser cases, protocol10 and bridge31; all29 frozen source files checked unchanged |

Detailed names, pass counts, capabilities and durations are retained in evidence/text-app-node.json and evidence/text-app-browser/{chromium,firefox,webkit}/results.json. Portable results are evidence/node-results.json, evidence/bridge-client-results.json and evidence/browser/{engine}/results.json. The checked manifest links every evidence file and hash.

Not covered by this candidate: full application UI actions/controller atomic commit tests, final product packing/extrusion, manufacturing color reduction acceptance, global source-bound/mesh/fit qualification, full deployed mono-thumbnail library, or independent configured review.
