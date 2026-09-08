import {createRasterTransport} from './raster-operations.mjs';
import {EngineError} from './engine-client.mjs';

/** Bind opaque raster leases to one already initialized root Worker. run is the
 * application's common generation allocator, also used for text/build/export. */
export function createEngineRasterRuntime(client,{run}){
  if(!client?.worker||!client.memory||!client.serviceCapabilities?.raster||typeof run!=='function')
    throw new EngineError('RASTER_SERVICE_UNAVAILABLE');
  const epoch=client.epoch;
  const mutations=new Set(['prepareEncoded','prepareRGBA','confirm','buildSourceContext']);
  let unsubscribe=()=>{};
  const facade=createRasterTransport({
    call(method,request,control){
      if(client.epoch!==epoch||!client.worker)throw new EngineError('RASTER_RUNTIME_RETIRED');
      if(!mutations.has(method))return client.rasterRegistry(method,request,{epoch});
      return run(control,(current,generation)=>{
        if(current!==client||client.epoch!==epoch)throw new EngineError('RASTER_RUNTIME_RETIRED');
        return client.rasterOperation(method,request,{generation,epoch});
      });
    },
    cancel:()=>client.epoch===epoch?client.cancel():false
  });
  function retire(){facade.retire();unsubscribe();}
  unsubscribe=client.onRetirement(retire);
  return Object.freeze({...facade,retire,
    productSource(lease){return Object.freeze({...facade.productSource(lease),epoch});},
    reset(options={}){if(options.runtimeRetired===true){retire();return facade.reset(options);}return facade.reset(options);}
  });
}
