import * as hb from '../../src/input/harfbuzz-engine.mjs';
import {createFontSourceWithHarfBuzz} from '../../src/input/font-source-core.mjs';
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');
self.onmessage=async({data})=>{
  try{
    const engine=await (await import('/engine/arch-kernel.mjs')).default();
    hb.initializeHarfBuzz(engine);
    const response=await fetch('/fixture/font');if(!response.ok)throw new Error('FONT_HTTP');
    const bytes=new Uint8Array(await response.arrayBuffer());
    const source=await createFontSourceWithHarfBuzz(bytes,data.entry,hb);
    const shaped=source.shapeRun(data.text,{variations:data.variations??{}});
    const paint=data.color?source.colorPaint(shaped.glyphs[0].glyphId):null;
    const pointer=engine._malloc(96*1024*1024);if(!pointer)throw new Error('ALLOCATION');
    try{
      const after=await createFontSourceWithHarfBuzz(bytes,data.entry,hb);
      const repeated=after.shapeRun(data.text,{variations:data.variations??{}});
      postMessage({ok:true,shared:engine.HEAPU8.buffer instanceof SharedArrayBuffer,shaper:hb.versionString(),shapeHash:await hash(shaped),paintHash:await hash(paint),afterGrowthHash:await hash(repeated)});
    }finally{engine._free(pointer);}
  }catch(error){postMessage({ok:false,error:error.message});}
};
