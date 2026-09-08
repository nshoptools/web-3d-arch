import {readFile,writeFile,readdir,realpath,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fixtures,bitmap} from './fixtures.mjs';
import {checks} from './suite.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),target=path.join(root,'docs','editing','manifest.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inventory(directory,prefix=''){
  const files=[];
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
    const absolute=path.join(directory,entry.name),relative=prefix+entry.name;
    if(entry.isSymbolicLink())throw Error('Manifest rejects symbolic links: '+relative);
    if(entry.isDirectory())files.push(...await inventory(absolute,relative+'/'));
    else if(relative!=='docs/editing/manifest.json'){const bytes=await readFile(absolute);files.push({path:relative,bytes:bytes.length,sha256:digest(bytes)});}
  }
  return files;
}
function imageHash(image){
  const header=Buffer.alloc(24);header.write('ARCH-RGBA-v1');header.writeUInt32LE(image.width,16);header.writeUInt32LE(image.height,20);
  return createHash('sha256').update(header).update(image.data).digest('hex');
}
const candidateFiles=[];
for(const directory of ['docs/editing','src/editing','tests/editing'])candidateFiles.push(...await inventory(path.join(root,directory),directory+'/'));
const fixtureRecords=fixtures.map(f=>{
  const input=bitmap(f.before),expected=bitmap(f.after);
  return {id:f.name,input:{width:input.width,height:input.height,rgbaSha256:digest(input.data)},
    expected:{rgbaSha256:digest(expected.data),imageSha256:imageHash(expected)},command:f.command};
});
const manifest={schemaVersion:1,candidateVersion:'arch-raster-edit/1',scope:'standalone pixel core; implementation, not independent review',
  fixtureProvenance:{source:'Synthetic analytic RGBA fixtures authored for web-3d-arch in this candidate',rights:'Project-authored internal test data; no third-party artwork',oracle:'Hand-specified pixel grids, analytic arithmetic and separate dense polynomial curve evaluation'},
  counts:{sourceFiles:candidateFiles.filter(f=>f.path.startsWith('src/')).length,testFiles:candidateFiles.filter(f=>f.path.startsWith('tests/')).length,
    documents:candidateFiles.filter(f=>f.path.startsWith('docs/')).length,analyticGridFixtures:fixtures.length,portableChecks:checks.length},
  files:candidateFiles,fixtures:fixtureRecords};
const mode=process.argv[2];
if(mode==='--write'){
  const run=process.env.PROJECT_REVIEW_RUN;
  if(!run||!process.env.PROJECT_ROOT)throw Error('Project environment required');
  const allowed=await realpath(process.env.PROJECT_ROOT),room=await realpath(run);
  if((await realpath(root)).toLowerCase()!==allowed.toLowerCase()||!path.relative(allowed,room)||path.relative(allowed,room).startsWith('..')||path.isAbsolute(path.relative(allowed,room)))throw Error('Source/output outside project');
  const stat=await lstat(path.dirname(target));if(stat.isSymbolicLink())throw Error('Docs directory is a link');
  try{if((await lstat(target)).isSymbolicLink())throw Error('Manifest target is a link');}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(target,JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({status:'written',counts:manifest.counts}));
}else if(mode==='--check'){
  const saved=JSON.parse(await readFile(target,'utf8'));
  if(JSON.stringify(saved)!==JSON.stringify(manifest))throw Error('Manifest inventory, hashes or fixture expectations differ');
  console.log(JSON.stringify({status:'checked',counts:manifest.counts,manifestSha256:digest(await readFile(target))}));
}else throw Error('Pass --write or --check');
