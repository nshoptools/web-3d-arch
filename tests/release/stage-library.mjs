// Reconstruct a checked deployment from explicitly supplied, integrated immutable source-library inputs.
import {resolve,dirname} from 'node:path';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {setImmediate as yieldTurn} from 'node:timers/promises';
import {materializeSourceLibrary,checkedLibraryPath} from '../../tools/release/vendor/source-library.mjs';
import {environment,outputPath,plainPath,inside,readPlain,hash,parse,jsonBytes,need} from '../../tools/release/core.mjs';
const [sourceRoot,rawOutput]=process.argv.slice(2),root=plainPath(sourceRoot),output=outputPath(rawOutput);
need(inside(environment().root,root)&&!existsSync(output),'LIBRARY_STAGE_PATH');
const configs={},files=[],configFiles=[];
for(const name of ['catalog','deployment','artwork','build-receipt']){
 const file='source-library/'+name+'.json',bytes=readPlain(resolve(root,'src/assets',file),64*1024*1024);
 configs[name]=bytes;configFiles.push({url:file,bytes:bytes.length,sha256:hash(bytes)});
}
const catalog=parse(configs.catalog),manifest=parse(configs.deployment);
materializeSourceLibrary({catalog,manifest,origin:'https://release.invalid'});
mkdirSync(output);
let i=0;for(const r of manifest.records){
 checkedLibraryPath(r.file);const source=plainPath(resolve(root,r.file));need(inside(root,source),'SOURCE_ESCAPE');
 const bytes=readPlain(source,16000000);need(bytes.length===r.bytes&&hash(bytes)===r.sha256,'SOURCE_INTEGRITY');
 const file=resolve(output,r.url);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes,{flag:'wx'});
 files.push({url:r.url,sha256:r.sha256,bytes:r.bytes});
 if(++i%64===0)await yieldTurn();
}
for(const [name,bytes]of Object.entries(configs)){const f=resolve(output,'source-library',name+'.json');mkdirSync(dirname(f),{recursive:true});writeFileSync(f,bytes,{flag:'wx'});}
writeFileSync(resolve(output,'source-library/ready.json'),jsonBytes({version:'arch-source-deployment-ready/1',files:[...files,...configFiles]}),{flag:'wx'});
console.log(JSON.stringify({status:'staged',files:files.length+configFiles.length,originalResources:manifest.records.length,assetBytes:manifest.totalUniqueBytes}));
