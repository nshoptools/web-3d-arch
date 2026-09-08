# Focused application composition delta

Parent owns src/integration/application.mjs. Apply docs/composition.patch only after comparing the exact current file SHA-256 with docs/composition.json.preimageSHA256. The frozen source manifest does not replace that entry. The patch was captured from current main including application.css and the parent host class; its initial older observation is separately retained in inputs/main.

The patch forwards `leasePolicy` instead of the unsafe standalone boolean and returns the same disposal Promise for repeated host cleanup. Default deployment remains signed-offline. For the explicitly selected authenticated-online initial release, the trusted bootstrap should call:

~~~js
const application = mountApplication({
  element,
  deviceId,
  leasePolicy: 'allow-authenticated-online',
  // Parent's checked worker/module/product/printing bindings.
});
// Before mounting another controller/identity in the host:
await application.dispose();
~~~

Choose the policy in trusted application configuration; do not read it from project files, cached settings, error payloads or query strings. HTTPS and the deployment's authenticated same-origin endpoints are required. A browser online event calls initialize, which starts a fresh exchange only after private adapter reset. It does not reuse an online grant.

The supplied reset composition already awaits editing, PNG, kernel, viewport, download, printing and mirror cleanup. Parent's real PNG client and CSS fixes are unchanged. The focused patch is syntax checked; actual full UI bootstrap integration remains parent-owned. The candidate browser tests directly exercise the actual AppController/storage/backend and the existing editing Worker.
