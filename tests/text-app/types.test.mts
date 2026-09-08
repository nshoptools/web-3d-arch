// Public consumer types are checked against the parent interfaces. Production remains dependency-free ESM.
import type {CreateTextAdapters,CreateTextOperations,TextAdapterOptions,TextOperationOptions,Confirmation,AcceptanceResult,GroupBinding} from '../../docs/text-app/API.mjs';
import type {SourceAdapter,Control,SourceContext} from '../../src/app/adapters.mjs';
import {createTextAdapters} from '../../src/integration/text-adapters.mjs';
import {createTextOperations} from '../../src/core/text-operations.mjs';
const createApp:CreateTextAdapters=createTextAdapters,createWorker:CreateTextOperations=createTextOperations;
declare const appOptions:TextAdapterOptions,workerOptions:TextOperationOptions,c:Control;
const app=createApp(appOptions),source:SourceAdapter=app;void source;
const service=createWorker(workerOptions);
const binding:GroupBinding={textId:'18446744073709551615',sourceId:'3',provenanceId:5n};
await service.run({version:c.version,ticket:c.ticket,op:'prepare.text',groupBinding:binding},{isCurrent:t=>t.id===c.ticket.id});
const confirmation:Confirmation={kind:'emoji',version:'arch-text-confirmation/1',approvalHash:'sha256',proposalHash:'sha256'};
declare const sourceContext:SourceContext;
const accepted:AcceptanceResult=await app.acceptProposal({...c,sourceContext,confirmation,source:{},assets:new Map(),acceptedAtRevision:c.ticket.revision+1});
const descriptor:Confirmation=accepted.confirmation;void descriptor;
// @ts-expect-error No geometry can replace the controller's approved candidate.
accepted.geometry;
// @ts-expect-error An acknowledgement is a receipt, not a SourceResult.
accepted.result;
// @ts-expect-error Numeric IDs lose u64 precision and are not allowed.
binding.textId=3;
// @ts-expect-error No source operation may omit the current-ticket guard.
await service.run({version:c.version,ticket:c.ticket,op:'font.import'},{signal:c.signal});
// @ts-expect-error A confirmation kind is the source's actual kind.
confirmation.kind='raster';
// @ts-expect-error Imported bytes are typed and owned, not base64 mesh JSON.
await app.ingest({...c,purpose:'font',file:{name:'Font.ttf',mediaType:'font/ttf',bytes:'base64'}});
