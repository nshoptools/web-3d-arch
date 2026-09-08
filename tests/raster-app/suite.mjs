import {createRasterOperations,createRasterDispatcher,createRasterTransport} from '../../src/core/raster-operations.mjs';
import {encodeOptions,decodeOptions,encodeLimits,encodeOrigin,validatePacket,bufferMap,view,hex} from '../../src/core/raster-schema.mjs';
import {createRasterAdapters,createRasterRecipeHelper,rasterOptionsForState} from '../../src/integration/raster-adapters.mjs';
import {sha256,canonicalJSON} from '../../src/storage/common.mjs';
import {createProject,validateProject} from '../../src/domain/index.mjs';
import {sourceAlignment} from './source-alignment-suite.mjs';
import {lifecycleChecks} from './lifecycle-suite.mjs';
import {callbackLifecycleChecks} from './callback-lifecycle-suite.mjs';
const assert=(ok,label)=>{if(!ok)throw Error(label);};
async function rejects(fn,code){try{await fn();}catch(e){assert(e.code===code,code+' got '+(e.code??e.message));return;}throw Error('Expected '+code);}
const clone=x=>structuredClone(x);
const same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const COLORS=[[0,0,0,0],[255,0,0,255],[0,0,255,255],[0,255,0,255]];
function grid(name) {
  const width=24,height=20,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){let l=0;
    if(name==='curve')l=x<8+Math.floor(y/3)?1:2;
    if(name==='hole')l=x>=8&&x<16&&y>=6&&y<14?0:1;
    if(name==='junction')l=x<12?1:y<10?2:3;
    if(name==='islands')l=x>=2&&x<6&&y>=2&&y<6||x>=18&&x<22&&y>=14&&y<18?1:0;
    data.set(COLORS[l],(y*width+x)*4);
  }return {data,width,height};
}
function area(packet){const b=bufferMap(packet),xy=new BigInt64Array(b.get(28).buffer),loops=new Uint32Array(b.get(13).buffer),indices=new Uint32Array(b.get(14).buffer);let twice=0n;
  for(let i=0;i<loops.length;i+=4)for(let j=loops[i];j<loops[i]+loops[i+1]-1;j++){const a=indices[j]*2,c=indices[j+1]*2;twice+=xy[a]*xy[c+1]-xy[c]*xy[a+1];}
  return Number(twice)/2e12;
}
export async function exercise(m,{readFixture,mainBase,notify=()=>{},browser=false}={}) {
  const root=createRasterOperations(m),next=()=>{const generation=root.control().generation+1;assert(m._arch_control_reset(generation)===1,'root reset');return {generation};};
  const checkRows=[],geometry=[],notes=[];let checks=0;
  const test=async(name,f)=>{await f();checks++;checkRows.push(name);};
  const identity={smooth:0,minA:0,denoise:0,eps:0,tension:0,longEdgeMm:24};
  await test('options exact catalog defaults/manual/invalid',async()=>{
    const d=decodeOptions(encodeOptions());assert(d.options.k===4&&d.options.res===520&&d.options.smooth===3&&d.options.minA===5&&d.options.denoise===1&&d.options.eps===35&&d.options.tension===65,'defaults');
    assert(decodeOptions(encodeOptions({eps:17,tension:91})).options.tension===91,'manual');
    for(const options of [{eps:NaN},{tension:1.5},{res:519},{k:1},{longEdgeMm:Infinity},{extra:1},{alpha:{policy:'matte'}},{palette:[[0,0,0],[0,0,0]]}])await rejects(()=>encodeOptions(options),'RASTER_OPTIONS');
    await rejects(()=>encodeLimits({maxDecodedPixels:Infinity}),'RASTER_LIMITS');
    await rejects(()=>encodeOrigin({sourceHash:'0'.repeat(64),settingsHash:'1'.repeat(64),renderer:'x\0',confirmationId:'c'}),'RASTER_ORIGIN');
  });
  const base=root.prepareRGBA({...grid('curve')},next());
  await test('default smoothing/curves and independent seam incidence',async()=>{
    const packet=base.copy(),b=bufferMap(packet),s=validatePacket(packet).summary;assert(s.curves>0,'actual default tension curves');
    const edges=new Uint32Array(b.get(12).buffer);assert(Array.from({length:edges.length/8},(_,i)=>edges[i*8+2]&&edges[i*8+3]).some(Boolean),'shared seam with two incidences');
    const changed=clone(packet);new DataView(changed.buffers[11].bytes.buffer).setUint32(0,0xffffffff,true);await rejects(()=>validatePacket(changed),'RASTER_SCHEMA');
    const tlv=clone(packet);new DataView(tlv.buffers[17].bytes.buffer).setUint16(0,65530,true);new DataView(tlv.buffers[17].bytes.buffer).setUint16(2,1,true);await rejects(()=>validatePacket(tlv),'RASTER_CRITICAL_TLV');
    geometry.push({name:'curve',hash:s.proposalHash,xy:await sha256(b.get(28)),curves:s.curves});
  });
  await test('unconfirmed build and bad/stale hash reject',async()=>{
    await rejects(()=>root.buildSourceContext(base,{thicknessMm:2},next()),'RASTER_CONFIRMATION_REQUIRED');
    await rejects(()=>root.confirm(base,'0'.repeat(64),next()),'RASTER_CONFIRMATION_MISMATCH');
    const changed=root.prepareRGBA({...grid('curve'),options:{eps:36}},next());
    assert(changed.summary.proposalHash!==base.summary.proposalHash,'changed settings hash');
    await rejects(()=>root.confirm(changed,base.summary.proposalHash,next()),'RASTER_CONFIRMATION_MISMATCH');changed.release();
  });
  const accepted=root.confirm(base,base.summary.proposalHash,next()),old=accepted.copy();
  await test('idempotent confirmation / one reader each / fresh memory views',async()=>{
    const repeated=root.confirm(base,base.summary.proposalHash,next());assert(repeated.summary.publicationGeneration===accepted.summary.publicationGeneration,'stable generation');repeated.release();
    const before=m.HEAPU8.buffer,allocation=m._malloc(before.byteLength+65536);assert(allocation&&m.HEAPU8.buffer.byteLength>before.byteLength,'memory grew');
    assert(await sha256(accepted.copy().buffers[27].bytes)===await sha256(old.buffers[27].bytes),'old shared graph intact after grow');m._free(allocation);
    const mutated=accepted.copy();mutated.buffers[27].bytes.fill(0);assert(await sha256(accepted.copy().buffers[27].bytes)===await sha256(old.buffers[27].bytes),'output copies not writable aliases');
    const extra=base.acquire();extra.release();extra.release();await rejects(()=>extra.copy(),'RASTER_LEASE_RETIRED');
  });
  await test('ARCH context real root / private reset preserves unrelated root lease',async()=>{
    const snapshot=root.buildSourceContext(accepted,{thicknessMm:2},next()),bytes=snapshot.copy();assert(view(bytes).getUint32(0,true)===0x48435241,'ARCH/1');
    const other=createRasterOperations(m),p=other.prepareRGBA({...grid('hole'),options:identity},next());other.reset();await rejects(()=>p.copy(),'RASTER_LEASE_RETIRED');
    assert(await sha256(snapshot.copy())===await sha256(bytes),'unrelated root snapshot retained');snapshot.release();
  });
  accepted.release();base.release();
  await test('holes / disconnected islands / T junction / empty analytic areas',async()=>{
    for(const [name,expected]of [['hole',416],['islands',32],['junction',480],['empty',0]]){
      const p=root.prepareRGBA({...grid(name),options:identity},next()),packet=p.copy(),meta=p.metadata;
      assert(Math.abs(Math.abs(area(packet))-expected)<1e-8,name+' exact area');if(name==='hole')assert(meta.topology.holes===1,'hole');if(name==='islands')assert(p.summary.regions===2,'islands');
      if(name==='junction')assert(meta.topology.junctions>0,'junction');
      geometry.push({name,hash:p.summary.proposalHash,xy:await sha256(packet.buffers[27].bytes)});p.release();
    }
  });
  await test('actual PNG/JPEG/EXIF/VP8L/VP8 decode retain original bytes',async()=>{
    for(const name of ['synthetic-rgba.png','synthetic-rgb.jpg','synthetic-exif6.jpg','synthetic-rgba.webp','synthetic-lossy-vp8.webp']){
      const bytes=await readFixture(name),p=root.prepareEncoded({bytes,options:{alpha:{policy:'threshold',cutoff:128}}},next()),packet=p.copy(),b=bufferMap(packet);
      assert(await sha256(bytes)===await sha256(b.get(2)),name+' source retention');assert(b.get(3).length===p.summary.inputWidth*p.summary.inputHeight*4,name+' raw RGBA');
      if(name==='synthetic-exif6.jpg')assert(p.metadata.orientation.exif===6&&p.metadata.orientation.applied&&p.summary.inputWidth===8&&p.summary.inputHeight===16,'orientation');
      if(name.includes('lossy'))assert(p.metadata.source.format==='webp','VP8');
      geometry.push({name,hash:p.summary.proposalHash,xy:await sha256(b.get(28)),raw:await sha256(b.get(3))});p.release();
    }
  });
  await test('bad input / alpha / overflow / stale generation / pre-cancel',async()=>{
    await rejects(()=>root.prepareEncoded({bytes:new TextEncoder().encode('bad')},next()),'RASTER_UNSUPPORTED_FORMAT');
    await rejects(()=>root.prepareEncoded({bytes:new TextEncoder().encode('<svg/>')},next()),'RASTER_SVG_IS_NOT_RASTER');
    await rejects(()=>root.prepareRGBA({data:new Uint8ClampedArray([255,0,0,128]),width:1,height:1},next()),'RASTER_ALPHA_POLICY_REQUIRED');
    await rejects(()=>root.prepareRGBA({data:new Uint8Array(4),width:0xffffffff,height:0xffffffff},next()),'RASTER_DIMENSIONS');
    const c=next();await rejects(()=>root.prepareRGBA({...grid('curve')},{generation:c.generation-1}),'RASTER_STALE_GENERATION');
    assert(root.cancel(c.generation),'active cancel');await rejects(()=>root.prepareRGBA({...grid('curve')},c),'RASTER_CANCELLED');assert(!root.cancel(c.generation-1),'cancel cannot target older generation');
  });
  await test('transport opaque tokens / stale reset / owned transfer / bad handle',async()=>{
    const dispatch=createRasterDispatcher(root),call=async(method,payload,c)=>dispatch.dispatch(method,payload,['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method)?next():c);
    const remote=createRasterTransport({call});
    const p=await remote.prepareRGBA({...grid('curve')});const packet=await p.copy();
    assert(dispatch.transferables(packet).every(b=>b instanceof ArrayBuffer),'owned transfer');
    await rejects(()=>dispatch.dispatch('confirm',{token:'heap-pointer-999',proposalHash:'0'.repeat(64)},next()),'RASTER_LEASE_RETIRED');
    const a=await remote.confirm(p,p.summary.proposalHash);const copy=await a.copy();assert(validatePacket(copy).summary.accepted,'accepted remote');
    await p.release();await a.release();await remote.reset();await rejects(()=>p.copy(),'RASTER_LEASE_RETIRED');
  });
  const alignmentDispatcher=createRasterDispatcher(root);
  const alignmentRuntime=createRasterTransport({call:async(method,payload,c)=>alignmentDispatcher.dispatch(method,payload,['prepareEncoded','prepareRGBA','confirm','buildSourceContext'].includes(method)?next():c)});
  await sourceAlignment({test,runtime:alignmentRuntime,readFixture,notes});
  await test('confirmed renderer RGBA retains render hashes, rejects missing confirmation',async()=>{
    const origin={sourceHash:'a'.repeat(64),settingsHash:'b'.repeat(64),renderer:'cpu-explicit-test-renderer-v1',confirmationId:'confirmed-render-1'};
    const p=root.prepareRGBA({...grid('hole'),origin},next());
    assert(p.summary.confirmedRender&&p.summary.sourceHash===origin.sourceHash,'render origin');const packet=p.copy();assert(packet.buffers[21].bytes.length>72&&packet.buffers[2].bytes.length===24*20*4,'origin + original RGBA');p.release();
  });
  await test('bounded output failure / snapshots borrowed for product / resampling domain',async()=>{
    const tight=createRasterOperations(m,{maxCopyBytes:256});
    await rejects(()=>tight.prepareRGBA({...grid('curve')},next()),'RASTER_OUTPUT_BUDGET');
    assert(root.ownedBytes()===0,'output failure releases primary');
    const image={width:521,height:113,data:new Uint8ClampedArray(521*113*4)};for(let i=0;i<image.data.length;i+=4){image.data[i]=255;image.data[i+3]=255;}
    const p=root.prepareRGBA({...image,options:{res:360}},next()),s=p.summary;
    assert(s.width===360&&s.height<113&&Math.abs(s.heightMm-113*45/521)<1e-10&&s.mmPerPixelX!==s.mmPerPixelY,'nonuniform processing transform explicit');
    assert(p.metadata.errorDomain.sourceBoundMm===null,'unknown source bound remains unknown');
    const a=root.confirm(p,s.proposalHash,next()),ctx=root.buildSourceContext(a,{thicknessMm:2},next());
    assert(root.withSourceReference(a,r=>r.kind==='raster'&&r.acceptedHandle>0),'accepted root reference');
    assert(root.withSourceReference(ctx,r=>r.kind==='snapshot'&&r.id>0&&r.generation===ctx.generation),'root snapshot reference');
    ctx.release();a.release();p.release();tight.reset();
  });
  await lifecycleChecks({test,root,module:m,next,grid});
  await callbackLifecycleChecks({test,root,module:m,next,grid,notes});
  await test('root owned bytes zero at end',async()=>assert(root.ownedBytes()===0,'root ownership leaked: '+root.ownedBytes()));
  return {pass:true,checks,checkRows,geometry,notes};
}
