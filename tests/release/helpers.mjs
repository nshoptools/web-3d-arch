import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {request as httpsRequest} from 'node:https';
import {randomBytes,generateKeyPairSync} from 'node:crypto';
import {hash,jsonBytes,environment} from '../../tools/release/core.mjs';
import {pinRuntime} from '../../tools/release/plan.mjs';
import {buildRelease} from '../../tools/release/build.mjs';
import {createHost} from '../../src/host/server.mjs';
export const candidate=fileURLToPath(new URL('../../',import.meta.url));
export const run=environment().run;
export const pin=(file,b)=>({file,sha256:hash(b),bytes:b.length});
export const wasm=Buffer.from('0061736d010000000105016000017f030201000707010372756e00000a06010400412a0b','hex');
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=','base64');
export function dir(label='release'){return mkdtempSync(join(run,'evidence',label+'-'));}
export function write(root,file,bytes){bytes=Buffer.from(bytes);const path=resolve(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,bytes);return pin(file,bytes);}
export function smallLibrary(root){
 const records=[],file=(mediaType,bytes,source)=>{bytes=Buffer.from(bytes);const sha256=hash(bytes),ext={'font/ttf':'ttf','image/png':'png','image/svg+xml':'svg','text/plain':'txt'}[mediaType];
  const r={sha256,bytes:bytes.length,mediaType,file:source,url:'source-assets/'+sha256+'.'+ext,originalFiles:[source],roles:['synthetic']};
  write(root,r.url,bytes);records.push(r);return {sha256,bytes:bytes.length};
 };
 const license=file('text/plain','Synthetic fixture legal notice; not a production source license.','art/NOTICE.txt');
 const font=file('font/ttf','synthetic source bytes; no font-rendering claim','art/glyph.ttf');
 const preview=file('image/png',png,'art/icon.png');
 const svg=file('image/svg+xml','<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><path d="M0 0H1V1H0Z"/></svg>','art/icon.svg');
 const catalog={version:'arch-source-catalog/1',fonts:[{id:'face',...font,license:{asset:license}}],defaultFontId:'face',
  defaultCollectionId:'color',collections:[{id:'color',selection:{kind:'svg'},items:[{id:'ink',emoji:'A',vectors:[svg],rasters:[preview]}],components:[]}],
  previews:[{collectionId:'color',itemId:'ink',...preview,width:1,height:1}]};
 const deployment={version:'arch-source-deployment/1',records,totalUniqueBytes:records.reduce((n,r)=>n+r.bytes,0),sourceFileCount:records.length};
 const configs={catalog,deployment,artwork:{version:'arch-source-artwork-library/1',items:[]},receipt:{version:'synthetic-build-receipt/1'}};
 const out={root},files=records.map(r=>({url:r.url,sha256:r.sha256,bytes:r.bytes}));
 for(const [name,value]of Object.entries(configs)){
  const file='source-library/'+(name==='receipt'?'build-receipt':name)+'.json',r=write(root,file,jsonBytes(value));out[name]=r;files.push({url:file,bytes:r.bytes,sha256:r.sha256});
 }
 out.ready=write(root,'source-library/ready.json',jsonBytes({version:'arch-source-deployment-ready/1',files}));return out;
}
export function libraryPins(root){
 const out={root};for(const [name,file]of Object.entries({catalog:'catalog',deployment:'deployment',artwork:'artwork',receipt:'build-receipt',ready:'ready'})){
  const rel='source-library/'+file+'.json';out[name]=pin(rel,readFileSync(resolve(root,rel)));
 }return out;
}
export function inputFixture({libraryRoot,label='build'}={}){
 const root=dir(label),front=resolve(root,'approved-build'),assets=[];
 const add=(file,b)=>{const r=write(front,file,b);assets.push({...r,url:'/'+file,cache:'revalidate',licenseIds:['application']});};
 add('index.html','<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><script type="module" src="/entry.mjs"></script></head><body>Synthetic release plumbing fixture</body></html>');
 add('entry.mjs','globalThis.releaseSmokeLoaded=true;');
 add('style.css','body { color: #123; }');
 add('engine.mjs','export default async function(){const r=await fetch(new URL("engine.wasm",import.meta.url));return WebAssembly.instantiateStreaming(r);}');
 add('engine.wasm',wasm);
 add('worker.mjs',`import create from './engine.mjs';
import {materializeReleaseSourceLibrary,sourceDigest} from './source-transport.mjs';
self.onmessage=async()=>{try{
 const b=await (await fetch('/release-bindings.json')).json(),get=async r=>{const v=new Uint8Array(await(await fetch(r.url)).arrayBuffer());if(v.byteLength!==r.bytes||await sourceDigest(v)!==r.sha256)throw Error('HASH');return v;};
 const [catalogBytes,deploymentBytes,transportBytes]=await Promise.all([get(b.library.catalog),get(b.library.deployment),get(b.library.transport)]);
 const lib=await materializeReleaseSourceLibrary({catalogBytes,deploymentBytes,transportBytes,origin:self.location.origin});
 const m=await create(),svg=lib.assetURLs.find(a=>a.mediaType==='image/svg+xml'),s=await(await fetch(svg.url)).arrayBuffer();
 const preview=lib.assetURLs.find(a=>a.sha256===lib.catalog.previews[0].sha256);
 self.postMessage({isolated:self.crossOriginIsolated,shared:new SharedArrayBuffer(8).byteLength,result:m.instance.exports.run(),
 resources:lib.assetURLs.length,previews:lib.catalog.previews.length,svgURL:svg.url,svgMedia:svg.mediaType,
 svgHash:await sourceDigest(new Uint8Array(s)),expectedSvgHash:svg.sha256,previewURL:preview.url});
}catch(e){self.postMessage({error:e.code||e.message});}};`);
 add('source-transport.mjs',readFileSync(resolve(candidate,'tools/release/source-transport.mjs')));
 add('vendor/source-library.mjs',readFileSync(resolve(candidate,'tools/release/vendor/source-library.mjs')));
 const notice=write(root,'NOTICE.txt','Project synthetic test fixture only; no distribution license or completed application is asserted.\\n');
 const lock=write(root,'runtime-lock.json',jsonBytes(pinRuntime(candidate)));
 const input={version:'arch-release-input/1',frontendRoot:front,
  frontend:{entry:'/entry.mjs',document:'/index.html',assets,navigations:{'/':'/index.html'},references:[
   {from:'/index.html',to:'/entry.mjs'},{from:'/entry.mjs',to:'/worker.mjs'},{from:'/worker.mjs',to:'/release-bindings.json'},
   {from:'/engine.mjs',to:'/engine.wasm'}]},
  engine:{moduleUrl:'/engine.mjs',wasmUrl:'/engine.wasm',binaryRequest:'engine.wasm',abi:1,semantics:1,source:1},
  library:libraryRoot?libraryPins(libraryRoot):smallLibrary(resolve(root,'approved-library')),
  runtimeRoot:candidate,runtimeLock:{...lock,file:resolve(root,lock.file)},
  licenses:[{id:'application',spdx:'LicenseRef-Synthetic-Private',source:'project test fixture',revision:'fixture1',...notice,file:resolve(root,notice.file)}]};
 const inputPath=resolve(root,'input.json'),save=()=>writeFileSync(inputPath,jsonBytes(input));save();
 return {root,front,input,inputPath,save,output:resolve(root,'artifact'),async build(){save();const result=await buildRelease(inputPath,this.output);return {result,directory:this.output};}};
}
export const tlsRoot=process.env.RELEASE_TEST_TLS;
export const ca=()=>readFileSync(resolve(tlsRoot,'synthetic-cert.pem'));
export function hostConfig(directory,overrides={}){
 return {schemaVersion:1,origin:'https://localhost:0',bindAddress:'127.0.0.1',port:0,backendPort:1,
  webroot:resolve(directory,'public'),manifestPath:resolve(directory,'public-manifest.json'),
  tlsKeyPath:resolve(tlsRoot,'synthetic-key.pem'),tlsCertPath:resolve(tlsRoot,'synthetic-cert.pem'),serviceWorker:true,...overrides};
}
export function wire(origin,method,path,body,headers={}){
 const u=new URL(origin),bytes=body===undefined?undefined:Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
 return new Promise((yes,no)=>{
  const req=httpsRequest({hostname:'127.0.0.1',servername:'localhost',port:u.port,method,path,ca:ca(),agent:false,
   headers:{host:u.host,...(bytes?{'content-type':'application/json','content-length':bytes.length}:{}),...headers}},res=>{
   const out=[];res.on('data',b=>out.push(b));res.on('error',no);res.on('end',()=>{const raw=Buffer.concat(out);let json;try{json=JSON.parse(raw);}catch{}
    yes({status:res.statusCode,headers:res.headers,raw,json});});
  });req.setTimeout(15000,()=>req.destroy(Error('TEST_DEADLINE')));req.on('error',no);req.end(bytes);
 });
}
export function backendKeys(){return {vaultKeys:new Map([['synthetic',randomBytes(32)]]),activeVaultKey:'synthetic',csrfKey:randomBytes(32),leaseKey:generateKeyPairSync('ed25519').privateKey};}
