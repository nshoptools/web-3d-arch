import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import assert from 'node:assert/strict';
import {environment,safe,sha256,cliArgs,writeJSON} from '../../tools/assets/source-library/common.mjs';
const a=cliArgs(['--library','--output','--python']),{root,run}=environment(),library=safe(root,path.resolve(a['--library'])),output=safe(run,path.resolve(a['--output']),{exists:false});
assert.ok(!fs.existsSync(output),'Choose a fresh reproduction directory');
const {buildSourceLibrary}=await import(pathToFileURL(path.join(library,'tools/assets/source-library/build.mjs')));
await buildSourceLibrary({output,python:a['--python']});
function tree(base,rel='src/assets/source-library'){
 const full=safe(root,path.join(base,rel));return fs.readdirSync(full,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).flatMap(e=>{
  if(e.isSymbolicLink())throw Error('Reparse output');const next=rel+'/'+e.name;if(e.isDirectory())return tree(base,next);
  const b=fs.readFileSync(path.join(base,next));return [{file:next,bytes:b.length,sha256:sha256(b)}];
 });
}
const expected=tree(library),actual=tree(output);assert.deepEqual(actual,expected,'All generated catalog/CLDR/PNG bytes must reproduce');
const result={version:'arch-source-library-reproduction/1',status:'pass',fileCount:actual.length,bytes:actual.reduce((n,r)=>n+r.bytes,0),fileListSha256:sha256(Buffer.from(JSON.stringify(actual))),scope:'Two fresh offline builds on the exact pinned native binaries. Cross-OS PNG-byte parity is not claimed.'};
writeJSON(run,path.join(run,'evidence/source-library-reproduction.json'),result);console.log(JSON.stringify(result));
