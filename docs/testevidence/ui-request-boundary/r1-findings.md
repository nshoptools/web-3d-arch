# r1: three reproducible publication leaks

On the preserved r1 source, Node passed 10/10 and TypeScript passed. Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6 each passed 35/38 scenarios and failed the same three. The full runner returned exit 1. There were no console/page errors or attempted non-loopback requests. Failure assertions remain ordinary failures, not expected-failure annotations.

1. `unmounted navigation caller cannot publish later confirmation`: hold `project.delete`, unmount its caller while BridgeProvider and UiStateProvider remain alive, and resolve a refusal carrying confirmation. The r1 context-command branch in `src/ui/core/bridge.tsx` checked account, provider and navigation serial, but not the caller instance. The actual UI logged `PRIVATE_NAV_UNMOUNT` and opened ConfirmDialog with that answer's changes/retry. Retiring the whole BridgeProvider correctly suppressed the answer; this is specifically individual caller retirement.
2. `actual AI changed prompt cannot publish old rejected body`: open AIGenerateDialog, enter a prompt, click Lấy báo giá, edit the prompt, then reject the held prepareImage promise. The r1 `src/ui/ai/AIGenerateDialog.tsx` checked request-owner identity after a fulfilled await; rejection bypassed that check. The outer useAsyncAction caught the Error under the still-current account/project and published `PRIVATE_EDITED_REJECTION` as BRIDGE_CALL_REJECTED log/toast detail. A returned confirmation after that same input change was correctly suppressed, and a current matching rejection remained visible.
3. `wrapped earlier navigation rejection cannot publish after newer navigation`: two callers use the production pattern useAsyncAction(async () => { await run(project.open) }). Hold the first P2 call, start/complete the newer P3 call while snapshot identity is unchanged, and reject the earlier call. The rejected dispatch skipped the navigation ownership check; useAsyncAction published `PRIVATE_OLDER_NAV_REJECTION` through its separate context-only owner. The positive current wrapped-confirmation control logged once and opened one dialog.

All strings above are synthetic markers. These findings were sent immediately to the parent. The parent acknowledged all three and owns the production fixes; this candidate contains no UI production changes.

r1 exact source hashes:

- bridge.tsx: `5bdd8edb82d8313a9e16370eab452aa6f7ec5279b5961521454082975f421aa9`
- AIGenerateDialog.tsx: `a711c11d0828a3a53d75c3f7aae37a717917bfa192b8df383fe1d59d7c3a0937`
- Full 75-file capture manifest: `73b54d49a1bd359a58e9fedac0fd93958daf62432be1f7a32b5a54525ce68ada`

The preserved r1 test snapshot also has its own manifest. New revision evidence must identify its own source/test hashes, keep r1 unchanged, and run these same assertions against the announced input. See evidence.md for the recorded results.
