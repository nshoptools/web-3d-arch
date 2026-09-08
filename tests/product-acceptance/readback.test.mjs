// Synthetic bytes test the independent acceptance oracle only, never product geometry.
import test from 'node:test';import assert from 'node:assert/strict';import {deflateRawSync} from 'node:zlib';
import {crc32,readDownloadZip,inspectSTL,verifyReceipt} from './readback.mjs';
import {sha256,relativeFile} from './artifact.mjs';import {suiteExit,featureVerdict,redactText} from './records.mjs';
function zip(name,bytes,method=0){
 const n=Buffer.from(name),data=method===8?deflateRawSync(bytes):bytes,l=Buffer.alloc(30),c=Buffer.alloc(46),e=Buffer.alloc(22);
 l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(method,8);l.writeUInt32LE(crc32(bytes),14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(bytes.length,22);l.writeUInt16LE(n.length,26);
 c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(method,10);c.writeUInt32LE(crc32(bytes),16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(bytes.length,24);c.writeUInt16LE(n.length,28);
 e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);e.writeUInt32LE(c.length+n.length,12);e.writeUInt32LE(l.length+n.length+data.length,16);
 return Buffer.concat([l,n,data,c,n,e]);
}
test('ZIP stored and deflated byte identity with independent CRC',()=>{for(const method of [0,8]){const b=Buffer.from('Tiếng Việt '.repeat(5));assert.deepEqual(readDownloadZip(zip('assets/data.bin',b,method)).get('assets/data.bin'),b);}assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);});
test('ZIP tamper, truncated and declared expansion limits reject',()=>{const b=zip('a.bin',Buffer.from('payload'));const bad=Buffer.from(b);bad[40]^=1;assert.throws(()=>readDownloadZip(bad));assert.throws(()=>readDownloadZip(b.subarray(0,b.length-1)));assert.throws(()=>readDownloadZip(zip('x',Buffer.alloc(100000),8),{maxTotal:99999}));});
test('ZIP/path traversal never becomes a readback asset',()=>{for(const name of ['../a','/a','a/../b','a\\b','a:%',''])assert.throws(()=>readDownloadZip(zip(name,Buffer.from('x'))));for(const name of ['../a','/a','a//b','a:b'])assert.throws(()=>relativeFile(name));});
test('STL count and finite raw float boundaries',()=>{const b=Buffer.alloc(134);b.writeUInt32LE(1,80);b.writeFloatLE(1,108);b.writeFloatLE(1,124);assert.equal(inspectSTL(b).triangleCount,1);assert.throws(()=>inspectSTL(b.subarray(1)));const bad=Buffer.from(b);bad.writeFloatLE(NaN,96);assert.throws(()=>inspectSTL(bad));});
test('receipt binds actual artifact bytes, format and revision',()=>{const download=Buffer.from('actual-download-test-bytes');const r={schema:'arch-app-export-receipt/1',projectId:'p',artifact:{projectRevision:8,formatId:'stl-union',sha256:sha256(download),byteLength:download.length}};const raw=Buffer.from(JSON.stringify(r)),expected={projectId:'p',revision:8,formatId:'stl-union'};verifyReceipt(raw,download,expected);assert.throws(()=>verifyReceipt(raw,Buffer.from('other'),expected));assert.throws(()=>verifyReceipt(raw,download,{...expected,revision:9}));assert.throws(()=>verifyReceipt(raw,download,{...expected,projectId:'q'}));});
test('correct refusal never passes an unavailable feature or campaign',()=>{assert.equal(featureVerdict({executed:true,capabilityAvailable:false,refusalPolicyPassed:true}),'unsupported');assert.equal(featureVerdict({executed:true,capabilityAvailable:true,oraclePassed:false,refusalPolicyPassed:true}),'fail');assert.equal(suiteExit([{verdict:'pass'},{verdict:'unsupported'}]),2);assert.equal(suiteExit([{verdict:'unverified'},{verdict:'fail'}]),1);});
test('diagnostic sanitization drops OIDC query and synthetic secrets',()=>{assert.equal(redactText('https://127.0.0.1/auth?code=secret extra',['secret']),'https://127.0.0.1/auth?[REDACTED] extra');});


test('empty selection cannot report executed acceptance',()=>{assert.equal(suiteExit([]),2);});
