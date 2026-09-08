import {RasterError,check,integer,record,encodeOptions,encodeLimits,encodeOrigin,normalizeLimits,hashBytes,decodeText,decodeSummary,decodeMetadata,validatePacket,readableSummary,freeze,MAX_PACKET_BYTES} from './raster-schema.mjs';
export {RasterError,DEFAULT_OPTIONS,DEFAULT_LIMITS,validatePacket,readableSummary} from './raster-schema.mjs';

const ERROR_NAMES=['OK','INVALID_OPTIONS','UNSUPPORTED_FORMAT','UNSUPPORTED_METADATA','SVG_IS_NOT_RASTER','SOURCE_LIMIT','DIMENSION_LIMIT','PIXEL_LIMIT','MEMORY_LIMIT','METADATA_LIMIT','DECODE_FAILED','ANIMATION_UNSUPPORTED','UNSUPPORTED_BIT_DEPTH','COLOR_MANAGEMENT_REQUIRED','ORIENTATION_UNKNOWN','ALPHA_POLICY_REQUIRED','RENDER_CONFIRMATION_REQUIRED','CAPABILITY_UNAVAILABLE','WORK_LIMIT','GRAPH_LIMIT','REGION_LIMIT','CONFIRMATION_MISMATCH','CONFIRMATION_REQUIRED','INVALID_BUFFER','INVARIANT_VIOLATION'];
const EXTRA_ERRORS={100:'INPUT_HANDLE_INVALID',101:'STALE_GENERATION',102:'CANCELLED',103:'LEASE_LIMIT',104:'INTEGRITY',105:'HANDLE_INVALID',106:'GEOMETRY_FAILED',107:'QUANTIZATION_UNCERTIFIED',108:'EMPTY_CONTEXT'};
const FUNCTIONS=['arch_abi_version','arch_raster_abi_version','arch_control_ptr','arch_input_create','arch_input_ptr','arch_input_release','arch_raster_prepare_encoded','arch_raster_prepare_rgba','arch_raster_confirm','arch_build_raster','arch_raster_acquire','arch_raster_release','arch_raster_buffer_ptr','arch_raster_buffer_bytes','arch_raster_error_code','arch_raster_owned_bytes','arch_error_ptr','arch_error_len','arch_snapshot_ptr','arch_snapshot_len','arch_snapshot_release'];
const abort=signal=>check(!signal?.aborted,'RASTER_CANCELLED');
/**
 * Worker-local binding. existingModule is the ALREADY instantiated root module.
 * Parent serial scheduler calls arch_control_reset(generation) exactly once before
 * each prepare/confirm/build. This binding never creates a generation or module.
 */
