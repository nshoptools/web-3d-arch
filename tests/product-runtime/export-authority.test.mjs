import test from 'node:test';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {source,makeRequest} from './fixtures.mjs';import {createProductOperations,readProductHead,readProductSemantics} from '../../src/core/product-operations.mjs';
import {encodeFinalExportOptions,exportFinalFileBytes} from '../../src/kernel/final-scene-export/runtime-helper.mjs';
import {modulePath} from './environment.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),M=await(await import(pathToFileURL(modulePath))).default({print:()=>{},printErr:()=>{}}),ops=createProductOperations(M);let generation=0;
const reset=()=>{assert.equal(M._arch_control_reset(++generation),1);return generation;};
const bytes=id=>new Uint8Array(M.HEAPU8.subarray(M._arch_snapshot_ptr(id),M._arch_snapshot_ptr(id)+M._arch_snapshot_len(id)));
function build(product,changes=[]){const packed=makeRequest(product,'noi',{sourceHash:hash(source),headHash:hash(JSON.stringify({product,changes})),changes}).packed,g=reset();return ops.buildRequest(ops.prepare({kind:'product',source:{kind:'svg',source},packed},g),g);}
function options(id){const b=bytes(id),v=new DataView(b.buffer),meta=ops.metadata(id),head=readProductHead(meta.descriptor),sem=readProductSemantics(meta.semanticBytes),at=v.getUint32(56,true);
 return {format:1,generation:v.getUint32(16,true),gates:0,verdict:1,inspection:0,revision:head.revision,expectedRevision:head.revision,filename:'Checked snapshot authority',
  mapping:sem.parts.map((p,i)=>({part:i,slot:p.slot,rgba:v.getUint32(at+i*40+16,true),source:v.getUint32(at+i*40+20,true),materialSource:i+1,reserved:0}))};}
test('R3: immutable product payload blocks assembly even with omitted caller gates and inspection',()=>{
 for(const[product,field]of [['charm','charmRap'],['clicky','assemble']]){const id=build(product,[{id:field,value:true}]),before=hash(bytes(id));
  try{assert.equal(readProductSemantics(ops.metadata(id).semanticBytes).exportBlocked,true);const base=options(id);
   for(const format of [1,2,3])for(const inspection of [0,1])assert.throws(()=>exportFinalFileBytes(M,id,encodeFinalExportOptions({...base,format,inspection}),reset()),{code:'ASSEMBLY_VIEW'});
   assert.equal(M._arch_export_stl(id,0,reset()),0);assert.equal(new TextDecoder().decode(M.HEAPU8.subarray(M._arch_error_ptr(),M._arch_error_ptr()+M._arch_error_len())),'ASSEMBLY_VIEW');
   assert.equal(hash(bytes(id)),before);
  }finally{assert.equal(M._arch_snapshot_release(id),1);}}
});
test('R3: two matching invented revisions cannot relabel a product snapshot',()=>{
 const id=build('keychain'),before=hash(bytes(id));try{const base=options(id),invented='9007199254741235';assert.notEqual(base.revision,invented);
  for(const format of [1,2,3])assert.throws(()=>exportFinalFileBytes(M,id,encodeFinalExportOptions({...base,format,revision:invented,expectedRevision:invented}),reset()),{code:'STALE_REVISION'});
  const valid=exportFinalFileBytes(M,id,encodeFinalExportOptions(base),reset());assert.ok(valid.bytes.length>84);assert.equal(valid.metadata.sourceProjectRevision,base.revision);assert.equal(hash(bytes(id)),before);
 }finally{assert.equal(M._arch_snapshot_release(id),1);}
});
