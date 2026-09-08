import {check,keys,cloneJSON,canonicalJSON,parseJSON,identity,integer,hashId,sha256,encoder,decodeUTF8,LIMITS} from './common.mjs';
export const MANIFEST_KIND='web-3d-arch.project-manifest';
export const MANIFEST_VERSION=1;
export function validateManifest(input,{namespace,projectId}={}){
  const m=cloneJSON(input);
  keys(m,['kind','schemaVersion','namespace','projectId','revision','engine','domainSchemaVersion','assets','sources','dependencies','document','provenance']);
  check(m.kind===MANIFEST_KIND&&m.schemaVersion===1,'UNSUPPORTED_MANIFEST_VERSION','Manifest version is not supported.');
  hashId(m.namespace);identity(m.projectId,'project ID');integer(m.revision,1);
  check(!namespace||m.namespace===namespace,'USER_MISMATCH','Manifest belongs to another user namespace.');
  check(!projectId||m.projectId===projectId,'PROJECT_MISMATCH','Manifest belongs to another project.');
  keys(m.engine,['id','version']);identity(m.engine.id,'engine ID');identity(m.engine.version,'engine version');
  integer(m.domainSchemaVersion,1);
  check(m.domainSchemaVersion===1,'UNSUPPORTED_DOMAIN_VERSION','Domain schema version is not supported by this storage envelope.');
  check(Array.isArray(m.assets)&&m.assets.length<=LIMITS.entries,'ASSET_BUDGET','Invalid asset list.');
  let total=0;const seen=new Set();
  for(const a of m.assets){
    keys(a,['hash','byteLength','kind']);hashId(a.hash);integer(a.byteLength,0,LIMITS.asset);
    check(['source','dependency','derived','history'].includes(a.kind),'ASSET_KIND','Unknown asset role.');
    check(!seen.has(a.hash),'DUPLICATE_ASSET','Asset hashes must be unique.');seen.add(a.hash);total+=a.byteLength;
  }
  check(total<=LIMITS.expanded,'ASSET_BUDGET','Manifest expanded asset byte budget exceeded.');
  for(const key of ['sources','dependencies']){
    check(Array.isArray(m[key])&&new Set(m[key]).size===m[key].length,'REFERENCE_LIST','Invalid source/dependency list.');
    for(const hash of m[key]){hashId(hash);check(seen.has(hash),'MISSING_REFERENCE','Manifest references an undeclared asset.',{hash,key});}
  }
  // Every original source or dependency is explicitly traversable without parsing the opaque document.
  for(const asset of m.assets){
    if(asset.kind==='source')check(m.sources.includes(asset.hash),'SOURCE_REFERENCE','Source missing from source inventory.');
    if(asset.kind==='dependency')check(m.dependencies.includes(asset.hash),'DEPENDENCY_REFERENCE','Dependency missing from inventory.');
  }
  keys(m.provenance,['importedFrom'],[]);
  if(m.provenance.importedFrom){
    keys(m.provenance.importedFrom,['namespace','projectId','manifestHash']);
    hashId(m.provenance.importedFrom.namespace);identity(m.provenance.importedFrom.projectId);hashId(m.provenance.importedFrom.manifestHash);
  }
  check(m.document&&typeof m.document==='object'&&!Array.isArray(m.document),'DOCUMENT_REQUIRED','Project rebuild document must be a JSON object.');
  return m;
}
export async function encodeManifest(input,scope){
  const value=validateManifest(input,scope);
  value.assets.sort((a,b)=>a.hash.localeCompare(b.hash));
  value.sources.sort();value.dependencies.sort();
  const bytes=encoder.encode(canonicalJSON(value));
  return {manifest:value,bytes,hash:await sha256(bytes)};
}
export async function inspectManifest(bytes,expectedHash,scope={}){
  const rawBytes=bytes.slice(),actualHash=await sha256(rawBytes);
  check(actualHash===expectedHash,'MANIFEST_HASH','Manifest bytes failed SHA-256 verification.',{expectedHash,actualHash});
  const raw=decodeUTF8(rawBytes);let envelope;
  try{envelope=parseJSON(raw,{exactNumbers:false});}catch(error){return {status:'read-only',rawBytes,raw,manifestHash:actualHash,reason:error.code};}
  if(envelope?.kind!==MANIFEST_KIND||envelope?.schemaVersion!==1)
    return {status:'read-only',rawBytes,raw,manifestHash:actualHash,reason:'UNSUPPORTED_MANIFEST_VERSION'};
  try{return {status:'editable',manifest:validateManifest(parseJSON(raw),scope),rawBytes,manifestHash:actualHash};}
  catch(error){return {status:'read-only',rawBytes,raw,manifestHash:actualHash,reason:error.code};}
}
