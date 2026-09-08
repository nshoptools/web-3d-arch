// Capture is allowed only in an unfrozen candidate inside the selected run.
// Default verification is read-only for the component/root/dependencies and
// writes its result only to the selected fresh run's reports directory.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fs.realpathSync(process.env.PROJECT_ROOT??'.');
if(!process.env.PROJECT_REVIEW_RUN)throw Error('Dot-source development/env.ps1 first');
const run=fs.realpathSync(process.env.PROJECT_REVIEW_RUN);
const component=fs.realpathSync(fileURLToPath(new URL('../',import.meta.url)));
const within=(base,p)=>{const r=path.relative(base,fs.realpathSync(p));return r!==''&&!r.startsWith('..')&&!path.isAbsolute(r);};
assert.ok(within(root,run));assert.ok(fs.existsSync(path.join(root,'AGENTS.md')));
if(fs.existsSync(path.join(run,'reports/FROZEN.json')))throw Error('Select a fresh unfrozen output run');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sha=p=>hash(fs.readFileSync(p));
const relative=p=>path.relative(root,p).replaceAll('\\','/');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 if(e.name==='.git')return [];const p=path.join(dir,e.name);assert.ok(within(root,p),'Dependency escaped root');
 if(e.isSymbolicLink())throw Error(`Unexpected dependency link: ${p}`);
 return e.isDirectory()?walk(p):[p];
}).sort();}
const records=dir=>walk(dir).map(p=>({path:relative(p),bytes:fs.statSync(p).size,sha256:sha(p)}));
function treeHash(base,files){return hash(files.map(f=>`${path.relative(base,path.join(root,f.path)).replaceAll('\\','/')}:${f.sha256.toUpperCase()}`).sort().join('\n')+'\n');}
const lockPath=path.join(root,'docs/development/toolchain-lock.json');
const lock=JSON.parse(fs.readFileSync(lockPath));
assert.equal(lock.runtimeABI,2);assert.equal(lock.snapshotFormat,'ARCH/1');
const directories={manifold:'.toolchain/manifold',clipperOriginal:'.toolchain/clipper2-original',clipperDerived:'.toolchain/clipper2-derived'};
const trees=Object.fromEntries(Object.entries(directories).map(([name,p])=>{
 const files=records(path.join(root,p));return [name,{directory:p,files,treeSha256:treeHash(path.join(root,p),files)}];
}));
assert.equal(trees.clipperDerived.treeSha256.toUpperCase(),lock.clipper2.derivedTreeSha256);
const archive=`.toolchain/archives/clipper2-${lock.clipper2.revision}.tar.gz`;
assert.equal(sha(path.join(root,archive)).toUpperCase(),lock.clipper2.archiveSha256);
const head=execFileSync('git',['-C',path.join(root,directories.manifold),'rev-parse','HEAD'],{encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
assert.equal(head,lock.manifold.revision);
const licenses=[['manifold-LICENSE.txt',lock.manifold.licenseSha256],['clipper2-LICENSE.txt',lock.clipper2.licenseSha256],['clipper2-no-iostream.patch',lock.clipper2.patchSha256]].map(([name,expected])=>{
 const p=path.join(root,'docs/licenses/kernel',name);assert.equal(sha(p).toUpperCase(),expected);return {name,source:relative(p),sha256:sha(p)};
});
const actual={schema:'arch-final-export-dependency-pins/1',scope:'Actual reused source bytes; Manifold includes the supplied ExecutionContext extension, not an assertion of an unmodified upstream checkout.',
 toolchainLock:{path:relative(lockPath),sha256:sha(lockPath)},manifoldHead:head,clipperArchive:{path:archive,sha256:sha(path.join(root,archive))},
 configure:{downloads:false,parallelManifold:false,sharedLibraries:false,crossSectionBackend:'clipper2'},licenses,trees};
const pinFile=path.join(component,'pins/dependency-sources.json');
if(process.argv.includes('--capture')){
 assert.ok(within(run,component),'Capture must never write an integrated main component');
 fs.mkdirSync(path.join(component,'pins'),{recursive:true});fs.mkdirSync(path.join(component,'licenses'),{recursive:true});
 for(const f of licenses)fs.copyFileSync(path.join(root,f.source),path.join(component,'licenses',f.name));
 fs.copyFileSync(lockPath,path.join(component,'pins/root-toolchain-lock.json'));
 fs.writeFileSync(pinFile,JSON.stringify(actual,null,2)+'\n');
}else{
 assert.deepEqual(actual,JSON.parse(fs.readFileSync(pinFile)),'Read-only pinned dependency bytes changed');
 assert.equal(sha(path.join(component,'pins/root-toolchain-lock.json')),actual.toolchainLock.sha256);
 for(const f of licenses)assert.equal(sha(path.join(component,'licenses',f.name)),f.sha256);
}
const result={checked:true,manifestSha256:sha(pinFile),treeCounts:Object.fromEntries(Object.entries(trees).map(([k,t])=>[k,t.files.length])),clipperDerivedTreeSha256:trees.clipperDerived.treeSha256,manifoldActualTreeSha256:trees.manifold.treeSha256,
 rootWrites:false,dependencyWrites:false,sourceNote:actual.scope};
fs.writeFileSync(path.join(run,'reports/dependency-verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
