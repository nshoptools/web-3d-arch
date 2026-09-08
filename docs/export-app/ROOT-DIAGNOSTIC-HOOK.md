# Exact Worker diagnostic hook

Apply the outer-catch hunk from `focused-production.patch`, checked against
`root-hooks.json`. The full candidate Worker is supplied for tests and preimage
comparison; do not overwrite concurrent parent runtime/ASFR/probe/CSG changes.

For `data.type === 'export-final'` and original code INVALID_SERIALIZATION, only
the complete messages INVALID_SERIALIZATION:STL_FLOAT_COLLISION and
INVALID_SERIALIZATION:SECTION_SUBGRID_RAW_EDGE become their suffix failure code.
The full-match equality check excludes terminal newlines too. Request ID and
existing proposal forwarding are retained. All other errors and RPC types keep
their existing path. The current EngineClient already uses that failure code.

No root ABI/registry/allocator/generation change, automatic retry on generic error,
geometry conditioning in the Worker, or confirmation is introduced. The adapter
can route only the exact STL collision to the explicit-consent proposal workflow.
Actual three-browser evidence uses this private hunk plus parent current code;
it is not an unmodified-main qualification claim.
