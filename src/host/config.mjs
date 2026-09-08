import { isIP } from 'node:net';
import { inside, plainPath, need, exact, integer } from './core.mjs';
export function validateConfig(input) {
  const required=['schemaVersion','origin','bindAddress','port','backendPort','webroot','manifestPath','tlsKeyPath','tlsCertPath'];
  exact(input,[...required,'serviceWorker','immutableMaxAge','hstsSeconds','maxAssetBytes','maxPublicBytes','maxRequestBytes','maxResponseBytes','maxConcurrent','maxConnections','requestDeadlineMs','upstreamDeadlineMs'],required);
  const c={serviceWorker:false,immutableMaxAge:31536000,hstsSeconds:31536000,maxAssetBytes:64*1024*1024,maxPublicBytes:512*1024*1024,
    maxRequestBytes:32_500_000,maxResponseBytes:32_500_000,maxConcurrent:16,maxConnections:128,requestDeadlineMs:30_000,upstreamDeadlineMs:35_000,...input};
  need(c.schemaVersion===1,'CONFIG_VERSION');
  const u=new URL(c.origin);
  need(u.protocol==='https:' && u.origin===c.origin && !u.username && !u.password, 'HTTPS_ORIGIN_REQUIRED');
  need(isIP(c.bindAddress)>0,'BIND_IP_REQUIRED');
  integer(c.port,0,65535);integer(c.backendPort,1,65535);
  need(c.port===0 || Number(u.port||443)===c.port,'ORIGIN_PORT_MISMATCH');
  need(typeof c.serviceWorker==='boolean','CONFIG_INVALID');
  integer(c.immutableMaxAge,0,31536000);integer(c.hstsSeconds,0,63072000);
  integer(c.maxAssetBytes,1,268435456);integer(c.maxPublicBytes,1,1073741824);
  integer(c.maxRequestBytes,1,32_500_000);integer(c.maxResponseBytes,1,64*1024*1024);
  integer(c.maxConcurrent,1,128);integer(c.maxConnections,c.maxConcurrent,1024);
  integer(c.requestDeadlineMs,50,60_000);integer(c.upstreamDeadlineMs,50,180_000);
  for(const k of ['webroot','manifestPath','tlsKeyPath','tlsCertPath'])c[k]=plainPath(c[k]);
  for(const k of ['manifestPath','tlsKeyPath','tlsCertPath'])need(!inside(c.webroot,c[k]),'PRIVATE_FILE_IN_WEBROOT');
  return Object.freeze(c);
}
