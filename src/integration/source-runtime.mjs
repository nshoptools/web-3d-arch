import {createEngineRasterRuntime} from '../core/engine-raster-runtime.mjs';
import {checkControl,requireValue} from './source-catalog.mjs';

/** Lazy binding to the root engine, with lease ownership retained across calls.
 * A confirm/release of an old lease never starts a replacement Worker. */
export function createSourceRasterRuntime(kernel){
  let current=null,epoch=0,owners=new WeakMap();const facades=new Set();
  async function runtime(c){
    checkControl(c);const e=epoch,client=await kernel.ensureRuntime(c);checkControl(c);requireValue(e===epoch,'SOURCE_PRIVATE_RESET');
    if(current?.client===client&&current.epoch===client.epoch)return current.facade;
    const facade=createEngineRasterRuntime(client,{run:kernel.operation});facades.add(facade);
    current={client,epoch:client.epoch,facade};
    const unsubscribe=client.onRetirement(()=>{facades.delete(facade);if(current?.facade===facade)current=null;unsubscribe();});
    return facade;
  }
  function wrap(facade,lease){
    const exposed=Object.freeze({...lease,
      ...(lease.acquire?{acquire:async()=>wrap(facade,await lease.acquire())}:{}),
      async release(){owners.delete(exposed);await lease.release();}
    });owners.set(exposed,{facade,lease});return exposed;
  }
  function owned(lease){const record=owners.get(lease);requireValue(record,'RASTER_LEASE_RETIRED');return record;}
  return Object.freeze({
    version:'arch-raster-operations/1',
    async prepareEncoded(request,c){const f=await runtime(c);return wrap(f,await f.prepareEncoded(request,c));},
    async prepareRGBA(request,c){const f=await runtime(c);return wrap(f,await f.prepareRGBA(request,c));},
    async confirm(lease,hash,c){const r=owned(lease);return wrap(r.facade,await r.facade.confirm(r.lease,hash,c));},
    async buildSourceContext(lease,options,c){const r=owned(lease);return wrap(r.facade,await r.facade.buildSourceContext(r.lease,options,c));},
    productSource(lease){const r=owned(lease);return r.facade.productSource(r.lease);},
    async reset(options={}){epoch++;owners=new WeakMap();const settled=await Promise.allSettled([...facades].map(f=>f.reset(options)));requireValue(settled.every(r=>r.status==='fulfilled'),'SOURCE_PRIVATE_RESET');},
    cancel(){return current?.facade.cancel()??false;}
  });
}