export function createRasterOperations(existingModule,{maxCopyBytes=MAX_PACKET_BYTES}={}) {
  const m=existingModule;check(m&&typeof m==='object','RASTER_MODULE_REQUIRED');
  for(const name of FUNCTIONS)check(typeof m['_'+name]==='function','RASTER_ABI_MISSING',name);
  check(m._arch_abi_version()===2&&m._arch_raster_abi_version()===1,'RASTER_ABI_VERSION');
  integer(maxCopyBytes,256,MAX_PACKET_BYTES,'RASTER_OUTPUT_BUDGET');
  const owned=new Map(),snapshots=new Map();let epoch=1,busy=false,retired=false;
  const alive=()=>check(!retired,'RASTER_RUNTIME_RETIRED');
  const retire=()=>{if(retired)return;retired=true;epoch++;owned.clear();snapshots.clear();};
  const heap=()=>{const b=m.wasmMemory?.buffer??m.HEAPU8?.buffer;check(b instanceof ArrayBuffer||(typeof SharedArrayBuffer!=='undefined'&&b instanceof SharedArrayBuffer),'RASTER_MEMORY');return new Uint8Array(b);};
  const range=(offset,length,alignment=1)=>{integer(offset,0,0xffffffff,'RASTER_POINTER');integer(length,0,0xffffffff,'RASTER_POINTER');const h=heap();check(offset%alignment===0&&(length===0||offset>0)&&offset+length<=h.byteLength,'RASTER_POINTER');return h.subarray(offset,offset+length);};
  const control=()=>{alive();const p=m._arch_control_ptr()>>>0;range(p,16,4);return new Int32Array(heap().buffer,p,4);};
  const atomic=(a,index)=>a.buffer instanceof ArrayBuffer?a[index]>>>0:Atomics.load(a,index)>>>0;
  const write=(a,index,value)=>{if(a.buffer instanceof ArrayBuffer)a[index]=value;else Atomics.store(a,index,value);};
  function nativeError() {
    const numeric=m._arch_raster_error_code()>>>0,n=m._arch_error_len()>>>0;
    check(n<=512,'RASTER_ERROR_BUDGET');
    const message=n?decodeText(range(m._arch_error_ptr()>>>0,n).slice()):'Root raster operation failed';
    return new RasterError('RASTER_'+(ERROR_NAMES[numeric]??EXTRA_ERRORS[numeric]??'NATIVE_ERROR'),message,{nativeCode:numeric});
  }
  const valid=(lease,map=owned)=>{const r=map.get(lease);check(r&&r.epoch===epoch,'RASTER_LEASE_RETIRED');return r;};
  function begin(c) {
    alive();check(!busy,'RASTER_BUSY');integer(c?.generation,1,0xfffffffe,'RASTER_GENERATION');abort(c.signal);
    const a=control();check(atomic(a,0)===c.generation&&atomic(a,1)===1,'RASTER_STALE_GENERATION');check(atomic(a,3)!==c.generation,'RASTER_CANCELLED');busy=true;
  }
  function register(bytes,ids) {
    check(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=16777216,'RASTER_INPUT_BUDGET');
    const id=m._arch_input_create(bytes.length)>>>0;check(id>0,'RASTER_INPUT_ALLOCATION');ids.push(id);
    // Input allocation may grow memory: obtain pointer and a new view afterwards.
    const p=m._arch_input_ptr(id)>>>0;range(p,bytes.length).set(bytes);return id;
  }
  function run(c,make,kind='raster') {
    begin(c);const ids=[];let id=0;
    try {
      id=make(bytes=>bytes.length?register(bytes,ids):0)>>>0;
      if(!id)throw nativeError();
      if(c.signal?.aborted){if(kind==='raster')m._arch_raster_release(id);else m._arch_snapshot_release(id);id=0;throw new RasterError('RASTER_CANCELLED');}
      const result=kind==='raster'?lease(id):snapshot(id,c.generation);
      id=0;return result;
    }finally{
      if(id){if(kind==='raster')m._arch_raster_release(id);else m._arch_snapshot_release(id);}
      for(const input of ids)m._arch_input_release(input); // consumed IDs already return 0
      busy=false;
    }
  }
  function copy(id) {
    const rows=[];let total=0;
    for(let kind=1;kind<=31;kind++){
      const length=m._arch_raster_buffer_bytes(id,kind)>>>0;total+=length;check(total<=maxCopyBytes,'RASTER_OUTPUT_BUDGET');
      const p=m._arch_raster_buffer_ptr(id,kind)>>>0;
      const bytes=length?range(p,length,8).slice():new Uint8Array();
      // Uint8Array#slice over SharedArrayBuffer produces independent ArrayBuffer.
      check(bytes.buffer instanceof ArrayBuffer,'RASTER_OWNERSHIP');rows.push({kind,bytes});
    }
    const packet={version:'arch-raster-packet/1',buffers:rows};validatePacket(packet);return packet;
  }
  function lease(id) {
    const packet=copy(id),header=packet.buffers[0].bytes,tlv=packet.buffers[17].bytes,s=decodeSummary(header),metadata=decodeMetadata(tlv);
    let released=false;
    const result=Object.freeze({
      summary:s,metadata,readable:readableSummary(s,metadata),
      describe(){valid(result);return {header:header.slice(),tlv:tlv.slice()};},
      copy(){valid(result);return copy(id);},
      acquire(){valid(result);check(m._arch_raster_acquire(id)===id,'RASTER_LEASE_LIMIT');try{return lease(id);}catch(e){m._arch_raster_release(id);throw e;}},
      release(){if(released)return;released=true;const r=owned.get(result);if(r&&r.epoch===epoch)m._arch_raster_release(id);owned.delete(result);}
    });
    owned.set(result,{id,epoch});return result;
  }
  function snapshot(id,generation) {
    const length=m._arch_snapshot_len(id)>>>0;check(length>=40&&length<=maxCopyBytes,'RASTER_OUTPUT_BUDGET');
    let released=false;
    const result=Object.freeze({
      kind:'raster-source-context',sourceAssemblyRequired:true,generation,byteLength:length,
      copy(){valid(result,snapshots);return range(m._arch_snapshot_ptr(id)>>>0,length,8).slice();},
      release(){if(released)return;released=true;const r=snapshots.get(result);if(r&&r.epoch===epoch)m._arch_snapshot_release(id);snapshots.delete(result);}
    });snapshots.set(result,{id,epoch});return result;
  }
  return Object.freeze({
    version:'arch-raster-operations/1',
    prepareEncoded(request,c) {
      record(request,['bytes','options','limits'],'RASTER_REQUEST');const {bytes,options={},limits={}}=request;
      const l=normalizeLimits(limits);check(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=l.maxSourceBytes,'RASTER_INPUT_BUDGET');
      const o=encodeOptions(options),lim=encodeLimits(l);
      return run(c,put=>m._arch_raster_prepare_encoded(put(bytes),put(o),put(lim),c.generation));
    },
    prepareRGBA(request,c) {
      record(request,['data','width','height','options','limits','origin'],'RASTER_REQUEST');const {data,width,height,options={},limits={},origin=null}=request;
      const l=normalizeLimits(limits);integer(width,1,l.maxDimension,'RASTER_DIMENSIONS');integer(height,1,l.maxDimension,'RASTER_DIMENSIONS');
      const size=width*height*4;check(Number.isSafeInteger(size)&&width*height<=l.maxDecodedPixels&&size<=l.maxDecodedBytes&&size<=l.maxSourceBytes,'RASTER_INPUT_BUDGET');
      check((data instanceof Uint8ClampedArray||data instanceof Uint8Array)&&data.byteLength===size,'RASTER_RGBA');
      const o=encodeOptions(options,origin),lim=encodeLimits(l),src=encodeOrigin(origin);
      return run(c,put=>m._arch_raster_prepare_rgba(put(new Uint8Array(data.buffer,data.byteOffset,data.byteLength)),width,height,put(o),put(lim),put(src),c.generation));
    },
    confirm(prepared,proposalHash,c) {
      const r=valid(prepared),h=hashBytes(proposalHash);
      // Native comparison is still performed; no accepted flag inferred from JS data.
      return run(c,put=>m._arch_raster_confirm(r.id,put(h),c.generation));
    },
    buildSourceContext(accepted,request,c) {
      record(request,['thicknessMm'],'RASTER_REQUEST');const {thicknessMm}=request;
      const r=valid(accepted);check(accepted.summary.accepted,'RASTER_CONFIRMATION_REQUIRED');
      check(Number.isFinite(thicknessMm)&&thicknessMm>0&&thicknessMm<=10000,'RASTER_THICKNESS');
      return run(c,()=>m._arch_build_raster(r.id,thicknessMm,c.generation),'snapshot');
    },
    /** Trusted Worker-only borrow for the same-module product compositor.
     * Consumer must synchronously retain its own reader/request if needed later. */
    withSourceReference(lease,consume) {
      check(typeof consume==='function','RASTER_SOURCE_CONSUMER');
      const snap=snapshots.get(lease),r=valid(lease,snap?snapshots:owned);
      if(!snap)check(lease.summary.accepted,'RASTER_CONFIRMATION_REQUIRED');
      const reference=snap?{kind:'snapshot',id:r.id,generation:lease.generation}:
        {kind:'raster',acceptedHandle:r.id,proposalHash:lease.summary.proposalHash};
      const result=consume(Object.freeze(reference));check(!result||typeof result.then!=='function','RASTER_SYNCHRONOUS_BORROW');
      return result;
    },
    cancel(generation) {
      if(retired)return false;integer(generation,1,0xfffffffe,'RASTER_GENERATION');const a=control();
      if(atomic(a,0)!==generation||atomic(a,1)!==1)return false;
      write(a,3,generation);return true;
    },
    control() {const a=control();return {generation:atomic(a,0),phase:atomic(a,1),progress:atomic(a,2),cancelledGeneration:atomic(a,3)};},
    ownedBytes(){alive();return m._arch_raster_owned_bytes()>>>0;},
    retire,
    reset(options={}) {
      record(options,['runtimeRetired'],'RASTER_RESET_OPTIONS');
      check(options.runtimeRetired===undefined||typeof options.runtimeRetired==='boolean','RASTER_RESET_OPTIONS');
      if(options.runtimeRetired===true){retire();return;}
      if(retired)return;
      check(!busy,'RASTER_BUSY');for(const x of [...owned.keys(),...snapshots.keys()])x.release();epoch++;
    },
  });
}

