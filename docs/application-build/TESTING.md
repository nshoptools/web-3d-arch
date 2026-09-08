# Builder acceptance

~~~powershell
. ./tools/project-env.ps1 -Seat codex -RunId <fresh-run>
& ./tests/application-build/run.ps1 -RunId <fresh-run> -Label <fresh-label> -ApplicationInput <absolute-pinned-input.json> -BrowserSmoke
~~~

The runner finds the real repository root, prepares the environment and refuses
reused evidence labels. No install/download. Omit ApplicationInput for analytic
tests only. Production tests require explicit pair, current source tree and full
ready library. No tmp default or fixture substitution.

Analytic tests cover exact two-literal derivation/untouched bytes/quotes, invalid
counts/references/UTF8, both full content addresses, same-size tampering, bounds,
other-room/outside-repository writes, junctions, legal/key paths, actual reference
inventory, sourcemaps, inline/remote assets, private paths and four ES Workers.
Synthetic compiler records remain test-only and never reach production prepare.

Production acceptance:
1. Captures/compiles actual main/product-entry/source/scene providers; checks loaded
   module hashes and proves private environment sentinels absent.
2. Recompiles fresh; compares every frontend hash and public buildId.
3. Packages one prepared input twice; compares exact release-manifest hashes,
   full library/resources/previews, schema5, notices and private/public inventory.
4. Rejects wrong seal, changed output/captured source, extra files, incorrect
   engine version/hash and borrowed notice, without publishing a failed destination.
5. Verifies unchanged live source/toolchain/pair before final publication.

Optional Chromium smoke uses the actual artifact host/server, synthetic TLS and
loopback one-use PKCE/JWT IdP with no AI provider. It loads actual product shell and
bootstrap, signs in, runs the compiled PNG Worker and checks decoded pixels, probes
private paths/MIME/ETag/cache/COI and pageshow.persisted reload. No alternate public
entry or runtime test switch. Playwright1.63.0/Chromium153.0.8010.12/revision1243;
one browser at a time with loopback whitelist and own profiles/cache/downloads.

No trust-store install, real accounts, paid inference, deployment, native full-app,
target fit or slicer claim. Parent owns final combined application/native/printing
acceptance. A shell mount/file hash/PNG result does not qualify a 3D product.
Failed attempts and final pin tables remain in run evidence.

See OWNED-WORKER.md for the additional sequential three-engine compiled Worker
owned-bytes/no-refetch/single-instance test. It accepts an already sealed actual
build so later package I/O does not duplicate browser work.

For canonical native receipt negatives, set APPLICATION_BUILD_INPUT to the same
explicit pinned input and run node --test --test-concurrency=1
tests/application-build/receipt.test.mjs. This is separate from the33 analytic
checks and does not build or instantiate a kernel.

The full runner executes receipt tests whenever ApplicationInput is supplied;
BrowserSmoke runs the compiled owned-byte checks on all3 engines sequentially
after the Chromium HTTPS shell. OWNED-WORKER.md also documents a focused rerun.
