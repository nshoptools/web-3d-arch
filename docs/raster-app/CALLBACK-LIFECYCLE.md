# Product consumer lifecycle

`source.prepareRecipe(control)` still returns either an owned kind28 source packet or
an unapproved source proposal. `source.prepareRecipe(control, consume)` calls the
consumer only after replaying and validating the exact persisted receipt. Defaults
remain k4/res520/smooth3/minA5/denoise1/eps35/tension65. Changed settings or unapproved
pixels produce a new proposal with an explicit convert SourceContext; they cannot
reach the consumer.

For product use the consumer must return a **releasable ModelLease**, synchronously
or asynchronously. It must allocate/build through the parent's existing root Worker
and transfer an independently owned finished product lease. It must clean up any
allocation it creates but never returns. A packet, borrowed source token, bare byte
array, pending recipe or source-context extrusion is not a finished ModelLease.
The additive declaration and negative type checks are in
[callback-contract.d.mts](../../tests/raster-app/callback-contract.d.mts) and
[types.test.mts](../../tests/raster-app/types.test.mts); the focused production
[declaration patch](raster-adapters-types.patch) is for the parent to review/apply.
The test declaration does not claim an older production declaration already has
this overload.

The callback receives all ready fields plus `nativeSource`:

```ts
{
 status:'ready', kind:'raster-source-geometry',
 sourceAssemblyRequired:true, coordinateKind:28, unitMm:0.000001,
 packet, receipt, preparation,
 nativeSource:{kind:'raster-token',token,epoch?}
}
```

The transport's token is opaque. The engine facade adds the current root epoch.
Only the existing Worker dispatcher resolves it to a synchronous native source
borrow for `buildProductRecipe`. Never send a heap handle or bulk JSON geometry.
The consumer may await the product build while the adapter retains both prepared
and accepted raster readers. It cannot save the borrowed token for later use.
A direct Module binding without productSource rejects a supplied consumer with
RASTER_PRODUCT_TRANSPORT_REQUIRED; the standalone call remains supported.

The final post-consume guard must retain this cleanup (exact statement, with the
ready-result local named `ready` to avoid shadowing the prepared native lease):

```js
const result=await consume({...ready,nativeSource:runtime.productSource(accepted)});
try{guard(e,c);}catch(error){if(typeof result?.release==='function')await result.release();throw error;}
return result;
```

The enclosing finally remains:

```js
}finally{await accepted?.release();await prepared.release();}
```

The final tested main snapshot includes the parent-applied
[three-reference rename](raster-callback-tdz.patch); that historical patch is
retained for audit and must not be reapplied if already present.

Do not declare another `const prepared` inside that try: its temporal dead zone
would break the earlier `runtime.confirm(prepared, ...)`, including the standalone
path. A guard-only variant leaks an independently returned model when cancellation
or private reset occurs after the consumer fulfills but before publication.

Successful return transfers ModelLease ownership to the parent. The parent releases
it when replaced/retired. On a failed final guard the adapter awaits returned
`release()` before rejecting and then releases both raster readers. If the consumer
throws instead of returning a lease, cleanup of its unreturned allocation belongs
to the consumer; the adapter still releases its own raster readers.

The product callback does not bypass controller identity/revision/online/CAS checks.
Source bytes, settings and confirmation receipt remain immutable. Logout must abort
its control and reset the source extension; the source adapter does not inspect an
account session on its own. Worker termination is a separate terminal path:
retire the runtime and reset with `{runtimeRetired:true}` without RPC, a live ticket,
a replacement Worker or waiting on the controller operation invoking reset.

[callback-lifecycle-suite.mjs](../../tests/raster-app/callback-lifecycle-suite.mjs)
runs the actual main request packer/Worker hook and Rust+C++ product entry points in
one Module. It checks a real default two-material curved product, typed APMS source
bindings/ledger and independent root lease. It resolves the consumer promise FIRST,
then invalidates cancel/reset/logout BEFORE the adapter resumes. An explicit async
release latch proves cleanup is awaited. Native snapshot retirement, stale token
rejection and owned root bytes0 are checked after every case. Failure before return,
unreturned allocation cleanup, unapproved/changed/stale receipts and legacy direct
binding are also covered.

The ModelLease host wrapper and logout invalidation are declared test fixtures,
not the full application's EngineClient, product compositor, storage or login flow.
All three Worker engines run these native paths; a separate Worker termination
suite covers terminal transport retirement. These remain implementation tests.