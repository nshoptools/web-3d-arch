import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {fixtureData} from '../text-app/fixture-data.mjs';
const root=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),f=await fixtureData(root);
const wanted=new Set([f.entries.inter.sha256,f.entries.colr.sha256,...f.catalog.previews.filter(p=>p.collectionId==='noto-color-emoji'&&p.itemId==='1f600').map(p=>p.sha256)]);
const actualAssets=[...f.assetRecords.values()].filter(a=>wanted.has(a.sha256));
assert.equal(actualAssets.length,3);fs.mkdirSync(path.join(run,'inputs/library'),{recursive:true});
for(const a of actualAssets){
 const p=fs.realpathSync(f.assetFiles.get(a.sha256));assert.ok(p.startsWith(root+path.sep));const b=fs.readFileSync(p);
 assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256);assert.equal(b.length,a.bytes);
 fs.writeFileSync(path.join(run,'inputs/library',a.sha256),b,{flag:'wx'});
}
fs.writeFileSync(path.join(run,'inputs/source-fixture-v2.json'),JSON.stringify({catalog:f.catalog,assetRecords:[...f.assetRecords.values()],actualAssets,selection:{emoji:'😀',itemId:'1f600',collection:'noto-color-emoji',colorFont:f.entries.colr}}),{flag:'wx'});
console.log(JSON.stringify({actualAssets,colorFont:f.entries.colr,scope:'one original COLRv1 emoji plus catalog preview; original Inter only as required default'},null,2));
