import {check,copyBytes,encoder,decodeUTF8,LIMITS} from './common.mjs';
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function path(name){
  check(typeof name==='string'&&name.length<=240&&/^[A-Za-z0-9._/-]+$/.test(name)&&!name.startsWith('/')&&
    name.split('/').every(p=>p!==''&&p!=='.'&&p!=='..'),'ZIP_PATH','Invalid/traversing ZIP path.');return name;
}
export function writeStoredZip(input){
  check(Array.isArray(input)&&input.length>0&&input.length<=LIMITS.entries,'ZIP_ENTRIES','Invalid ZIP entry count.');
  const files=input.map(f=>({name:path(f.name),bytes:copyBytes(f.bytes)})).sort((a,b)=>a.name.localeCompare(b.name));
  check(new Set(files.map(f=>f.name)).size===files.length,'ZIP_DUPLICATE','Duplicate ZIP names.');
  let local=0,central=0,totalBytes=0;
  for(const f of files){f.nameBytes=encoder.encode(f.name);f.crc=crc32(f.bytes);f.offset=local;local+=30+f.nameBytes.length+f.bytes.length;central+=46+f.nameBytes.length;totalBytes+=f.bytes.length;}
  check(totalBytes<=LIMITS.expanded&&local+central+22<=LIMITS.package,'ZIP_BUDGET','ZIP exceeds package/expanded byte budget.');
  const out=new Uint8Array(local+central+22),v=new DataView(out.buffer);let p=0;
  for(const f of files){
    v.setUint32(p,0x04034b50,true);v.setUint16(p+4,20,true);v.setUint16(p+6,0x800,true);
    v.setUint16(p+12,33,true); // 1980-01-01, deterministic DOS date.
    v.setUint32(p+14,f.crc,true);v.setUint32(p+18,f.bytes.length,true);v.setUint32(p+22,f.bytes.length,true);v.setUint16(p+26,f.nameBytes.length,true);
    out.set(f.nameBytes,p+30);out.set(f.bytes,p+30+f.nameBytes.length);p+=30+f.nameBytes.length+f.bytes.length;
  }
  for(const f of files){
    v.setUint32(p,0x02014b50,true);v.setUint16(p+4,20,true);v.setUint16(p+6,20,true);v.setUint16(p+8,0x800,true);v.setUint16(p+14,33,true);
    v.setUint32(p+16,f.crc,true);v.setUint32(p+20,f.bytes.length,true);v.setUint32(p+24,f.bytes.length,true);v.setUint16(p+28,f.nameBytes.length,true);v.setUint32(p+42,f.offset,true);
    out.set(f.nameBytes,p+46);p+=46+f.nameBytes.length;
  }
  v.setUint32(p,0x06054b50,true);v.setUint16(p+8,files.length,true);v.setUint16(p+10,files.length,true);
  v.setUint32(p+12,central,true);v.setUint32(p+16,local,true);return out;
}
/** Stored (method 0) ZIP only. Deflate/ZIP64/encryption/symlinks are explicit unsupported/rejected. */
export function readStoredZip(input){
  const data=copyBytes(input);check(data.length<=LIMITS.package&&data.length>=22,'ZIP_BUDGET','ZIP package size invalid.');
  const v=new DataView(data.buffer);let end=-1;
  for(let p=data.length-22;p>=Math.max(0,data.length-65557);p--)
    if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===data.length){end=p;break;}
  check(end>=0,'ZIP_FORMAT','ZIP end record missing.');
  check(v.getUint16(end+4,true)===0&&v.getUint16(end+6,true)===0,'ZIP_MULTIDISK','Multi-disk ZIP unsupported.');
  const count=v.getUint16(end+10,true),centralSize=v.getUint32(end+12,true),centralStart=v.getUint32(end+16,true);
  check(count>0&&count<=LIMITS.entries&&v.getUint16(end+8,true)===count,'ZIP_ENTRIES','Invalid ZIP entry count.');
  check(centralStart+centralSize===end,'ZIP_FORMAT','Central directory extent mismatch.');
  let p=centralStart,expanded=0;const inventory=[],names=new Set(),intervals=[];
  const requireBytes=(start,size,limit=data.length)=>check(Number.isSafeInteger(start)&&Number.isSafeInteger(size)&&start>=0&&size>=0&&start+size<=limit,'ZIP_FORMAT','ZIP record exceeds bounds.');
  for(let i=0;i<count;i++){
    requireBytes(p,46,end);check(v.getUint32(p,true)===0x02014b50,'ZIP_FORMAT','Invalid central record.');
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),
      packed=v.getUint32(p+20,true),size=v.getUint32(p+24,true),nameLength=v.getUint16(p+28,true),
      extraLength=v.getUint16(p+30,true),commentLength=v.getUint16(p+32,true),offset=v.getUint32(p+42,true);
    check(method===0,'ZIP_COMPRESSION_UNSUPPORTED','Only stored ZIP entries are supported in this adapter.');
    check((flags&~0x800)===0,'ZIP_FLAGS','Encrypted/data-descriptor ZIP entries unsupported.');
    check(v.getUint16(p+34,true)===0,'ZIP_MULTIDISK','Entry spans disks.');
    check(((v.getUint32(p+38,true)>>>16)&0xf000)!==0xa000,'ZIP_SYMLINK','Symlink ZIP entries are forbidden.');
    check(size!==0xffffffff&&offset!==0xffffffff&&size===packed,'ZIP64_UNSUPPORTED','ZIP64/compressed lengths unsupported.');
    expanded+=size;check(size<=LIMITS.asset&&expanded<=LIMITS.expanded,'ZIP_BUDGET','Expanded ZIP byte budget exceeded before allocation.');
    requireBytes(p+46,nameLength+extraLength+commentLength,end);
    const name=path(decodeUTF8(data.subarray(p+46,p+46+nameLength)));
    check(!names.has(name),'ZIP_DUPLICATE','Duplicate ZIP names.');names.add(name);
    requireBytes(offset,30,centralStart);check(v.getUint32(offset,true)===0x04034b50,'ZIP_FORMAT','Local record missing.');
    const localName=v.getUint16(offset+26,true),localExtra=v.getUint16(offset+28,true),start=offset+30+localName+localExtra;
    requireBytes(offset+30,localName+localExtra,centralStart);requireBytes(start,size,centralStart);
    check(v.getUint16(offset+6,true)===flags&&v.getUint16(offset+8,true)===method&&v.getUint32(offset+14,true)===crc&&
      v.getUint32(offset+18,true)===packed&&v.getUint32(offset+22,true)===size&&decodeUTF8(data.subarray(offset+30,offset+30+localName))===name,
      'ZIP_HEADER_MISMATCH','Local/central ZIP records disagree.');
    intervals.push([offset,start+size]);inventory.push({name,start,size,crc});p+=46+nameLength+extraLength+commentLength;
  }
  check(p===end,'ZIP_FORMAT','Unexpected central directory data.');
  intervals.sort((a,b)=>a[0]-b[0]);for(let i=1;i<intervals.length;i++)check(intervals[i-1][1]<=intervals[i][0],'ZIP_OVERLAP','ZIP entries overlap.');
  const files=new Map();
  for(const f of inventory){const bytes=data.slice(f.start,f.start+f.size);check(crc32(bytes)===f.crc,'ZIP_CRC','ZIP entry CRC mismatch.',{name:f.name});files.set(f.name,bytes);}
  return files;
}
