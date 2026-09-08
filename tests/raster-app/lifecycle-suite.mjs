import {createRasterDispatcher,createRasterTransport} from '../../src/core/raster-operations.mjs';
import {createRasterAdapters} from '../../src/integration/raster-adapters.mjs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
async function rejects(fn,code){try{await fn();}catch(error){assert(error.code===code,code+' got '+error.code);return;}throw Error('Expected '+code);}
export async function lifecycleChecks({test,root,module,next,grid}){
 await test('live registry reset abandons old waiters / no controller-ticket wait / unrelated lease retained',async()=>{
  const other=root.prepareRGBA({...grid('hole')},next());
  const privateRoot=createRasterDispatcher((await import('../../src/core/raster-operations.mjs')).createRasterOperations(module));
  // root.moduleForTest is supplied explicitly by the test host, never a product API.
  let completeCopy,completeReset,holdCopy=false,holdReset=false,calls=0;
  const runtime=createRasterTransport({call:(method,payload,c)=>{
   calls++;if(method==='reset')assert(c===undefined,'registry reset has no AppTicket');
   const reply=privateRoot.dispatch(method,payload,['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method)?next():c);
   if(method==='copy'&&holdCopy)return new Promise(resolve=>{completeCopy=()=>resolve(reply);});
   if(method==='reset'&&holdReset)return new Promise(resolve=>{completeReset=()=>resolve(reply);});
   return Promise.resolve(reply);
  }});
  const lease=await runtime.prepareRGBA({...grid('curve')});
  holdCopy=true;const copy=lease.copy(),copyRefusal=rejects(()=>copy,'RASTER_LEASE_RETIRED');
  holdReset=true;const reset=runtime.reset();
  await rejects(()=>runtime.prepareRGBA({...grid('curve')}),'RASTER_RESET_PENDING');
  await copyRefusal;completeReset();await reset;const atReset=calls;
  await lease.release();completeCopy();await Promise.resolve();assert(calls===atReset,'old tokens never released into new epoch');
  assert(other.copy().buffers.length===31,'unrelated root lease preserved');other.release();
  holdCopy=false;holdReset=false;
  const newLease=await runtime.prepareRGBA({...grid('curve')});await newLease.release();await runtime.reset({runtimeRetired:false});
 });
 await test('terminal transport retirement interrupts unresolved RPCs and cleanup without new calls',async()=>{
  const dispatcher=createRasterDispatcher(root);let waiting=false,lateReply=null,calls=0,cancelCalls=0;
  const runtime=createRasterTransport({cancel:()=>{cancelCalls++;},call:(method,payload,c)=>{
   calls++;const reply=dispatcher.dispatch(method,payload,['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method)?next():c);
   if(waiting)return new Promise(resolve=>{lateReply=()=>resolve(reply);});
   return Promise.resolve(reply);
  }});
  const service=createRasterAdapters({runtime}),lease=await runtime.prepareRGBA({...grid('curve')});
  waiting=true;const pending=runtime.prepareRGBA({...grid('hole')}),refusal=rejects(()=>pending,'RASTER_LEASE_RETIRED');
  const count=calls;runtime.retire();
  await service.reset({runtimeRetired:true});await service.reset();await runtime.reset();
  await refusal;await lease.release();
  await rejects(()=>lease.copy(),'RASTER_LEASE_RETIRED');
  await rejects(()=>runtime.prepareRGBA({...grid('curve')}),'RASTER_RUNTIME_RETIRED');
  assert(runtime.cancel()===false&&cancelCalls===0,'retired cancel cannot start RPC');
  lateReply();await Promise.resolve();assert(calls===count,'no calls or late-token cleanup after retirement');
  // Test host teardown: this Node/Worker suite still has a live Module. Real Worker
  // termination is separately exercised by worker-retirement-client.mjs.
  dispatcher.dispatch('reset');assert(root.ownedBytes()===0,'explicit live-Module teardown releases test registry');
 });
}
