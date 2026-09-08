import { request } from 'node:http';
import { need, HostFault } from './core.mjs';
import { privateHeaders, secureHeaders } from './headers.mjs';

const REQUEST_HEADERS = ['accept','accept-language','content-type','cookie','origin','sec-fetch-site','sec-fetch-mode','sec-fetch-dest',
  'x-csrf-token','idempotency-key','if-match','authorization'];
const RESPONSE_HEADERS = ['content-type','content-disposition','etag','x-request-id','x-user-id','x-session-id','retry-after','location','set-cookie'];
export async function readRequest(req, config) {
  need(!req.headers['content-encoding'] || req.headers['content-encoding'] === 'identity', 'CONTENT_ENCODING_UNSUPPORTED',415);
  const size = req.headers['content-length'];
  need(size === undefined || (/^(0|[1-9]\d*)$/.test(size) && Number(size) <= config.maxRequestBytes), 'BODY_TOO_LARGE',413);
  return new Promise((resolve,reject) => {
    let total=0, done=false; const chunks=[];
    const finish=(error,value)=>{
      if(done)return; done=true; clearTimeout(timer);
      req.removeListener('data',data);req.removeListener('end',end);req.removeListener('aborted',aborted);
      if(error){req.resume();reject(error);}else resolve(value);
    };
    const data=chunk=>{total+=chunk.length;if(total>config.maxRequestBytes)finish(new HostFault('BODY_TOO_LARGE',413));else chunks.push(chunk);};
    const end=()=>finish(null,Buffer.concat(chunks));
    const aborted=()=>finish(new HostFault('REQUEST_ABORTED',400));
    const timer=setTimeout(()=>finish(new HostFault('REQUEST_TIMEOUT',408)),config.requestDeadlineMs);
    req.on('data',data); req.once('end',end); req.once('aborted',aborted);
    req.once('error',aborted);
  });
}
export async function forward(req,res,config,body) {
  const headers = {host:new URL(config.origin).host,'content-length':body.length,'accept-encoding':'identity'};
  for(const k of REQUEST_HEADERS)if(req.headers[k] !== undefined)headers[k]=req.headers[k];
  const result=await new Promise((resolve,reject)=>{
    let done=false,sent=false,upstream;
    const finish=(error,value)=>{
      if(done)return;done=true;clearTimeout(timer);res.removeListener('close',gone);
      if(error){upstream?.destroy();reject(error);}else resolve(value);
    };
    const ambiguous=()=>new HostFault(sent && !['GET','HEAD'].includes(req.method) ? 'API_DELIVERY_UNKNOWN':'API_UNAVAILABLE',502);
    const gone=()=>finish(ambiguous());
    const timer=setTimeout(()=>finish(new HostFault(sent && !['GET','HEAD'].includes(req.method)?'API_DELIVERY_UNKNOWN':'API_TIMEOUT',504)),config.upstreamDeadlineMs);
    res.once('close',gone);
    upstream=request({hostname:'127.0.0.1',port:config.backendPort,path:req.url,method:req.method,
      headers,agent:false,maxHeaderSize:16384},response=>{
      const chunks=[];let bytes=0;
      if(response.statusCode<200 || response.statusCode>599 ||
         response.headers['content-encoding'] && response.headers['content-encoding']!=='identity') {
        response.destroy();finish(ambiguous());return;
      }
      const length=response.headers['content-length'];
      if(length!==undefined && (!/^\d+$/.test(length) || Number(length)>config.maxResponseBytes)){response.destroy();finish(ambiguous());return;}
      response.on('data',chunk=>{
        bytes+=chunk.length;
        if(bytes>config.maxResponseBytes){response.destroy();finish(ambiguous());}else chunks.push(chunk);
      });
      response.once('end',()=>finish(null,{status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));
      response.once('aborted',()=>finish(ambiguous()));response.once('error',()=>finish(ambiguous()));
    });
    upstream.once('error',()=>finish(ambiguous()));
    // Exactly one attempt, including on timeout, disconnect, parser failure, or 5xx.
    sent=true;upstream.end(body);
  });
  if(res.destroyed)return;
  if(result.headers.location !== undefined) {
    const location=result.headers.location;
    need(typeof location==='string' && location.startsWith('/') && !location.startsWith('//') &&
      !/[\x00-\x20\x7f\\]/.test(location) && new URL(location,config.origin).origin===config.origin, 'UPSTREAM_REDIRECT_REJECTED',502);
  }
  for(const k of RESPONSE_HEADERS)if(result.headers[k]!==undefined)res.setHeader(k,result.headers[k]);
  secureHeaders(res,config);privateHeaders(res);
  res.setHeader('Content-Length',result.body.length);
  res.statusCode=result.status;
  res.end(req.method==='HEAD'?undefined:result.body);
}
