import { Resolver } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';
import { fail, Fault } from './core.mjs';

export function endpoint(value,{testOnly=false}={}) {
  const u=new URL(value);
  fail(!u.username&&!u.password&&!u.hash&&!u.search,500,'ENDPOINT_INVALID');
  if(testOnly&&u.protocol==='http:'&&u.hostname==='127.0.0.1')return u;
  fail(u.protocol==='https:'&&(!u.port||u.port==='443')&&!isIP(u.hostname)&&u.hostname.includes('.')&&!u.hostname.endsWith('.localhost'),500,'ENDPOINT_INVALID');
  return u;
}
export function publicIPv4(ip) {
  if(isIP(ip)!==4)return false;
  const [a,b,c]=ip.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
function aborted(signal) {return new Fault(502,signal.reason?.code==='UPSTREAM_TIMEOUT'?'UPSTREAM_TIMEOUT':'UPSTREAM_ABORTED');}
async function resolvePublic(host,signal) {
  const resolver=new Resolver({timeout:2000,tries:2});
  const cancel=()=>resolver.cancel();signal.addEventListener('abort',cancel,{once:true});
  try {return await resolver.resolve4(host);}
  finally {signal.removeEventListener('abort',cancel);}
}
function withAbort(promise,signal) {
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(aborted(signal));
    if(signal.aborted){abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
// Constructor injection is for server tests, never deployment JSON or a browser request.
export function createBoundedTransport({resolve4=resolvePublic,https=httpsRequest,http=httpRequest}={}) {
  return async function requestBounded(url,{method='GET',headers={},body=null,testOnly=false,signal:parent,
    timeoutMs=10_000,maxBytes=262_144,maxRequestBytes=262_144,captureStatus=false,
    allowedOrigins,onHeaders,beforeRequest}={}) {
    const u=endpoint(url,{testOnly}),local=testOnly&&u.protocol==='http:';
    fail(!allowedOrigins||allowedOrigins.includes(u.origin),502,'ENDPOINT_ORIGIN_BLOCKED');
    for(const [n,max] of [[timeoutMs,120_000],[maxBytes,48_000_000],[maxRequestBytes,12_000_000]])
      fail(Number.isInteger(n)&&n>0&&n<=max,500,'TRANSPORT_LIMIT_INVALID');
    fail(body===null||Buffer.isBuffer(body)||typeof body==='string',500,'TRANSPORT_BODY_INVALID');
    const payload=body===null?null:Buffer.from(body);
    fail(!payload||payload.length<=maxRequestBytes,413,'UPSTREAM_REQUEST_TOO_LARGE');
    const control=new AbortController(),signal=parent?AbortSignal.any([parent,control.signal]):control.signal;
    const timer=setTimeout(()=>control.abort(new Fault(502,'UPSTREAM_TIMEOUT')),timeoutMs);timer.unref();
    try {
      if(signal.aborted)throw aborted(signal);
      let ips;
      try {ips=local?['127.0.0.1']:await withAbort(resolve4(u.hostname,signal),signal);}
      catch {throw signal.aborted?aborted(signal):new Fault(502,'ENDPOINT_DNS_UNAVAILABLE');}
      fail(Array.isArray(ips)&&ips.length>0&&ips.length<=64&&(local||ips.every(publicIPv4)),502,'ENDPOINT_ADDRESS_BLOCKED');
      if(signal.aborted)throw aborted(signal);
      if(beforeRequest)beforeRequest();
      return await new Promise((resolve,reject)=>{
        let req,res,done=false;
        const finish=(error,value)=>{
          if(done)return;done=true;
          signal.removeEventListener('abort',abort);
          if(error){res?.destroy();req?.destroy();reject(error);}else resolve(value);
        };
        const abort=()=>finish(aborted(signal));
        signal.addEventListener('abort',abort,{once:true});
        try {
          req=(local?http:https)(u,{
            method,headers:{...headers,...(payload?{'content-length':String(payload.length)}:{})},
            agent:false,signal,maxHeaderSize:16_384,
            // Preserve TLS SNI/certificate verification of u.hostname; DNS is resolved exactly once.
            lookup:(_host,opts,cb)=>opts.all?cb(null,[{address:ips[0],family:4}]):cb(null,ips[0],4)
          },response=>{
            res=response;
            const status=res.statusCode;
            if(onHeaders)try{onHeaders(status,res.headers);}catch{finish(new Fault(502,'UPSTREAM_REJECTED'));return;}
            // No redirect is followed, even to the same origin. Destroy instead of unbounded draining.
            if(status>=300&&status<400||!captureStatus&&(status<200||status>=300)){
              finish(new Fault(502,'UPSTREAM_REJECTED'));return;
            }
            const limit=status>=400?Math.min(maxBytes,65_536):maxBytes;
            const length=res.headers['content-length'],encoding=res.headers['content-encoding'];
            if(encoding&&encoding!=='identity'){finish(new Fault(502,'UPSTREAM_ENCODING_REJECTED'));return;}
            if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)>limit)){
              finish(new Fault(502,'UPSTREAM_TOO_LARGE'));return;
            }
            const chunks=[];let received=0;
            res.on('data',chunk=>{
              received+=chunk.length;
              if(received>limit)finish(new Fault(502,'UPSTREAM_TOO_LARGE'));
              else chunks.push(chunk);
            });
            res.on('end',()=>{
              if(!res.complete){finish(new Fault(502,'UPSTREAM_UNAVAILABLE'));return;}
              finish(null,{statusCode:status,bytes:Buffer.concat(chunks),headers:res.headers});
            });
            res.on('error',()=>finish(new Fault(502,'UPSTREAM_UNAVAILABLE')));
            res.on('aborted',()=>finish(new Fault(502,'UPSTREAM_UNAVAILABLE')));
          });
          req.on('error',()=>finish(signal.aborted?aborted(signal):new Fault(502,'UPSTREAM_UNAVAILABLE')));
          if(signal.aborted){abort();return;}
          req.end(payload);
        } catch {finish(signal.aborted?aborted(signal):new Fault(502,'UPSTREAM_UNAVAILABLE'));}
      });
    } finally {clearTimeout(timer);payload?.fill(0);}
  };
}
export const boundedRequest=createBoundedTransport();
