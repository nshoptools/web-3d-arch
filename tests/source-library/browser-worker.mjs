import {materializeSourceLibrary} from '/stage/src/integration/source-library.mjs';
import {createSourceCatalog,createAssetReader} from '/stage/src/integration/source-catalog.mjs';
self.onmessage=async({data})=>{
 const checks=[];const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
 try{
  const [catalog,manifest]=await Promise.all(['catalog.json','deployment.json'].map(f=>fetch('/deploy/source-library/'+f).then(r=>{if(!r.ok)throw Error('HTTP config');return r.json();})));
  const config=materializeSourceLibrary({catalog,manifest,origin:location.origin,basePath:'/deploy/'}),api=createSourceCatalog(config);
  check(api.queryFonts().length===catalog.fonts.filter(f=>!f.color).length,'all text+mono font choices');check(api.queryEmoji('viet nam').entries.some(i=>i.text==='🇻🇳'),'Vietnamese accent folding');
  for(const c of catalog.collections){let count=0;for(let offset=0;offset<c.items.length+c.components.length;offset+=64)count+=api.queryEmoji('',c.id,offset).entries.length;check(count===c.items.length+c.components.length,c.id+' full page coverage');}
  const reader=createAssetReader({...config,fetchImpl:fetch});
  for(const id of ['inter','notoemoji','noto-colrv1']){const f=api.font(id),b=await reader(f);check(b.length===f.bytes,'verified original font '+id);}
  const previews=[];
  for(const c of catalog.collections){
   for(const id of ['1f600','1f1fb-1f1f3','1f3fb']){
    const p=api.emoji(id,c.id).preview,b=await reader(p);check(b.length===p.bytes,'verified preview '+c.id+'/'+id);previews.push({label:c.id+'/'+id,bytes:b.buffer,width:p.width,height:p.height});
   }
  }
  const corrupted=structuredClone(manifest);corrupted.records[0].url='../escape';let rejected=false;try{materializeSourceLibrary({catalog,manifest:corrupted,origin:location.origin});}catch{rejected=true;}check(rejected,'unsafe deployment rejected');
  const abort=new AbortController();abort.abort();let cancelled=false;try{await reader(api.font('inter'),{signal:abort.signal});}catch(e){cancelled=e.code==='CANCELLED';}check(cancelled,'cancel before asset read');
  self.postMessage({ok:true,checks,previews},previews.map(p=>p.bytes));
 }catch(error){self.postMessage({ok:false,error:error.stack??String(error),checks});}
};
