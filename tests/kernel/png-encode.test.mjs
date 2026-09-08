import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {encodeRasterPNG} from '../../src/core/png-encode.mjs';
import {crc32} from '../../src/storage/zip.mjs';

test('RGBA PNG retains exact transparent/color bytes, dimensions, CRC and sRGB; independent zlib readback',async()=>{
  const width=37,height=23,data=Uint8ClampedArray.from({length:width*height*4},(_,i)=>(i*71+Math.floor(i/17))%256),prior=new Uint8ClampedArray(data);
  const bytes=await encodeRasterPNG({width,height,data});assert.deepEqual(data,prior);
  assert.deepEqual(Array.from(bytes.slice(0,8)),[137,80,78,71,13,10,26,10]);
  const view=new DataView(bytes.buffer),chunks=[];let offset=8;
  while(offset<bytes.length){const n=view.getUint32(offset),type=new TextDecoder().decode(bytes.slice(offset+4,offset+8));
    assert.equal(crc32(bytes.subarray(offset+4,offset+8+n)),view.getUint32(offset+8+n));chunks.push({type,bytes:bytes.slice(offset+8,offset+8+n)});offset+=n+12;}
  assert.equal(offset,bytes.length);assert.deepEqual(chunks.map(c=>c.type),['IHDR','sRGB','IDAT','IEND']);
  assert.deepEqual(Array.from(chunks[0].bytes),[0,0,0,width,0,0,0,height,8,6,0,0,0]);assert.deepEqual(Array.from(chunks[1].bytes),[0]);
  const raw=inflateSync(chunks[2].bytes),stride=width*4;assert.equal(raw.length,height*(stride+1));
  for(let y=0;y<height;y++){assert.equal(raw[y*(stride+1)],0);assert.deepEqual(new Uint8Array(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1))),new Uint8Array(data.subarray(y*stride,(y+1)*stride)));}
});
test('RGBA PNG rejects malformed dimensions/length and aborted work before any output',async()=>{
  for(const width of [0,NaN,Infinity,-1,1.5,16385])await assert.rejects(encodeRasterPNG({width,height:1,data:new Uint8ClampedArray(4)}),{code:'PNG_DIMENSIONS'});
  await assert.rejects(encodeRasterPNG({width:1,height:1,data:new Uint8ClampedArray(3)}),{code:'PNG_RGBA'});
  await assert.rejects(encodeRasterPNG({width:1,height:1,data:new Uint8ClampedArray(4)},{signal:AbortSignal.abort()}),{code:'CANCELLED'});
});
test('RGBA PNG streams a processing-size image above the browser Blob backing threshold',async()=>{
  const width=1280,height=640,data=Uint8ClampedArray.from({length:width*height*4},(_,i)=>(i*19+(i>>>11))&255);
  const bytes=await encodeRasterPNG({width,height,data}),view=new DataView(bytes.buffer);let offset=8,compressed;
  while(offset<bytes.length){const n=view.getUint32(offset);if(new TextDecoder().decode(bytes.subarray(offset+4,offset+8))==='IDAT')compressed=bytes.subarray(offset+8,offset+8+n);offset+=n+12;}
  const raw=inflateSync(compressed);assert.equal(raw.length,(width*4+1)*height);
  for(let y=0;y<height;y++)assert.deepEqual(new Uint8Array(raw.subarray(y*(width*4+1)+1,(y+1)*(width*4+1))),new Uint8Array(data.subarray(y*width*4,(y+1)*width*4)));
});
