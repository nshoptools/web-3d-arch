import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parseArgs,discoverRepo,loadContext,loadStage,ownPath,allocateBrowserProfile,chromiumProfileBudget} from './runner-env.mjs';
const scriptDir=dirname(fileURLToPath(import.meta.url)),runtime=dirname(dirname(scriptDir)),stage=JSON.parse(await readFile(join(runtime,'stage.json'),'utf8'));
test('run id must be explicit, bounded and unambiguous',()=>{
 for(const args of [[],['--run-id',''],['--run-id','../other'],['--run-id','a','--run-id','b'],['--unknown','x'],['--run-id','x'.repeat(81)]])assert.throws(()=>parseArgs(args));
 assert.equal(parseArgs(['--run-id','portable_run-2'])['run-id'],'portable_run-2');
});
test('nested tests AGENTS is not the repository root',async()=>{
 const dir=await mkdtemp(join(stage.temporaryDirectory,'root-discovery-')),nested=join(dir,'tests');await mkdir(nested);
 await writeFile(join(nested,'AGENTS.md'),'Test fixture only. This is not the repository root.');
 assert.equal(await discoverRepo(nested),stage.repoRoot);assert.equal(await discoverRepo(scriptDir),stage.repoRoot);
});
test('runner rejects a mismatched run or escaping output before staging',async()=>{
 await assert.rejects(()=>loadContext('unrelated-run',{start:scriptDir}),{code:'RUN_SCOPE_MISMATCH'});
 await assert.rejects(()=>ownPath(stage.temporaryDirectory,join(stage.temporaryDirectory,'..','escape')),{code:'PATH_OUTSIDE_ROOT'});
 const context=await loadContext(stage.runId,{start:scriptDir});assert.equal((await loadStage(runtime,context)).stageId,stage.stageId);
});
test('stage includes app/backend helpers from pinned main inputs, fixtures, and exactly pinned Three bytes',async()=>{
 const required=['src/app/index.mjs','src/server/app.mjs','tests/server/helpers.mjs','tests/server/fixtures/manifest.json','src/editing/worker.mjs','src/contracts/app-bridge.ts','vendor/three/three.module.js','vendor/three/three.core.js','vendor/three/OrbitControls.js'];
 for(const path of required){const f=stage.files.find(f=>f.path===path);assert.ok(f,path);const b=await readFile(join(runtime,path));assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);}
 assert.equal((stage.files.find(f=>f.path==='src/app/index.mjs').origin??stage.files.find(f=>f.path==='src/app/index.mjs').source),'src/app/index.mjs');
 assert.equal((stage.files.find(f=>f.path==='tests/server/helpers.mjs').origin??stage.files.find(f=>f.path==='tests/server/helpers.mjs').source),'tests/server/helpers.mjs');
 assert.ok(stage.files.filter(f=>f.path.startsWith('vendor/three/')).every(f=>(f.origin??f.source).startsWith('.toolchain/app-runtime/node_modules/three/')));
});
test('stage CLI without run id fails before allocating another runtime',async()=>{
 const stageParent=dirname(dirname(runtime)),before=(await readdir(stageParent)).sort();
 const child=spawnSync(process.execPath,[join(scriptDir,'stage.mjs')],{cwd:scriptDir,env:process.env,encoding:'utf8',timeout:10000,windowsHide:true});
 assert.ifError(child.error);assert.notEqual(child.status,0);assert.match(child.stderr,/RUN_ID_REQUIRED/);
 assert.deepEqual((await readdir(stageParent)).sort(),before);
});

test('profile allocation is fresh, tied to stage bytes, and remains in the owning run',async()=>{
 const context=await loadContext(stage.runId,{start:scriptDir}),origin='https://127.0.0.1:54321';
 const a=await allocateBrowserProfile(context,stage,'chromium',origin),b=await allocateBrowserProfile(context,stage,'chromium',origin);
 assert.notEqual(a.path,b.path);assert.equal(a.stageDigest,b.stageDigest);assert.ok(a.relativePath.startsWith('p/'));
 assert.ok(a.estimatedLevelDBManifestLength<=240);await ownPath(context.run,a.path);
 const changed=await allocateBrowserProfile(context,{...stage,files:[...stage.files,{path:'TEST-change',sha256:'f'.repeat(64)}]},'chromium',origin);
 assert.notEqual(changed.stageDigest,a.stageDigest);
 await assert.rejects(()=>allocateBrowserProfile(context,stage,'other',origin),{code:'BROWSER_SELECTION'});
});
test('Windows profile budget fails before a path can reach the observed native boundary',()=>{
 const origin='https://127.0.0.1:54321';
 assert.throws(()=>chromiumProfileBudget('x'.repeat(186),origin,{platform:'win32'}),{code:'PROFILE_PATH_BUDGET'});
 const usable=chromiumProfileBudget('x'.repeat(160),origin,{platform:'win32'});assert.ok(usable.estimatedLevelDBManifestLength<=240);
 assert.throws(()=>chromiumProfileBudget('x','https://example.com:443',{platform:'win32'}),{code:'PROFILE_LOOPBACK_ORIGIN'});
});
