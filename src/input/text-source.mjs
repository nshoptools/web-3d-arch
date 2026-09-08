import {VERSION,LIMITS,SourceError,fail,record,keys,id,token,sameToken,finite,ownedBytes,sha,fontEntry,hash,hashRecord,Work,translateFontError,multiply} from './source-contract.mjs';
import {validateText,layoutText,svgEnvelope} from './text-layout.mjs';
import {createCollectionIndex,prepareEmoji} from './emoji-source.mjs';

/** Replace binary fields with their hashes only for artifact identity; encoded sources stay intact. */
async function digestValue(value,depth=0){
  if(depth>64)fail('RESOURCE_LIMIT','Artifact nesting limit');
  if(value instanceof Uint8Array)return {binaryBytes:value.byteLength,sha256:await hash(value)};
  if(Array.isArray(value))return Promise.all(value.map(v=>digestValue(v,depth+1)));
  if(value&&typeof value==='object'){
    const out={};for(const key of Object.keys(value).sort())out[key]=await digestValue(value[key],depth+1);return out;
  }
  if(typeof value==='number'&&!Number.isFinite(value))fail('INVALID_GEOMETRY','Nonfinite artifact');
  return value;
}
export const artifactHash=async value=>hashRecord(await digestValue(value));

/**
 * No WASM initialization or hidden I/O. createFontSource must bind the parent's already
 * initialized shared HarfBuzz ABI2 namespace. readBytes is supplied and authorized by the host.
 * One active preparation and one pending conversion per instance; no persistent state/history.
 */
