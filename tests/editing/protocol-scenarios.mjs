import {VERSION,encodeUndo,decodeUndo} from '../../src/editing/index.mjs';
import {bitmap,palette} from './fixtures.mjs';
import {assert,equal,bytes,source,rejects} from './suite.mjs';

export async function runProtocol(){
  const worker=new Worker('/src/editing/worker.mjs',{type:'module'}),pending=new Map(),progress=[];
  let sequence=0,onProgress=()=>{};
  worker.onmessage=({data})=>{
    if(data.type==='progress'){progress.push(data);onProgress(data);return;}
    const slot=pending.get(data.requestId);if(!slot)return;
    clearTimeout(slot.timer);pending.delete(data.requestId);
    if(data.type==='error')slot.reject(Object.assign(Error(data.error.message),data.error));else slot.resolve(data.result);
  };
  worker.onerror=event=>{for(const slot of pending.values()){clearTimeout(slot.timer);slot.reject(Error(event.message));}pending.clear();};
  const rpc=(type,fields={},transfer=[])=>new Promise((resolve,reject)=>{
    const requestId='rpc/'+(++sequence);
    const timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Worker RPC timeout '+type));},20000);
    pending.set(requestId,{resolve,reject,timer});worker.postMessage({type,requestId,...fields},transfer);
  });
  try{
    const original=bitmap(Array(128).fill('R'.repeat(128))),proof=original.data.slice();
    const initialized=await rpc('init',{input:{source,image:original}},[original.data.buffer]);
    equal(original.data.byteLength,0,'Caller intentionally transferred input');
    let token=initialized.token;
    await rejects(()=>rpc('init',{input:{source,image:bitmap(['R'])}}),'ALREADY_INITIALIZED');
    const c={version:VERSION,id:'worker/line',expected:token,tool:'line',points:[{x:.5,y:.5},{x:127.5,y:.5}],color:palette.B};
    const prepared=await rpc('prepare',{command:c});
    equal((await rpc('snapshot')).token,token);prepared.image.data.fill(33);
    await rejects(()=>rpc('commit',{gestureId:c.id,expected:{...token,sourceId:'other'}}),'REVISION_CONFLICT');
    const committed=await rpc('commit',{gestureId:c.id,expected:token});
    equal(committed.changedPixels,128);equal(committed.token.revision,1);
    const stored=encodeUndo(committed.undo),undone=await rpc('replay',{payload:decodeUndo(stored),direction:'undo',expected:committed.token});
    bytes(undone.image.data,proof);token=undone.token;
    const redone=await rpc('replay',{payload:decodeUndo(stored),direction:'redo',expected:token});token=redone.token;
    bytes(redone.image.data,committed.image.data);
    const cancelledCommand={version:VERSION,id:'worker/cancel',expected:token,tool:'paint',seeds:[{x:1,y:1}],color:palette.G};
    let cancelRequest=null;
    onProgress=message=>{if(!cancelRequest&&message.progress.phase==='select-region')cancelRequest=rpc('cancel',{gestureId:cancelledCommand.id});};
    await rejects(()=>rpc('apply',{command:cancelledCommand,control:{checkpointWork:256}}),'CANCELLED');
    assert((await cancelRequest).cancelled);onProgress=()=>{};
    const afterCancel=await rpc('snapshot');equal(afterCancel.token,token);bytes(afterCancel.image.data,redone.image.data);
    const draft={...cancelledCommand,id:'worker/draft'};
    await rpc('prepare',{command:draft});assert((await rpc('cancel',{gestureId:draft.id})).cancelled);
    await rejects(()=>rpc('commit',{gestureId:draft.id,expected:token}),'NO_TRANSACTION');
    await rejects(()=>rpc('apply',{command:{...draft,id:'worker/budget'},control:{maxWork:1}}),'RESOURCE_LIMIT');
    const sourceSnapshot=await rpc('snapshot',{original:true});bytes(sourceSnapshot.image.data,proof);
    const last=await rpc('snapshot');equal(last.token,token);
    return {passed:true,rpcRequests:sequence,progressMessages:progress.length,sourceHash:sourceSnapshot.hash,
      finalHash:token.hash,finalRevision:token.revision,transferredInput:true,
      scenarios:['transfer ownership','one init','provisional preparation','stale source at commit','commit',
        'serialized whole-gesture undo','redo','message cancellation while working','discard draft','resource rollback','original proof']};
  }finally{
    worker.terminate();for(const slot of pending.values())clearTimeout(slot.timer);
  }
}
