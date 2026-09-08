import {runSuite,assert} from './suite.mjs';
import {attachMainThreadColorRenderer} from '../../src/input/index.mjs';
export async function browserSuite(runtime){
  const fixture=await(await fetch('/fixture/config.json')).json(),origin=location.origin;
  const assetURLs=fixture.assetRecords.map(([,r])=>({...r,url:origin+'/library/'+r.sha256}));
  const worker=new Worker('/stage/tests/text-app/browser-worker.mjs',{type:'module'}),pending=new Map(),timings=[],samples=[];let serial=0,bridge=null,activeExpected=null,running=true,frames=0,maxFrameGapMs=0,last=performance.now();
  const canvasCount=document.querySelectorAll('canvas').length,fontCount=document.fonts.size;
  const animate=()=>{if(!running)return;const t=performance.now();maxFrameGapMs=Math.max(maxFrameGapMs,t-last);last=t;frames++;requestAnimationFrame(animate);};requestAnimationFrame(animate);
  worker.onmessage=({data})=>{
    const p=pending.get(data.id);if(!p)return;
    if(data.type==='progress'){p.control?.onProgress?.(data.progress);return;}
    pending.delete(data.id);clearTimeout(p.timer);p.control?.signal.removeEventListener('abort',p.abort);
    if(data.type==='error')p.reject(Object.assign(Error(data.error.message),data.error));else p.resolve(data.result);
  };
  worker.onerror=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(e.message));}pending.clear();};
  function rpc(type,payload={},control,transfer=[]){
    const id=++serial;
    return new Promise((resolve,reject)=>{
      const abort=()=>worker.postMessage({type:'cancel',id}),timer=setTimeout(()=>{pending.delete(id);abort();worker.terminate();reject(Error('Text Worker deadline'));},30000);
      pending.set(id,{resolve,reject,timer,control,abort});control?.signal.addEventListener('abort',abort,{once:true});
      worker.postMessage({id,type,...payload},transfer);if(control?.signal.aborted)abort();
    });
  }
  const readFixture=async digest=>new Uint8Array(await(await fetch('/library/'+digest)).arrayBuffer());
  function connect(){
    bridge?.dispose();bridge=null;
    const channel=new MessageChannel();
    bridge=attachMainThreadColorRenderer(channel.port1,{...runtime,sources:[fixture.entries.colr,fixture.entries.cbdt],onTiming:p=>timings.push(p),
      isCurrent:t=>activeExpected?.sourceId===t.sourceId&&activeExpected.revision===t.revision});
    return channel.port2;
  }
  try{
    const init=await rpc('init',{runtime,fixture:{catalog:fixture.catalog},assetURLs,origin});
    assert(init.moduleFactories===1);const fallback=runtime.engine==='webkit'&&!init.capabilities.canvas2d;
    if(fallback){const port=connect();await rpc('reset',{rendererPort:port},undefined,[port]);}
    const invoke=async(request,control)=>{
      activeExpected={sourceId:request.state?.content?.app?.source?.id??request.ticket.projectId+'/text',
        revision:request.state?.content?.app?.source?.revision??request.ticket.revision};
      try{
        const r=await rpc('run',{request},control);
        if(request.op==='emoji.select'&&r.preview&&samples.length<12){
          let text='';for(let i=0;i<r.preview.png.length;i++)text+=String.fromCharCode(r.preview.png[i]);
          samples.push({name:r.prepared.selection.originalText,sourceKind:r.prepared.selection.sourceKind,width:r.preview.width,height:r.preview.height,
            renderer:r.preview.renderer,rgbaHash:r.preview.sha256,pngBase64:btoa(text)});
        }
        return r;
      }finally{activeExpected=null;}
    };
    const reset=async()=>{if(fallback){const port=connect();await rpc('reset',{rendererPort:port},undefined,[port]);}else await rpc('reset');};
    const report=await runSuite({fixture,assetURLs,origin,readFixture,invoke,reset,
      capabilities:{realColor:true,moduleFactories:init.moduleFactories},onResult:r=>console.log((r.ok?'ok ':'FAIL ')+r.name+(r.ok?'':' '+r.error))});
    const core=await rpc('core-checks',{fixture});
    const disposed=await rpc('dispose');assert(disposed.moduleFactories===1);bridge?.dispose();bridge=null;
    assert(document.querySelectorAll('canvas').length===canvasCount&&document.fonts.size===fontCount,'No transient canvas/font leak');
    return {...report,core,capabilities:init.capabilities,fallback,frames,maxFrameGapMs,timings,samples,crossOriginIsolated,
      rawSvgDom:false,objectUrls:false,moduleFactories:init.moduleFactories,
      maxRenderSyncMs:Math.max(0,...timings.filter(t=>t.budgetKind==='render').map(t=>t.ms??0)),
      maxFontSetupSpentMs:Math.max(0,...timings.map(t=>t.fontSetupSpentMs??0))};
  }finally{running=false;worker.terminate();bridge?.dispose();for(const p of pending.values()){clearTimeout(p.timer);p.control?.signal.removeEventListener('abort',p.abort);}pending.clear();}
}