export function createTextSourceAdapter({readBytes,createFontSource,collections=[],renderer}){
  if(typeof readBytes!=='function'||typeof createFontSource!=='function')fail('INVALID_INPUT','Inject byte loader and shared-engine font factory');
  if(renderer&&typeof renderer.render!=='function')fail('INVALID_INPUT','Invalid renderer');
  const catalog=createCollectionIndex(collections),fonts=new Map();
  let cacheBytes=0,jobs=0,active=null,pending=null;
  function control(expected,options,job){
    if(typeof options?.isCurrent!=='function')fail('INVALID_INPUT','Host isCurrent(expected) callback is mandatory');
    return new Work(expected,options,()=>job?.cancelled===true);
  }
  async function getAsset(ref,work,max=LIMITS.assetBytes){
    sha(ref?.sha256);finite(ref?.bytes,1,max,'asset bytes',true);
    await work.step(1,'read-source');
    let bytes;
    try{bytes=ownedBytes(await readBytes(structuredClone(ref),{signal:work.options.signal}),max);}
    catch(error){if(error instanceof SourceError)throw error;fail('ASSET_READ_FAILED',String(error?.message??error));}
    work.check();
    if(bytes.byteLength!==ref.bytes||await hash(bytes)!==ref.sha256)fail('HASH_MISMATCH','Actual source bytes differ from catalog',{id:ref.id??ref.path});
    work.check();return bytes;
  }
  async function getFont(entry,work){
    const ref=fontEntry(entry),key=await hashRecord(ref);work.check();
    if(fonts.has(key))return fonts.get(key);
    if(fonts.size>=LIMITS.fonts||cacheBytes+ref.bytes>LIMITS.cacheBytes)fail('RESOURCE_LIMIT','Font cache full; use a fresh source Worker');
    const bytes=await getAsset(ref,work,LIMITS.fontBytes);
    let source;
    try{source=await createFontSource(new Uint8Array(bytes),structuredClone(ref));}catch(e){translateFontError(e);}
    work.check();
    if(!source||typeof source.shapeRun!=='function')fail('FONT_READER_ERROR','Invalid injected font source');
    const loaded={entry:ref,bytes,source};fonts.set(key,loaded);cacheBytes+=bytes.byteLength;return loaded;
  }
  async function prepare(command,options){
    if(active)fail('BUSY','One preparation per adapter');
    record(command,'command');let request;
    try{request=structuredClone(command);}catch{fail('INVALID_INPUT','Command must be structured-cloneable');}
    const expected=token(request.expected),job={id:id(request.id),cancelled:false};
    if(request.version!==VERSION)fail('VERSION_MISMATCH','Unsupported source version');
    const work=control(expected,options,job);work.check();
    if(++jobs>LIMITS.maxJobs)fail('RESOURCE_LIMIT','Preparation lifetime limit; recycle Worker');
    active=job;pending=null;
    try{
      await work.step(1,'validate-source');
      let result;
      if(request.kind==='text'){
        const textRequest={...request};delete textRequest.kind;
        const validated=validateText(textRequest);
        const geometry=await layoutText(validated,getFont,work),sourceAssets=geometry.sourceAssets;delete geometry.sourceAssets;
        result={kind:'paths',geometry,...svgEnvelope(geometry,geometry.options.color),sourceAssets,conversion:null};
      }else if(request.kind==='emoji'){
        result=await prepareEmoji(request,catalog,getFont,getAsset,work);
        if(result.geometry?.sourceAssets)delete result.geometry.sourceAssets;
        const input=result.renderInput;delete result.renderInput;
        if(request.raster!==undefined&&!input)fail('INVALID_INPUT','Raster preview applies only to explicitly selected color font sources');
        if(input){
          const raster=request.raster??{width:256,height:256};
          keys(raster,['width','height'],'raster');
          finite(raster.width,5,LIMITS.maxEdge,'raster width',true);finite(raster.height,5,LIMITS.maxEdge,'raster height',true);
          if(!renderer)result.preview={status:'renderer-gap',code:'RENDERER_GAP',message:'Inject a qualified color renderer'};
          else{
            try{
              const rendered=await renderer.render({...input,...raster},work);work.check();
              finite(rendered.width,5,LIMITS.maxEdge,'renderer width',true);finite(rendered.height,5,LIMITS.maxEdge,'renderer height',true);
              if(rendered.width!==raster.width||rendered.height!==raster.height)fail('INVALID_RENDERER','Renderer changed selected resolution');
              rendered.rgba=ownedBytes(rendered.rgba,LIMITS.maxPixels*4);
              if(rendered.rgba.length!==raster.width*raster.height*4)fail('INVALID_RENDERER','Renderer RGBA length mismatch');
              if(!Array.isArray(rendered.pixelToSourceMm)||rendered.pixelToSourceMm.length!==6)fail('INVALID_RENDERER','Missing pixel transform');
              rendered.pixelToSourceMm.forEach(n=>finite(n,-1e6,1e6,'pixel transform'));
              const m=rendered.pixelToSourceMm;if(m[0]*m[3]-m[1]*m[2]===0)fail('INVALID_RENDERER','Singular pixel transform');
              rendered.sha256=await hash(rendered.rgba);
              rendered.pixelToSourceMm=multiply(result.placement,rendered.pixelToSourceMm);
              result.preview={status:'ready',...rendered};
              result.conversion={requiresConfirmation:true,kind:'source-to-rgba8',status:'proposed',
                sourceKind:result.selection.sourceKind,sourceHashes:result.sourceAssets.map(s=>s.record.sha256),
                raster:{width:rendered.width,height:rendered.height,sha256:rendered.sha256,pixelToSourceMm:rendered.pixelToSourceMm,renderer:rendered.renderer},
                losses:['Continuous curves/gradients sampled to selected pixel grid','Native antialiasing and premultiplied readback rounded to straight sRGB RGBA8'],
                colorReduction:{status:'not-applied',requiresSeparateHostProposal:true},
                retained:['Original encoded font','Original Unicode token and catalog selection','Full paint graph or original embedded PNG'],
                claims:{sourceBoundVerified:false,fitVerified:false,meshVerified:false}};
            }catch(error){
              if(error?.code!=='RENDERER_GAP')throw error;
              result.preview={status:'renderer-gap',code:error.code,message:error.message,details:error.details};
            }
          }
        }
      }else fail('INVALID_INPUT','Expected text or emoji command');
      const prepared={version:VERSION,id:job.id,expected, ...result,
        provenance:{adapter:VERSION,shaper:[...new Set(result.geometry?.shapedRuns?.map(r=>r.shaper)??(result.shape?[result.shape.shaper]:[]))].join('+')||'none-original-svg-or-empty-text',sourcePreserved:true},
        claims:{sourceBoundVerified:false,fitVerified:false,meshVerified:false}};
      await work.step(1,'hash-artifact');
      prepared.artifactHash=await artifactHash(prepared);
      if(prepared.conversion)prepared.proposalHash=await hashRecord({artifactHash:prepared.artifactHash,expected,conversion:prepared.conversion});
      await work.step(1,'prepared');
      // Publish only after all source/revision/cancel checks. Returned bytes cannot mutate pending data.
      if(prepared.conversion)pending=structuredClone(prepared);
      return prepared;
    }catch(error){translateFontError(error);}
    finally{active=null;}
  }
  async function confirm(approval,options){
    keys(approval,['id','expected','proposalHash','decision'],'approval');
    const expected=token(approval.expected),work=control(expected,options);
    work.check();
    const selected=pending;
    if(!selected||selected.id!==approval.id)fail('NO_PROPOSAL','No matching pending conversion');
    if(!sameToken(selected.expected,expected))fail('STALE_SOURCE','Approval targets another source/revision');
    if(approval.decision!=='accept-source-conversion'||approval.proposalHash!==selected.proposalHash)fail('CONFIRMATION_REQUIRED','Confirm the exact reviewed conversion proposal');
    await work.step(1,'confirm-conversion');
    if(pending!==selected)fail('STALE_SOURCE','Conversion proposal was superseded or cancelled');
    pending=null;
    return {version:VERSION,id:selected.id,expected,proposalHash:selected.proposalHash,artifactHash:selected.artifactHash,
      conversion:{...selected.conversion,status:'confirmed'},rasterInput:structuredClone(selected.preview),
      originalSource:structuredClone({selection:selected.selection,source:selected.source,sourceAssets:selected.sourceAssets,shape:selected.shape})};
  }
  function cancel(jobId){
    id(jobId);let found=false;
    if(active?.id===jobId){active.cancelled=true;found=true;}
    if(pending?.id===jobId){pending=null;found=true;}
    return found;
  }
  return Object.freeze({prepare,confirm,cancel,
    stats:()=>({cachedFonts:fonts.size,cachedBytes:cacheBytes,jobs,active:active?.id??null,pending:pending?.id??null})});
}
