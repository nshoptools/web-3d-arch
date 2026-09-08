import test from 'node:test';import assert from 'node:assert/strict';
import {createBrowserDownload} from '../../src/integration/download.mjs';
test('consecutive models and receipts retain live download URLs and stay bounded until reset',async()=>{
 const original={URL:globalThis.URL,document:globalThis.document,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 const live=new Set(),timers=new Map(),clicks=[];let id=0;
 globalThis.URL={createObjectURL:()=>{const u='blob:owned-'+(++id);live.add(u);return u;},revokeObjectURL:u=>{assert.ok(live.delete(u));}};
 globalThis.setTimeout=(fn,ms)=>{assert.equal(ms,30000);const n=++id;timers.set(n,fn);return n;};globalThis.clearTimeout=n=>timers.delete(n);
 globalThis.document={body:{appendChild(){}},createElement:()=>({click(){assert.ok(live.has(this.href));clicks.push(this.download);},remove(){}})};
 const signal=new AbortController().signal,d=createBrowserDownload(),save=name=>d.save({bytes:new Uint8Array(10),mimeType:'application/octet-stream',filename:name,signal});
 try{
  for(let i=0;i<3;i++){await save('model-'+i+'.stl');await save('model-'+i+'.json');}
  assert.equal(clicks.length,6);assert.equal(live.size,6,'existing downloads were not revoked to admit the next receipt');
  for(let i=6;i<32;i++)await save('receipt-'+i+'.json');
  await assert.rejects(save('bounded.json'),{code:'DOWNLOAD_BUSY'});assert.equal(live.size,32);
  d.reset();assert.equal(live.size,0);assert.equal(timers.size,0);await save('after-reset.stl');
  const timer=[...timers.values()][0];timer();assert.equal(live.size,0);assert.equal(timers.size,0);
  const abort=new AbortController();abort.abort();await assert.rejects(d.save({bytes:new Uint8Array(1),filename:'cancelled.stl',signal:abort.signal}),{code:'CANCELLED'});
 }finally{d.reset();Object.assign(globalThis,original);}
});
