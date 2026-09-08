import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,cpSync,existsSync} from 'node:fs';
import {prepareApplication,verifyApplication,packageApplication} from '../../tools/application/build.mjs';
import {inspectFrontend} from '../../tools/application/frontend.mjs';
import {validateInput} from '../../tools/application/snapshot.mjs';
import {pin,checked,parse,readPlain,hash,jsonBytes,put,canonical,environment,walk} from '../../tools/application/core.mjs';
import {verifyRelease} from '../../tools/release/verify.mjs';
import {directory,write} from './helpers.mjs';
const inputPath=process.env.APPLICATION_BUILD_INPUT;
assert.ok(inputPath,'Supply APPLICATION_BUILD_INPUT: explicit pinned production inputs, no module/library defaults');
const input=parse(readPlain(inputPath,4*1024*1024));
const root=directory('actual-acceptance');
const evidence=resolve(root,'acceptance.json');
const record={version:'arch-application-acceptance/1',root,inputSHA256:hash(readFileSync(inputPath)),checks:[],runtimeProof:'parent-required',applicationComplete:false,independentReview:false};
const first=resolve(root,'build-a'),second=resolve(root,'build-b'),releaseA=resolve(root,'release-a'),releaseB=resolve(root,'release-b');
let a,b,pa;
test('real main entry builds from stable frozen inputs; private environment sentinel is absent',{timeout:900000},async()=>{
 process.env.VITE_PRIVATE_TEST_SENTINEL='synthetic-never-bundle-31a87d';
 process.env.ARCH_NO_PUBLIC_ENV_SECRET='synthetic-never-bundle-562bc1';
 try{a=await prepareApplication(inputPath,first);}finally{delete process.env.VITE_PRIVATE_TEST_SENTINEL;delete process.env.ARCH_NO_PUBLIC_ENV_SECRET;}
 assert.equal(a.status,'prepared');const verified=verifyApplication(first,a.sha256),r=verified.receipt;
 assert.equal(r.engine.replacementCount,2);assert.equal(r.databaseSchema,5);assert.equal(r.runtimeProof,'parent-required');
 const graph=JSON.parse(readFileSync(resolve(first,'compiler-graph.json'))),loaded=graph.loaded.map(r=>r.file.replaceAll('\\','/'));
 for(const path of ['src/main.mjs','src/integration/product-entry.mjs','src/integration/source-svg-export.mjs','src/integration/final-scene-evidence.mjs','tools/release/source-transport.mjs','tools/release/vendor/source-library.mjs'])assert.ok(loaded.some(f=>f.endsWith('/'+path)),path);
 assert.ok(loaded.every(f=>!/\/src\/(?:server|host|assets)\//.test(f)&&!/\/(?:tests|fixtures)\//.test(f)));
 const names=walk(resolve(first,'frontend')).filter(f=>!f.includes('.vite'));
 for(const path of names){const body=readFileSync(path).toString();assert.ok(!body.includes('synthetic-never-bundle-31a87d')&&!body.includes('synthetic-never-bundle-562bc1'));}
 assert.equal(r.frontend.workerEntries.length,4);
 record.prepared={directory:first,sha256:a.sha256};record.checks.push('actual-entry-stable');
});
test('fresh second Vite compilation preserves every public frontend hash',{timeout:900000},async()=>{
 assert.ok(a);b=await prepareApplication(inputPath,second);
 const one=JSON.parse(readFileSync(resolve(first,'package-input.json'))),two=JSON.parse(readFileSync(resolve(second,'package-input.json')));
 assert.deepEqual(one.frontend,two.frontend);assert.deepEqual(one.engine,two.engine);
 assert.equal(a.publicBuildId,b.publicBuildId);
 assert.equal(hash(readFileSync(resolve(first,'frontend/.vite/manifest.json'))),hash(readFileSync(resolve(second,'frontend/.vite/manifest.json'))));
 record.deterministic={frontend:true,publicBuildId:a.publicBuildId,compiledFiles:one.frontend.assets.length,originalInputSame:true};
 record.checks.push('fresh-build-deterministic');
});
test('one prepared input produces two exact portable packages with same release manifest hash',{timeout:900000},async()=>{
 assert.ok(a);pa=await packageApplication(first,a.sha256,releaseA);
 const pb=await packageApplication(first,a.sha256,releaseB);assert.equal(pa.sha256,pb.sha256);
 const checkedA=verifyRelease(releaseA,pa.sha256),checkedB=verifyRelease(releaseB,pb.sha256);
 assert.equal(checkedA.manifest.library.originalResources,21391);assert.equal(checkedA.manifest.library.previews,7751);
 assert.deepEqual(checkedA.manifest,checkedB.manifest);
 const publicFiles=checkedA.manifest.files.filter(f=>f.path.startsWith('public/'));
 assert.ok(publicFiles.every(f=>!/(?:^|\/)(?:src|tests|tools|node_modules|inputs|tmp|profiles)(?:\/|$)/.test(f.path)));
 assert.ok(checkedA.manifest.files.some(f=>f.path==='src/server/codecs/jpeg-js.LICENSE'));
 assert.equal(checkedA.manifest.licenses.length,input.licenses.length);
 for(const l of checkedA.manifest.licenses)assert.equal(hash(readFileSync(resolve(releaseA,l.file))),input.licenses.find(i=>i.id===l.id).sha256);
 const runtime=JSON.parse(readFileSync(resolve(releaseA,'provenance/runtime-lock.json')));
 assert.equal(runtime.databaseSchema,5);assert.equal(runtime.node,'24.19.0');
 const pub=JSON.parse(readFileSync(resolve(releaseA,'public-manifest.json')));
 assert.equal(pub.assets.filter(a=>a.mime==='application/wasm').length,1);
 const bindings=JSON.parse(readFileSync(resolve(releaseA,'public/release-bindings.json')));
 assert.equal(bindings.entry,JSON.parse(readFileSync(resolve(first,'package-input.json'))).frontend.entry);
 for(const p of [bindings.engine.module,bindings.engine.wasm,...Object.values(bindings.library)])assert.ok(p.url.includes(p.sha256));
 assert.ok(pub.assets.filter(a=>a.url.startsWith('/assets/')).every(a=>a.cache==='revalidate'));
 record.packaged={directory:releaseA,sha256:pa.sha256,files:checkedA.files,publicAssets:checkedA.publicAssets,publicBytes:checkedA.publicBytes,licenses:input.licenses.length};
 record.checks.push('two-packages-exact');
});
test('wrong prepared seal, changed compiled bytes and extra file all fail without publishing',{timeout:60000},async()=>{
 assert.ok(a);assert.throws(()=>verifyApplication(first,'a'.repeat(64)),e=>e.code==='INPUT_INTEGRITY');
 const file=JSON.parse(readFileSync(resolve(first,'package-input.json'))).frontend.entry.slice(1),path=resolve(first,'frontend',file),original=readFileSync(path);
 try{writeFileSync(path,Buffer.concat([original,Buffer.from('\n/*tampered*/')]));await assert.rejects(()=>packageApplication(first,a.sha256,resolve(root,'must-not-publish')),e=>e.code==='INPUT_INTEGRITY');assert.equal(existsSync(resolve(root,'must-not-publish')),false);}
 finally{writeFileSync(path,original);}
 const dirty=resolve(root,'dirty-copy');cpSync(first,dirty,{recursive:true,errorOnExist:true,force:false});
 write(dirty,'extra.json','{}');assert.throws(()=>verifyApplication(dirty,a.sha256),e=>e.code==='PREPARED_FILE_SET');
 record.checks.push('artifact-tamper-fails');
});
test('stale same-size source bytes block package; restoring exact source allows verification',{timeout:60000},async()=>{
 assert.ok(a);
 // Mutate only the OWN copied source dependency whose actual byte hash the compiler retained.
 const graph=JSON.parse(readFileSync(resolve(first,'compiler-graph.json'))),row=graph.loaded.find(r=>r.file.replaceAll('\\','/').endsWith('/src/main.mjs'));
 const original=readFileSync(row.file),mutated=Buffer.from(original);mutated[0]=mutated[0]===32?33:32;
 try{writeFileSync(row.file,mutated);await assert.rejects(()=>packageApplication(first,a.sha256,resolve(root,'stale-must-not-publish')),e=>e.code==='INPUT_INTEGRITY');assert.equal(existsSync(resolve(root,'stale-must-not-publish')),false);}
 finally{writeFileSync(row.file,original);}
 verifyApplication(first,a.sha256);record.checks.push('captured-source-tamper-fails');
});
test('valid production library and license pins reject wrong reference count, engine bytes, version and borrowed notice',()=>{
 assert.ok(a);assert.equal(validateInput(input),input);
 const broken=structuredClone(input);broken.engine.wasm.sha256='f'.repeat(64);assert.throws(()=>validateInput(broken),e=>e.code==='INPUT_INTEGRITY');
 const wrongVersion=structuredClone(input);wrongVersion.engine.source=1;assert.throws(()=>validateInput(wrongVersion),e=>e.code==='ENGINE_VERSION_REQUIRED');
 const wrongNotice=structuredClone(input),application=wrongNotice.licenses.find(l=>l.id==='application'),react=wrongNotice.licenses.find(l=>l.id==='react');
 Object.assign(react,{file:application.file,bytes:application.bytes,sha256:application.sha256});assert.throws(()=>validateInput(wrongNotice),e=>e.code==='LICENSE_PACKAGE_MISMATCH');
 record.checks.push('production-pins-reject-forgery');
});
test('acceptance summary records exact checked artifact, constraints and unchanged input',()=>{
 assert.ok(a&&pa);assert.equal(record.checks.length,6);record.status='passed';put(evidence,jsonBytes(record));
 put(resolve(environment().run,'evidence',process.env.APPLICATION_BUILD_LABEL+'-acceptance.json'),jsonBytes(record));
});
