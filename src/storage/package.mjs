import {validateHead} from './head.mjs';
import {check,keys,cloneJSON,canonicalJSON,parseJSON,copyBytes,sha256,hashId,identity,encoder,decodeUTF8,integer,LIMITS} from './common.mjs';
import {inspectManifest} from './manifest.mjs';
import {writeStoredZip,readStoredZip} from './zip.mjs';
export async function exportRescuePackage(store,projectId,options={}){
  const inventory=await store.rescueInventory(projectId,options),files=[],metadataFiles=[];
  for(const m of inventory.manifests){
    const path=m.verified?'manifests/'+m.actualHash+'.json':'unverified/'+m.actualHash+'.raw';
    files.push({name:path,bytes:m.bytes});metadataFiles.push({path,hash:m.actualHash,byteLength:m.bytes.length,type:m.verified?'manifest':'unverified-manifest',declaredHash:m.declaredHash});
  }
  for(const a of inventory.assets){
    const path='assets/'+a.hash+'.bin';
    files.push({name:path,bytes:a.bytes});metadataFiles.push({path,hash:a.hash,byteLength:a.bytes.length,type:'asset'});
  }
  const metadata={kind:'web-3d-arch.rescue-package',schemaVersion:1,namespace:inventory.namespace,projectId,
    head:inventory.head,selectedManifestHash:inventory.selectedManifestHash,complete:inventory.complete,issues:inventory.issues,
    files:metadataFiles.sort((a,b)=>a.path.localeCompare(b.path))};
  files.push({name:'package.json',bytes:encoder.encode(canonicalJSON(metadata))});
  const bytes=writeStoredZip(files);
  return {bytes,sha256:await sha256(bytes),metadata,format:'zip-store-v1'};
}
export async function inspectRescuePackage(input){
  const rawPackage=copyBytes(input),files=readStoredZip(rawPackage);
  check(files.has('package.json'),'PACKAGE_METADATA','Missing rescue package metadata.');
  const text=decodeUTF8(files.get('package.json')),header=parseJSON(text,{exactNumbers:false});
  if(header?.kind!=='web-3d-arch.rescue-package'||header?.schemaVersion!==1)
    return {status:'read-only',rawPackage,reason:'UNSUPPORTED_PACKAGE_VERSION'};
  const metadata=cloneJSON(parseJSON(text));
  keys(metadata,['kind','schemaVersion','namespace','projectId','head','selectedManifestHash','complete','issues','files']);
  hashId(metadata.namespace);identity(metadata.projectId);if(metadata.selectedManifestHash!==null)hashId(metadata.selectedManifestHash);
  check(typeof metadata.complete==='boolean'&&Array.isArray(metadata.issues),'PACKAGE_METADATA','Invalid rescue status.');
  check(Array.isArray(metadata.files)&&metadata.files.length<=LIMITS.entries-1,'PACKAGE_BUDGET','Invalid file inventory.');
  const paths=new Set();let total=0;
  for(const f of metadata.files){
    keys(f,['path','hash','byteLength','type','declaredHash'],['path','hash','byteLength','type']);
    hashId(f.hash);integer(f.byteLength,0,LIMITS.asset);total+=f.byteLength;
    check(total<=LIMITS.expanded,'PACKAGE_BUDGET','Expanded package budget exceeded.');
    check(!paths.has(f.path),'PACKAGE_DUPLICATE','Duplicate inventory path.');paths.add(f.path);
    check(['manifest','asset','unverified-manifest'].includes(f.type),'PACKAGE_FILE_TYPE','Unknown file role.');
    const expected=f.type==='asset'?'assets/'+f.hash+'.bin':f.type==='manifest'?'manifests/'+f.hash+'.json':'unverified/'+f.hash+'.raw';
    check(f.path===expected,'PACKAGE_PATH','File path does not match its content-addressed role.');
    if(f.declaredHash!==undefined)hashId(f.declaredHash);
    const bytes=files.get(f.path);
    check(bytes&&bytes.length===f.byteLength,'PACKAGE_MISSING','Inventory file missing or wrong size.',{path:f.path});
    check(await sha256(bytes)===f.hash,'PACKAGE_HASH','Package file SHA-256 mismatch.',{path:f.path});
  }
  check(files.size===paths.size+1,'PACKAGE_UNDECLARED','ZIP contains undeclared files.');
  if(metadata.head!==null){
    try{validateHead(metadata.head);}
    catch(error){return {status:'read-only',rawPackage,metadata,reason:error.code};}
    check(metadata.head.projectId===metadata.projectId,'PROJECT_MISMATCH','Package head belongs to another project.');
  }
  const selected=metadata.selectedManifestHash;
  check(selected&&files.has('manifests/'+selected+'.json'),'PACKAGE_SELECTION','No verified selected manifest can be imported.');
  const inspected=await inspectManifest(files.get('manifests/'+selected+'.json'),selected,{namespace:metadata.namespace,projectId:metadata.projectId});
  if(inspected.status==='read-only')return {status:'read-only',rawPackage,metadata,reason:inspected.reason};
  for(const a of inspected.manifest.assets){
    const bytes=files.get('assets/'+a.hash+'.bin');
    check(bytes&&bytes.length===a.byteLength&&await sha256(bytes)===a.hash,'PACKAGE_MISSING_REFERENCE','Selected manifest is missing a verified source/dependency.',{hash:a.hash});
  }
  return {status:'importable',rawPackage,metadata,files,manifest:inspected.manifest};
}
/** True when a dependency asset is itself a rescue package (an earlier import kept whole). */
export function isRescuePackage(bytes){
  try{const meta=readStoredZip(bytes).get('package.json');if(!meta)return false;return parseJSON(decodeUTF8(meta),{exactNumbers:false})?.kind==='web-3d-arch.rescue-package';}
  catch{return false;}
}
export async function importRescueCopy(store,input,{projectId,transactionId,signal,expectedRevision=0}){
  identity(projectId,'destination project ID');
  const inspected=await inspectRescuePackage(input);
  if(inspected.status==='read-only')return inspected;
  const current=await store.load(projectId,{signal});
  // Copy-on-write into an empty ID by default. A caller that names the head it
  // is replacing restores the package over that generation of the *same* ID
  // instead: a deleted project reopened from its own package keeps its
  // identity, so every record inside the document that names the project
  // (source bindings, receipts, preparations) stays valid.
  if(expectedRevision===0)check(current.status==='empty','IMPORT_TARGET_EXISTS','Import is copy-on-write into a new project ID.');
  else check(current.status==='editable'&&current.headRevision===expectedRevision,'IMPORT_TARGET_MOVED','The destination changed since it was inspected; load it again before restoring.');
  const m=inspected.manifest;
  // A complete package with no issues was verified file by file above and every one of those files
  // lands in the copy as a first-class asset, so the ZIP itself is not kept: re-embedding it (and the
  // ZIPs earlier copies embedded) doubled the next package on every export→import round until
  // ZIP_BUDGET refused to write one (audit RO-01). An incomplete package, or one carrying issues,
  // is still kept whole so nothing this version did not understand is lost.
  const complete=inspected.metadata.complete===true&&inspected.metadata.issues.length===0;
  const carried=m.assets.map(a=>({...a,bytes:inspected.files.get('assets/'+a.hash+'.bin')}));
  const assets=complete?carried.filter(a=>!(a.kind==='dependency'&&isRescuePackage(a.bytes))):carried;
  const dropped=new Set(carried.filter(a=>!assets.includes(a)).map(a=>a.hash));
  const dependencies=new Set(m.dependencies.filter(h=>!dropped.has(h)));
  const backupHash=await sha256(inspected.rawPackage);
  if(!complete&&!assets.some(a=>a.hash===backupHash)){assets.push({hash:backupHash,byteLength:inspected.rawPackage.length,kind:'dependency',bytes:inspected.rawPackage});dependencies.add(backupHash);}
  // The document may still list the dropped ZIPs as retained assets from its own earlier imports.
  const document=Array.isArray(m.document?.retainedAssets)&&dropped.size?{...m.document,retainedAssets:m.document.retainedAssets.filter(h=>!dropped.has(h))}:m.document;
  const result=await store.commit({projectId,transactionId,expectedRevision,engine:m.engine,domainSchemaVersion:m.domainSchemaVersion,
    document,assets,sources:m.sources,dependencies:[...dependencies],
    provenance:{importedFrom:{namespace:m.namespace,projectId:m.projectId,manifestHash:inspected.metadata.selectedManifestHash}}},{signal});
  return {status:expectedRevision===0?'imported-copy':'restored',...result,originalPackageHash:backupHash,originalPackageRetained:!complete,droppedNestedPackages:dropped.size,sourceProjectId:m.projectId};
}
