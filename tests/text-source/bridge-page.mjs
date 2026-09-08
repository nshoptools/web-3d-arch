// Browser-test host for the explicitly installed private MessagePort bridge.
import {attachMainThreadColorRenderer,COLOR_BRIDGE_VERSION} from '../../src/input/index.mjs';
import {assert,equal} from './shared-suite.mjs';
export async function runBridgePage(runtime,fixture){
  const timings=[],baseline={canvases:document.querySelectorAll('canvas').length,fonts:document.fonts.size},hostResults=[];
  const sources=[fixture.entries.colr,fixture.entries.cbdt,fixture.entries.analytic];
  let running=true,frames=0,maxFrameGapMs=0,lastFrame=performance.now();const animate=()=>{if(running){const t=performance.now();maxFrameGapMs=Math.max(maxFrameGapMs,t-lastFrame);lastFrame=t;frames++;requestAnimationFrame(animate);}};requestAnimationFrame(animate);
  function connect(options={}){
    const channel=new MessageChannel();
    const service=attachMainThreadColorRenderer(channel.port1,{...runtime,sources,isCurrent:t=>t.sourceId==='source-fixture'&&t.revision===3,
      onTiming:t=>timings.push(t),...options});
    return {service,port:channel.port2};
  }
  async function workerJob(type,options={}){
    const {service,port}=connect(options),worker=new Worker('/candidate/tests/text-source/bridge-worker.mjs',{type:'module'});
    try{
      return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Main bridge test timed out')),90000);
        worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
        worker.onmessage=({data})=>{if(data.type==='check')return;clearTimeout(timer);resolve(data);};
        worker.postMessage({type,...runtime},[port]);
      });
    }finally{worker.terminate();service.dispose();}
  }
  try{
    const report=await workerJob('run');
    if(report.type!=='complete')throw Error(report.error??JSON.stringify(report));
    const pngs=[];
    for(const sample of report.samples){
      const {width,height,rgba,sha256,renderer,sampling}=sample.preview,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),width,height),0,0);
      const pngBase64=canvas.toDataURL('image/png').split(',')[1];canvas.width=canvas.height=1;
      pngs.push({name:sample.name,kind:sample.kind,width,height,sha256,renderer,sampling,pngBase64});
    }
    const stale=await workerJob('single',{isCurrent:()=>false});
    equal(stale.type,'error');equal(stale.code,'STALE_SOURCE');hostResults.push({name:'main endpoint rejects stale source before native draw',ok:true});
    let current=true;
    const late=await workerJob('single',{isCurrent:()=>current,onTiming:p=>{timings.push(p);if(p.phase==='main-canvas-qualified')current=false;}});
    equal(late.type,'error');equal(late.code,'STALE_SOURCE');hostResults.push({name:'main endpoint rejects revision changed after source verification',ok:true});
    const unapproved=await workerJob('single',{sources:[fixture.entries.analytic]});
    equal(unapproved.type,'single-result');equal(unapproved.status,'renderer-gap');equal(unapproved.pending,null);
    hostResults.push({name:'unapproved main-thread font hash preserves source with explicit gap',ok:true});
    // Exercise actual byte-integrity checks at the receiver, independently of the production Worker.
    const connection=connect();
    try{
      const payload={kind:'COLRv1',width:32,height:32,fontHash:fixture.entries.colr.sha256,
        bounds:{minX:0,minY:0,maxX:10,maxY:10,width:10,height:10},fontBytes:new Uint8Array(fixture.entries.colr.bytes),
        text:'😀',paint:{paletteIndex:0,foreground:{red:0,green:0,blue:0,alpha:255}},operationCount:1,variations:{},emMm:10,unitsPerEm:1024,advanceMm:12.4};
      const response=new Promise(resolve=>{connection.port.onmessage=e=>resolve(e.data);connection.port.start();});
      connection.port.postMessage({version:COLOR_BRIDGE_VERSION,type:'render',requestId:1,expected:{sourceId:'source-fixture',revision:3},payload},[payload.fontBytes.buffer]);
      const invalid=await response;equal(invalid.type,'error');equal(invalid.error.code,'HASH_MISMATCH');
      hostResults.push({name:'main endpoint verifies actual font bytes against approved SHA-256',ok:true});
    }finally{connection.service.dispose();connection.port.close();}
    equal(document.querySelectorAll('canvas').length,baseline.canvases);equal(document.fonts.size,baseline.fonts);
    hostResults.push({name:'detached canvases and transient FontFaces are cleaned up',ok:true});
    if(report.results.every(r=>r.ok)){assert(frames>0);assert(timings.some(t=>t.phase==='draw-color-font'));assert(timings.some(t=>t.phase==='draw-bitmap'));}
    return {results:[...report.results,...hostResults],samples:pngs,frames,maxFrameGapMs,timings,mainOffscreenCanvas:typeof OffscreenCanvas==='function',canvasBackends:[...new Set(pngs.map(s=>s.sampling.bridge.canvas))],
      maxSyncMs:Math.max(0,...timings.filter(t=>t.ms!==undefined).map(t=>t.ms)),
      maxRenderSyncMs:Math.max(0,...timings.filter(t=>t.budgetKind==='render').map(t=>t.ms)),
      maxFontSetupSpentMs:Math.max(0,...timings.map(t=>t.fontSetupSpentMs??0)),rawSvgDom:false,objectUrls:false};
  }finally{running=false;}
}
