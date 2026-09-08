import {materializeSourceLibrary} from './vendor/source-library.mjs';
export const TRANSPORT_VERSION='arch-release-transport/1';
export const CONFIG_BYTES=64*1024*1024;
export class TransportError extends Error{constructor(code){super(code);this.code=code;}}
const need=(v,c)=>{if(!v)throw new TransportError(c);};
const exact=(v,keys)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)),'TRANSPORT_FIELDS');
const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
export async function sourceDigest(bytes){
 need(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=CONFIG_BYTES,'CONFIG_BYTES_LIMIT');
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function owned(bytes){need(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=CONFIG_BYTES,'CONFIG_BYTES_LIMIT');need(!(typeof SharedArrayBuffer==='function'&&bytes.buffer instanceof SharedArrayBuffer),'SHARED_CONFIG_REJECTED');return new Uint8Array(bytes);}
function json(bytes){need(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=CONFIG_BYTES,'CONFIG_BYTES_LIMIT');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new TransportError('CONFIG_JSON');}}
function wire(r){
 const inert=['image/svg+xml','text/plain','application/xml','text/xml'].includes(r.mediaType);
 const mime={'image/png':'image/png','font/ttf':'font/ttf','application/json':'application/json; charset=utf-8'}[r.mediaType];
 need(inert||mime,'TRANSPORT_MEDIA');
 return {sha256:r.sha256,bytes:r.bytes,sourceMediaType:r.mediaType,wireMime:inert?'application/octet-stream':mime,
  url:inert?'source-assets/'+r.sha256+'.bin':r.url};
}
/** Validate original deployment1 first. Original documents are never rewritten. */
export async function createSourceTransport({catalogBytes,deploymentBytes}){
 catalogBytes=owned(catalogBytes);deploymentBytes=owned(deploymentBytes);
 const catalog=json(catalogBytes),manifest=json(deploymentBytes);
 materializeSourceLibrary({catalog,manifest,origin:'https://release.invalid',basePath:'/'});
 return {version:TRANSPORT_VERSION,catalogSha256:await sourceDigest(catalogBytes),deploymentSha256:await sourceDigest(deploymentBytes),
  records:manifest.records.map(wire).sort((a,b)=>a.sha256<b.sha256?-1:1),totalUniqueBytes:manifest.totalUniqueBytes};
}
/** Browser/DedicatedWorker helper. Fetch is injected by the caller, not performed here. */
export async function materializeReleaseSourceLibrary({catalogBytes,deploymentBytes,transportBytes,origin,basePath='/'}){
 catalogBytes=owned(catalogBytes);deploymentBytes=owned(deploymentBytes);transportBytes=owned(transportBytes);
 const catalog=json(catalogBytes),manifest=json(deploymentBytes),transport=json(transportBytes);
 const original=materializeSourceLibrary({catalog,manifest,origin,basePath});
 exact(transport,['version','catalogSha256','deploymentSha256','records','totalUniqueBytes']);
 need(transport.version===TRANSPORT_VERSION&&transport.catalogSha256===await sourceDigest(catalogBytes)&&
  transport.deploymentSha256===await sourceDigest(deploymentBytes),'TRANSPORT_CONFIG_INTEGRITY');
 need(Array.isArray(transport.records)&&transport.records.length===manifest.records.length&&
  transport.totalUniqueBytes===manifest.totalUniqueBytes,'TRANSPORT_RECORDS');
 const originals=new Map(manifest.records.map(r=>[r.sha256,r])),mapped=new Map(),paths=new Set();
 for(const r of transport.records){
  exact(r,['sha256','bytes','sourceMediaType','wireMime','url']);
  need(originals.has(r.sha256)&&!mapped.has(r.sha256)&&!paths.has(r.url.toLowerCase()),'TRANSPORT_DUPLICATE');
  need(stable(r)===stable(wire(originals.get(r.sha256))),'TRANSPORT_BINDING');
  const url=new URL(basePath+r.url,origin);
  need(url.origin===origin&&url.pathname===basePath+r.url&&!url.search&&!url.hash,'TRANSPORT_URL');
  mapped.set(r.sha256,{sha256:r.sha256,bytes:r.bytes,mediaType:r.sourceMediaType,url:url.href});paths.add(r.url.toLowerCase());
 }
 // Preserve the original order returned by the original validator.
 return {catalog:original.catalog,assetURLs:original.assetURLs.map(a=>mapped.get(a.sha256)),origin};
}
