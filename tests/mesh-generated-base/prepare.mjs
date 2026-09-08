import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {fixtureData} from '../text-app/fixture-data.mjs';
const root=fs.realpathSync(process.env.PROJECT_ROOT),run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);
assert.ok(run.startsWith(root+path.sep));const fixture=await fixtureData(root);
const assetRecords=[...fixture.assetRecords.values()],actualAssets=assetRecords.filter(x=>x.sha256===fixture.entries.inter.sha256);
fs.mkdirSync(path.join(run,'inputs/library'),{recursive:true});
for(const a of actualAssets){
 const p=fs.realpathSync(fixture.assetFiles.get(a.sha256));assert.ok(p.startsWith(root+path.sep));const b=fs.readFileSync(p);
 assert.equal(createHash('sha256').update(b).digest('hex'),a.sha256);assert.equal(b.length,a.bytes);
 fs.writeFileSync(path.join(run,'inputs/library',a.sha256),b,{flag:'wx'});
}
fs.writeFileSync(path.join(run,'inputs/source-fixture-v2.json'),JSON.stringify({catalog:fixture.catalog,assetRecords,actualAssets}),{flag:'wx'});
console.log(JSON.stringify({actualAssets,fixture:'tests/text-app/fixture-data.mjs',scope:'original Inter only; no catalog/model recapture campaign'}));
