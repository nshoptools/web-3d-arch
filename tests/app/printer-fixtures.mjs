// Synthetic sealed printer fixtures, never vendor/fit qualification or UI defaults.
import assert from 'node:assert/strict';
import {sealed,sha256} from '../../src/printing/src/contracts.mjs';
import {createPrinterProfileLibrary} from '../../src/app/printer-profiles.mjs';
export const bytes=text=>new TextEncoder().encode(text);
export const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};};
export async function profile(id='test-p1s',patch={}){
 return sealed({schemaVersion:1,id,label:'Synthetic P1S',adapterId:'export.3mf.bambu-project',
  slicer:{id:'BambuStudio',version:'02.08.02.60'},
  printer:{model:'Bambu Lab P1S',nozzleDiametersMm:[0.4],slotExtruders:[1],bedPolygonMm:[[0,0],[256,0],[256,256],[0,256]],maxZMm:256},
  settings:{printer_model:'Bambu Lab P1S',version:'02.08.02.60',nozzle_diameter:['0.4'],single_extruder_multi_material:'1',filament_colour:['#AABBCC'],filament_type:['PLA'],filament_diameter:['1.75']},
  source:{id:'synthetic-test-source',sha256:await sha256(bytes('Synthetic source, not a vendor profile.'))},rights:'internal-testing',...patch});
}
export const asFile=(record,name='profile.json',raw=bytes(JSON.stringify(record,null,3)+'\n'))=>({name,size:raw.byteLength,arrayBuffer:async()=>raw.slice().buffer});
export async function source(record,raw=bytes(JSON.stringify(record,null,3)+'\n'),filename='profile.json'){
 return {profileHash:record.sha256,sha256:await sha256(raw),filename,byteLength:raw.byteLength,encoding:'base64',data:Buffer.from(raw).toString('base64')};
}
export async function confirmation(promise){
 try{await promise;assert.fail('expected prepared confirmation');}catch(e){assert.equal(e.code,'PROFILE_CONFIRMATION_REQUIRED');assert.ok(e.confirmation?.retry);return e.confirmation.retry;}
}
export function rig(values={},options={}){
 // Explicit in-memory test doubles for context/write/download. HTTP tests use the real backend.
 let live={userId:'account-A',epoch:1,settings:{schemaVersion:1,revision:0,values:structuredClone(values)},etag:'"r0"'};
 const writes=[],downloads=[];
 const lib=createPrinterProfileLibrary({context:()=>live,
  write:async(values,capture)=>{writes.push(structuredClone(values));if(options.write)await options.write(values,capture);
   live={...live,settings:{schemaVersion:1,revision:live.settings.revision+1,values:{...live.settings.values,...structuredClone(values)}},etag:'"r'+(live.settings.revision+1)+'"'};if(options.afterWrite)await options.afterWrite(values,capture);},
  download:async(value)=>{downloads.push(value);if(options.download)await options.download(value);},
  ...(options.preflight?{preflight:options.preflight}:{}),onChange:options.onChange??(()=>{})});
 return {lib,writes,downloads,get live(){return live;},set live(v){live=v;},
  change(patch){live={...live,...patch};},sameValuesNext(){live={...live,settings:structuredClone(live.settings)};},
  async add(record){const c=await confirmation(lib.prepare(asFile(record)));await lib.accept(c.id,true);return c;}
 };
}
