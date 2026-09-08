import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {decodePixels,encodePNG,thumbnail,base64Bytes} from '../../src/server/image-codec.mjs';
import {checkImage} from '../../src/server/image-workers.mjs';
import {chunk,jpg} from './adapter-helpers.mjs';
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
function png(w,h,color,raw,extras=[],depth=8,interlace=0){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w);ihdr.writeUInt32BE(h,4);ihdr[8]=depth;ihdr[9]=color;ihdr[12]=interlace;return Buffer.concat([sig,chunk('IHDR',ihdr),...extras,chunk('IDAT',deflateSync(Buffer.from(raw))),chunk('IEND',Buffer.alloc(0))]);}
test('B03 PNG: all five filters reconstruct analytically specified RGB samples',()=>{
 const rows=[[11,22,33,45,56,67],[11,22,33,34,34,34],[1,2,3,5,6,7],[6,12,18,20,20,21],[1,2,3,5,6,7]];
 for(let f=0;f<5;f++){const d=decodePixels(png(2,2,2,[0,10,20,30,40,50,60,f,...rows[f]]),'image/png');
 assert.deepEqual([...d.data],[10,20,30,255,40,50,60,255,11,22,33,255,45,56,67,255]);}
});
test('B03 PNG: real palette transparency and grayscale alpha, hidden RGB retained',()=>{
 const palette=chunk('PLTE',Buffer.from([255,0,0,0,255,0]));
 assert.deepEqual([...decodePixels(png(2,1,3,[0,0,1],[palette,chunk('tRNS',Buffer.from([0,128]))]),'image/png').data],[255,0,0,0,0,255,0,128]);
 assert.deepEqual([...decodePixels(png(2,1,4,[0,7,0,9,128]),'image/png').data],[7,7,7,0,9,9,9,128]);
 assert.deepEqual([...decodePixels(png(2,1,0,[0,3,4],[chunk('tRNS',Buffer.from([0,3]))]),'image/png').data],[3,3,3,0,4,4,4,255]);
});
test('B03 PNG: dimension and decompression fences run before oversized output allocation',()=>{
 assert.throws(()=>decodePixels(png(4097,1,6,[0]),'image/png'),/IMAGE_PIXEL_LIMIT/);
 assert.throws(()=>decodePixels(png(4096,4096,6,[0]),'image/png'),/IMAGE_PIXEL_LIMIT/);
 assert.throws(()=>decodePixels(png(1,1,6,Buffer.alloc(2_000_000)),'image/png'),/IMAGE_INVALID/);
 assert.throws(()=>decodePixels(png(1,1,6,[0,1,2]),'image/png'),/IMAGE_INVALID/);
});
test('B03 PNG: CRC, trailing bytes, APNG, ICC/custom gamma, interlace/16-bit and palette overflow reject',()=>{
 const good=png(1,1,6,[0,1,2,3,4]),bad=Buffer.from(good);bad[40]^=1;
 const invalid=[bad,good.subarray(0,-5),Buffer.concat([good,Buffer.from([0])]),png(1,1,6,[0,0,0,0,0],[chunk('acTL',Buffer.alloc(8))]),png(1,1,6,[0,0,0,0,0],[chunk('iCCP',Buffer.alloc(1))]),png(1,1,6,[0,0,0,0,0],[chunk('gAMA',Buffer.from([0,0,0,1]))]),png(1,1,6,[0,0,0,0,0],[],16),png(1,1,6,[0,0,0,0,0],[],8,1),png(1,1,3,[0,1],[chunk('PLTE',Buffer.from([0,0,0]))])];
 for(const b of invalid)assert.throws(()=>decodePixels(b,'image/png'),/IMAGE_/);
});
test('B03 baseline malformed 1px fixture is rejected; corrected IDAT CRC decodes opaque white',()=>{
 const original=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0uUAAAAASUVORK5CYII=','base64');
 assert.throws(()=>decodePixels(original,'image/png'),/IMAGE_INVALID/);
 original.writeUInt32BE(4020414299,52);assert.deepEqual([...decodePixels(original,'image/png').data],[255,255,255,255]);
});
test('B03 JPEG: pinned decoder produces actual baseline pixels; missing entropy/EOI/progressive/EXIF reject',()=>{
 const d=decodePixels(jpg,'image/jpeg');assert.equal(d.width,1024);assert.equal(d.data.length,1024*1024*4);assert.equal(d.data[3],255);
 assert.ok(d.data.some((v,i)=>i%4!==3&&v>0));
 const sof=jpg.indexOf(Buffer.from([255,192])),sos=jpg.indexOf(Buffer.from([255,218]));assert.ok(sof>0&&sos>0);
 const progressive=Buffer.from(jpg);progressive[sof+1]=194;
 const empty=Buffer.concat([jpg.subarray(0,sos+2+jpg.readUInt16BE(sos+2)),Buffer.from([255,217])]);
 for(const b of [jpg.subarray(0,-2),empty,progressive,Buffer.concat([jpg.subarray(0,2),Buffer.from([255,225,0,8,69,120,105,102,0,0]),jpg.subarray(2)])])assert.throws(()=>decodePixels(b,'image/jpeg'),/IMAGE_/);
});
test('B03 real thumbnail is bounded and deterministic nearest-center RGBA; original bytes unchanged',async()=>{
 const data=Buffer.alloc(512*2*4);for(let x=0;x<512;x++){data.set([x&255,0,0,255],x*4);data.set([0,x&255,255,128],(512+x)*4);}
 const bytes=encodePNG({width:512,height:2,data}),copy=Buffer.from(bytes),image=await checkImage(bytes,'image/png');
 assert.ok(bytes.equals(copy));const d=decodePixels(image.thumbnail.bytes,'image/png');
 assert.equal(d.width,256);assert.equal(d.height,1);assert.deepEqual([...d.data.subarray(0,8)],[0,1,255,128,0,3,255,128]);
 assert.ok(image.thumbnail.bytes.equals(thumbnail({width:512,height:2,data}).bytes));
});
test('B03 canonical base64 and actual byte limits reject tolerant Buffer decoding cases',()=>{
 for(const s of ['Zh==','Zg=','Zg==\n','data:image/png;base64,Zg==','@@==','A==='])assert.throws(()=>base64Bytes(s,8),/IMAGE_/);
 assert.equal(base64Bytes('Zg==',1).toString(),'f');assert.throws(()=>base64Bytes('AAAA',1));
});
test('B03 worker cancellation/deadline and bounded concurrency release slots',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(checkImage(jpg,'image/jpeg',undefined,{signal:c.signal}),/IMAGE_CANCELLED/);
 await assert.rejects(checkImage(jpg,'image/jpeg',undefined,{timeoutMs:1}),/IMAGE_DECODE_TIMEOUT/);
 const a=new AbortController(),b=new AbortController(),p=checkImage(jpg,'image/jpeg',undefined,{signal:a.signal}),q=checkImage(jpg,'image/jpeg',undefined,{signal:b.signal});
 const settled=Promise.allSettled([p,q]);await assert.rejects(checkImage(jpg,'image/jpeg'),/IMAGE_CODEC_BUSY/);a.abort();b.abort();const results=await settled;assert.ok(results.every(r=>r.status==='rejected'));
 assert.equal((await checkImage(jpg,'image/jpeg')).width,1024);
});

