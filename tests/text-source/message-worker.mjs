// Test-only message boundary around the production adapter; host still owns the revision.
import * as hb from '/parent/harfbuzz-engine.mjs';
import {createFontSourceWithHarfBuzz} from '/parent/font-source-core.mjs';
import {createTextSourceAdapter} from '../../src/input/index.mjs';
let adapter,revision=3;
self.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const module=await import('/engine/arch-kernel.mjs'),engine=await module.default();hb.initializeHarfBuzz(engine);
      const fixture=await(await fetch('/fixture/config.json')).json();
      adapter=createTextSourceAdapter({collections:fixture.collections,
        readBytes:async ref=>new Uint8Array(await(await fetch('/asset/'+ref.sha256)).arrayBuffer()),
        createFontSource:(bytes,entry)=>createFontSourceWithHarfBuzz(bytes,entry,hb)});
      postMessage({type:'ready'});return;
    }
    if(data.type==='cancel'){adapter.cancel(data.id);return;}
    if(data.type==='revision'){revision=data.revision;return;}
    if(data.type==='prepare'){
      const result=await adapter.prepare(data.command,{isCurrent:t=>t.sourceId==='source-fixture'&&t.revision===revision,
        onProgress:p=>postMessage({type:'progress',id:data.command.id,...p})});
      postMessage({type:'prepared',result,stats:adapter.stats()});
    }
  }catch(e){postMessage({type:'error',code:e.code,message:e.message,stats:adapter?.stats()});}
};
