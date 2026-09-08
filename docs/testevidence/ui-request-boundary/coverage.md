# Coverage and assertion boundaries

| Boundary | Exercised oracle |
| --- | --- |
| File identity | Two Files have identical name, size, type and lastModified but different bytes. Current fileKey separates them; the actual AI dialog drops the old quote, then accepts the new File's matching quote. Same object remains stable. |
| Tuple identity | Pure tests include U+001F, pipe, double colon, NUL, quote/comma, backslash, emoji and scalar types. A real request-owner hook uses the historical U+001F collision witness across two tuples. |
| Account round trip | Two synchronous A→B→A notifications occur in one handler. No B UI commit is required to retire both project/account ownership. Late success, returned confirmation, and unexpected rejection cannot publish. |
| Project round trip | P1→P2→P1 retires project ownership even with equal final IDs. An account-scoped query remains owned across project-only movement. |
| Input round trip | Two real textarea input events A→B→A run synchronously in one act, ending at the exact original prompt. The previous quote, returned confirmation and thrown rejection are each suppressed; no live quote or submit appears. |
| Ordinary edit | A revision-only project edit does not replace context identity. A matching error remains visible; the UI does not pretend to replace controller revision validation. |
| Owner lifetime | Caller unmount and provider retirement are distinct cases. The UiStateProvider remains alive so late toast/log/dialog effects can be observed. Provider cleanup also removes all bridge listeners. |
| Global observation | A child passive-effect bridge call starts only after the provider's layout subscription is active. Pure tests cover initial inactivity, cleanup, restart, older cleanup and a read before any notification/render. |
| Request sequence | Two requests from one owner finish in reverse order: only the latest result enters rendered data. Changed key and account/project round trips are tested separately. |
| Navigation | The newest navigation may publish after its own project transition; an older navigation cannot replace its UI result. Account change/provider retirement, caller unmount, and an older thrown rejection through the real wrapped-hook pattern are covered. |
| Raw async rejection | A current rejection renders one BRIDGE_CALL_REJECTED diagnostic. A rejected call from a retired context must not leak its Error.message through useAsyncAction. |
| Actual AI handler | Real prompt editing, reference picking, quote preparation, dialog close, input replacement, current quote, stale returned confirmation and rejected promise paths are exercised. No submitImage call occurs. |
| Genuine current errors | Positive controls require error detail in the production log/toast/live region, actual ConfirmDialog contents, no automatic retry, and no double handling from useAsyncAction wrapping useRunCommand. |

The 41 browser checks execute the same suite in each engine. These are 38 scenarios repeated across engines, not 123 independent feature claims. Ten Node tests cover pure identities and context-clock behavior. Typechecking uses the exact captured AppBridge contract, including the full synthetic AppSnapshot, and the actual imported UI component graph.

Limits:

- The bridge is controlled synthetic infrastructure. Backend authorization, controller source revisions, real AI idempotence/charging, storage, mesh, runtime transport and kernel execution are outside this suite.
- File fixtures intentionally contain two identity-test bytes, not valid PNGs; no decoder capability is implied. Real File objects and exact metadata/bytes reach the AI request handler.
- DOM `.click()` and input events execute real React handlers within `act`; this is not trusted pointer activation, native file-picker integration, visual styling, screenshot comparison, or accessibility certification.
- `DialogHost`, `ConfirmDialog`, `AIGenerateDialog`, Toasts and live regions are real components. The harness exposes the production log state in an output element; it does not exercise every account/library dialog's rendering.
- The historical UI6 evidence covers two pure collisions only. ABA regressions are proved against the current context clock and React harness, not claimed as full historical engine reruns.
- Browser startup and selector deadlines retain their defaults. Held promises determine the race; changing a timeout cannot turn the three r1 payload leaks into passing assertions.

