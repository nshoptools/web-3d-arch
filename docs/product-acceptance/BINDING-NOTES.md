# Binding notes for parent

The current pinned backend OIDC endpoint policy (src/server/network.mjs) allows synthetic loopback only as HTTP 127.0.0.1. The production app navigation guard requires an HTTPS authorizationUrl. This means the existing synthetic OIDC helper can prove signed token/PKCE/backend account setup, but cannot by itself prove the production interactive same-tab IdP UX. No URL guard or backend transport will be bypassed here. Parent can supply an existing supported test binding, or the harness will bootstrap authenticated sessions through actual loopback OIDC/HTTP and label that narrower identity scope.

Useful preparation proceeds without the release: immutable artifact copier/pin checker, independent ZIP/STL/receipt readbacks, verdict ledger and DOM flow helpers. The actual source, wrapper/WASM pair, UI and product processing composition will be selected only from the supplied exact prepared artifact.

Current src/app/export-receipts.mjs uses artifact.sha256, artifact.byteLength, artifact.projectRevision and artifact.formatId. Its receipt contentHash is the receipt document hash, not the STL hash. Readback must compare actual download bytes to artifact.sha256.

No product execution or browser pass is recorded during this preparation phase.
