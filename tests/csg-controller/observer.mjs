// Test-only read observer; every mutation is an ordinary AppBridge call.
// Never pass this module to the production application/release builder.
const need=(v,c)=>{if(!v)throw Error(c);};
const copy=x=>structuredClone(x);
async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function base64(bytes){
 need(bytes instanceof Uint8Array&&bytes.byteLength<=16*1024*1024,'OBSERVER_MODEL_BOUND');
 let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(text);
}
export function observeApplication(application){
 const c=application.controller,events=[],failures=[];let serial=0;const originalReport=c.report.bind(c);c.report=e=>{failures.push({code:e?.code,name:e?.name,message:String(e?.message??e).slice(0,2000),stack:String(e?.stack??'').replace(/\?[^\s)]+/g,'?[REDACTED]').slice(0,16000),details:copy(e?.details??null)});if(failures.length>30)failures.shift();return originalReport(e);};
 const unsubscribe=c.subscribe(()=>{
  const s=c.getSnapshot();
  events.push({serial:++serial,at:performance.now(),projectId:s.project.id,revision:s.project.revision,
   headRevision:s.controller.headRevision,visibleRevision:s.project.visibleModelRevision,
   pending:s.controller.pendingChange??null,job:s.job?{id:s.job.id,stage:s.job.stage}:null});
  if(events.length>1000)events.shift();
 });
 const api={
  version:'arch-csg-controller-observer/1',
  async initialized(){return await application.initialized;},
  snapshot(){return copy(c.getSnapshot());},
  events(){return copy(events);},
  failures(){return copy(failures);},
  dispatch(command){return c.dispatch(copy(command));},
  importFile({name,mediaType,base64:encoded},purpose){
   need(['source','mesh'].includes(purpose)&&typeof encoded==='string'&&encoded.length<=2*1024*1024,'OBSERVER_FILE_BOUND');
   const bytes=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
   return c.importFile(new File([bytes],name,{type:mediaType}),purpose);
  },
  exportFile(id){return c.exportFile(id);},
  async checkpoint(){
   const doc=c.doc,assets=c.assets,lease=c.visible?.lease??null,projectId=c.projectId,headRevision=c.headRevision;
   need(doc&&c.store&&projectId,'OBSERVER_PROJECT_REQUIRED');
   const bytes=lease?lease.bytes().slice():null,modelSHA256=bytes?await hash(bytes):null;
   const loaded=await c.store.load(projectId);
   need(doc===c.doc&&assets===c.assets&&lease===(c.visible?.lease??null)&&projectId===c.projectId&&headRevision===c.headRevision,'OBSERVER_CHANGED_DURING_READ');
   need(loaded.status==='editable','OBSERVER_DURABLE_HEAD_UNREADABLE');
   const rows=[];
   for(const a of loaded.assets??[])rows.push({hash:a.hash,byteLength:a.byteLength,actualSHA256:await hash(a.bytes)});
   need(doc===c.doc&&headRevision===c.headRevision,'OBSERVER_CHANGED_DURING_READ');
   return {
    version:'arch-csg-controller-checkpoint/1',projectId,headRevision,
    state:copy(doc.state),history:copy(doc.history),savedRevision:doc.savedRevision??null,
    sourceHashes:[...assets.keys()].sort(),
    snapshot:copy(c.getSnapshot()),
    visible:lease?{leaseId:lease.leaseId,generation:lease.generation,ticket:copy(lease.ticket),modelSHA256,
     kind:lease.kind??'generated-product',blocks:copy(lease.blocks),
     product:lease.product?copy(lease.product):null,mesh:lease.mesh?copy(lease.mesh):null}:null,
    durable:{status:loaded.status,headRevision:loaded.headRevision,head:copy(loaded.head),
     state:copy(loaded.manifest.document.state),history:copy(loaded.manifest.document.history),
     assets:rows.sort((a,b)=>a.hash.localeCompare(b.hash))}
   };
  },
  modelBytes(){const lease=c.visible?.lease;need(lease,'OBSERVER_MODEL_REQUIRED');return {leaseId:lease.leaseId,base64:base64(lease.bytes().slice())};},
  readiness(){
   const s=c.getSnapshot();return {
    contractVersion:s.contractVersion,environment:s.environment,session:s.session.status,
    hasMeshTransactions:typeof c.adapters.meshTransactions?.prepare==='function'&&typeof c.adapters.meshTransactions?.replay==='function',
    meshImport:s.capabilities.find(x=>x.id==='mesh.import')??null,
    geometry:s.capabilities.find(x=>x.id==='geometry.build')??null,
    crossOriginIsolated,secureContext:isSecureContext
   };
  },
  async dispose(){unsubscribe();await application.dispose();}
 };
 return Object.freeze(api);
}