/** Focused Worker hook. No global event handler, module loader or scheduler. */
export function createRasterDispatcher(operations) {
  check(operations?.version==='arch-raster-operations/1','RASTER_BINDING');
  const leases=new Map();let epoch=1,serial=0;
  function put(lease) {check(leases.size<512,'RASTER_LEASE_LIMIT');const token=epoch+':'+(++serial);leases.set(token,lease);return token;}
  const get=token=>{check(typeof token==='string'&&leases.has(token),'RASTER_LEASE_RETIRED');return leases.get(token);};
  const publish=lease=>{try{return {token:put(lease),...(lease.describe?lease.describe():{}),kind:lease.kind,sourceAssemblyRequired:lease.sourceAssemblyRequired,generation:lease.generation,byteLength:lease.byteLength};}catch(e){lease.release();throw e;}};
  return Object.freeze({
    withSourceReference(token,consume){return operations.withSourceReference(get(token),consume);},
    dispatch(method,request={},control) {
      switch(method) {
        case 'prepareEncoded':return publish(operations.prepareEncoded(request,control));
        case 'prepareRGBA':return publish(operations.prepareRGBA(request,control));
        case 'confirm':return publish(operations.confirm(get(request.token),request.proposalHash,control));
        case 'buildSourceContext':return publish(operations.buildSourceContext(get(request.token),{thicknessMm:request.thicknessMm},control));
        case 'copy':return get(request.token).copy();
        case 'acquire':{const l=get(request.token);check(l.acquire,'RASTER_LEASE_TYPE');return publish(l.acquire());}
        case 'release':{const l=leases.get(request.token);if(!l)return false;l.release();leases.delete(request.token);return true;}
        case 'reset':for(const l of leases.values())l.release();leases.clear();operations.reset();epoch++;return true;
        default:throw new RasterError('RASTER_METHOD');
      }
    },
    /** Use only these ArrayBuffers as a transfer list; never the root shared heap. */
    transferables(value) {
      if(value?.version==='arch-raster-packet/1'){validatePacket(value);return value.buffers.map(b=>b.bytes.buffer);}
      if(value instanceof Uint8Array){check(value.buffer instanceof ArrayBuffer,'RASTER_OWNERSHIP');return [value.buffer];}
      return [];
    }
  });
}

