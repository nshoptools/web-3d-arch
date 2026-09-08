import {createTextSourceAdapter,createNativeColorRenderer,VERSION} from '../../src/input/index.mjs';
import {hash,transform} from '../../src/input/source-contract.mjs';
import {assert,equal,near,rejects,current,emojiCommand,textCommand} from './shared-suite.mjs';
export async function runRendererSuite(data,{createFontSource,engine,version,onResult=()=>{},rendererOverride,canvasAvailable,previewEdge=1280}){
  const renderer=rendererOverride??createNativeColorRenderer({engine,version}),tests=[],results=[],samples=[];
  const make=overrides=>createTextSourceAdapter({collections:data.collections,readBytes:data.readBytes,createFontSource,renderer,...overrides});
  const a=make(),test=(name,fn)=>tests.push({name,fn}),hasCanvas=canvasAvailable??(typeof OffscreenCanvas==='function');
  const analytic=(name,extra={})=>{
    const i=['linear','radial','sweep','group','reflect','alpha','tied'].indexOf(name);
    return emojiCommand(data,String.fromCharCode(0xe000+i),'COLRv1',{collectionId:'analytic-color',source:{kind:'COLRv1',font:data.entries.analytic},raster:{width:84,height:84},...extra});
  };
  const pixel=(r,x,y)=>Array.from(r.rgba.subarray((y*r.width+x)*4,(y*r.width+x)*4+4));
  const sourcePixel=(r,x,y)=>{
    const m=r.pixelToSourceMm;
    return pixel(r,Math.max(0,Math.min(r.width-1,Math.floor((x-m[4])/m[0]))),Math.max(0,Math.min(r.height-1,Math.floor((y-m[5])/m[3]))));
  };
  for(const token of data.selected)test('native COLRv1 color preview '+token,async()=>{
    const r=await a.prepare(emojiCommand(data,token,'COLRv1',{raster:{width:128,height:128}}),current());
    if(!hasCanvas){equal(r.preview.status,'renderer-gap');equal(r.preview.details.feature,'OffscreenCanvas');assert(r.source.paint.operations.length>0);return;}
    equal(r.preview.status,'ready',JSON.stringify(r.preview));assert(r.preview.rgba instanceof Uint8Array);
    let count=0;for(let i=0;i<r.preview.rgba.length;i+=4)if(r.preview.rgba[i+3]&&r.preview.rgba[i]!==r.preview.rgba[i+1])count++;
    if(token!=='👨‍👩‍👧‍👦')assert(count>100,'must render actual color ink');
    assert(r.preview.rgba.filter((v,i)=>i%4===3&&v>0).length>100,'visible ink required, including the original gray family symbol');
    equal(await hash(r.preview.rgba),r.preview.sha256);assert(r.conversion.requiresConfirmation);equal(r.conversion.colorReduction.status,'not-applied');
    samples.push({name:token,kind:'COLRv1',preview:r.preview});
  });
  test('same pinned renderer/input/resolution produces identical RGBA',async()=>{
    if(!hasCanvas)return {skipped:'Worker OffscreenCanvas unavailable'};
    const x=await a.prepare(emojiCommand(data),current()),y=await a.prepare(emojiCommand(data),current());
    equal(x.preview.sha256,y.preview.sha256);equal(x.artifactHash,y.artifactHash);equal(x.proposalHash,y.proposalHash);
  });
  const b=make();
  for(const token of ['😀','🇻🇳','👩🏽‍💻'])test('native CBDT original PNG preview '+token,async()=>{
    const r=await b.prepare(emojiCommand(data,token,'CBDT/CBLC',{raster:{width:128,height:128}}),current());
    if(!hasCanvas){equal(r.preview.status,'renderer-gap');return;}
    equal(r.preview.status,'ready',JSON.stringify(r.preview));assert(r.preview.rgba.some((v,i)=>i%4===3&&v>0));samples.push({name:token,kind:'CBDT',preview:r.preview});
    equal(r.source.bitmap.pngWidth,136);equal(r.source.bitmap.pngHeight,128);
  });
  for(const name of ['linear','radial','sweep','group','reflect','alpha','tied'])test('analytic native COLR '+name+' and complete graph',async()=>{
    const r=await a.prepare(analytic(name),current()),ops=r.source.paint.operations;
    assert(ops.some(o=>o.op==='pushClipRectangle')&&ops.some(o=>o.op==='pushClipOutline'));
    if(name==='group')assert(ops.some(o=>o.op==='popGroup'&&o.mode===5)&&ops.some(o=>o.op==='pushTransform'&&o.matrix[4]===200));
    if(['linear','radial','sweep'].includes(name))assert(ops.some(o=>o.op===name+'Gradient'));
    if(name==='tied'){const stops=ops.find(o=>o.op==='linearGradient').colorLine.colorStops;assert(stops[1].offset===stops[2].offset);}
    if(!hasCanvas){equal(r.preview.status,'renderer-gap');return;}
    equal(r.preview.status,'ready',JSON.stringify(r.preview));const p=r.preview;
    equal(pixel(p,0,0),[0,0,0,0]);equal(pixel(p,83,83),[0,0,0,0]);
    if(name==='linear'){const l=sourcePixel(p,2,5),r=sourcePixel(p,8,5);assert(l[0]>l[2]&&r[2]>r[0]);equal(l[3],255);}
    if(name==='radial'){const center=sourcePixel(p,5,5),edge=sourcePixel(p,8.5,5);assert(center[0]>center[2]&&edge[2]>edge[0]);}
    if(name==='group'){const clear=sourcePixel(p,1.5,5),ink=sourcePixel(p,5,5);equal(clear[3],0);near(ink[0],255,1);near(ink[1],0,1);near(ink[2],0,1);near(ink[3],128,1);}
    if(name==='alpha'){const l=sourcePixel(p,2,5),r=sourcePixel(p,8,5);assert(l[3]<r[3]&&l[3]>0&&r[3]<255);}
    if(name==='tied'){const l=sourcePixel(p,4,5),r=sourcePixel(p,6,5);assert(l[0]>250&&l[2]<5&&r[2]>250&&r[0]<5);}
    samples.push({name,kind:'analytic',preview:p});
  });
  test('conversion approval binds exact source revision and raster, returned mutations isolated',async()=>{
    if(!hasCanvas)return {skipped:'Worker OffscreenCanvas unavailable'};
    const r=await a.prepare(emojiCommand(data),current()),wanted=r.preview.sha256;
    await rejects(()=>a.confirm({id:r.id,expected:r.expected,proposalHash:'0'.repeat(64),decision:'accept-source-conversion'},current()),'CONFIRMATION_REQUIRED');
    await rejects(()=>a.confirm({id:r.id,expected:{...r.expected,revision:4},proposalHash:r.proposalHash,decision:'accept-source-conversion'},{isCurrent:()=>true}),'STALE_SOURCE');
    r.preview.rgba.fill(0);r.sourceAssets[0].bytes.fill(0);
    const accepted=await a.confirm({id:r.id,expected:r.expected,proposalHash:r.proposalHash,decision:'accept-source-conversion'},current());
    equal(accepted.conversion.status,'confirmed');equal(await hash(accepted.rasterInput.rgba),wanted);
    equal(await hash(accepted.originalSource.sourceAssets[0].bytes),data.entries.colr.sha256);
    equal(accepted.conversion.claims.fitVerified,false);
    await rejects(()=>a.confirm({id:r.id,expected:r.expected,proposalHash:r.proposalHash,decision:'accept-source-conversion'},current()),'NO_PROPOSAL');
  });
  test('cancelled proposal cannot be accepted',async()=>{
    if(!hasCanvas)return {skipped:'Worker OffscreenCanvas unavailable'};
    const r=await a.prepare(emojiCommand(data),current());equal(a.cancel(r.id),true);
    await rejects(()=>a.confirm({id:r.id,expected:r.expected,proposalHash:r.proposalHash,decision:'accept-source-conversion'},current()),'NO_PROPOSAL');
  });
  test('stale/cancel during renderer readback publishes no proposal',async()=>{
    if(!hasCanvas)return {skipped:'Worker OffscreenCanvas unavailable'};
    let valid=true;
    await rejects(()=>a.prepare(emojiCommand(data),{...current(),isCurrent:()=>valid,onProgress:p=>{if(['renderer-readback','bridge-readback'].includes(p.phase))valid=false;}}),'STALE_SOURCE');
    equal(a.stats().pending,null);
    await rejects(()=>a.prepare(emojiCommand(data),{...current(),onProgress:p=>{if(['renderer-readback','bridge-readback'].includes(p.phase))a.cancel('emoji-job');}}),'CANCELLED');
    equal(a.stats().pending,null);
  });
  test('stale at confirmation checkpoint publishes no accepted conversion',async()=>{
    if(!hasCanvas)return {skipped:'Worker OffscreenCanvas unavailable'};
    const r=await a.prepare(emojiCommand(data),current());let valid=true;
    await rejects(()=>a.confirm({id:r.id,expected:r.expected,proposalHash:r.proposalHash,decision:'accept-source-conversion'},
      {...current(),isCurrent:()=>valid,onProgress:()=>{valid=false;}}),'STALE_SOURCE');
  });
  test('new preparation supersedes previous approval',async()=>{
    if(!hasCanvas)return {skipped:'Worker OffscreenCanvas unavailable'};
    const r=await a.prepare(emojiCommand(data),current());await a.prepare(emojiCommand(data,'🇻🇳','COLRv1',{id:'new-job'}),current());
    await rejects(()=>a.confirm({id:r.id,expected:r.expected,proposalHash:r.proposalHash,decision:'accept-source-conversion'},current()),'NO_PROPOSAL');
  });
  test('rotated RGBA pixel-to-mm mapping retains isotropic scale',async()=>{
    if(!hasCanvas)return {skipped:'Worker OffscreenCanvas unavailable'};
    const r=await a.prepare(emojiCommand(data,'😀','COLRv1',{placement:{xMm:10,yMm:20,rotationDegrees:90},raster:{width:160,height:96}}),current()),m=r.preview.pixelToSourceMm;
    near(m[0],0);near(m[3],0);near(Math.abs(m[1]),Math.abs(m[2]));assert(m[1]>0&&m[2]>0);
    const first=transform(m,0,0);assert(first.every(Number.isFinite));
  });
  test('selected preview resolution has enforced resource bounds',async()=>{
    await rejects(()=>a.prepare(emojiCommand(data,'😀','COLRv1',{raster:{width:1281,height:1280}}),current()),'INVALID_INPUT');
    await rejects(()=>a.prepare(emojiCommand(data,'😀','COLRv1',{raster:{width:4,height:8}}),current()),'INVALID_INPUT');
    if(hasCanvas){
      const r=await a.prepare(emojiCommand(data,'😀','COLRv1',{raster:{width:previewEdge,height:previewEdge}}),current());
      equal(r.preview.rgba.length,previewEdge*previewEdge*4);equal(r.preview.status,'ready',JSON.stringify(r.preview));
    }
  });
  test('exact color renderer gap does not switch source',async()=>{
    const gap=make({renderer:{render:async()=>{throw Object.assign(Error('native unsupported paint'),{code:'RENDERER_GAP',details:{operation:'test-fixture'}});}}});
    const r=await gap.prepare(emojiCommand(data),current());equal(r.preview.status,'renderer-gap');equal(r.selection.sourceKind,'COLRv1');assert(r.source.paint.operations.length>0);equal(r.conversion,undefined);
  });
  test('unqualified renderer cannot silently change resolution or transform',async()=>{
    const bad=make({renderer:{render:async()=>({width:1,height:1,rgba:new Uint8Array(4),pixelToSourceMm:[1,0,0,1,0,0]})}});
    await rejects(()=>bad.prepare(emojiCommand(data),current()),'INVALID_INPUT');
    const singular=make({renderer:{render:async()=>({width:256,height:256,rgba:new Uint8Array(256*256*4),pixelToSourceMm:[1,1,1,1,0,0]})}});
    await rejects(()=>singular.prepare(emojiCommand(data),current()),'INVALID_RENDERER');
  });
  for(const t of tests){
    const started=performance.now();
    try{const outcome=await t.fn();results.push({name:t.name,ok:true,...(outcome?.skipped?{skipped:outcome.skipped}:{}),ms:Math.round((performance.now()-started)*10)/10,...(!hasCanvas&&!t.name.includes('gap')?{nativePreviewAvailable:false}:{})});}
    catch(e){results.push({name:t.name,ok:false,error:e.message+'\n'+(e.stack??'')});}
    onResult(results.at(-1));
  }
  return {results,samples,capabilities:{OffscreenCanvas:hasCanvas,FontFace:typeof FontFace==='function',workerFonts:!!globalThis.fonts,createImageBitmap:typeof createImageBitmap==='function'}};
}
