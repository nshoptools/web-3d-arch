// Test-only client. Trusts this run's synthetic certificate on one exact loopback origin.
import {request} from 'node:https';import assert from 'node:assert/strict';
export function scopedHTTPS(origin,ca){
 const allowed=new URL(origin);assert.equal(allowed.protocol,'https:');assert.equal(allowed.hostname,'127.0.0.1');
 return (url,options={})=>new Promise((yes,no)=>{
  const u=new URL(url);assert.equal(u.origin,origin);assert.equal(u.username,'');assert.equal(u.password,'');assert.equal(u.hash,'');
  const req=request(u,{ca,rejectUnauthorized:true,method:options.method??'GET',headers:options.headers??{},timeout:15000},res=>{
   const chunks=[];let total=0;res.on('data',b=>{total+=b.length;if(total>16*1024*1024){req.destroy(Error('TEST_RESPONSE_LIMIT'));return;}chunks.push(b);});
   res.on('error',no);res.on('end',()=>{
    const headers=new Headers();for(const [k,v]of Object.entries(res.headers))for(const x of Array.isArray(v)?v:[v])if(x!==undefined)headers.append(k,x);
    yes(new Response([204,205,304].includes(res.statusCode)?null:Buffer.concat(chunks),{status:res.statusCode,headers}));
   });
  });req.on('error',no);req.on('timeout',()=>req.destroy(Error('TEST_RESPONSE_DEADLINE')));
  if(options.body!==undefined)req.write(options.body);req.end();
 });
}
