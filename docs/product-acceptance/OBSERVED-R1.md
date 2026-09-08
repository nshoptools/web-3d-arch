# Observed baseline issues, Chromium campaign-r1
Exact baseline release 1147ad94ad005ffdb5f2524e4d9e6ada71778f3cc84c1b3cf590b2165c3b621f; prepared 136b8b90a35e4007a6e110db7a2737d73eb25f12c8b33fc9b44b595fb333d2e9. Read-only product; no fixes proposed to main here.

## Complete rescue package selects an absent manifest
Actual UI sequence: create keychain; import original two-color SVG; download rescue; set parameter size=40 through Enter/blur; immediately click rescue. The parameter command is asynchronous and ordinary job indicator is absent for this commit. The second actual download claims complete:true and issues:[] but selects a manifest not included among its two manifest members.
- raw: evidence/campaign-r1-chromium/svg-after.arch-project.zip, 94,413 bytes
- raw SHA d2fb8df8efa5a28d3813fdc822472ea49ce6e700a93db97c69308e19f258ab15
- head revision3/current4282651253ee939f9c33c2c0b897bef5f7316617fdf16b2f2e7bb9cd554286e4
- previous14b0158818605e561f68397df995e82eadee596cc13c1ada32d37a2a2c3010d0
- selected037af62271cde0cfe022cba0834f6e2c16e3c772c46a399e6af4cd8dddb643fb is absent.
- independent ZIP local/central lengths, CRC and all existing member hashes agree. No corrupted input or synthetic storage adapter.
- evidence/campaign-r1-download-readback.jsonl holds complete member inventory.

This is an invalid actual rescue artifact during overlapping parameter publication. The current head remaining committed is not evidence that the exported package is coherent. Underlying storage/controller interleaving needs a focused fix; one observation does not establish frequency or every affected engine. Ordinary sequential flow will wait the public document revision acknowledgement; this race remains a separate open regression.

## Default keycap proposal, not a compute hang
PROD-02 retained a geometry confirmation proposing long edge40 ->41.25mm. The first driver wrongly awaited job idle before handling that proposal and hit45s. Report this as awaiting explicit default adjustment, not proof of a kernel hang. Unmodified default build has not passed. A separately approved build can be tested without claiming the original default succeeded.

## Harness corrections
- Initial ancillary Node client called backend port with its default Host after configuring a public HTTPS origin; HOST_REJECTED is correct. Next harness routes all ancillary client requests through the real HTTPS host, trusting only the run's synthetic certificate.
- Source import can hold a running job while awaiting consent. Next driver recognizes the dialog before waiting idle; raster-r1 timeout is not a pixel-processing performance measurement.
- Controlled async text checkbox cannot be tested with Playwright's immediate check-state assertion; click then wait actual publication/consent.
- Color source selected real Noto COLRv1 item. First build said PRODUCT_SOURCE_CONVERSION_REQUIRED. Next flow explicitly converts/consents before building. Refusal alone is not feature pass.
- These corrections do not change artifact bytes, product deadlines, or geometry oracles.

Current four default build/gate paths (keychain,strap,lego,charm) passed in Chromium with actual source/Worker/model; STL bytes and full flow still require their own acceptance. Profile-library UI is absent. No whole-product readiness claim.
