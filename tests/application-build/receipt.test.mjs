import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateEngineBuild} from '../../tools/application/engine-build.mjs';
import {pin} from '../../tools/application/core.mjs';
import {directory,write} from './helpers.mjs';
const inputPath=process.env.APPLICATION_BUILD_INPUT;assert.ok(inputPath,'Explicit pinned application input required');
const input=JSON.parse(readFileSync(inputPath)),original=JSON.parse(readFileSync(input.engine.buildReceipt.file));
test('canonical production receipt checks actual source, log, output and incoming API pins',()=>{
 const result=validateEngineBuild(input.engine,input.sourceRoot);assert.equal(result.receipt.sha256,input.engine.buildReceipt.sha256);assert.equal(result.files.length,11);assert.ok(result.incomingModuleApi.includes('wasmBinary'));assert.equal(result.actualWorkerIntegrity,'requires-separate-execution-evidence');
});
for(const [name,change,code]of [
 ['different output hash',r=>r.outputs.module.sha256='f'.repeat(64),'ENGINE_BUILD_OUTPUT'],
 ['different actual build source hash',r=>r.buildInputs[0].sha256='f'.repeat(64),'INPUT_INTEGRITY'],
 ['omitted incoming wasmBinary',r=>r.incomingModuleApi=r.incomingModuleApi.filter(k=>k!=='wasmBinary'),'ENGINE_INCOMING_API'],
 ['failed native command',r=>r.exitCode=1,'ENGINE_BUILD_RECEIPT'],
 ['credential path in log list',r=>r.logs[0].path='customer/user.keys','ENGINE_BUILD_LOGS']
])test('receipt rejects '+name,()=>{
 const r=structuredClone(original);change(r);const root=directory('receipt'),file=write(root,'changed-build-receipt.json',JSON.stringify(r)),engine={...input.engine,buildReceipt:pin(file)};
 assert.throws(()=>validateEngineBuild(engine,input.sourceRoot),e=>e.code===code);
});
