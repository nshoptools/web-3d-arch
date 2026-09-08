import * as hb from '/parent/harfbuzz-engine.mjs';
import {createFontSourceWithHarfBuzz} from '/parent/font-source-core.mjs';
import {runSharedSuite} from './shared-suite.mjs';
import {runRendererSuite} from './renderer-suite.mjs';
const json=async url=>{const r=await fetch(url);if(!r.ok)throw Error('Fixture HTTP '+r.status);return r.json();};
const revive=value=>{if(value?.__bytes)return new Uint8Array(value.__bytes);if(Array.isArray(value))return value.map(revive);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,revive(v)]));return value;};
self.onmessage=async({data:runtime})=>{
  try{
    const module=await import('/engine/arch-kernel.mjs'),engine=await module.default();hb.initializeHarfBuzz(engine);
    const data=await json('/fixture/config.json'),refs=revive(await json('/fixture/reference.json'));
    data.readBytes=async ref=>{const response=await fetch('/asset/'+ref.sha256);if(!response.ok)throw Error('Asset not whitelisted');return new Uint8Array(await response.arrayBuffer());};
    const createFontSource=(bytes,entry)=>createFontSourceWithHarfBuzz(bytes,entry,hb);
    const reference=async(key,text,options,kind)=>{
      const r=refs[JSON.stringify([key,text,options,kind??null])];if(!r)throw Error('Missing reference fixture');return structuredClone(r);
    };
    let generation=1;
    const buildSvg=async bytes=>{
      const g=generation++;engine._arch_control_reset(g);const h=engine._arch_input_create(bytes.length);
      if(!h)throw Error('Input allocation');engine.HEAPU8.set(bytes,engine._arch_input_ptr(h));
      const id=engine._arch_build_svg(h,2,0,.004,g);
      if(!id)throw Error(new TextDecoder().decode(new Uint8Array(engine.HEAPU8.subarray(engine._arch_error_ptr(),engine._arch_error_ptr()+engine._arch_error_len()))));
      try{return {bytes:engine._arch_snapshot_len(id),metadata:JSON.parse(new TextDecoder().decode(new Uint8Array(engine.HEAPU8.subarray(engine._arch_metadata_ptr(id),engine._arch_metadata_ptr(id)+engine._arch_metadata_len(id)))))};}
      finally{engine._arch_snapshot_release(id);}
    };
    const onResult=result=>postMessage({type:'check',result});
    const shared=await runSharedSuite(data,{createFontSource,reference,buildSvg,onResult});
    const rendered=await runRendererSuite(data,{createFontSource,engine:runtime.engine,version:runtime.version,onResult});
    const samples=[];
    for(const sample of rendered.samples){
      const {width,height,rgba,sha256,renderer}=sample.preview,canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
      ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),width,height),0,0);
      const png=new Uint8Array(await (await canvas.convertToBlob({type:'image/png'})).arrayBuffer());
      let binary='';for(const byte of png)binary+=String.fromCharCode(byte);
      samples.push({name:sample.name,kind:sample.kind,width,height,sha256,renderer,pngBase64:btoa(binary)});
    }
    postMessage({type:'complete',shared,renderer:rendered.results,capabilities:rendered.capabilities,samples,abi:engine._arch_abi_version(),harfbuzz:hb.versionString(),sharedHeap:engine.HEAPU8.buffer instanceof SharedArrayBuffer});
  }catch(e){postMessage({type:'fatal',error:e.stack??String(e)});}
};
