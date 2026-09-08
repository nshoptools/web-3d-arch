import * as hb from '/parent/harfbuzz-engine.mjs';
import {createFontSourceWithHarfBuzz} from '/parent/font-source-core.mjs';
import {createColorRendererClient,createTextSourceAdapter} from '../../src/input/index.mjs';
import {runRendererSuite} from './renderer-suite.mjs';
import {emojiCommand,current,assert,equal,rejects} from './shared-suite.mjs';
const json=async url=>(await fetch(url)).json();
self.onmessage=async({data,ports})=>{
  const client=createColorRendererClient(ports[0]);
  try{
    const engine=await(await import('/engine/arch-kernel.mjs')).default();hb.initializeHarfBuzz(engine);
    const fixture=await json('/fixture/config.json');
    fixture.readBytes=async ref=>new Uint8Array(await(await fetch('/asset/'+ref.sha256)).arrayBuffer());
    const factory=(bytes,entry)=>createFontSourceWithHarfBuzz(bytes,entry,hb);
    if(data.type==='single'){
      const adapter=createTextSourceAdapter({readBytes:fixture.readBytes,createFontSource:factory,collections:fixture.collections,renderer:client});
      const result=await adapter.prepare(emojiCommand(fixture),current());
      postMessage({type:'single-result',status:result.preview.status,pending:adapter.stats().pending});
      return;
    }
    const rendered=await runRendererSuite(fixture,{createFontSource:factory,engine:data.engine,version:data.version,
      rendererOverride:client,canvasAvailable:true,previewEdge:512,onResult:r=>postMessage({type:'check',result:r})});
    const adapter=createTextSourceAdapter({readBytes:fixture.readBytes,createFontSource:factory,collections:fixture.collections,renderer:client});
    const r=await adapter.prepare(emojiCommand(fixture,'😀','COLRv1',{raster:{width:513,height:256}}),current());
    equal(r.preview.status,'renderer-gap');assert(!r.proposalHash);
    rendered.results.push({name:'bridge refuses 513 px without downsampling or fake bitmap',ok:true});
    postMessage({type:'complete',results:rendered.results,samples:rendered.samples.map(s=>({name:s.name,kind:s.kind,preview:s.preview}))});
  }catch(e){postMessage({type:'error',code:e.code,error:e.message+'\n'+(e.stack??'')});}
  finally{client.dispose();}
};
