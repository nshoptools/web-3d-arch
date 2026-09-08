import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {COLOR_BRIDGE_VERSION,createColorRendererClient,attachMainThreadColorRenderer} from '../../src/input/index.mjs';
import {Work} from '../../src/input/source-contract.mjs';
import {assert,equal,rejects} from './shared-suite.mjs';
const token={sourceId:'source-fixture',revision:3};
const base=()=>({kind:'COLRv1',width:5,height:5,fontHash:'a'.repeat(64),fontBytes:new Uint8Array([1,2,3]),
  bounds:{minX:0,minY:0,maxX:1,maxY:1,width:1,height:1},paint:{paletteIndex:0,foreground:{red:0,green:0,blue:0,alpha:255},operations:[{op:'solid'}]},
  text:'😀',variations:{},emMm:1,unitsPerEm:1024,advanceMm:1});
const work=options=>new Work(token,{isCurrent:()=>true,...options});
function connection(options={}){
  const channel=new MessageChannel(),client=createColorRendererClient(channel.port1,options);channel.port2.start();
  return {client,port:channel.port2,close(){client.dispose();channel.port2.close();}};
}
const next=port=>new Promise(resolve=>{port.onmessage=e=>resolve(e.data);});
const reply=(port,id,fill=7)=>port.postMessage({version:COLOR_BRIDGE_VERSION,type:'result',requestId:id,result:{width:5,height:5,rgba:new Uint8Array(100).fill(fill),pixelToSourceMm:[1,0,0,1,0,0]}});
const tests=[],results=[],test=(name,fn)=>tests.push({name,fn});
test('bridge transfers owned copy and preserves source bytes/expected token',async()=>{
  const c=connection(),input=base();
  try{const request=next(c.port),job=c.client.render(input,work()),message=await request;
    equal(message.expected,token);equal(input.fontBytes.byteLength,3);equal(Array.from(message.payload.fontBytes),[1,2,3]);assert(!message.payload.paint.operations);
    reply(c.port,message.requestId);const result=await job;assert(result.rgba instanceof Uint8Array);equal(result.rgba[0],7);
  }finally{c.close();}
});
test('bridge rejects oversize before posting or changing resolution',async()=>{
  const c=connection();let called=false;c.port.onmessage=()=>called=true;
  try{await rejects(()=>c.client.render({...base(),width:513},work()),'RENDERER_GAP');equal(called,false);}finally{c.close();}
});
test('bridge rejects paint complexity beyond main budget',async()=>{
  const c=connection();try{const input=base();input.paint.operations=Array(4097).fill({op:'solid'});
    await rejects(()=>c.client.render(input,work()),'RENDERER_GAP');
  }finally{c.close();}
});
test('bridge has one outstanding request and no queue',async()=>{
  const c=connection();try{
    const request=next(c.port),first=c.client.render(base(),work()),message=await request;
    await rejects(()=>c.client.render(base(),work()),'RENDERER_GAP');
    reply(c.port,message.requestId);await first;
  }finally{c.close();}
});
test('bridge polls cancellation while waiting and informs main endpoint',async()=>{
  const c=connection(),abort=new AbortController();try{
    const request=next(c.port),job=c.client.render(base(),work({signal:abort.signal}));await request;
    const cancel=next(c.port);abort.abort();await rejects(()=>job,'CANCELLED');equal((await cancel).type,'cancel');
  }finally{c.close();}
});
test('bridge polls stale source while waiting',async()=>{
  const c=connection();let current=true;try{
    const request=next(c.port),job=c.client.render(base(),work({isCurrent:()=>current}));await request;
    current=false;await rejects(()=>job,'STALE_SOURCE');
  }finally{c.close();}
});
test('bridge deadline produces explicit renderer gap and cancellation',async()=>{
  const c=connection({deadlineMs:20});try{
    const request=next(c.port),job=c.client.render(base(),work());await request;
    const cancel=next(c.port);await rejects(()=>job,'RENDERER_GAP');equal((await cancel).type,'cancel');
  }finally{c.close();}
});
test('bridge ignores responses for other request IDs',async()=>{
  const c=connection();try{
    const request=next(c.port),job=c.client.render(base(),work()),message=await request;
    reply(c.port,message.requestId+100,9);reply(c.port,message.requestId,42);
    equal((await job).rgba[0],42);
  }finally{c.close();}
});
test('disposing a bridge cancels waiting work and forbids reuse',async()=>{
  const c=connection();try{
    const request=next(c.port),job=c.client.render(base(),work());await request;c.client.dispose();
    await rejects(()=>job,'CANCELLED');await rejects(()=>c.client.render(base(),work()),'RENDERER_GAP');
  }finally{c.close();}
});
test('main endpoint has an explicit non-browser capability gap',async()=>{
  const c=connection();try{await rejects(async()=>attachMainThreadColorRenderer(c.port,{engine:'node',version:process.version,sources:[],isCurrent:()=>true}),'RENDERER_GAP');}finally{c.close();}
});
for(const t of tests){try{await t.fn();results.push({name:t.name,ok:true});}catch(e){results.push({name:t.name,ok:false,error:e.stack??String(e)});}console.log((results.at(-1).ok?'ok ':'not ok ')+t.name);if(!results.at(-1).ok)console.log(results.at(-1).error);}
const result={passed:results.filter(r=>r.ok).length,total:results.length,results};
await writeFile(await (await import('./test-environment.mjs')).testOutput('evidence/bridge-client-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,total:result.total}));
if(result.passed!==result.total)process.exitCode=1;
