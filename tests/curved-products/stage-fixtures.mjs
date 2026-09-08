import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {gunzipSync} from 'node:zlib';
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN),repo=fs.realpathSync(process.env.PROJECT_ROOT);assert.ok(run.startsWith(repo+path.sep));
const from=path.join(path.dirname(fileURLToPath(import.meta.url)),'fixtures'),to=path.join(run,'inputs/corpus-production'),manifest=JSON.parse(fs.readFileSync(path.join(from,'manifest.json')));
assert.equal(manifest.version,1);assert.equal(manifest.files.length,80);fs.mkdirSync(to,{recursive:true});const sha=b=>createHash('sha256').update(b).digest('hex');
for(const row of manifest.files){assert.match(row.output,/^(text|emoji)-(keychain|clicky|strap|lego|charm)-(noi|chim|phang|phang2)\.(arch|aprq)$/);assert.equal(row.path,row.output+'.gz');
 const compressed=fs.readFileSync(path.join(from,row.path));assert.equal(sha(compressed),row.compressedSha256);const raw=gunzipSync(compressed,{maxOutputLength:2*1024*1024});assert.equal(raw.length,row.bytes);assert.equal(sha(raw),row.sha256);
 const dest=path.join(to,row.output);if(fs.existsSync(dest))assert.equal(sha(fs.readFileSync(dest)),row.sha256,'existing capture differs');else fs.writeFileSync(dest,raw);
}console.log('PASS 80 exact production ARCH/APRQ captures staged');
