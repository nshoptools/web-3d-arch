import {inflateSync,deflateSync} from 'node:zlib';
import jpeg from './codecs/jpeg-decoder.cjs';
import {fail,sha} from './core.mjs';
export const CODEC_VERSION='arch-image-codec/1';
export const IMAGE_LIMITS=Object.freeze({maxBytes:8_000_000,maxWidth:4096,maxHeight:4096,maxPixels:4_194_304});
export const OUTPUT_LIMITS=Object.freeze({...IMAGE_LIMITS,maxBytes:12_000_000,maxWidth:2048,maxHeight:2048});
export const THUMB_MAX_BYTES=270_000;
const valid=(x,code='IMAGE_INVALID')=>fail(x,422,code);
const sig=Buffer.from([137,80,78,71,13,10,26,10]);
const table=Uint32Array.from({length:256},(_,v)=>{for(let k=0;k<8;k++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
export function crc(b){let n=0xffffffff;for(const v of b)n=table[(n^v)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export function chunk(type,b){const out=Buffer.alloc(b.length+12);out.writeUInt32BE(b.length);out.write(type,4);b.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;}
function size(w,h,l){valid(Number.isInteger(w)&&Number.isInteger(h)&&w>0&&h>0&&w<=l.maxWidth&&h<=l.maxHeight&&w*h<=l.maxPixels,'IMAGE_PIXEL_LIMIT');return {width:w,height:h};}
export function base64Bytes(value,maxBytes){
 valid(typeof value==='string'&&value.length>0&&value.length<=4*Math.ceil(maxBytes/3)&&value.length%4===0,'IMAGE_BYTE_LIMIT');
 valid(!/[^A-Za-z0-9+/=]/.test(value));const pad=value.indexOf('=');valid(pad<0||pad>=value.length-2&&/^={1,2}$/.test(value.slice(pad)));
 const b=Buffer.from(value,'base64');valid(b.length>0&&b.length<=maxBytes&&b.toString('base64')===value);return b;
}
const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
function png(bytes,l){
 valid(bytes.subarray(0,8).equals(sig));let p=8,header=null,palette=null,trans=null,seen=false,ended=false,dataEnded=false,count=0;
 const parts=[],seenAnc=new Set();
 while(p<bytes.length){
  valid(++count<=4096&&p+12<=bytes.length);const n=bytes.readUInt32BE(p),start=p+8,end=start+n;
  valid(n<=bytes.length-p-12);const type=bytes.toString('ascii',p+4,start);
  valid(/^[A-Za-z]{4}$/.test(type)&&crc(bytes.subarray(p+4,end))===bytes.readUInt32BE(end)&&!ended);
  if(!header)valid(type==='IHDR');
  if(type==='IHDR'){
   valid(!header&&n===13);const w=bytes.readUInt32BE(start),h=bytes.readUInt32BE(start+4);size(w,h,l);
   valid(bytes[start+8]===8,'IMAGE_PNG_BIT_DEPTH_UNSUPPORTED');valid(bytes[start+12]===0,'IMAGE_PNG_INTERLACE_UNSUPPORTED');valid([0,2,3,4,6].includes(bytes[start+9]),'IMAGE_FORMAT_UNSUPPORTED');
   valid(bytes[start+10]===0&&bytes[start+11]===0);header={w,h,color:bytes[start+9],channels:{0:1,2:3,3:1,4:2,6:4}[bytes[start+9]]};
  }else if(type==='PLTE'){valid(!seen&&!palette&&n>0&&n%3===0&&n<=768&&![0,4].includes(header.color));palette=bytes.subarray(start,end);
  }else if(type==='tRNS'){valid(!seen&&!trans&&[0,2,3].includes(header.color));valid(header.color===0?n===2&&bytes.readUInt16BE(start)<=255:header.color===2?n===6&&[0,2,4].every(i=>bytes.readUInt16BE(start+i)<=255):palette&&n>0&&n<=palette.length/3);trans=bytes.subarray(start,end);
  }else if(type==='IDAT'){valid(!dataEnded&&(header.color!==3||palette));seen=true;parts.push(bytes.subarray(start,end));
  }else if(type==='IEND'){valid(seen&&n===0&&end+4===bytes.length);ended=true;
  }else{
   valid(['sRGB','gAMA','cHRM','pHYs','tEXt','tIME','bKGD','sBIT'].includes(type),'IMAGE_FORMAT_UNSUPPORTED');
   if(type!=='tEXt'){valid(!seenAnc.has(type));seenAnc.add(type);}
   if(type==='sRGB')valid(!seen&&n===1&&bytes[start]<=3);
   if(type==='gAMA')valid(!seen&&n===4&&bytes.readUInt32BE(start)===45455,'IMAGE_COLOR_UNSUPPORTED');
   // Only standard sRGB chromaticity, no silent ICC/custom color conversion.
   if(type==='cHRM')valid(!seen&&n===32&&[31270,32900,64000,33000,30000,60000,15000,6000].every((v,i)=>bytes.readUInt32BE(start+i*4)===v),'IMAGE_COLOR_UNSUPPORTED');
   if(seen)dataEnded=true;
  }
  p=end+4;
 }
 valid(ended);const {w,h,channels,color}=header,stride=w*channels,expected=(stride+1)*h;
 valid(expected<=16_781_312,'IMAGE_DECODE_LIMIT');const compressed=Buffer.concat(parts);
 let raw;try{const v=inflateSync(compressed,{maxOutputLength:expected,info:true});valid(v.buffer.length===expected&&v.engine.bytesWritten===compressed.length);raw=v.buffer;}catch{valid(false);}
 const data=Buffer.alloc(w*h*4),prev=Buffer.alloc(stride),row=Buffer.alloc(stride);let off=0;
 for(let y=0;y<h;y++){
  const filter=raw[off++];valid(filter<=4);
  for(let x=0;x<stride;x++){const a=x>=channels?row[x-channels]:0,b=prev[x],c=x>=channels?prev[x-channels]:0;row[x]=(raw[off++]+[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter])&255;}
  for(let x=0;x<w;x++){const i=x*channels,o=(y*w+x)*4;let r,g,b,a=255;
   if(color===0||color===4){r=g=b=row[i];a=color===4?row[i+1]:trans&&r===trans.readUInt16BE(0)?0:255;}
   else if(color===2||color===6){[r,g,b]=row.subarray(i,i+3);a=color===6?row[i+3]:trans&&r===trans.readUInt16BE(0)&&g===trans.readUInt16BE(2)&&b===trans.readUInt16BE(4)?0:255;}
   else{const k=row[i];valid(k<palette.length/3);[r,g,b]=palette.subarray(k*3,k*3+3);a=trans&&k<trans.length?trans[k]:255;}
   data.set([r,g,b,a],o);
  }prev.set(row);
 }
 return {width:w,height:h,data};
}
function jpegFrame(bytes,l){
 valid(bytes.length>=12&&bytes[0]===255&&bytes[1]===216);let p=2,frame=null,scan=false,count=0,quant=false,huff=false,jfif=false;
 while(p<bytes.length){
  valid(++count<=4096&&bytes[p++]===255);while(bytes[p]===255)p++;const m=bytes[p++];
  if(m===0xd9){valid(p===bytes.length&&scan&&frame);valid(frame.components===1||jfif,'IMAGE_JPEG_COLOR_MODEL_UNSUPPORTED');return frame;}
  valid(p+2<=bytes.length);const n=bytes.readUInt16BE(p),start=p+2,end=p+n;valid(n>=2&&end<=bytes.length);
  if(m===0xc2)valid(false,'IMAGE_JPEG_PROGRESSIVE_UNSUPPORTED');
  if(m===0xe1)valid(false,'IMAGE_JPEG_EXIF_UNSUPPORTED');
  if(m===0xe2)valid(false,'IMAGE_COLOR_PROFILE_UNSUPPORTED');
  if(m===0xee)valid(false,'IMAGE_JPEG_ADOBE_UNSUPPORTED');
  if(m===0xc0){valid(!frame&&bytes[start]===8);const c=bytes[start+5];valid(c!==4,'IMAGE_JPEG_CMYK_UNSUPPORTED');valid([1,3].includes(c)&&n===8+c*3,'IMAGE_FORMAT_UNSUPPORTED');
   frame={...size(bytes.readUInt16BE(start+3),bytes.readUInt16BE(start+1),l),components:c};
   const ids=new Set();let blocks=0;for(let i=0;i<c;i++){const id=bytes[start+6+i*3],sample=bytes[start+7+i*3];valid(!ids.has(id));ids.add(id);valid([1,2].includes(sample>>4)&&[1,2].includes(sample&15));blocks+=(sample>>4)*(sample&15);}valid(blocks<=6);
  }else if(m===0xdb)quant=true;
  else if(m===0xc4)huff=true;
  else if(m===0xda){valid(frame&&quant&&huff&&!scan&&n>=6);const components=bytes[start];valid(n===6+2*components&&bytes[end-3]===0&&bytes[end-2]===63&&bytes[end-1]===0);scan=true;
  }else if(m===0xe0){valid(bytes.toString('ascii',start,start+5)==='JFIF\0','IMAGE_FORMAT_UNSUPPORTED');jfif=true;
  }else valid(m===0xdd||m===0xfe,'IMAGE_FORMAT_UNSUPPORTED'); // EXIF, ICC, Adobe/CMYK and progressive are explicitly unavailable.
  p=end;
  if(m===0xda){while(p<bytes.length){if(bytes[p]!==255){p++;continue;}if(bytes[p+1]===0||bytes[p+1]>=0xd0&&bytes[p+1]<=0xd7){p+=2;continue;}break;}}
 }
 valid(false);
}
export function decodePixels(value,mediaType,limits=IMAGE_LIMITS){
 const l={...IMAGE_LIMITS,...limits};
 for(const k of ['maxBytes','maxWidth','maxHeight','maxPixels'])valid(Number.isSafeInteger(l[k])&&l[k]>0&&l[k]<=({maxBytes:32_000_000,maxWidth:4096,maxHeight:4096,maxPixels:4_194_304})[k],'IMAGE_LIMIT_INVALID');
 valid(value instanceof Uint8Array&&value.length>0&&value.length<=l.maxBytes,'IMAGE_BYTE_LIMIT');const bytes=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
 valid(['image/png','image/jpeg'].includes(mediaType),'IMAGE_FORMAT_UNSUPPORTED');
 let decoded;
 if(mediaType==='image/png')decoded=png(bytes,l);
 else{const frame=jpegFrame(bytes,l);try{decoded=jpeg(bytes,{useTArray:true,formatAsRGBA:true,tolerantDecoding:false,maxResolutionInMP:l.maxPixels/1e6,maxMemoryUsageInMB:96});}catch{valid(false);}
  valid(decoded.width===frame.width&&decoded.height===frame.height&&decoded.data.length===frame.width*frame.height*4);
 }
 return decoded;
}
export function encodePNG({width,height,data}){
 size(width,height,IMAGE_LIMITS);valid(data.length===width*height*4);const raw=Buffer.alloc((width*4+1)*height);
 for(let y=0;y<height;y++)raw.set(data.subarray(y*width*4,(y+1)*width*4),y*(width*4+1)+1);
 const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=6;
 return Buffer.concat([sig,chunk('IHDR',h),chunk('IDAT',deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
export function thumbnail(image){
 const scale=Math.min(1,256/Math.max(image.width,image.height)),width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale)),data=Buffer.alloc(width*height*4);
 // Explicit nearest-center sampling, no alpha/color blending or replacement of originals.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=Math.min(image.width-1,Math.floor((x+.5)*image.width/width)),sy=Math.min(image.height-1,Math.floor((y+.5)*image.height/height));data.set(image.data.subarray((sy*image.width+sx)*4,(sy*image.width+sx+1)*4),(y*width+x)*4);}
 const bytes=encodePNG({width,height,data});valid(bytes.length<=THUMB_MAX_BYTES);return {width,height,bytes,sha256:sha(bytes)};
}
export function analyzeImage(bytes,mediaType,limits){
 const image=decodePixels(bytes,mediaType,limits);return {version:CODEC_VERSION,sha256:sha(bytes),byteLength:bytes.length,mediaType,width:image.width,height:image.height,color:'unmanaged-sRGB-samples',orientation:'encoded-top-left',thumbnail:thumbnail(image)};
}
