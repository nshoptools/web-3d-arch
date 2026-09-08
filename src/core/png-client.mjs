const failure=code=>Object.assign(new Error(code),{code});
/** Worker-only codec adapter. Each input is copied; neither caller/history
 * ownership nor cancellation relies on transferring the original RGBA buffer. */
export function createPNGEncoder({workerURL=new URL(/* @vite-ignore */ './png-worker.mjs',import.meta.url),timeoutMs=30000}={}){
  let worker=null,sequence=0,pending=null;
  function settle(error,bytes){const job=pending;if(!job)return;pending=null;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);error?job.reject(failure(error)):job.resolve(bytes);}
  function reset(){worker?.terminate();worker=null;settle('CANCELLED');}
  async function encode(image,{signal}={}){
    if(signal?.aborted)throw failure('CANCELLED');
    if(pending)throw failure('PNG_BUSY');
    const {width,height,data}=image??{};
    // The editing Worker returns Uint8Array; canvas readers return clamped
    // bytes. Both carry the same straight RGBA8 values. Copy to the codec's
    // clamped representation below without transferring the caller's buffer.
    if(!Number.isInteger(width)||width<1||!Number.isInteger(height)||height<1||width*height>16777216||!(data instanceof Uint8Array||data instanceof Uint8ClampedArray)||data.length!==width*height*4)throw failure('PNG_RGBA');
    if(!worker){worker=new Worker(workerURL,{type:'module',name:'arch-png'});worker.onmessage=({data})=>{if(!pending||data.id!==pending.id)return;if(data.error)settle(data.error);else if(data.bytes instanceof Uint8Array)settle(null,data.bytes);else settle('PNG_OUTPUT_ABI');};worker.onerror=()=>{worker?.terminate();worker=null;settle('PNG_WORKER_FAILED');};}
    const owned=new Uint8ClampedArray(data),id=++sequence;
    return new Promise((resolve,reject)=>{
      const abort=()=>reset(),timer=setTimeout(()=>{worker?.terminate();worker=null;settle('PNG_TIMEOUT');},timeoutMs);
      pending={id,resolve,reject,timer,signal,abort};signal?.addEventListener('abort',abort,{once:true});
      worker.postMessage({type:'encode-png',id,image:{width,height,data:owned}},[owned.buffer]);
    });
  }
  encode.reset=reset;return encode;
}
