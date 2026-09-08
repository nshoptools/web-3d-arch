import {createUnifiedPrinting} from '../src/unified.mjs';
import {inspect3MF} from '../src/zip-inspect.mjs';
import {sha256,sealed} from '../src/contracts.mjs';
function assert(ok,message){if(!ok)throw new Error(message);}
async function rejects(fn,code){let caught=false;try{await fn();}catch(e){assert(e.message.includes(code),'wrong error: '+e.message);caught=true;}assert(caught,'missing error '+code);}
export async function runUnifiedChecks(module,profiles,hb,fontBytes,sourceHashes){
 const records=[],files=[];
 const original={release:module._arch_snapshot_release,acquire:module._arch_snapshot_acquire,flat:module._arch3mf_add_part,bridge:module._arch3mf_add_snapshot_part};
 let releases=0,acquires=0,bridges=0,flatCalls=0,generation=0;
 module._arch_snapshot_release=(...a)=>{releases++;return original.release(...a);};
 module._arch_snapshot_acquire=(...a)=>{acquires++;return original.acquire(...a);};
 module._arch3mf_add_part=(...a)=>{flatCalls++;return original.flat(...a);};
 module._arch3mf_add_snapshot_part=(...a)=>{bridges++;return original.bridge(...a);};
 const binding=createUnifiedPrinting(module);assert(binding===createUnifiedPrinting(module),'one binding per module');
 const next=(index=0)=>{
  generation++;assert(module._arch_control_reset(generation)===1,'control reset');
  const id=module._arch_test_fixture(index,generation);assert(id>0,'snapshot build');
  return {id,generation,token:binding.adoptPrimaryLease(id,generation)};
 };
 function request(token,profile){
  const info=binding.describeLease(token);
  const materials=info.parts.map((p,i)=>({id:'material-'+i,name:'part material '+i,type:profile.payload.settings.filament_type[i],
   color:'#'+p.colorRgba.toString(16).padStart(8,'0').slice(0,6).toUpperCase(),slot:i+1,extruder:profile.payload.printer.slotExtruders[i]}));
  return {schemaVersion:1,purpose:'inspection',revision:'generation-'+token.generation,
   parts:info.parts.map((p,i)=>({partIndex:p.partIndex,id:'part-'+i,name:'kernel part '+i,materialId:'material-'+i})),
   materialTable:{schemaVersion:1,materials},printerProfile:profile,
   sourceHashes};
 }
 async function withSchedule(token,profile,first){
  const r=request(token,profile);
  r.schedule=await sealed({schemaVersion:1,kind:'constant-first-regular',profileId:profile.payload.id,profileHash:profile.sha256,
   firstLayerHeight:first,layerHeight:.2,origin:{firstLayerHeight:'user',layerHeight:'profile'}});
  return r;
 }
 try{
  assert(module._arch_abi_version()===2&&module._arch3mf_abi_version()===1,'ABI');
  assert(module.HEAPU8.buffer instanceof SharedArrayBuffer,'shared heap');
  hb.initializeHarfBuzz(module);
  const blob=new hb.Blob(fontBytes),face=new hb.Face(blob),font=new hb.Font(face);
  const shape=text=>{const b=new hb.Buffer();b.addText(text);b.guessSegmentProperties();hb.shape(font,b);return b.getGlyphInfosAndPositions();};
  const nfc=shape('Tiếng Việt'),nfd=shape('Tiếng Việt'.normalize('NFD'));
  assert(nfc.length>0&&nfc.every(g=>g.codepoint>0),'missing Vietnamese glyph');
  assert(JSON.stringify(nfc.map(g=>g.codepoint))===JSON.stringify(nfd.map(g=>g.codepoint)),'NFC/NFD shaping');
  records.push({test:'same-module HarfBuzz shaping',verdict:'pass',version:hb.versionString(),glyphs:nfc.length});
  const retained=next(0),before=module._arch_snapshot_ptr(retained.id),capacity=module.HEAPU8.byteLength;
  const grown=module._malloc(96*1024*1024);assert(grown>0,'growth allocation');module._free(grown);
  assert(module.HEAPU8.byteLength>capacity&&module._arch_snapshot_ptr(retained.id)===before,'retained pointer after growth');
  shape('Tiếng Việt');
  const oldRequest=await withSchedule(retained.token,profiles.bambu,.16);
  const releaseStart=releases;
  const old=await binding.exportSnapshot3MF(retained.token,oldRequest,{format:'core'});
  assert(releases===releaseStart+1&&acquires===0&&module._arch_snapshot_ptr(retained.id)===0,'primary released exactly once');
  assert(old.bytes.buffer instanceof ArrayBuffer&&!(old.bytes.buffer instanceof SharedArrayBuffer),'owned output');
  files.push({name:'unified-hole-core.3mf',bytes:old.bytes,shape:'hole'});const oldHash=await sha256(old.bytes);
  await rejects(()=>binding.exportSnapshot3MF(retained.token,oldRequest), 'LEASE_ALREADY_CONSUMED');
  assert(releases===releaseStart+1,'duplicate call must not release again');
  records.push({test:'primary lease, shared heap growth, owned output',verdict:'pass',heapBytes:module.HEAPU8.byteLength});
  for(const [profile,index,name,first] of [[profiles.bambu,1,'unified-seam-bambu',.16],[profiles.u1,2,'unified-t-junction-u1',.25]]){
   const lease=next(index),r=await withSchedule(lease.token,profile,first),count=releases;
   const result=await binding.exportSnapshot3MF(lease.token,r,{format:'project'});
   const parsed=await inspect3MF(result.bytes,{adapterId:profile.payload.adapterId});
   assert(parsed.meshes.length===index+1&&Number(parsed.settings.initial_layer_print_height)===first,'adapter snapshot mapping');
   assert(releases===count+1&&module._arch_snapshot_ptr(lease.id)===0,'adapter lease release');
   assert(result.metadata.manifest.kernelSnapshot.runtimeABI===2,'kernel provenance');
   files.push({name:name+'.3mf',bytes:result.bytes,shape:index===1?'seam':'t-junction'});
  }
  records.push({test:'same-kernel Bambu/U1 adapters and schedules',verdict:'pass'});
  const bad=next(),r=await withSchedule(bad.token,profiles.bambu,.16),count=releases;r.materialTable.materials[0].color='#FFFFFF';
  await rejects(()=>binding.exportSnapshot3MF(bad.token,r), 'SNAPSHOT_MATERIAL_COLOR');
  assert(releases===count+1&&module._arch_snapshot_ptr(bad.id)===0,'validation failure releases');
  records.push({test:'metadata failure never leaks primary lease or publishes output',verdict:'pass'});
  const secondary=next(),reader=binding.acquireReaderLease(secondary.id,secondary.generation);
  const rs=await withSchedule(reader,profiles.bambu,.16);
  await binding.exportSnapshot3MF(reader,rs);
  assert(module._arch_snapshot_ptr(secondary.id)>0,'secondary reader survives');
  await rejects(()=>binding.adoptPrimaryLease(secondary.id,secondary.generation),'PRIMARY_LEASE_ALREADY_ADOPTED');
  binding.releaseLease(secondary.token);assert(module._arch_snapshot_ptr(secondary.id)===0,'primary owner final release');
  records.push({test:'explicit export reader releases itself and preserves the primary owner',verdict:'pass'});
  const manual=next(),manualCount=releases;binding.releaseLease(manual.token);
  await rejects(()=>binding.releaseLease(manual.token),'LEASE_ALREADY_CONSUMED');
  assert(releases===manualCount+1,'manual token release only once');
  for(let i=0;i<10;i++){
   const lease=next(),meta=await withSchedule(lease.token,profiles.bambu,.16);
   await binding.exportSnapshot3MF(lease.token,meta);
   assert(module._arch_snapshot_len(lease.id)===0,'registry pressure lease leak');
  }
  // Exercise the production SVG entrypoint, including its consumed input handle.
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="10mm" height="10mm" viewBox="0 0 10 10"><path fill="#ff0000" d="M0 0H10V10H0Z"/></svg>';
  const inputBytes=new TextEncoder().encode(svg);generation++;
  assert(module._arch_control_reset(generation)===1,'SVG generation');
  const input=module._arch_input_create(inputBytes.length);assert(input>0,'SVG input');
  module.HEAPU8.set(inputBytes,module._arch_input_ptr(input));
  const svgId=module._arch_build_svg(input,10,10,.004,generation);assert(svgId>0,'production SVG build');
  assert(module._arch_input_ptr(input)===0,'build consumes input');
  const svgLease=binding.adoptPrimaryLease(svgId,generation);
  const svgRequest=await withSchedule(svgLease,profiles.bambu,.25);
  svgRequest.sourceHashes=[{id:'analytic-10mm.svg',sha256:await sha256(inputBytes)}];
  const svgResult=await binding.exportSnapshot3MF(svgLease,svgRequest,{format:'project'});
  assert(module._arch_snapshot_ptr(svgId)===0,'SVG primary released');
  files.push({name:'unified-svg-cube-bambu.3mf',bytes:svgResult.bytes,shape:'cube'});
  records.push({test:'production SVG API to leased snapshot to lib3MF with user .25 override',verdict:'pass'});
  assert(await sha256(old.bytes)===oldHash,'old output mutated by later jobs');
  assert(flatCalls===0&&bridges>0,'unified path staged flat mesh');
  records.push({test:'10 exports exceed registry capacity without leaks; no JS flat-mesh staging',verdict:'pass',flatCalls,bridgeCalls:bridges});
  return {records,files,releases,acquires,flatCalls,bridgeCalls:bridges,harfbuzzVersion:hb.versionString()};
 }finally{
  module._arch_snapshot_release=original.release;module._arch_snapshot_acquire=original.acquire;
  module._arch3mf_add_part=original.flat;module._arch3mf_add_snapshot_part=original.bridge;
 }
}
