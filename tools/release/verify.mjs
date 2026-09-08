import {resolve} from 'node:path';
import {loadManifest} from '../../src/host/manifest.mjs';
import {RUNTIME_FILES} from './runtime-files.mjs';
import {TOOL_FILES,DOC_FILES} from './plan.mjs';
import {plainPath,readPlain,need,exact,sha,count,hash,parse,canonical,relativeFiles,portable,LIMITS,environment,inside} from './core.mjs';
export function verifyRelease(directory,expectedSha256){
 const root=plainPath(directory);need(inside(environment().root,root),'PACKAGE_OUTSIDE_REPOSITORY');
 sha(expectedSha256);
 const bytes=readPlain(resolve(root,'release-manifest.json'),32*1024*1024);
 need(hash(bytes)===expectedSha256,'RELEASE_MANIFEST_INTEGRITY');
 const m=parse(bytes);
 exact(m,['version','node','databaseSchema','applicationQualification','inputSha256','buildId','publicManifestSha256','publicBytes',
  'engine','library','bindings','frontend','licenses','runtimeLockSha256','files']);
 need(m.version==='arch-release-package/1'&&m.node==='24.19.0'&&m.databaseSchema===5,'PACKAGE_VERSION');
 need(Array.isArray(m.files)&&m.files.length>0&&m.files.length<=LIMITS.files+512,'PACKAGE_FILES_LIMIT');
 const seen=new Set(),byPath=new Map();let total=0;
 for(const r of m.files){
  exact(r,['path','sha256','bytes']);portable(r.path);sha(r.sha256);count(r.bytes,LIMITS.assetBytes);
  need(!seen.has(r.path.toLowerCase())&&r.path!=='release-manifest.json','PACKAGE_DUPLICATE');seen.add(r.path.toLowerCase());byPath.set(r.path,r);
  total+=r.bytes;need(total<=LIMITS.packageBytes,'PACKAGE_BYTES_LIMIT');
  const bytes=readPlain(resolve(root,r.path),LIMITS.assetBytes);
  need(bytes.length===r.bytes&&hash(bytes)===r.sha256,'PACKAGE_FILE_INTEGRITY');
 }
 const expected=[...m.files.map(r=>r.path),'release-manifest.json'].sort();
 need(canonical(relativeFiles(root).sort())===canonical(expected),'PACKAGE_FILE_SET');
 const required=[...RUNTIME_FILES,...TOOL_FILES.map(f=>'tools/release/'+f),...DOC_FILES.map(f=>'docs/release/'+f),
  'public-manifest.json','provenance/library-ready.json','provenance/runtime-lock.json'];
 need(required.every(path=>byPath.has(path)),'PACKAGE_REQUIRED_FILE');
 for(const r of m.files)need(r.path.startsWith('public/')||required.includes(r.path)||
  /^licenses\/[A-Za-z0-9_-]{1,80}\/[a-f0-9]{64}\.txt$/.test(r.path),'PACKAGE_PRIVATE_FILE_REJECTED');
 const raw=readPlain(resolve(root,'public-manifest.json'),32*1024*1024),pub=parse(raw);
 need(hash(raw)===m.publicManifestSha256&&pub.buildId===m.buildId,'PUBLIC_MANIFEST_INTEGRITY');
 need(canonical(pub.assets.map(a=>'public/'+a.file).sort())===canonical(m.files.filter(f=>f.path.startsWith('public/')).map(f=>f.path).sort()),'PUBLIC_FILE_SET');
 for(const a of pub.assets){const p=byPath.get('public/'+a.file);need(p?.sha256===a.sha256&&p.bytes===a.bytes,'PUBLIC_MANIFEST_INTEGRITY');}
 const checked=loadManifest({webroot:resolve(root,'public'),manifestPath:resolve(root,'public-manifest.json'),
  maxAssetBytes:LIMITS.assetBytes,maxPublicBytes:LIMITS.publicBytes,immutableMaxAge:31536000});
 need(checked.publicBytes===m.publicBytes,'PUBLIC_BYTES_MISMATCH');
 return {version:'arch-release-check/1',status:'verified',sha256:expectedSha256,buildId:m.buildId,
  files:m.files.length,publicAssets:checked.assetCount,publicBytes:checked.publicBytes,databaseSchema:5,
  applicationQualification:m.applicationQualification,manifest:m};
}
