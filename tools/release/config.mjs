import {resolve,dirname} from 'node:path';
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHost} from '../../src/host/server.mjs';
import {validateConfig} from '../../src/host/config.mjs';
import {validateRuntime} from '../../src/server/runtime-config.mjs';
import {Oidc} from '../../src/server/oidc.mjs';
import {productionAdapters} from '../../src/server/adapters/registry.mjs';
import {validatePolicy} from '../../src/server/policy.mjs';
import {verifyRelease} from './verify.mjs';
import {need,exact,hash,sha,jsonBytes,parse,checkedJson,readPlain,plainPath,inside,outputPath,environment} from './core.mjs';
const PRIVATE_FILES=['configuration.json','host.json','runtime.json'];
function privatePath(value,{exists=false}={}){
 const target=outputPath(value);
 if(exists)plainPath(target);
 return target;
}
export async function configureRelease(inputPath,destination){
 const output=outputPath(destination);need(!existsSync(output),'OUTPUT_EXISTS');
 need(inside(environment().run,plainPath(inputPath)),'CONFIG_OUTSIDE_RUNTIME');
 const c=checkedJson(inputPath,262144);
 exact(c,['version','package','origin','host','backend','tls','bootstrap','runtime']);
 need(c.version==='arch-release-operator/1','OPERATOR_VERSION');
 exact(c.package,['directory','sha256']);sha(c.package.sha256);
 const checked=verifyRelease(c.package.directory,c.package.sha256);
 exact(c.host,['bindAddress','port','serviceWorker','runtimeDirectory']);
 exact(c.backend,['port','dataDirectory','keysFile','oidcFile','aiAdapters']);
 exact(c.tls,['keyFile','certificateFile']);
 need(typeof c.origin==='string'&&!c.origin.includes('.invalid'),'OPERATOR_ORIGIN_REQUIRED');
 need(c.host.port>0&&c.host.port!==c.backend.port,'EXPLICIT_DISTINCT_PORTS');
 need(['','xai-imagine'].includes(c.backend.aiAdapters),'AI_ADAPTER_SELECTION_INVALID');
 productionAdapters(c.backend.aiAdapters);
 const runtime=validateRuntime(c.runtime);
 // Defaults are5min. Disable/change only by an explicit validated private runtime document.
 const privatePaths=[privatePath(c.host.runtimeDirectory),privatePath(c.backend.dataDirectory),
  privatePath(c.backend.keysFile),privatePath(c.backend.oidcFile,{exists:true}),
  privatePath(c.tls.keyFile,{exists:true}),privatePath(c.tls.certificateFile,{exists:true}),output];
 for(const p of privatePaths)need(!inside(plainPath(c.package.directory),p),'PRIVATE_PATH_IN_RELEASE');
 need(new Set(privatePaths.map(p=>p.toLowerCase())).size===privatePaths.length,'PRIVATE_PATH_COLLISION');
 const oidc=checkedJson(c.backend.oidcFile,262144);
 exact(oidc,['issuer','authorizationEndpoint','tokenEndpoint','jwksUri','clientId','authMethod']);
 need(!Object.values(oidc).some(v=>typeof v==='string'&&(/REPLACE|\.invalid(?:\/|$)/i.test(v))),'OIDC_OPERATOR_INPUT_REQUIRED');
 const secret=process.env.BACKEND_OIDC_CLIENT_SECRET;
 new Oidc({...oidc,...(secret?{clientSecret:secret}:{})});
 if(c.bootstrap!==null){
  exact(c.bootstrap,['issuer','subject','policyFile']);
  need(c.bootstrap.issuer===oidc.issuer&&typeof c.bootstrap.subject==='string'&&c.bootstrap.subject.length>0&&c.bootstrap.subject.length<=255,'EXPLICIT_BOOTSTRAP_REQUIRED');
  privatePath(c.bootstrap.policyFile,{exists:true});validatePolicy(checkedJson(c.bootstrap.policyFile,262144));
 }
 const host=validateConfig({schemaVersion:1,origin:c.origin,bindAddress:c.host.bindAddress,port:c.host.port,
  backendPort:c.backend.port,webroot:resolve(c.package.directory,'public'),manifestPath:resolve(c.package.directory,'public-manifest.json'),
  tlsKeyPath:c.tls.keyFile,tlsCertPath:c.tls.certificateFile,serviceWorker:c.host.serviceWorker});
 // Existing host validates TLS/key/name/expiry and the immutable public whitelist without binding.
 const prepared=createHost(host);await prepared.close();
 const normalized={...c,package:{directory:plainPath(c.package.directory),sha256:c.package.sha256},runtime};
 const docs={'configuration.json':jsonBytes(normalized),'host.json':jsonBytes(host),'runtime.json':jsonBytes(runtime)};
 const seal={version:'arch-release-config/1',packageSha256:checked.sha256,files:PRIVATE_FILES.map(file=>({file,sha256:hash(docs[file]),bytes:docs[file].length}))};
 const sealBytes=jsonBytes(seal);
 mkdirSync(output,{recursive:false});
 for(const [file,bytes]of Object.entries(docs))writeFileSync(resolve(output,file),bytes,{flag:'wx',mode:0o600});
 writeFileSync(resolve(output,'config-seal.json'),sealBytes,{flag:'wx',mode:0o600});
 return {status:'configured',configSha256:hash(sealBytes),packageSha256:checked.sha256,databaseSchema:5,
  maintenanceIntervalMs:runtime.maintenance.intervalMs,aiKeyPolicy:'per-user-byok-only',deploymentVerified:false};
}
export function readOperator(directory,pin){
 const root=plainPath(directory);need(inside(environment().run,root),'CONFIG_OUTSIDE_RUNTIME');sha(pin);
 const b=readPlain(resolve(root,'config-seal.json'),262144);need(hash(b)===pin,'CONFIG_SEAL_INTEGRITY');
 const s=parse(b);exact(s,['version','packageSha256','files']);
 need(s.version==='arch-release-config/1'&&JSON.stringify(s.files.map(r=>r.file))===JSON.stringify(PRIVATE_FILES),'CONFIG_SEAL_VERSION');
 const docs={};
 for(const r of s.files){exact(r,['file','sha256','bytes']);const data=readPlain(resolve(root,r.file),262144);
  need(data.length===r.bytes&&hash(data)===r.sha256,'CONFIG_CHANGED');docs[r.file]=parse(data);}
 const c=docs['configuration.json'];need(c.package.sha256===s.packageSha256,'CONFIG_PACKAGE_BINDING');
 verifyRelease(c.package.directory,c.package.sha256);
 // Operator dependencies are checked on every invocation. The existing backend validates actual retained vault ciphertexts.
 for(const f of [c.backend.oidcFile,c.tls.keyFile,c.tls.certificateFile])privatePath(f,{exists:true});
 for(const p of [c.backend.dataDirectory,c.backend.keysFile,c.host.runtimeDirectory])privatePath(p);
 return {root,configuration:c};
}
