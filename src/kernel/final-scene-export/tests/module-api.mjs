import {pack,configuration} from './options.mjs';
const need=(v,message)=>{if(!v)throw Error(message)};
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export function api(M){
 let generation=0;
 const bytes=(ptr,len)=>M.HEAPU8.slice(ptr,ptr+len);
 const error=()=>new TextDecoder().decode(bytes(M._arch_error_ptr(),M._arch_error_len()));
 const next=()=>{need(M._arch_control_reset(++generation)===1,'generation reset');return generation;};
 const state=()=>Array.from(M.HEAPU32.subarray(M._arch_control_ptr()/4,M._arch_control_ptr()/4+4));
 const input=b=>{const id=M._arch_input_create(b.length);need(id>0,'input create');M.HEAPU8.set(b,M._arch_input_ptr(id));return id;};
 const source=index=>{const g=next(),id=M._arch_final_test_fixture(index,g);need(id>0,error());return {id,g};};
 const exportOne=(s,c,{cancel=false,stale=false,oldCancel=false}={})=>{
  const options=input(pack(c));const g=next();if(cancel)Atomics.store(M.HEAPU32,M._arch_control_ptr()/4+3,g);if(oldCancel)Atomics.store(M.HEAPU32,M._arch_control_ptr()/4+3,g-1);
  const id=M._arch_export_final(s.id,options,stale?g-1:g);const consumed=M._arch_input_release(options)===0;const e=error();
  return {id,g,consumed,error:e,phase:state()[1],progress:state()[2]};
 };
 const output=id=>({bytes:bytes(M._arch_final_output_ptr(id),M._arch_final_output_len(id)),metadata:JSON.parse(new TextDecoder().decode(bytes(M._arch_final_output_metadata_ptr(id),M._arch_final_output_metadata_len(id))))});
 const snapshot=id=>bytes(M._arch_snapshot_ptr(id),M._arch_snapshot_len(id));
 const stats=()=>Array.from({length:5},(_,i)=>M._arch_final_test_stats(i));
 return {M,bytes,error,next,state,input,source,exportOne,output,snapshot,stats};
}
export function runCase(A,test){
 const s=A.source(test.fixture),before=A.snapshot(s.id);const c={...test.config,generation:test.expect.keepGeneration?test.config.generation:s.g};
 const r=A.exportOne(s,c),unchanged=hex(A.snapshot(s.id))===hex(before);
 const result={ok:r.id>0,error:r.error,sourceUnchanged:unchanged,inputConsumed:r.consumed,phase:r.phase,progress:r.progress,layout:Array.from({length:7},(_,i)=>A.M._arch_final_native_layout(i)),metadata:null};
 let bytes;
 if(r.id){const out=A.output(r.id);bytes=out.bytes;result.metadata=out.metadata;}
 need(A.M._arch_snapshot_release(s.id)===1,'source primary release');
 need(A.M._arch_snapshot_ptr(s.id)===0,'internal source pin released');
 if(r.id){need(A.M._arch_final_output_ptr(r.id)>0,'output survives source release');need(A.M._arch_final_output_release(r.id)===1,'output release');need(A.M._arch_final_output_release(r.id)===0,'double output release rejected');}
 need(A.stats().every(n=>n===0),'all root charges and registries returned to zero');
 return {result,bytes,config:c};
}
export function ownership(A){
 const M=A.M,checks=[];const ok=(value,name)=>{need(value,name);checks.push(name)};
 const s=A.source(2),before=hex(A.snapshot(s.id));const c=configuration(2,{generation:s.g});
 const good=A.exportOne(s,c);ok(good.id>0,'initial final output');const out=A.output(good.id);const ptr=M._arch_final_output_ptr(good.id);
 ok(M._arch_final_output_acquire(good.id)===ptr,'additional output lease');
 ok(M._arch_output_release(good.id)===0&&M._arch_snapshot_release(good.id)===0&&M._arch_input_release(good.id)===0,'wrong handle kinds cannot release final output');
 const legacyGeneration=A.next(),legacy=M._arch_export_stl(s.id,0,legacyGeneration);ok(legacy>0,'legacy per-part exporter remains callable');
 const legacyBytes=hex(A.bytes(M._arch_output_ptr(legacy),M._arch_output_len(legacy)));ok(M._arch_final_output_release(legacy)===0,'final release cannot release legacy output');
 const cancelled=A.exportOne(s,c,{cancel:true});ok(cancelled.id===0&&cancelled.error==='CANCELLED'&&cancelled.phase===4&&cancelled.consumed,'cancel atomic with consumed options');
 const stale=A.exportOne(s,c,{stale:true});ok(stale.id===0&&stale.error==='STALE_GENERATION'&&stale.consumed,'stale job consumed input, no output');
 const recovered=A.exportOne(s,c,{oldCancel:true});ok(recovered.id>0,'old-generation cancellation does not cancel new export');M._arch_final_output_release(recovered.id);
 const invalid=A.exportOne(s,{...c,gates:4,inspection:1});ok(!invalid.id&&invalid.error==='ASSEMBLY_VIEW','inspection cannot bypass assembly gate');
 ok(hex(A.snapshot(s.id))===before,'prior source immutable through cancel/error');ok(hex(A.output(good.id).bytes)===hex(out.bytes),'prior final output immutable through cancel/error');
 ok(hex(A.bytes(M._arch_output_ptr(legacy),M._arch_output_len(legacy)))===legacyBytes,'prior legacy output immutable');
 const oldMemory=M.HEAPU8.buffer;const growth=M._malloc(128*1024*1024);ok(growth!==0,'memory growth allocation');
 ok(M.HEAPU8.buffer!==oldMemory,'memory.grow refreshed Module views');ok(hex(A.output(good.id).bytes)===hex(out.bytes),'leased final output survives growth');M._free(growth);
 const held=[];for(let i=0;i<3;i++){const r=A.exportOne(s,c);ok(r.id>0,`output slot ${i+2}`);held.push(r.id)}
 const limit=A.exportOne(s,c);ok(!limit.id&&limit.error==='FINAL_OUTPUT_RESOURCE_LIMIT','bounded output registry');
 ok(hex(A.output(good.id).bytes)===hex(out.bytes),'output cap failure preserves earlier reader');for(const id of held)M._arch_final_output_release(id);
 ok(M._arch_snapshot_release(s.id)===1&&M._arch_snapshot_ptr(s.id)===0,'source primary released, no retained internal pin');
 ok(M._arch_final_output_release(good.id)===1&&M._arch_final_output_ptr(good.id)===ptr,'extra output lease remains');
 ok(M._arch_final_output_release(good.id)===1&&M._arch_final_output_ptr(good.id)===0,'last output release invalidates pointer');
 ok(M._arch_output_release(legacy)===1,'legacy output still releasable');ok(A.stats().every(n=>n===0),'all byte charges/registries released');
 return {checks,passed:checks.length};
}
