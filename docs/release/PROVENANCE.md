# Inputs and resource bounds

Every supplied frontend file, original library config/source, runtime lock entry
and legal notice is checked by exact SHA-256 and byte length before publication.
The release manifest includes every output file, including the packager itself.
It contains no absolute workspace path or timestamp. The external manifest digest
is the operator pin; there is no signing key or claim that a hash is a signature.

The source-library validator in tools/release/vendor/source-library.mjs is an exact
copy of the project-approved frozen src/integration/source-library.mjs:
SHA-256 0bb129e33391aa6a041d8ed1fcebdb2a5a0755b3cb194c4f4fe47f2900e7df06.
Original frozen assembly manifest b07bf4e7d771a25d66ebf609c2a24fd6021b86674df90c216e5a8fee8e7fe216.
Its deployment1 URL suffixes are unchanged. The release transport helper first
uses that validator, then creates a separately versioned exact mapping.

No new npm/native dependency. Node24.19.0 vm.SourceTextModule runs only in an isolated
parse-only child (--experimental-vm-modules,256MB JS heap,15s deadline). Application
code is not evaluated, linked, transpiled or bundled. Static imports and supplied
dynamic/Worker/fetch references are checked; this does not prove all computed paths,
runtime behavior, WASM ABI semantics, or the absence of a deliberately embedded
secret in operator-approved JS. Main compiled input remains a trusted publication
decision. Known private/source/provider/auth/test paths, source maps and unknown
MIME are rejected; no directory is discovered or recursively made public.

Original asset notices remain referenced by the catalog and unchanged bytes.
Supplied frontend/module legal notices are copied privately under licenses/.
This tool grants no new license for repository application code. Existing jpeg-js
0.4.4 BSD-3-Clause and Apache notices remain under private src/server/codecs.
Keys, accounts, prompts, provider credentials, user exports and databases are never
release files. Detached customer user.keys is not opened by the packager.

Host bounds: 65,536 explicit assets,32MiB manifest; 64MiB per public file and512MiB
public-byte sum in this recipe. Existing host config supports at most1GiB total;
this recipe does not increase that bound. Original source records keep their
16,000,000-byte encoded source limit; catalog/artwork/deployment/receipt configs
allow64MiB independently. Full library has21,391 resources /306,260,612 asset bytes,
plus four configs totaling41,010,331 bytes. All7,751 previews are PNG.

The host eagerly holds verified public bytes; manifest objects, JSON parsing,
build buffers, TLS, backend, service-worker tables and V8 overhead add memory.
306MB is an asset sum, NOT an RSS/process cap. Packager max file count is bounded,
package bytes768MiB, manifest32MiB, public sum512MiB. Tests record actual RSS
snapshots without a universal deployment memory guarantee. Slow disk/fsync and
synchronous parser work are not preemptible by JS timers.

B11 schema5/cadence and B05 accounting remain unchanged: maintenance defaults5min
in CLI, conservative unresolved obligations persist, above-quote actuals count
fully, recovery plans can become stale on maintenance checkpoint generation
changes. No physical RPO/RTO, trusted external TLS/IdP, ACL, load or offsite restore
qualification. This is authorized implementation; prior blocked review was not retried.
