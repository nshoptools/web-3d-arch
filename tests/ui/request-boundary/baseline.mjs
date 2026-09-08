import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';import {env,safe,write,sha} from './support.mjs';
/** Optional, explicit historical source; no fixed run/path dependency in the test suite. */
const {root,run}=env();if(!process.env.ARCH_UI_BASELINE_IDENTITY)throw Error('Set ARCH_UI_BASELINE_IDENTITY to the explicit historical identity.ts path inside this repository');
const source=safe(root,process.env.ARCH_UI_BASELINE_IDENTITY),b=fs.readFileSync(source),copy=path.join(run,'inputs/baseline/identity.ts');write(copy,b.toString('utf8'));
assert.deepEqual(fs.readFileSync(copy),b,'Historical source must be byte-preserved');
const old=await import(pathToFileURL(copy)),current=await import(pathToFileURL(safe(run,path.join(process.env.ARCH_UI_TEST_INPUT,'src/ui/core/identity.ts'))));
const a=new File([new Uint8Array([1,2])],'same.png',{type:'image/png',lastModified:1000}),other=new File([new Uint8Array([3,4])],'same.png',{type:'image/png',lastModified:1000});
const partsA=['a\u001fb','c'],partsB=['a','b\u001fc'];
assert.equal(old.fileKey(a),old.fileKey(other),'Historical file collision witness');assert.notEqual(current.fileKey(a),current.fileKey(other));
assert.equal(old.requestKey(partsA),old.requestKey(partsB),'Historical separator collision witness');assert.notEqual(current.requestKey(partsA),current.requestKey(partsB));
write(path.join(run,'evidence/ui-baseline.json'),{version:'arch-ui-baseline-witness/1',baselineSha256:sha(b),currentSha256:sha(fs.readFileSync(path.join(process.env.ARCH_UI_TEST_INPUT,'src/ui/core/identity.ts'))),fileMetadataIdentical:true,fileBytesDifferent:true,baselineFileCollision:true,baselineTupleCollision:true,currentDistinct:true,scope:'Two pure collision witnesses only; not a full historical React/browser run'});
console.log('2 historical collision witnesses reproduced; current captured identity separates both');