/** Client-side facade over parent's EXISTING Worker RPC. call(method,payload,control)
 * must serialize with other root operations and use their generation allocator.
 * copy/acquire/release/reset are serial registry operations without control_reset.
 */
export function createRasterTransport({call,cancel:cancelActive=null}) {
  check(typeof call==='function','RASTER_TRANSPORT');
  const live=new WeakMap(),pending=new Set();let epoch=1,retired=false,resetting=null;
  const usable=()=>{check(!retired,'RASTER_RUNTIME_RETIRED');check(!resetting,'RASTER_RESET_PENDING');};
  const valid=l=>{const r=live.get(l);check(!retired&&r&&r.epoch===epoch&&!r.released,'RASTER_LEASE_RETIRED');return r;};
  function invalidate(){epoch++;for(const end of [...pending])end();pending.clear();}
  /** Abandon local waiters immediately on retirement. The injected client still owns
   * its underlying RPC table; termination rejects/clears that table independently. */
  function invoke(method,payload,control,{cleanup=false}={}) {
    check(!retired,'RASTER_RUNTIME_RETIRED');
    const e=epoch;
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(ok,value)=>{if(settled)return;settled=true;pending.delete(end);(ok?resolve:reject)(value);};
      const end=()=>finish(cleanup,cleanup?undefined:new RasterError('RASTER_LEASE_RETIRED'));
      pending.add(end);
      try {
        Promise.resolve(call(method,payload,control)).then(value=>{
          if(e!==epoch||retired)end();else finish(true,value);
        },error=>{if(e!==epoch||retired)end();else finish(false,error);});
      }catch(error){finish(false,error);}
    });
  }
  async function cleanupToken(token,e){
    if(token&&e===epoch&&!retired)await invoke('release',{token},undefined,{cleanup:true});
  }
  function lease(reply) {
    check(reply&&typeof reply.token==='string'&&reply.token.length>0&&reply.token.length<=200,'RASTER_TRANSPORT_REPLY');const token=reply.token;
    const raster=!!reply.header;
    if(raster){check(reply.header instanceof Uint8Array&&reply.tlv instanceof Uint8Array,'RASTER_TRANSPORT_REPLY');reply={...reply,summary:decodeSummary(reply.header),metadata:decodeMetadata(reply.tlv)};}
    if(raster)check(reply.summary.schema===2&&typeof reply.summary.proposalHash==='string'&&reply.metadata?.semantics==='raster-parameters-proposal-v2','RASTER_TRANSPORT_REPLY');
    else {
      check(reply.kind==='raster-source-context'&&reply.sourceAssemblyRequired===true,'RASTER_TRANSPORT_REPLY');
      integer(reply.byteLength,40,MAX_PACKET_BYTES,'RASTER_TRANSPORT_REPLY');integer(reply.generation,1,0xfffffffe,'RASTER_TRANSPORT_REPLY');
    }
    const r={token,epoch,released:false};
    const out=Object.freeze({
      ...(raster?{summary:freeze(structuredClone(reply.summary)),metadata:freeze(structuredClone(reply.metadata)),readable:readableSummary(reply.summary,reply.metadata)}:{kind:reply.kind,sourceAssemblyRequired:true,generation:reply.generation,byteLength:reply.byteLength}),
      async copy(){valid(out);usable();const data=await invoke('copy',{token});valid(out);if(raster)validatePacket(data);else check(data instanceof Uint8Array&&data.length===reply.byteLength,'RASTER_TRANSPORT_REPLY');return data;},
      async acquire(){valid(out);check(raster,'RASTER_LEASE_TYPE');return receive('acquire',{token});},
      async release(){if(r.released)return;r.released=true;live.delete(out);await cleanupToken(token,r.epoch);}
    });live.set(out,r);return out;
  }
  async function receive(method,payload,control) {
    usable();abort(control?.signal);const e=epoch,reply=await invoke(method,payload,control);
    if(e!==epoch||retired||control?.signal?.aborted){
      await cleanupToken(reply?.token,e);
      throw new RasterError(control?.signal?.aborted?'RASTER_CANCELLED':'RASTER_LEASE_RETIRED');
    }
    try{return lease(reply);}catch(error){await cleanupToken(reply?.token,e);throw error;}
  }
  function retire(){if(retired)return;retired=true;invalidate();}
  function reset(options={}) {
    record(options,['runtimeRetired'],'RASTER_RESET_OPTIONS');
    check(options.runtimeRetired===undefined||typeof options.runtimeRetired==='boolean','RASTER_RESET_OPTIONS');
    if(options.runtimeRetired===true){retire();return Promise.resolve();}
    if(retired)return Promise.resolve();
    if(resetting)return resetting;
    invalidate();
    // Raw serial registry RPC: parent must bypass controller-operation/AppTicket waits.
    resetting=invoke('reset',{},undefined,{cleanup:true}).finally(()=>{resetting=null;});
    return resetting;
  }
  return Object.freeze({
    version:'arch-raster-operations/1',
    prepareEncoded:(request,c)=>receive('prepareEncoded',request,c),
    prepareRGBA:(request,c)=>receive('prepareRGBA',request,c),
    confirm:(l,proposalHash,c)=>receive('confirm',{token:valid(l).token,proposalHash},c),
    buildSourceContext:(l,request,c)=>receive('buildSourceContext',{...request,token:valid(l).token},c),
    /** Opaque same-Worker reference. The root resolves acceptance/ownership again;
     * no pointer or native ID is exposed or reconstructed by the application. */
    productSource(l){usable();return Object.freeze({kind:'raster-token',token:valid(l).token});},
    cancel(){if(retired)return false;check(typeof cancelActive==='function','RASTER_CANCEL_BINDING_REQUIRED');return cancelActive();},
    retire,reset
  });
}
