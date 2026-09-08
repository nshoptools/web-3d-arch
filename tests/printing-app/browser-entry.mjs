import {EngineClient} from '../../src/core/engine-client.mjs';
import {bindRuntime,SOURCE} from './runtime-fixture.mjs';
import {sha256} from '../../src/printing/src/contracts.mjs';
import {inspect3MF} from '../../src/printing/src/zip-inspect.mjs';
const need=(x,m)=>{if(!x)throw Error(m);};
globalThis.runPrintingBrowser=async({profiles,pins})=>{
 const records=[],files=[],client=new EngineClient({moduleURL:new URL('/module/arch-kernel.mjs',location.href),workerURL:new URL('/engine.mjs',location.href),watchdogMs:45000});
 let generation=0,sends=0;const original=client.export3MF.bind(client);client.export3MF=(...args)=>{sends++;return original(...args);};
 const operation=async(control,invoke)=>{
  const cancel=()=>{if(client.active)void client.cancel();};control.signal.addEventListener('abort',cancel,{once:true});
  try{need(!control.signal.aborted,'cancelled before dispatch');return await invoke(client,++generation);}
  finally{control.signal.removeEventListener('abort',cancel);}
 };
 const make=async profile=>{
  const root=await client.build({kind:'svg',source:SOURCE,thicknessMm:2,longEdgeMm:20,toleranceMm:.004},{generation:++generation});
  return bindRuntime({client,operation,root,profile,proof:{runtimeABI:2,printingABI:1,kernelPrintingABI:2,...pins,evidenceId:'exact-pinned-root-service-exercised-in-this-browser'}});
 };
 try{
  need(crossOriginIsolated,'COI');await client.start();const epoch=client.epoch;
  need(client.memory instanceof SharedArrayBuffer,'actual shared root memory');
  for(const [kind,profile,id]of [['bambu',profiles.bambu,'3mf-bambu-project'],['u1',profiles.u1,'3mf-snapmaker-project']]){
   const e=await make(profile);
   try{const before=await sha256(new Uint8Array(e.root.bytes())),r=await e.adapter.refresh();need(r.selection.status==='ready',JSON.stringify(r.selection));need(r.printers[0].qualified===false,'qualification');
    const count=sends,a=await e.exporter.export(e.input(id));need(sends===count+1,'exactly one send');
    const view=await inspect3MF(a.bytes,{adapterId:profile.payload.adapterId});need(view.meshes.length===2,'real parts');need(Number(view.settings.initial_layer_print_height)===.25,'actual first layer override');
    need(await sha256(new Uint8Array(e.root.bytes()))===before,'original root preserved');need(client.epoch===epoch,'same root runtime epoch');
    records.push({case:kind,status:'passed',bytes:a.bytes.length,sha256:await sha256(a.bytes),profileHash:view.manifest.profileHash,scheduleHash:view.manifest.scheduleHash,qualified:r.printers[0].qualified});
    files.push({name:kind+'.3mf',bytes:Array.from(a.bytes)});
   }finally{e.close();}
  }
  const e=await make(profiles.bambu);
  try{
   await e.adapter.refresh();const before=sends;e.auth.settings.revision++;
   let stale=false;try{await e.exporter.export(e.input('3mf-bambu-project'));}catch(error){stale=error.code==='PRINTING_REFRESH_REQUIRED';}
   need(stale&&sends===before,'stale profile must not dispatch');
   e.auth.settings.values.printerProfiles=[];e.auth.settings.revision++;await e.adapter.list();
   const a=await e.exporter.export(e.input('stl-union'));need(a.mimeType==='model/stl'&&a.bytes.length>84,'neutral fallback');
   files.push({name:'neutral.stl',bytes:Array.from(a.bytes)});records.push({case:'invalid-profile-blocks-only-dependent-target',status:'passed'});
   e.auth.settings.values.printerProfiles=[profiles.bambu];e.auth.settings.revision++;await e.adapter.refresh();
   const abort=new AbortController();abort.abort();let cancelled=false;try{await e.exporter.export(e.input('3mf-bambu-project',abort.signal));}catch(error){cancelled=error.code==='CANCELLED';}
   need(cancelled&&sends===before,'cancel before send');e.adapter.reset();need(e.adapter.describe('export.3mf.bambu-project',e.current).status!=='ready','reset invalidation');
   records.push({case:'cancel-and-private-reset',status:'passed'});
  }finally{e.close();}
  return {status:'passed',records,files,rootRuntimeInitializations:1,rootEpoch:client.epoch,printingSends:sends,serviceCapabilityPrintingBit:client.serviceCapabilities.printing??null,actualParentRPC:true,syntheticSceneAuthority:true,qualified:false,fit:'unqualified'};
 }finally{client.dispose();}
};
