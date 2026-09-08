# Immutable release packages

Node24.19.0, ESM and standard library. This packages an explicit compiled browser
entry/file list, unchanged unified WASM pair, the checked source library, and existing
HTTPS host/B11 backend. It does not compile the parent UI or discover source files.

Read API.md for exact input/transport schemas and RUNBOOK.md for configuration,
foreground startup/shutdown, backup, restore and artifact rollback.
PROVENANCE.md explains pins and limits.

Use the repository's tools/project-env.ps1 before writing. During implementation
all output belongs to the caller's run. After integration the builder also permits
report/release/<explicit-id> inside the repo. Runtime data and config always remain
in the operator's run. No machine services, secrets, provider calls or deployments
are created. Artifact verification is integrity checking, not independent review.

A synthetic fixture package exercises the actual host/API/Worker/cache plumbing.
It does not establish application completion. Only the parent's final compiled
entry and acceptance evidence can establish product integration.
