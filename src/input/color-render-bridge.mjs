import {LIMITS,SourceError,Work,fail,finite,record,keys,token,sha,string,ownedBytes,hash,fontEntry} from './source-contract.mjs';
import {pngDimensions} from './emoji-source.mjs';
import {createCanvasColorRenderer} from './native-color-renderer.mjs';

export const COLOR_BRIDGE_VERSION='arch-color-render-bridge/1';
export const COLOR_BRIDGE_LIMITS=Object.freeze({maxEdge:512,maxPixels:262144,fontBytes:8000000,pngBytes:1048576,decodedPixels:1048576,paintOperations:4096,deadlineMs:10000,pollMs:16});
function checkPort(port){if(!port||typeof port.postMessage!=='function'||typeof port.addEventListener!=='function')fail('INVALID_INPUT','Inject a private MessagePort');}
function edge(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<5||height<5||width>COLOR_BRIDGE_LIMITS.maxEdge||height>COLOR_BRIDGE_LIMITS.maxEdge)
    fail('RENDERER_GAP','Main canvas bridge requires an explicitly selected 5..512 pixel resolution',{maxEdge:512});
}
function boundedColor(c){for(const k of ['red','green','blue','alpha'])finite(c?.[k],0,255,'bridge foreground',true);}
function pack(input){
  edge(input.width,input.height);const base={kind:input.kind,width:input.width,height:input.height,bounds:structuredClone(input.bounds),fontHash:sha(input.fontHash)};
  if(input.kind==='COLRv1'){
    if(!Array.isArray(input.paint?.operations)||input.paint.operations.length>COLOR_BRIDGE_LIMITS.paintOperations)
      fail('RENDERER_GAP','Paint graph exceeds the bounded main canvas bridge',{maxOperations:COLOR_BRIDGE_LIMITS.paintOperations});
    const fontBytes=ownedBytes(input.fontBytes,COLOR_BRIDGE_LIMITS.fontBytes);
    return {...base,fontBytes,text:input.text,paint:{paletteIndex:input.paint.paletteIndex,foreground:structuredClone(input.paint.foreground)},
      operationCount:input.paint.operations.length,variations:structuredClone(input.variations),emMm:input.emMm,unitsPerEm:input.unitsPerEm,advanceMm:input.advanceMm};
  }
  if(input.kind==='CBDT/CBLC')return {...base,pngHash:sha(input.pngHash),pngBytes:ownedBytes(input.pngBytes,COLOR_BRIDGE_LIMITS.pngBytes),
    pngWidth:input.pngWidth,pngHeight:input.pngHeight,bitmapBoxMm:structuredClone(input.bitmapBoxMm)};
  fail('RENDERER_GAP','Bridge only accepts original COLRv1 fonts and CBDT PNG; no SVG or fallback');
}
const errorRecord=e=>({code:typeof e?.code==='string'?e.code:'RENDERER_GAP',message:String(e?.message??e).slice(0,512),details:e?.details??{}});
/** Worker-side renderer. Transfers only new copies; never detaches the adapter's source/cache buffers. */
export function createColorRendererClient(port,{deadlineMs=COLOR_BRIDGE_LIMITS.deadlineMs}={}){
  checkPort(port);finite(deadlineMs,20,COLOR_BRIDGE_LIMITS.deadlineMs,'bridge deadline',true);
  let disposed=false,pending=null,serial=0;
  const post=value=>port.postMessage({version:COLOR_BRIDGE_VERSION,...value});
  function complete(error,value){
    const p=pending;if(!p)return;pending=null;clearInterval(p.poll);clearTimeout(p.timeout);
    if(error)p.reject(error);else p.resolve(value);
  }
  const listener=event=>{
    const message=event.data;
    if(message?.version!==COLOR_BRIDGE_VERSION||!pending||message.requestId!==pending.requestId)return;
    try{pending.work.check();}catch(e){post({type:'cancel',requestId:pending.requestId});complete(e);return;}
    if(message.type==='result')complete(null,message.result);
    else if(message.type==='error')complete(new SourceError(message.error?.code??'RENDERER_GAP',message.error?.message??'Bridge failed',message.error?.details));
  };
  port.addEventListener('message',listener);port.start();
  return Object.freeze({
    async render(input,work){
      if(disposed)fail('RENDERER_GAP','Color bridge disposed');
      if(pending)fail('RENDERER_GAP','Color bridge already rendering; no queue');
      const expected=token(work.expected),payload=pack(input),requestId=++serial;
      if(!Number.isSafeInteger(requestId))fail('RESOURCE_LIMIT','Bridge request counter exhausted');
      await work.step(1,'bridge-dispatch');work.check();
      // The yield may have allowed another direct renderer caller to begin.
      if(pending||disposed)fail('RENDERER_GAP','Color bridge unavailable after scheduling');
      const result=await new Promise((resolve,reject)=>{
        pending={requestId,work,resolve,reject};
        pending.poll=setInterval(()=>{try{work.check();}catch(e){post({type:'cancel',requestId});complete(e);}},COLOR_BRIDGE_LIMITS.pollMs);
        pending.timeout=setTimeout(()=>{post({type:'cancel',requestId});complete(new SourceError('RENDERER_GAP','Color bridge deadline expired'));},deadlineMs);
        try{port.postMessage({version:COLOR_BRIDGE_VERSION,type:'render',requestId,expected,payload},[(payload.fontBytes??payload.pngBytes).buffer]);}
        catch(e){complete(new SourceError('RENDERER_GAP','Color bridge send failed',{reason:String(e?.message??e)}));}
      });
      await work.step(input.width*input.height,'bridge-readback');work.check();
      return result;
    },
    dispose(){
      if(disposed)return;disposed=true;
      if(pending){post({type:'cancel',requestId:pending.requestId});complete(new SourceError('CANCELLED','Color bridge disposed'));}
      port.removeEventListener('message',listener);port.close();
    },
  });
}
/**
 * Explicit host-installed main-thread endpoint. Creates a private 2D canvas without DOM insertion.
 * Private port + qualified source hashes; no DOM insertion, raw SVG, URLs, fetch, or history.
 */
