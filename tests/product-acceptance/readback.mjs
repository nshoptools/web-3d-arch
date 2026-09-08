// Independent download container reader: no application/native exporter imports.
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const sha256=b=>createHash('sha256').update(b).digest('hex');
const table=Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
const text=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
function safeName(n){assert.ok(n.length>0&&n.length<=240&&!n.startsWith('/')&&!n.includes('\\')&&!/[\0:%]/.test(n)&&n.split('/').every(s=>s&&s!=='.'&&s!=='..'),'unsafe archive name');}
export function readDownloadZip(input,{maxArchive=128*1024*1024,maxTotal=256*1024*1024,maxEntries=1024}={}){
 const b=Buffer.from(input);assert.ok(b.length>=22&&b.length<=maxArchive);
 let end=-1;for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(b.readUInt32LE(i)===0x06054b50&&i+22+b.readUInt16LE(i+20)===b.length){end=i;break;}
 assert.ok(end>=0,'zip end');assert.equal(b.readUInt16LE(end+4),0);assert.equal(b.readUInt16LE(end+6),0);
 const count=b.readUInt16LE(end+10),size=b.readUInt32LE(end+12),offset=b.readUInt32LE(end+16);
 assert.equal(b.readUInt16LE(end+8),count);assert.ok(count>0&&count<=maxEntries&&offset+size===end);
 const entries=new Map(),folded=new Set(),ranges=[];let at=offset,total=0;
 for(let i=0;i<count;i++){
  assert.ok(at+46<=end);assert.equal(b.readUInt32LE(at),0x02014b50);
  const flags=b.readUInt16LE(at+8),method=b.readUInt16LE(at+10),crc=b.readUInt32LE(at+16),compressed=b.readUInt32LE(at+20),plain=b.readUInt32LE(at+24);
  const n=b.readUInt16LE(at+28),extra=b.readUInt16LE(at+30),comment=b.readUInt16LE(at+32),local=b.readUInt32LE(at+42),ext=b.readUInt32LE(at+38);
  assert.equal(flags&~0x0808,0,'only UTF8/data-descriptor flags');assert.ok(method===0||method===8);assert.equal(b.readUInt16LE(at+34),0);assert.notEqual((ext>>>16)&0xf000,0xa000,'symlink forbidden');
  assert.ok(at+46+n+extra+comment<=end);const name=text(b.subarray(at+46,at+46+n));safeName(name);assert.ok(!folded.has(name.toLowerCase()));folded.add(name.toLowerCase());
  assert.ok(local+30<=offset);assert.equal(b.readUInt32LE(local),0x04034b50);assert.equal(b.readUInt16LE(local+6),flags);assert.equal(b.readUInt16LE(local+8),method);
  const ln=b.readUInt16LE(local+26),le=b.readUInt16LE(local+28),start=local+30+ln+le,stop=start+compressed;
  assert.ok(stop<=offset);assert.equal(text(b.subarray(local+30,local+30+ln)),name);
  if(!(flags&8)){assert.equal(b.readUInt32LE(local+14),crc);assert.equal(b.readUInt32LE(local+18),compressed);assert.equal(b.readUInt32LE(local+22),plain);}
  total+=plain;assert.ok(total<=maxTotal&&plain<=maxTotal);
  const raw=b.subarray(start,stop),bytes=method===0?Buffer.from(raw):inflateRawSync(raw,{maxOutputLength:plain||1});
  assert.equal(bytes.length,plain);assert.equal(crc32(bytes),crc,'entry CRC32');entries.set(name,bytes);let extent=stop;
  if(flags&8){const signed=stop+4<=offset&&b.readUInt32LE(stop)===0x08074b50,atD=stop+(signed?4:0);assert.ok(atD+12<=offset,'descriptor extent');assert.equal(b.readUInt32LE(atD),crc);assert.equal(b.readUInt32LE(atD+4),compressed);assert.equal(b.readUInt32LE(atD+8),plain);extent=atD+12;}
  ranges.push([local,extent]);at+=46+n+extra+comment;
 }
 assert.equal(at,end);ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)assert.ok(ranges[i][0]>=ranges[i-1][1],'no shared/overlapping local data');
 return entries;
}
export function inspectSTL(input,{maxTriangles=2_000_000}={}){
 const b=Buffer.from(input);assert.ok(b.length>=84);const count=b.readUInt32LE(80);assert.ok(count>0&&count<=maxTriangles);assert.equal(b.length,84+50*count);
 const vertices=[],faces=[],byCoordinate=new Map(),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
 for(let f=0;f<count;f++){
  const face=[];for(let j=0;j<3;j++){
   const v=[0,1,2].map(k=>b.readFloatLE(84+50*f+12+12*j+4*k));assert.ok(v.every(Number.isFinite),'finite STL coordinates');
   for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],v[k]);bounds.max[k]=Math.max(bounds.max[k],v[k]);}
   const key=v.map(x=>Object.is(x,-0)?0:x).join(',');if(!byCoordinate.has(key)){byCoordinate.set(key,vertices.length);vertices.push(v);}face.push(byCoordinate.get(key));
  }faces.push(face);
 }
 // Face/edge/vertex-link oracle is supplied from the repo's independent
 // tests/oracles/mesh-oracle.mjs, pinned separately from production code.
 return {sha256:sha256(b),byteLength:b.length,triangleCount:count,bounds,mesh:{vertices,faces}};
}
export function verifyReceipt(input,download,{projectId,revision,formatId}){
 const r=JSON.parse(text(input));assert.equal(r.schema,'arch-app-export-receipt/1');
 assert.equal(r.projectId,projectId);assert.equal(r.artifact.projectRevision,revision);assert.equal(r.artifact.formatId,formatId);
 assert.equal(r.artifact.sha256,sha256(download));assert.equal(r.artifact.byteLength,download.byteLength);
 return r;
}

export function inspectRescue(input){
 const files=readDownloadZip(input),metadata=JSON.parse(text(files.get('package.json')));
 assert.equal(metadata.kind,'web-3d-arch.rescue-package');assert.equal(metadata.schemaVersion,1);assert.equal(metadata.complete,true);assert.deepEqual(metadata.issues,[]);
 const seen=new Set();for(const f of metadata.files){assert.ok(!seen.has(f.path));seen.add(f.path);const b=files.get(f.path);assert.ok(b);assert.equal(b.length,f.byteLength);assert.equal(sha256(b),f.hash);}
 assert.equal(files.size,seen.size+1);const selectedPath='manifests/'+metadata.selectedManifestHash+'.json';assert.ok(files.has(selectedPath),'SELECTED_MANIFEST_MISSING: '+metadata.selectedManifestHash);const manifest=JSON.parse(text(files.get(selectedPath)));
 assert.equal(manifest.projectId,metadata.projectId);for(const a of manifest.assets){const b=files.get('assets/'+a.hash+'.bin');assert.ok(b);assert.equal(b.length,a.byteLength);assert.equal(sha256(b),a.hash);}
 return {metadata,manifest,files,state:manifest.document.state,document:manifest.document};
}
