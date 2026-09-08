# Host sidecar handoff

Actual Node 24.19.0 HTTPS host with explicit static manifest and same-origin loopback API forwarding. No npm production dependency. No modifications to backend, UI, specs, seat configuration, other rooms or main product are included.

- CONTRACT.md: routes, headers, error/cache/SW semantics and frontend requirements.
- DEPLOYMENT.md: explicit TLS/config, existing backend CLI, backup/restore and rollback.
- TESTING-AND-LIMITS.md / limits.json: exact test boundary and open qualifications.
- manifest.schema.json: contract shape; runtime enforces additional file/security invariants.
- host-config.example.json / allowlist.example.json: placeholders requiring an operator-approved release/origin.
- provenance.json: official references, dates, implementation-seat limitation.

Integrate only new src/host and tools/hosting files. Parent can keep tests/host and docs under its chosen product test/documentation layout. Frozen unchanged backend/font inputs live in this run's inputs; they are test dependencies, not patches or production copies. No prior-room runner is called.

Run self-tests with tests/host/run.ps1 after reviewing its fixed run scope. Test evidence and final SHA manifest are in this run's reports/evidence. The host needs the separate UI build and real backend OIDC configuration to deliver the product flow. No independent review or real host/IdP qualification is claimed.
