# Portable test inputs and outputs

Source tests use `tests/text-source/test-environment.mjs` to validate the assigned
repository/run and explicit `ARCH_KERNEL_MODULE`. Text adapter tests use
`tests/text-app/environment.mjs` to stage current permanent code and types. Neither
requires an implementation room or its files to remain available.

Original font and emoji assets remain under `src/assets`; derived test images
are written to the assigned run with hashes and source records. The module path,
matching WASM, pinned tools and selected browsers are prerequisites, not inferred
from another worker's cache. See [commands](COMMANDS.md).
