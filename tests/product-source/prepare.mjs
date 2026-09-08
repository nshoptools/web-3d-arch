import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {fixtureData} from '../text-app/fixture-data.mjs';
const root=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),modulePath=fs.realpathSync(process.env.PRODUCT_APP_MODULE);
assert.ok(run.startsWith(root+path.sep)&&modulePath.startsWith(root+path.sep));
const digest=b=>createHash('sha256').update(b).digest('hex'),pins=[];
function put(bytes,relative,source){const target=path.resolve(run,relative);assert.ok(target.startsWith(run+path.sep));fs.mkdirSync(path.dirname(target),{recursive:true});assert.ok(fs.realpathSync(path.dirname(target)).startsWith(run+path.sep));fs.writeFileSync(target,bytes,{flag:'wx'});pins.push({path:relative,source,bytes:bytes.length,sha256:digest(bytes)});}
const fixture=await fixtureData(root),fontHashes=new Set([...Object.values(fixture.entries).map(f=>f.sha256),fixture.catalog.fonts.find(f=>f.id==='bevietnampro').sha256]);
const assetRecords=[...fixture.assetRecords.values()],actualAssets=assetRecords.filter(r=>fontHashes.has(r.sha256)||r.mediaType==='image/svg+xml');
assert.ok(actualAssets.length>=4&&actualAssets.length<=64);
for(const a of actualAssets){const original=fs.realpathSync(fixture.assetFiles.get(a.sha256));assert.ok(original.startsWith(root+path.sep));const b=fs.readFileSync(original);assert.equal(b.length,a.bytes);assert.equal(digest(b),a.sha256);put(b,'inputs/library/'+a.sha256,path.relative(root,original).split(path.sep).join('/'));}
const legalDirs=['src/assets/fonts/licenses','src/assets/emoji/licenses','src/assets/emoji/color/licenses'];
function legal(dir,prefix){for(const e of fs.readdirSync(dir,{withFileTypes:true})){assert.ok(!e.isSymbolicLink());const p=path.join(dir,e.name),rel=prefix+'/'+e.name;if(e.isDirectory())legal(p,rel);else put(fs.readFileSync(p),'inputs/retained/'+rel,rel);}}
for(const dir of legalDirs)legal(path.join(root,dir),dir);
put(Buffer.from(JSON.stringify({catalog:fixture.catalog,assetRecords,actualAssets,initialState:fixture.initialState},null,2)+'\n'),'inputs/source-fixture.json','checked portable fixture');
put(Buffer.from(JSON.stringify({catalog:fixture.catalog,assetRecords,actualAssets,initialState:fixture.initialState},null,2)+'\n'),'inputs/source-fixture-v2.json','generated from current checked source catalogs and labelled test selection');
for(const ext of ['mjs','wasm']){const from=modulePath.replace(/\.mjs$/,'.'+ext);assert.ok(fs.realpathSync(from).startsWith(root+path.sep));put(fs.readFileSync(from),'work/module/arch-kernel.'+ext,path.relative(root,from).split(path.sep).join('/'));}
put(Buffer.from(JSON.stringify({version:1,fixtureProducer:'tests/text-app/fixture-data.mjs',actualAssets,pins},null,2)+'\n'),'reports/portable-inputs.json','input manifest');
console.log(JSON.stringify({actualAssets:actualAssets.length,assetRecords:assetRecords.length,stagedFiles:pins.length}));
