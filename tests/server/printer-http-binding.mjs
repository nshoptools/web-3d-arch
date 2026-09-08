// Production manager + real backend HTTP. Only UI/download/context are test bindings.
import assert from 'node:assert/strict';
import {createPrinterProfileLibrary} from '../../src/app/printer-profiles.mjs';
export async function httpLibrary(client,{afterWrite}={}){
 let c=null;const downloads=[];
 async function read(next=client,epoch=(c?.epoch??0)+1){
  client=next;const r=await client.request('GET','/api/v1/settings');assert.equal(r.status,200);
  c={userId:client.user.id,epoch,settings:r.json,etag:r.headers.get('etag')};return c;
 }
 await read();
 const lib=createPrinterProfileLibrary({context:()=>c,
  write:async(values,base)=>{
   assert.equal(base.settings,c.settings);assert.equal(base.epoch,c.epoch);assert.equal(base.etag,c.etag);
   const r=await client.request('PUT','/api/v1/settings',{schemaVersion:1,values:{...base.settings.values,...values}},{'If-Match':base.etag});
   if(r.status!==200)throw Object.assign(new Error(r.json.error.code),{code:r.json.error.code,status:r.status,details:r.json.error.details});
   c={...c,settings:r.json,etag:r.headers.get('etag')};if(afterWrite)await afterWrite(c);
  },
  download:async v=>downloads.push({...v,bytes:v.bytes.slice()})});
 await lib.refresh();return {lib,downloads,read,get c(){return c;}};
}
