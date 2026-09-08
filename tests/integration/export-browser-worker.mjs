import {serviceTransport,setup,sourceSVG} from './export-fixture.mjs';
import {stlOracle,sectionOracle,zipOracle,near} from './export-oracles.mjs';
import {inspect3MF} from '../../src/printing/src/zip-inspect.mjs';
import {sha256} from '../../src/printing/src/contracts.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
const equal=(a,b,m)=>check(JSON.stringify(a)===JSON.stringify(b),m);
self.onmessage=async({data})=>{
 try{
  const create=(await import(/* @vite-ignore */ '/engine/arch-kernel.mjs')).default,M=await create(),T=serviceTransport(M),records=[],files=[];
  check(crossOriginIsolated&&M.HEAPU8.buffer instanceof SharedArrayBuffer,'COI/shared heap');
  check(M._arch_abi_version()===2&&M._arch_final_export_version()===1&&M._arch3mf_abi_version()===1,'same-Module services');
  const execute=async(id,config,fn)=>{const h=await setup(T,{profiles:data.profiles,...config});try{const detail=await fn(h);records.push({id,verdict:'pass',detail:detail??null});}finally{h.close();equal(T.stats(),[0,0,0,0,0],'root registries after '+id);}};
  const save=(name,a)=>{files.push({name,bytes:a.bytes,metadata:a.metadata});};
  await execute('union-overlap',{index:0},async h=>{const before=await sha256(h.root.bytes().slice()),a=await h.exporter.export(h.input('stl-union')),o=stlOracle(a.bytes);near(o.volume,1500);equal(o.bbox,[0,0,0,15,10,10],'union bounds');check(await sha256(h.root.bytes().slice())===before,'root preserved');save('union.stl',a);return o;});
  await execute('material-grouping',{index:12},async h=>{const a=await h.exporter.export(h.input('stl-material-zip')),o=zipOracle(a.bytes);check(o.groups.length===2,'two slot/color groups');near(o.groups[0].volume,2000);near(o.groups[1].volume,1000);save('materials.zip',a);return o.groups;});
  await execute('final-blind-bore-sections',{index:3},async h=>{h.exportOptions['svg-section'].section={mode:'sequence',startMm:1,endMm:3,stepMm:2,side:'front',units:'mm',color:'black'};const a=await h.exporter.export(h.input('svg-section')),o=sectionOracle(a.bytes);near(o.samples[0].area,184);near(o.samples[1].area,200);equal(o.samples.map(s=>s.rings),[2,1],'section opening');save('sections.svg',a);return o;});
  await execute('pattern-down',{index:7},async h=>{h.exportOptions['stl-union'].pose={kind:'pattern-down-x',restOnBed:true};const a=await h.exporter.export(h.input('stl-union')),o=stlOracle(a.bytes);near(o.volume,120);equal(o.bbox,[1,-7,0,5,-2,6],'resting Z');save('pattern-down.stl',a);return o;});
  await execute('reflection',{index:7},async h=>{h.exportOptions['stl-union'].pose={kind:'isometry',restOnBed:true,matrix:[-1,0,0,0,0,1,0,0,0,0,1,0]};const a=await h.exporter.export(h.input('stl-union')),o=stlOracle(a.bytes);near(o.volume,120);equal(o.bbox,[-5,2,0,-1,7,6],'reflected coordinates/normals');save('reflection.stl',a);return o;});
  await execute('committed-source-provider-double',{model:false},async h=>{const calls=T.counters.operations,a=await h.exporter.export(h.input('svg-color'));check(new TextDecoder().decode(a.bytes)===sourceSVG,'original paint/curves');check(T.counters.operations===calls,'no mesh dispatch for source');save('source.svg',a);});
  await execute('portable-PNG-encoder-frame-double',{model:false},async h=>{const a=await h.exporter.export(h.input('png-viewport'));save('viewport.png',a);return {bytes:a.bytes.length,sha256:await sha256(a.bytes)};});
  await execute('revision-zero-viewport',{model:false},async h=>{h.state.revision=0;h.frame.displayedRevision=0;const input=h.input('png-viewport');input.ticket.revision=0;const a=await h.exporter.export(input);check(a.metadata.revision===0&&a.metadata.service.frame.displayedRevision===0,'revision zero PNG');});
  for(const id of ['3mf-bambu-project','3mf-snapmaker-project'])await execute(id,{index:12,firstLayerHeight:id.includes('bambu')?.16:.25},async h=>{
   const a=await h.exporter.export(h.input(id)),re=await inspect3MF(a.bytes,{adapterId:'export.'+id.replace('3mf-','3mf.')}),m=re.meshes;
   check(m.length===3,'project geometry parts');const volumes=m.map(p=>p.faces.reduce((s,f)=>{const [a,b,c]=f.map(i=>p.vertices[i]);return s+(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;},0));volumes.forEach(v=>near(v,1000));
   near(Number(re.settings.initial_layer_print_height),id.includes('bambu')?.16:.25);check(re.manifest.materials.length===2,'material aliases');check(a.metadata.qualification.slicer==='unverified','no slicer claim');save(id+'.3mf',a);return {volumes,firstLayerHeight:Number(re.settings.initial_layer_print_height)};
  });
  const reject=async(h,id,code)=>{let caught;try{await h.exporter.export(h.input(id));}catch(e){caught=e.code;}check(caught===code,`expected ${code}, got ${caught}`);return {code};};
  await execute('upstream-invalid-blocks-even-inspection',{},async h=>{h.exportOptions['stl-union'].inspection=true;h.evidence.gates.invalidInput=true;const before=T.counters.final,r=await reject(h,'stl-union','INVALID_INPUT');check(T.counters.final===before,'no dispatch');return r;});
  await execute('native-cancel-keeps-source',{},async h=>{const before=await sha256(h.root.bytes().slice());T.before.operation=async(_,g)=>Atomics.store(M.HEAPU32,M._arch_control_ptr()/4+3,g);const r=await reject(h,'stl-union','CANCELLED');check(await sha256(h.root.bytes().slice())===before,'source preserved after native cancel');return r;});
  await execute('stale-source-acquire-release',{model:false},async h=>{const count=T.counters.providerReleases;T.before.acquire=async()=>h.source.key='next';const r=await reject(h,'svg-color','EXPORT_PROVIDER_STALE');check(T.counters.providerReleases===count+1,'release source');return r;});
  await execute('PNG-frame-change-release',{model:false},async h=>{const count=T.counters.frameReleases;T.before.capture=async()=>h.frame.frameKey='camera:next';const r=await reject(h,'png-viewport','EXPORT_PROVIDER_STALE');check(T.counters.frameReleases===count+1,'release PNG');return r;});
  await execute('cleanup-session-race',{model:false},async h=>{T.before.release=async()=>h.context.sessionKey={next:true};return reject(h,'png-viewport','EXPORT_CONTEXT_STALE');});
  postMessage({ok:true,records,files,rootStats:T.stats(),sameModule:true,transport:'explicit test double over actual native services; not parent EngineClient RPC qualification'},files.map(f=>f.bytes.buffer));
 }catch(e){postMessage({ok:false,error:e.stack});}
};
