import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inputFixture} from './helpers.mjs';
import {createSourceTransport,materializeReleaseSourceLibrary,CONFIG_BYTES} from '../../tools/release/source-transport.mjs';
import {hash,jsonBytes} from '../../tools/release/core.mjs';
function original(){
 const f=inputFixture(),catalogBytes=readFileSync(resolve(f.input.library.root,f.input.library.catalog.file)),deploymentBytes=readFileSync(resolve(f.input.library.root,f.input.library.deployment.file));
 return {catalogBytes,deploymentBytes};
}
test('separate release binding preserves original bytes, hashes, semantic media, previews and variations',async()=>{
 const b=original(),before=[hash(b.catalogBytes),hash(b.deploymentBytes)],map=await createSourceTransport(b);
 const config=await materializeReleaseSourceLibrary({...b,transportBytes:jsonBytes(map),origin:'https://arch.example.com',basePath:'/library/'});
 assert.equal(map.version,'arch-release-transport/1');
 assert.equal(config.assetURLs.length,4);
 assert.ok(config.assetURLs.find(a=>a.mediaType==='image/svg+xml').url.endsWith('.bin'));
 assert.ok(config.assetURLs.find(a=>a.mediaType==='text/plain').url.endsWith('.bin'));
 assert.ok(config.assetURLs.find(a=>a.mediaType==='image/png').url.endsWith('.png'));
 assert.ok(config.assetURLs.every(a=>a.url.startsWith('https://arch.example.com/library/source-assets/')));
 assert.deepEqual(config.catalog,JSON.parse(b.catalogBytes));assert.deepEqual([hash(b.catalogBytes),hash(b.deploymentBytes)],before);
 assert.equal(map.records.find(a=>a.sourceMediaType==='image/svg+xml').wireMime,'application/octet-stream');
});
test('frozen materializer still sees original .svg and rejects rewritten deployment1 suffix',async()=>{
 const b=original(),d=JSON.parse(b.deploymentBytes),r=d.records.find(a=>a.mediaType==='image/svg+xml');
 r.url=r.url.replace('.svg','.bin');
 await assert.rejects(createSourceTransport({...b,deploymentBytes:jsonBytes(d)}),{code:'LIBRARY_URL'});
});
for(const kind of ['wrong-hash','wrong-size','active-svg','wrong-url','duplicate','missing','extra-field','PNG-bin'])
 test('reject transport '+kind,async()=>{
  const b=original(),map=await createSourceTransport(b),r=map.records.find(a=>a.sourceMediaType==='image/svg+xml');
  if(kind==='wrong-hash')map.catalogSha256='0'.repeat(64);
  if(kind==='wrong-size')r.bytes++;
  if(kind==='active-svg')r.wireMime='image/svg+xml';
  if(kind==='wrong-url')r.url='../escape.bin';
  if(kind==='duplicate')map.records[0]=map.records[1];
  if(kind==='missing')map.records.pop();
  if(kind==='extra-field')r.fallback='monochrome';
  if(kind==='PNG-bin')map.records.find(a=>a.sourceMediaType==='image/png').url='source-assets/x.bin';
  await assert.rejects(materializeReleaseSourceLibrary({...b,transportBytes:jsonBytes(map),origin:'https://arch.example.com'}));
 });
test('original resource/preview limits, encoded config limit and unsafe origin are enforced',async()=>{
 const b=original(),d=JSON.parse(b.deploymentBytes);d.records[0].bytes=16000001;
 await assert.rejects(createSourceTransport({...b,deploymentBytes:jsonBytes(d)}),{code:'LIBRARY_BYTES'});
 const c=JSON.parse(b.catalogBytes);c.previews[0].sha256=d.records.find(r=>r.mediaType==='image/svg+xml').sha256;
 await assert.rejects(createSourceTransport({...b,catalogBytes:jsonBytes(c)}),{code:'LIBRARY_REFERENCE'});
 await assert.rejects(createSourceTransport({...b,catalogBytes:new Uint8Array(CONFIG_BYTES+1)}),{code:'CONFIG_BYTES_LIMIT'});
 const map=await createSourceTransport(b);
 await assert.rejects(materializeReleaseSourceLibrary({...b,transportBytes:jsonBytes(map),origin:'https://name:password@arch.example.com'}),{code:'LIBRARY_ORIGIN'});
});

test('config inputs are owned snapshots across async hashes; caller mutation cannot change binding',async()=>{
 const b=original(),catalogBefore=hash(b.catalogBytes),deploymentBefore=hash(b.deploymentBytes);
 const pending=createSourceTransport(b);b.catalogBytes.fill(32);b.deploymentBytes.fill(32);
 const map=await pending;assert.equal(map.catalogSha256,catalogBefore);assert.equal(map.deploymentSha256,deploymentBefore);
});
test('shared mutable config buffers are rejected before copy/parse',async()=>{
 const b=original(),shared=new Uint8Array(new SharedArrayBuffer(b.catalogBytes.length));shared.set(b.catalogBytes);
 await assert.rejects(createSourceTransport({...b,catalogBytes:shared}),{code:'SHARED_CONFIG_REJECTED'});
});