export function attachMainThreadColorRenderer(port,{engine,version,sources,isCurrent,onTiming,maxSyncMs=100,maxFontSetupMs=500,deadlineMs=COLOR_BRIDGE_LIMITS.deadlineMs}){
  checkPort(port);
  if(!globalThis.document?.createElement||!globalThis.document.fonts)fail('RENDERER_GAP','Main-thread document canvas/font set unavailable');
  if(typeof isCurrent!=='function')fail('INVALID_INPUT','Host revision check required');
  if(onTiming!==undefined&&typeof onTiming!=='function')fail('INVALID_INPUT','Invalid timing callback');
  finite(maxSyncMs,1,100,'main canvas synchronous soft budget');finite(maxFontSetupMs,1,500,'main canvas aggregate font setup soft budget');finite(deadlineMs,20,COLOR_BRIDGE_LIMITS.deadlineMs,'deadline',true);
  if(!Array.isArray(sources)||!sources.length||sources.length>64)fail('INVALID_INPUT','Provide qualified source catalog records');
  const allow=new Map();
  for(const value of sources){const entry=fontEntry(value);if(!['COLRv1','CBDT/CBLC'].includes(entry.colorFormat))fail('INVALID_INPUT','Only explicitly approved color font sources');allow.set(entry.sha256,entry);}
  let active=null,disposed=false,cachedBytes=0;const fontFaces=new Map();
  const post=(requestId,value,transfer=[])=>{if(!disposed)port.postMessage({version:COLOR_BRIDGE_VERSION,requestId,...value},transfer);};
  async function validate(payload,work){
    record(payload,'bridge payload');edge(payload.width,payload.height);sha(payload.fontHash);
    const entry=allow.get(payload.fontHash);if(!entry||entry.colorFormat!==payload.kind)fail('RENDERER_GAP','Font source is not qualified for this bridge');
    for(const key of ['minX','minY','maxX','maxY','width','height'])finite(payload.bounds?.[key],-20000,20000,'bridge bounds');
    if(payload.bounds.width<=0||payload.bounds.height<=0)fail('INVALID_INPUT','Empty bridge bounds');
    if(payload.kind==='COLRv1'){
      string(payload.text,128,'bridge token');
      if(!payload.text||/[\r\n\t\u2028\u2029]/u.test(payload.text))fail('INVALID_INPUT','Expected one selected emoji token');
      finite(payload.operationCount,1,COLOR_BRIDGE_LIMITS.paintOperations,'paint operations',true);
      finite(payload.emMm,.001,1000,'em size');finite(payload.unitsPerEm,16,16384,'UPEM',true);finite(payload.advanceMm,0,20000,'advance');
      if(payload.unitsPerEm!==entry.unitsPerEm)fail('INVALID_INPUT','Catalog UPEM mismatch');
      record(payload.variations,'variations');boundedColor(payload.paint?.foreground);
      finite(payload.paint?.paletteIndex,0,255,'palette',true);
      const bytes=ownedBytes(payload.fontBytes,COLOR_BRIDGE_LIMITS.fontBytes);
      if(bytes.length!==entry.bytes||await hash(bytes)!==entry.sha256)fail('HASH_MISMATCH','Main canvas actual font hash mismatch');
      payload.fontBytes=bytes;
    }else{
      const bytes=ownedBytes(payload.pngBytes,COLOR_BRIDGE_LIMITS.pngBytes);sha(payload.pngHash);
      if(await hash(bytes)!==payload.pngHash)fail('HASH_MISMATCH','Main canvas actual PNG hash mismatch');
      const dim=pngDimensions(bytes);
      if(dim.width*dim.height>COLOR_BRIDGE_LIMITS.decodedPixels||dim.width!==payload.pngWidth||dim.height!==payload.pngHeight)fail('RESOURCE_LIMIT','Main canvas decoded PNG bound');
      for(const key of ['minX','minY','maxX','maxY','width','height'])finite(payload.bitmapBoxMm?.[key],-20000,20000,'bitmap box');
      if(payload.bitmapBoxMm.width<=0||payload.bitmapBoxMm.height<=0)fail('INVALID_INPUT','Empty bitmap box');
      payload.pngBytes=bytes;
    }
    work.check();return payload;
  }
  const listener=async event=>{
    const message=event.data;
    if(disposed||message?.version!==COLOR_BRIDGE_VERSION)return;
    if(message.type==='cancel'){if(active?.requestId===message.requestId)active.cancelled=true;return;}
    if(message.type!=='render')return;
    const requestId=message.requestId;
    if(!Number.isSafeInteger(requestId)||requestId<1)return;
    if(active){post(requestId,{type:'error',error:{code:'RENDERER_GAP',message:'Main canvas busy; requests are not queued'}});return;}
    const job={requestId,cancelled:false},canvases=new Set(),timings=[];active=job;
    const started=performance.now();let canvasKind,fontSetupSpentMs=0;
    try{
      const expected=token(message.expected);
      const work=new Work(expected,{isCurrent,onProgress:p=>onTiming?.({requestId,phase:p.phase,elapsedMs:performance.now()-started}),
        yieldControl:()=>new Promise(r=>setTimeout(r,0))},()=>job.cancelled||disposed);
      const check=work.check.bind(work);
      work.check=()=>{check();if(performance.now()-started>deadlineMs)fail('RENDERER_GAP','Main canvas soft deadline exceeded');};
      work.check();const input=await validate(message.payload,work);
      await work.step(1,'main-canvas-qualified');
      const observeSync=(phase,ms)=>{
        const fontSetup=['create-font-face','load-font-face','register-font-face','match-font-face'].includes(phase);
        if(fontSetup)fontSetupSpentMs+=ms;
        const timing={requestId,phase,ms,budgetKind:fontSetup?'font-setup':'render',limitMs:fontSetup?maxFontSetupMs:maxSyncMs,fontSetupSpentMs};
        timings.push(timing);onTiming?.(timing);
        if(fontSetup?fontSetupSpentMs>maxFontSetupMs:ms>maxSyncMs)
          fail('RENDERER_GAP','Native operation exceeded synchronous soft budget',{phase,ms,maxSyncMs,maxFontSetupMs,fontSetupSpentMs});
        work.check();
      };
      const timed=(phase,fn)=>{const t=performance.now();const result=fn();observeSync(phase,performance.now()-t);return result;};
      const renderer=createCanvasColorRenderer({engine,version},{
        id:'main-thread-native-font-image/1',fontSet:()=>document.fonts,
        async acquireFont(family,bytes){
          let cached=fontFaces.get(family);
          if(!cached){
            if(fontFaces.size>=2||cachedBytes+bytes.length>COLOR_BRIDGE_LIMITS.fontBytes)fail('RENDERER_GAP','Main native font cache full; reattach the bridge for another selection');
            const face=timed('create-font-face',()=>new FontFace(family,bytes,{style:'normal',weight:'400'}));
            cached={face,bytes:bytes.length};fontFaces.set(family,cached);cachedBytes+=bytes.length;
          }
          try{
            await timed('load-font-face',()=>cached.face.load());work.check();timed('register-font-face',()=>document.fonts.add(cached.face));
            // Native font matching can be lazy; request it asynchronously before measuring.
            await timed('match-font-face',()=>document.fonts.load(input.unitsPerEm+'px "'+family+'"',input.text));work.check();
            return cached.face;
          }catch(e){
            document.fonts.delete(cached.face);if(fontFaces.get(family)===cached){fontFaces.delete(family);cachedBytes-=cached.bytes;}throw e;
          }
        },
        createCanvas(width,height){
          edge(width,height);
          // Main-thread OffscreenCanvas is a distinct capability from a Worker canvas.
          // Firefox's HTML canvas metrics differ; its main OffscreenCanvas matches the source.
          if(typeof OffscreenCanvas==='function'){
            const canvas=new OffscreenCanvas(width,height);
            if(canvas.getContext('2d',{alpha:true,colorSpace:'srgb',willReadFrequently:true})){
              canvases.add(canvas);canvasKind='main-OffscreenCanvas';return canvas;
            }
          }
          const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
          canvases.add(canvas);canvasKind='detached-HTMLCanvasElement';return canvas;
        },
        observeSync,
      });
      const result=await renderer.render(input,work);work.check();
      result.sampling={...result.sampling,bridge:{version:COLOR_BRIDGE_VERSION,maxEdge:512,maxSyncMs,maxFontSetupMs,deadlineMs,canvas:canvasKind}};
      post(requestId,{type:'result',result},[result.rgba.buffer]);
    }catch(error){post(requestId,{type:'error',error:errorRecord(error)});}
    finally{for(const c of canvases){c.width=1;c.height=1;}active=null;}
  };
  port.addEventListener('message',listener);port.start();
  return Object.freeze({
    dispose(){disposed=true;if(active)active.cancelled=true;for(const f of fontFaces.values())document.fonts.delete(f.face);fontFaces.clear();cachedBytes=0;port.removeEventListener('message',listener);port.close();},
    stats:()=>({active:active?.requestId??null,disposed,qualifiedSources:allow.size,cachedFonts:fontFaces.size,cachedBytes}),
  });
}
