import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {inputFixture,write,dir,run,candidate} from './helpers.mjs';
import {buildRelease} from '../../tools/release/build.mjs';
import {verifyRelease} from '../../tools/release/verify.mjs';
import {hash,jsonBytes,inside} from '../../tools/release/core.mjs';

test('two fresh builds of identical explicit inputs have identical manifest and every output hash',async()=>{
 const f=inputFixture(),a=await f.build(),second=resolve(f.root,'second-artifact');
 const b=await buildRelease(f.inputPath,second);
 assert.equal(a.result.sha256,b.sha256);
 assert.deepEqual(readFileSync(resolve(a.directory,'release-manifest.json')),readFileSync(resolve(second,'release-manifest.json')));
 const doc=JSON.parse(readFileSync(resolve(second,'release-manifest.json')));
 assert.equal(doc.databaseSchema,5);assert.equal(doc.applicationQualification,'parent-required');
 assert.ok(doc.files.some(r=>r.path==='src/server/recovery.mjs'));
 assert.ok(doc.files.some(r=>r.path==='src/server/runtime-operations.mjs'));
 assert.ok(doc.files.some(r=>r.path==='src/server/codecs/jpeg-js.LICENSE'));
 assert.ok(doc.files.some(r=>r.path==='licenses/application/'+f.input.licenses[0].sha256+'.txt'));
 assert.ok(doc.files.filter(r=>r.path.startsWith('public/')).every(r=>!/(?:server|provider|auth|tests|tmp|keys)/.test(r.path)));
 assert.ok(!readFileSync(resolve(second,'release-manifest.json'),'utf8').includes(run));
 assert.equal(verifyRelease(second,b.sha256).files,doc.files.length);
});
test('portable artifact verifies from its own tools after compiled source directory is moved',async()=>{
 const f=inputFixture(),a=await f.build(),moved=resolve(f.root,'moved-package'),oldSource=resolve(f.root,'held-build');
 assert.ok(inside(run,moved)&&inside(run,oldSource));renameSync(a.directory,moved);renameSync(f.front,oldSource);
 const r=spawnSync(process.execPath,[resolve(moved,'tools/release/cli.mjs'),'verify',moved,a.result.sha256],
 {encoding:'utf8',env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},windowsHide:true,timeout:30000});
 assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'verified');
});
const invalid=[
 ['missing exact input',f=>{f.input.frontend.assets[0].file='missing.html';},'ENOENT'],
 ['different bytes under previously pinned hash',f=>{writeFileSync(resolve(f.front,'entry.mjs'),'different');},'INPUT_INTEGRITY'],
 ['unknown recipe/test switch',f=>{f.input.testOnly=true;},'CONFIG_FIELDS_INVALID'],
 ['private customer key input rejected before opening',f=>{f.input.frontend.assets[0].file='customeruser.keys';},'MIME_REJECTED'],
 ['private provider module is never public',f=>{f.input.frontend.assets[1].file='providers/entry.mjs';},'PRIVATE_BUILD_INPUT'],
 ['different relative module binary request',f=>{f.input.engine.binaryRequest='different.wasm';},'MODULE_BINARY_REFERENCE'],
 ['missing module reference',f=>{f.input.engine.moduleUrl='/missing.mjs';},'PUBLIC_REFERENCE'],
 ['invalid genuine WASM with a matching encoded-byte pin',f=>{const r=write(f.front,'engine.wasm','not wasm');Object.assign(f.input.frontend.assets.find(a=>a.file==='engine.wasm'),r);},'WASM_INVALID'],
 ['malformed compiled JavaScript is parsed without running it',f=>{const r=write(f.front,'entry.mjs','export const = ;');Object.assign(f.input.frontend.assets.find(a=>a.file==='entry.mjs'),r);},'COMPILED_MODULE_INVALID'],
 ['missing static import',f=>{const r=write(f.front,'entry.mjs',"import './absent.mjs';");Object.assign(f.input.frontend.assets.find(a=>a.file==='entry.mjs'),r);},'PUBLIC_REFERENCE'],
 ['dangling declared Worker/fetch reference',f=>{f.input.frontend.references.push({from:'/entry.mjs',to:'/absent.bin'});},'PUBLIC_REFERENCE'],
 ['unapproved source map',f=>{const r=write(f.front,'entry.mjs','globalThis.x=1;\\n//# sourceMappingURL=entry.map');Object.assign(f.input.frontend.assets.find(a=>a.file==='entry.mjs'),r);},'SOURCEMAP_REFERENCE_REJECTED'],
 ['unlisted library digest',f=>{f.input.library.catalog.sha256='0'.repeat(64);},'INPUT_INTEGRITY'],
 ['forged runtime lock selection',f=>{f.input.runtimeLock.sha256='0'.repeat(64);},'INPUT_INTEGRITY'],
 ['missing license binding',f=>{f.input.frontend.assets[0].licenseIds=['absent'];},'LICENSE_REFERENCE'],
 ['casefold URL collision',f=>{const a={...f.input.frontend.assets[1],url:'/ENTRY.mjs'};f.input.frontend.assets.push(a);},'MANIFEST_DUPLICATE']
];
for(const [label,modify,code]of invalid)test('fail before publication: '+label,async()=>{
 const f=inputFixture();modify(f);f.save();
 await assert.rejects(buildRelease(f.inputPath,f.output),e=>e.code===code||code==='ENOENT'&&e.code==='ENOENT');
 assert.equal(existsSync(f.output),false);
});
test('output overwrite and path escape are refused; failed verify identifies changed/extra bytes',async()=>{
 const f=inputFixture(),a=await f.build();
 await assert.rejects(buildRelease(f.inputPath,f.output),{code:'OUTPUT_EXISTS'});
 await assert.rejects(buildRelease(f.inputPath,resolve(run,'outside-room-slot')),{code:'OUTPUT_OUTSIDE_RUN'});
 assert.throws(()=>verifyRelease(f.output,'0'.repeat(64)),{code:'RELEASE_MANIFEST_INTEGRITY'});
 writeFileSync(resolve(f.output,'unexpected.keys'),'not a real credential');
 assert.throws(()=>verifyRelease(f.output,a.result.sha256),{code:'PACKAGE_FILE_SET'});
 const g=inputFixture(),b=await g.build();writeFileSync(resolve(g.output,'public/entry.mjs'),'changed');
 assert.throws(()=>verifyRelease(g.output,b.result.sha256),{code:'PACKAGE_FILE_INTEGRITY'});
});
test('private unlisted build-root siblings are never read or copied, and CLI failures redact paths',async()=>{
 const f=inputFixture();writeFileSync(resolve(f.front,'customeruser.keys'),'SYNTHETIC-DO-NOT-PUBLISH');
 const r=await f.build();const m=JSON.parse(readFileSync(resolve(r.directory,'release-manifest.json')));
 assert.ok(!m.files.some(x=>x.path.includes('customeruser')));
 const child=spawnSync(process.execPath,[resolve(candidate,'tools/release/cli.mjs'),'build',resolve(f.root,'SECRET-PATH.json'),resolve(f.root,'failed')],
 {env:process.env,encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(child.status,1);assert.deepEqual(JSON.parse(child.stderr),{error:'ENOENT'});
 assert.ok(!child.stdout.includes('SYNTHETIC')&&!child.stderr.includes('SECRET-PATH'));
});
