export function serviceWorker(build) {
  const table = Object.fromEntries([...build.entries].map(([url,e]) => [url,{hash:e.hash,bytes:e.bytes.length,mime:e.mime}]));
  return Buffer.from("'use strict';\nconst BUILD="+JSON.stringify(build.buildId)+";\nconst TABLE="+JSON.stringify(table)+";\n"+workerSource);
}
const workerSource = String.raw`
const CACHE='arch-public-v1-'+BUILD;
const eligible=(request)=>{
  const u=new URL(request.url);
  return request.method==='GET' && u.origin===self.location.origin && !u.search && !u.hash &&
    Object.prototype.hasOwnProperty.call(TABLE,u.pathname) && !request.headers.has('range') &&
    !request.headers.has('authorization') ? u.pathname : null;
};
async function verified(response,path){
  const e=TABLE[path];
  if(response.status!==200 || response.redirected || response.type==='opaque' ||
     response.url!==self.location.origin+path || response.headers.get('x-arch-public')!=='1' ||
     response.headers.get('x-arch-build')!==BUILD || response.headers.get('content-type')!==e.mime ||
     response.headers.get('cross-origin-opener-policy')!=='same-origin' ||
     response.headers.get('cross-origin-embedder-policy')!=='require-corp' ||
     response.headers.get('cross-origin-resource-policy')!=='same-origin' ||
     !response.headers.get('content-security-policy') ||
     /(?:no-store|private)/i.test(response.headers.get('cache-control')||'') ||
     Number(response.headers.get('content-length'))!==e.bytes) return false;
  const reader=response.clone().body?.getReader();
  if(!reader)return false;
  const bytes=new Uint8Array(e.bytes);let count=0;
  while(true){
    const {value,done}=await reader.read();if(done)break;
    if(count+value.byteLength>e.bytes){reader.cancel().catch(()=>{});return false;}
    bytes.set(value,count);count+=value.byteLength;
  }
  if(count!==e.bytes)return false;
  const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
  return h===e.hash;
}
self.addEventListener('install',()=>{});
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
// No skipWaiting or arbitrary messages. Existing clients retain their build generation.
self.addEventListener('fetch',event=>{
  const path=eligible(event.request);
  if(!path)return; // API/auth navigation bypasses SW completely; HTTPS responses enforce no-store.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(new Request(event.request,{credentials:'omit',cache:'no-store',redirect:'error'}));
      if(response.status===200){
        if(!await verified(response,path))return Response.error();
        // Quota pressure must not turn a verified online response into an offline failure.
        try{await cache.put(self.location.origin+path,response.clone());}catch{}
      }
      return response;
    }catch{
      const cached=await cache.match(self.location.origin+path);
      if(cached && await verified(cached,path))return cached;
      return Response.error();
    }
  })());
});
`;
