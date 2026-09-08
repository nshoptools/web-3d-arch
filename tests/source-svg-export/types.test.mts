import {createSourceSVGExport,type SourceSVGContext,type SourceSVGServices,type SourceSVGKernel} from '../../src/integration/source-svg-export.mjs';
import {createExportAdapters,type ExportBindings,type SourceSnapshotProvider,type SourceSVGOptions} from '../../src/integration/export-adapters.mjs';
import type {Control} from '../../src/app/adapters.mjs';
declare const context:()=>SourceSVGContext|null, kernel:SourceSVGKernel, sources:SourceSVGServices, control:Control, bindings:ExportBindings;
const provider=createSourceSVGExport({context,kernel,sources});
const exact:SourceSnapshotProvider=provider;
createExportAdapters({...bindings,sourceSnapshot:exact});
const refresh=await provider.refresh({control});
const source=context()!;
const lease=await exact.acquire(refresh.descriptor,{...control,context:{...source,revision:control.ticket.revision},assets:source.assetsMap});
const options:SourceSVGOptions={units:'source',side:'source',color:'source',filename:'source.svg',inspection:false};
const svg=await lease.serializeSVG(options,control);
const bytes:Uint8Array=svg.bytes,hash:string=svg.rawHash;
await lease.release();provider.reset();
// @ts-expect-error A product model is not a source snapshot provider.
const model:SourceSnapshotProvider={model:source.model};
// @ts-expect-error A matching-model export option is not a source SVG option.
const wrong:SourceSVGOptions={...options,units:'mm'};
// @ts-expect-error Dedicated Worker source proof uses the existing same-runtime services.
createSourceSVGExport({context,sources});
void bytes;void hash;void model;void wrong;