test('B03 valid maximum pixel image decodes within worker bounds and creates an actual bounded thumbnail',async()=>{
 const data=Buffer.alloc(1024*4096*4,255),bytes=encodePNG({width:1024,height:4096,data});
 const v=await checkImage(bytes,'image/png');assert.equal(v.width*v.height,4_194_304);assert.equal(v.thumbnail.height,256);assert.equal(v.thumbnail.width,64);assert.equal(decodePixels(v.thumbnail.bytes,'image/png').data[3],255);
});
test('B03 typed PNG/JPEG subset failures are actionable, with no silent conversion',()=>{
 assert.throws(()=>decodePixels(png(1,1,6,[0,0,0,0,0],[],16),'image/png'),/IMAGE_PNG_BIT_DEPTH_UNSUPPORTED/);
 assert.throws(()=>decodePixels(png(1,1,6,[0,0,0,0,0],[],8,1),'image/png'),/IMAGE_PNG_INTERLACE_UNSUPPORTED/);
 const progressive=Buffer.from(jpg);progressive[jpg.indexOf(Buffer.from([255,192]))+1]=194;
 assert.throws(()=>decodePixels(progressive,'image/jpeg'),/IMAGE_JPEG_PROGRESSIVE_UNSUPPORTED/);
});


test('B03 three-component JPEG without declared JFIF color model is explicitly rejected',()=>{
 assert.equal(jpg[2],255);assert.equal(jpg[3],224);const end=4+jpg.readUInt16BE(4);
 const undec=Buffer.concat([jpg.subarray(0,2),jpg.subarray(end)]);
 assert.throws(()=>decodePixels(undec,'image/jpeg'),/IMAGE_JPEG_COLOR_MODEL_UNSUPPORTED/);
});

