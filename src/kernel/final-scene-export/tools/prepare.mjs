import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=process.env.PROJECT_ROOT,run=process.env.PROJECT_REVIEW_RUN;
if(!root||!run)throw Error('Dot-source development/env.ps1 with your seat/run first');
const candidate=fileURLToPath(new URL('../',import.meta.url));
const overlay=path.join(run,'work','kernel-overlay');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(['target','.git'].includes(e.name)?[]:walk(path.join(p,e.name))):[path.join(p,e.name)]);
const copy=(src,dst)=>{fs.mkdirSync(path.dirname(dst),{recursive:true});if(fs.existsSync(dst)&&hash(src)===hash(dst))return;fs.copyFileSync(src,dst);fs.chmodSync(dst,0o666);};
if(!fs.existsSync(overlay)){
 const records=[];
 for(const f of walk(path.join(root,'src/kernel'))){const rel=path.relative(path.join(root,'src/kernel'),f);const dst=path.join(overlay,rel);copy(f,dst);records.push({path:`src/kernel/${rel.replaceAll('\\','/')}`,sha256:hash(dst)});}
 fs.writeFileSync(path.join(run,'inputs','root-kernel-preimages.json'),JSON.stringify(records,null,2)+'\n');
 // Optional precise remediation overlay: verified files only, never edit its room.
 const prior=process.env.ARCH_MECHANICS_CANDIDATE;
 if(prior){const manifestPath=path.resolve(prior,'../../reports/checked-manifest.json');const manifest=JSON.parse(fs.readFileSync(manifestPath));
  for(const f of manifest.files){const src=path.join(prior,f.path);if(hash(src)!==f.sha256)throw Error(`Mechanics preimage ${f.path}`);copy(src,path.join(overlay,'mechanics',f.path));}
  fs.writeFileSync(path.join(run,'inputs','mechanics-overlay.json'),JSON.stringify({manifest:manifestPath,sha256:hash(manifestPath),files:manifest.files},null,2)+'\n');}
}
for(const f of walk(candidate))copy(f,path.join(overlay,'final-scene-export',path.relative(candidate,f)));
const hooks=[
 ['src/abi.rs','pub(crate) mod raster_runtime;','pub(crate) mod raster_runtime;\n#[path="../final-scene-export/rust/mod.rs"]\npub(crate) mod final_scene_export;'],
 ['src/lib.rs','pub use abi::raster_runtime::*;','pub use abi::raster_runtime::*;\npub use abi::final_scene_export::*;'],
 ['native/CMakeLists.txt','add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../source-assembly" source-assembly)','add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../source-assembly" source-assembly)\nadd_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../final-scene-export" final-scene-export)'],
 ['build.rs','"Release", "source-assembly/Release"','"Release", "final-scene-export/Release", "source-assembly/Release"'],
 ['build.rs','&["", "source-assembly"','&["", "final-scene-export", "source-assembly"'],
 ['build.rs','["arch_geometry", "arch_source_assembly"','["arch_final_scene_export", "arch_geometry", "arch_source_assembly"'],
 ['Cargo.toml','[features]','[[example]]\nname = "final-export-probe"\npath = "final-scene-export/tests/native_probe.rs"\nrequired-features = ["test-fixtures"]\n\n[features]'],
 ];
const applied=[];
for(const [rel,before,after] of hooks){const p=path.join(overlay,rel);let text=fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
 const integrated=rel==='src/abi.rs'?/\bmod final_scene_export\s*;/.test(text):rel==='src/lib.rs'?text.includes('pub use abi::final_scene_export::*;'):
  rel==='native/CMakeLists.txt'?/add_subdirectory\([^\r\n]*final-scene-export/.test(text):rel==='Cargo.toml'?/name\s*=\s*"final-export-probe"/.test(text):
  rel==='build.rs'?(before.startsWith('["arch_geometry"')?text.includes('"arch_final_scene_export"'):before.startsWith('"Release"')?text.includes('"final-scene-export/Release"'):text.includes('"final-scene-export"')):false;
 if(text.includes(after)||integrated)continue;if(text.split(before).length!==2)throw Error(`Focused hook preimage mismatch ${rel}`);applied.push({path:`src/kernel/${rel}`,beforeSha256:hash(p),before,after});fs.writeFileSync(p,text.replace(before,after));}
if(applied.length)fs.writeFileSync(path.join(run,'inputs','applied-private-hooks.json'),JSON.stringify(applied,null,2)+'\n');
console.log(JSON.stringify({overlay,candidate,rootWrites:false}));
