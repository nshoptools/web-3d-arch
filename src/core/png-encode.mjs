/** PNG RGBA8/sRGB, non-interlaced, filter 0. Compression uses platform RFC1950.
 * References: W3C PNG Third Edition §§5,7,10,11; WHATWG Compression §3. */
const table=Uint32Array.from({length:256},(_,value)=>{for(let i=0;i<8;i++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const fail=code=>{throw Object.assign(new Error(code),{code});};
function chunk(type,data){
  const bytes=new Uint8Array(12+data.length),view=new DataView(bytes.buffer);view.setUint32(0,data.length);
  for(let i=0;i<4;i++)bytes[4+i]=type.charCodeAt(i);bytes.set(data,8);
  let crc=0xffffffff;for(let i=4;i<8+data.length;i++)crc=table[(crc^bytes[i])&255]^(crc>>>8);
  view.setUint32(8+data.length,(crc^0xffffffff)>>>0);return bytes;
}
export async function encodeRasterPNG({width,height,data},{signal}={}) {
  if(!Number.isInteger(width)||width<1||width>16384||!Number.isInteger(height)||height<1||height>16384||width*height>16777216)fail('PNG_DIMENSIONS');
  if(!(data instanceof Uint8ClampedArray)||data.length!==width*height*4)fail('PNG_RGBA');
  if(signal?.aborted)fail('CANCELLED');if(typeof CompressionStream!=='function')fail('PNG_COMPRESSION_UNAVAILABLE');
  const stride=width*4,scanlines=new Uint8Array(height*(1+stride));
  for(let y=0;y<height;y++)scanlines.set(data.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
  // Stream owned memory directly. Some browser Blob implementations move large
  // bodies to temporary files and fail reads from a Worker. No Blob I/O is
  // necessary for this encoder; bounded chunks also provide backpressure.
  let offset=0;
  const source=new ReadableStream({pull(controller){if(offset===scanlines.length){controller.close();return;}
    const end=Math.min(offset+65536,scanlines.length);controller.enqueue(scanlines.subarray(offset,end));offset=end;}});
  const compressed=new Uint8Array(await new Response(source.pipeThrough(new CompressionStream('deflate'),{signal})).arrayBuffer());
  if(signal?.aborted)fail('CANCELLED');if(compressed.length>80*1024*1024)fail('PNG_OUTPUT_BUDGET');
  const header=new Uint8Array(13),view=new DataView(header.buffer);view.setUint32(0,width);view.setUint32(4,height);header[8]=8;header[9]=6;
  const pieces=[Uint8Array.of(137,80,78,71,13,10,26,10),chunk('IHDR',header),chunk('sRGB',Uint8Array.of(0)),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())];
  const bytes=new Uint8Array(pieces.reduce((n,p)=>n+p.length,0));offset=0;for(const p of pieces){bytes.set(p,offset);offset+=p.length;}return bytes;
}
