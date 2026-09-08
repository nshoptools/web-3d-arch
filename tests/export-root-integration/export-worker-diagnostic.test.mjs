import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
// Execute the exact production catch body, supplying only its lexical inputs.
// This is a routing test, not a substitute for the actual STL error RPC test.
const source=await fs.readFile(new URL('../../src/core/engine-worker.mjs',import.meta.url),'utf8');
const start=source.indexOf('// Preserve only these final-file diagnostics;'),end=source.indexOf('\n  }',start);
assert.ok(start>0&&end>start,'focused production catch hunk is present');
const route=new Function('data','error','failure',source.slice(start,end));
test('Worker diagnostic hook: only two complete INVALID_SERIALIZATION suffixes on export-final are specialized',()=>{
 const proposal=Object.freeze({test:'opaque-existing-error-proposal'}),seen=[];
 const call=(type,code,message)=>{route({type,requestId:73},{code,message,proposal},(...args)=>seen.push(args));return seen.at(-1);};
 for(const suffix of ['STL_FLOAT_COLLISION','SECTION_SUBGRID_RAW_EDGE']){
  assert.deepEqual(call('export-final','INVALID_SERIALIZATION','INVALID_SERIALIZATION:'+suffix),[73,suffix,proposal]);
  for(const type of ['build','final-float-prepare','final-float-confirm','source-frame','export-3mf','unknown'])assert.deepEqual(call(type,'INVALID_SERIALIZATION','INVALID_SERIALIZATION:'+suffix),[73,'INVALID_SERIALIZATION',proposal]);
  for(const message of [suffix,' INVALID_SERIALIZATION:'+suffix,'INVALID_SERIALIZATION:'+suffix+'\n','INVALID_SERIALIZATION:'+suffix+'\r','INVALID_SERIALIZATION:'+suffix+'\nextra','INVALID_SERIALIZATION:'+suffix+':detail','prefix:INVALID_SERIALIZATION:'+suffix])assert.equal(call('export-final','INVALID_SERIALIZATION',message)[1],'INVALID_SERIALIZATION');
  assert.equal(call('export-final','CANCELLED','INVALID_SERIALIZATION:'+suffix)[1],'CANCELLED');
 }
 for(const message of ['INVALID_SERIALIZATION:STL_FLOAT_ERROR','INVALID_SERIALIZATION:STL_NONMANIFOLD','INVALID_SERIALIZATION','unknown'])assert.equal(call('export-final','INVALID_SERIALIZATION',message)[1],'INVALID_SERIALIZATION');
 assert.equal(call('export-final',undefined,'ENGINE_FAILURE')[1],'ENGINE_FAILURE');
});
