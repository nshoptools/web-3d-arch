import {Inflate} from 'fflate';
import {DOMParser} from '@xmldom/xmldom';
import {check, parseJson, PrintingError, sha256} from './contracts.mjs';
export const LIMITS=Object.freeze({archive:64*1024*1024,entries:256,entry:64*1024*1024,total:128*1024*1024,ratio:1000});
const decoder=new TextDecoder('utf-8',{fatal:true});
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(b){let c=0xffffffff;for(const n of b)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
export function packagePath(name) {
  check(typeof name==='string' && name.length>0 && name.length<=512 && !/[\\:%\x00-\x1f\x7f]/.test(name),'ZIP_UNSAFE_PATH',name);
  check(!name.startsWith('/')&&!name.endsWith('/')&&name.split('/').every(s=>s&&s!=='.'&&s!=='..'),'ZIP_UNSAFE_PATH',name);
  return name;
}
export function readZip(bytes, limits=LIMITS) {
  check(bytes instanceof Uint8Array && bytes.length>=22&&bytes.length<=limits.archive,'ZIP_BYTE_BOUND');
  const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=i=>{check(i>=0&&i+2<=bytes.length,'ZIP_TRUNCATED');return d.getUint16(i,true);};
  const u32=i=>{check(i>=0&&i+4<=bytes.length,'ZIP_TRUNCATED');return d.getUint32(i,true);};
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===bytes.length){end=i;break;}
  check(end>=0,'ZIP_EOCD');
  check(u16(end+4)===0&&u16(end+6)===0&&u16(end+8)===u16(end+10),'ZIP_MULTIDISK');
  const u64=i=>{check(i>=0&&i+8<=bytes.length,'ZIP_TRUNCATED');const n=d.getBigUint64(i,true);check(n<=BigInt(Number.MAX_SAFE_INTEGER),'ZIP64_BOUND');return Number(n);};
  let count=u16(end+10),cdSize=u32(end+12),cd=u32(end+16),centralEnd=end;
  if(end>=20&&u32(end-20)===0x07064b50){
    check(u32(end-16)===0&&u32(end-4)===1,'ZIP_MULTIDISK');
    const z=u64(end-12);check(z+56===end-20&&u32(z)===0x06064b50&&u64(z+4)===44,'ZIP64_DIRECTORY');
    check(u32(z+16)===0&&u32(z+20)===0&&u64(z+24)===u64(z+32),'ZIP_MULTIDISK');
    const n=u64(z+32),sz=u64(z+40),off=u64(z+48);
    check((count===65535||count===n)&&(cdSize===0xffffffff||cdSize===sz)&&(cd===0xffffffff||cd===off),'ZIP64_MISMATCH');
    count=n;cdSize=sz;cd=off;centralEnd=z;
  }
  check(count>0&&count<=limits.entries&&cd+cdSize===centralEnd,'ZIP_DIRECTORY_BOUND');
  const extra64=(start,length,values)=>{
    const result={...values};let q=start,found=false;
    while(q<start+length){
      check(q+4<=start+length,'ZIP_EXTRA');const id=u16(q),len=u16(q+2);q+=4;check(q+len<=start+length,'ZIP_EXTRA');
      if(id===1){check(!found,'ZIP64_DUPLICATE_EXTRA');found=true;let at=q;
        for(const key of ['size','compressed','offset'])if(result[key]===0xffffffff){check(at+8<=q+len,'ZIP64_EXTRA');result[key]=u64(at);at+=8;}
      }q+=len;
    }
    for(const n of Object.values(result))check(n!==0xffffffff,'ZIP64_EXTRA_MISSING');
    return result;
  };
  let pos=cd,declared=0,actualTotal=0;const names=new Set(),records=[],ranges=[];
  for(let i=0;i<count;i++){
    check(pos+46<=centralEnd&&u32(pos)===0x02014b50,'ZIP_DIRECTORY');
    const flags=u16(pos+8),method=u16(pos+10),crc=u32(pos+16);
    const nl=u16(pos+28),el=u16(pos+30),cl=u16(pos+32),mode=u32(pos+38)>>>16;
    const {size,compressed,offset}=extra64(pos+46+nl,el,{size:u32(pos+24),compressed:u32(pos+20),offset:u32(pos+42)});
    check(pos+46+nl+el+cl<=centralEnd&&u16(pos+34)===0,'ZIP_DIRECTORY');
    check((flags&~0x080e)===0&&(flags&1)===0&&(method===0||method===8),'ZIP_METHOD_OR_FLAGS');
    check((mode&0xf000)!==0xa000,'ZIP_SYMLINK');
    let name;try{name=decoder.decode(bytes.subarray(pos+46,pos+46+nl));}catch{throw new PrintingError('ZIP_FILENAME_ENCODING');}
    packagePath(name);const key=name.normalize('NFC').toLowerCase();check(!names.has(key),'ZIP_DUPLICATE_PATH',name);names.add(key);
    declared+=size;
    check(size<=limits.entry&&declared<=limits.total&&size<=Math.max(1,compressed)*limits.ratio,'ZIP_DECOMPRESS_BOUND',name);
    check(offset+30<=cd&&u32(offset)===0x04034b50,'ZIP_LOCAL_HEADER');
    check(u16(offset+6)===flags&&u16(offset+8)===method,'ZIP_LOCAL_MISMATCH');
    const lnl=u16(offset+26),lel=u16(offset+28),start=offset+30+lnl+lel,finish=start+compressed;
    check(start<=cd&&finish<=cd,'ZIP_DATA_BOUND');
    check(decoder.decode(bytes.subarray(offset+30,offset+30+lnl))===name,'ZIP_LOCAL_MISMATCH');
    let rangeEnd=finish;
    if(flags&8){
      let q=finish;if(u32(q)===0x08074b50)q+=4;
      check(q+12<=cd&&u32(q)===crc&&u32(q+4)===compressed&&u32(q+8)===size,'ZIP_DESCRIPTOR');rangeEnd=q+12;
    }else {
      const local=extra64(offset+30+lnl,lel,{size:u32(offset+22),compressed:u32(offset+18)});
      check(u32(offset+14)===crc&&local.compressed===compressed&&local.size===size,'ZIP_LOCAL_MISMATCH');
    }
    ranges.push([offset,rangeEnd]);records.push({name,method,crc,size,start,finish});
    pos+=46+nl+el+cl;
  }
  check(pos===centralEnd,'ZIP_DIRECTORY_SIZE');ranges.sort((a,b)=>a[0]-b[0]);
  for(let i=0;i<ranges.length;i++)check(ranges[i][0]===(i===0?0:ranges[i-1][1]),'ZIP_OVERLAP_OR_HIDDEN_DATA');
  check(ranges.at(-1)[1]===cd,'ZIP_HIDDEN_DATA');
  const entries=new Map();
  for(const rec of records){
    let out;
    if(rec.method===0){check(rec.finish-rec.start===rec.size,'ZIP_STORED_SIZE');out=bytes.slice(rec.start,rec.finish);actualTotal+=out.length;}
    else {
      const chunks=[];let actual=0;
      const inflate=new Inflate((chunk)=>{
        actual+=chunk.length;actualTotal+=chunk.length;
        check(actual<=rec.size&&actual<=limits.entry&&actualTotal<=limits.total,'ZIP_DECOMPRESS_BOUND',rec.name);
        chunks.push(chunk.slice());
      });
      try{for(let i=rec.start;i<rec.finish;i+=1024)inflate.push(bytes.subarray(i,Math.min(i+1024,rec.finish)),i+1024>=rec.finish);}
      catch(e){if(e instanceof PrintingError)throw e;throw new PrintingError('ZIP_DEFLATE',rec.name);}
      check(actual===rec.size,'ZIP_DECOMPRESSED_SIZE');out=new Uint8Array(actual);let n=0;for(const c of chunks){out.set(c,n);n+=c.length;}
    }
    check(actualTotal<=limits.total&&crc32(out)===rec.crc,'ZIP_CRC_OR_TOTAL',rec.name);entries.set(rec.name,out);
  }
  return entries;
}
export function parseXml(bytes) {
  let s;try{s=decoder.decode(bytes);}catch{throw new PrintingError('XML_ENCODING');}
  check(!/<!DOCTYPE|<!ENTITY/i.test(s),'XML_EXTERNAL_ENTITY');
  check(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s),'XML_CONTROL');
  let doc;try{doc=new DOMParser({onError:level=>{throw new PrintingError('XML_PARSE',level);}}).parseFromString(s,'application/xml');}
  catch(e){if(e instanceof PrintingError)throw e;throw new PrintingError('XML_PARSE');}
  check(doc.documentElement,'XML_ROOT');
  const stack=[[doc.documentElement,0]];let nodes=0;
  while(stack.length){const [node,depth]=stack.pop();check(depth<=32&&++nodes<=2200000,'XML_COMPLEXITY');for(let c=node.firstChild;c;c=c.nextSibling)if(c.nodeType===1)stack.push([c,depth+1]);}
  return doc;
}
export const CORE='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
export const PROD='http://schemas.microsoft.com/3dmanufacturing/production/2015/06';
const REL='http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES='http://schemas.openxmlformats.org/package/2006/content-types';
const children=(n,name,ns=CORE)=>Array.from(n.childNodes).filter(c=>c.nodeType===1&&c.localName===name&&c.namespaceURI===ns);
function uint(s){check(/^(0|[1-9][0-9]*)$/.test(s),'XML_INTEGER');const n=Number(s);check(Number.isSafeInteger(n),'XML_INTEGER');return n;}
function transform(s) {
  if(!s)return [1,0,0,0,1,0,0,0,1,0,0,0];
  const a=s.trim().split(/\s+/).map(Number);check(a.length===12&&a.every(Number.isFinite),'BUILD_TRANSFORM');
  const determinant=a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]);
  check(Math.abs(determinant)>1e-12&&a.every(n=>Math.abs(n)<=10000),'BUILD_TRANSFORM');return a;
}
function resolveTarget(base,target){
  check(!/[:\\%\x00-\x1f]/.test(target),'RELATIONSHIP_EXTERNAL');
  const parts=target.startsWith('/')?[]:base.split('/').filter(Boolean);
  for(const p of target.split('/')){if(!p||p==='.')continue;if(p==='..'){check(parts.length>0,'RELATIONSHIP_ESCAPE');parts.pop();}else parts.push(p);}
  return packagePath(parts.join('/'));
}
export async function inspect3MF(bytes, {adapterId,expectedManifest}={}) {
  const entries=readZip(bytes),xml=new Map();
  if(entries.has('Metadata/project_settings.config')&&entries.has('Metadata/model_settings.config')){
    const settings=parseJson(decoder.decode(entries.get('Metadata/project_settings.config')));
    const slots=settings.filament_colour?.length;
    check(Number.isInteger(slots)&&slots>0,'MATERIAL_SLOT_MISMATCH');
    const cfg=parseXml(entries.get('Metadata/model_settings.config'));
    for(const m of Array.from(cfg.getElementsByTagName('metadata')))if(m.getAttribute('key')==='extruder'){
      const slot=Number(m.getAttribute('value'));check(Number.isInteger(slot)&&slot>=1&&slot<=slots,'MATERIAL_SLOT_MISMATCH');
    }
  }
  for(const [name,value] of entries)if(name.endsWith('.xml')||name.endsWith('.rels')||name.endsWith('.model'))xml.set(name,parseXml(value));
  const rels=xml.get('_rels/.rels'),types=xml.get('[Content_Types].xml');
  check(rels?.documentElement.namespaceURI===REL&&rels.documentElement.localName==='Relationships','RELATIONSHIPS_NAMESPACE');
  check(types?.documentElement.namespaceURI===TYPES&&types.documentElement.localName==='Types','CONTENT_TYPES_NAMESPACE');
  const defaults=new Map(),overrides=new Map();
  for(const e of Array.from(types.documentElement.childNodes).filter(n=>n.nodeType===1)){
    check(e.namespaceURI===TYPES,'CONTENT_TYPES_NAMESPACE');
    if(e.localName==='Default'){const k=e.getAttribute('Extension');check(!defaults.has(k),'CONTENT_TYPE_DUPLICATE');defaults.set(k,e.getAttribute('ContentType'));}
    else {check(e.localName==='Override','CONTENT_TYPE_ELEMENT');const k=e.getAttribute('PartName');check(k.startsWith('/')&&!overrides.has(k),'CONTENT_TYPE_OVERRIDE');overrides.set(k,e.getAttribute('ContentType'));}
  }
  for(const name of entries.keys())if(name!=='[Content_Types].xml')check(overrides.has('/'+name)||defaults.has(name.split('.').at(-1)),'CONTENT_TYPE_MISSING',name);
  const relationships=[];
  for(const [name,doc] of xml)if(name.endsWith('.rels')){
    check(doc.documentElement.namespaceURI===REL,'RELATIONSHIPS_NAMESPACE');
    const base=name==='_rels/.rels'?'':name.slice(0,name.lastIndexOf('/_rels/')+1),ids=new Set();
    for(const rel of children(doc.documentElement,'Relationship',REL)){
      const id=rel.getAttribute('Id');check(id&&!ids.has(id),'RELATIONSHIP_DUPLICATE');ids.add(id);
      check(!rel.hasAttribute('TargetMode')||rel.getAttribute('TargetMode')==='Internal','RELATIONSHIP_EXTERNAL');
      const target=resolveTarget(base,rel.getAttribute('Target'));check(entries.has(target),'RELATIONSHIP_MISSING',target);
      relationships.push({source:name,target,type:rel.getAttribute('Type')});
    }
  }
  const modelRels=relationships.filter(r=>r.source==='_rels/.rels'&&r.type==='http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel');
  check(modelRels.length===1,'MODEL_RELATIONSHIP');
  const rootPath=modelRels[0].target,resources=new Map(),meshes=[],builds=[];
  for(const [name,doc] of xml)if(name.endsWith('.model')){
    const root=doc.documentElement;check(root.namespaceURI===CORE&&root.localName==='model','CORE_NAMESPACE');
    check(root.getAttribute('unit')==='millimeter','MODEL_UNIT');
    for(const prefix of (root.getAttribute('requiredextensions')||'').split(/\s+/).filter(Boolean))
      check([PROD].includes(root.lookupNamespaceURI(prefix)),'UNSUPPORTED_REQUIRED_EXTENSION',prefix);
    const rs=children(root,'resources');check(rs.length===1,'MODEL_RESOURCES');
    const local=new Map();resources.set(name,local);
    for(const e of Array.from(rs[0].childNodes).filter(n=>n.nodeType===1)){
      check(e.namespaceURI===CORE,'RESOURCE_NAMESPACE');const id=uint(e.getAttribute('id'));check(id>0&&!local.has(id),'RESOURCE_ID');
      if(e.localName==='basematerials'){
        const bases=children(e,'base');check(bases.length>0,'BASE_MATERIALS');
        for(const b of bases)check(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(b.getAttribute('displaycolor')),'MATERIAL_COLOR');
        local.set(id,{kind:'materials',bases});
      }else{
        check(e.localName==='object'&&(!e.hasAttribute('type')||e.getAttribute('type')==='model'),'UNSUPPORTED_RESOURCE');
        const ms=children(e,'mesh'),cs=children(e,'components');check(ms.length+cs.length===1,'OBJECT_PAYLOAD');
        if(ms.length){
          const vs=children(ms[0],'vertices'),ts=children(ms[0],'triangles');check(vs.length===1&&ts.length===1,'MESH_PAYLOAD');
          const verts=children(vs[0],'vertex').map(v=>['x','y','z'].map(k=>{const n=Number(v.getAttribute(k));check(v.hasAttribute(k)&&Number.isFinite(n)&&Math.abs(n)<=10000,'VERTEX_BOUND');return n;}));
          const faces=children(ts[0],'triangle').map(t=>{const a=['v1','v2','v3'].map(k=>uint(t.getAttribute(k)));check(a.every(i=>i<verts.length)&&new Set(a).size===3,'INDEX_BOUND');return a;});
          check(verts.length>=4&&faces.length>=4,'EMPTY_MESH');
          const m={kind:'mesh',id,path:name,name:e.getAttribute('name'),vertices:verts,faces,
            pid:e.hasAttribute('pid')?uint(e.getAttribute('pid')):null,pindex:e.hasAttribute('pindex')?uint(e.getAttribute('pindex')):null};
          // This reader deliberately supports the writer's per-object base-material subset.
          for(const t of children(ts[0],'triangle'))for(const k of ['pid','p1','p2','p3'])check(!t.hasAttribute(k),'UNSUPPORTED_TRIANGLE_MATERIAL');
          local.set(id,m);meshes.push(m);
        }else {
          const components=children(cs[0],'component').map(c=>({id:uint(c.getAttribute('objectid')),
            path:c.hasAttributeNS(PROD,'path')?resolveTarget('',c.getAttributeNS(PROD,'path')):name,transform:transform(c.getAttribute('transform'))}));
          check(components.length>0,'EMPTY_COMPONENTS');local.set(id,{kind:'components',id,components});
        }
      }
    }
    for(const b of children(root,'build'))for(const item of children(b,'item'))builds.push({path:name,id:uint(item.getAttribute('objectid')),transform:transform(item.getAttribute('transform'))});
  }
  const rootBuilds=builds.filter(b=>b.path===rootPath);check(rootBuilds.length>0,'BUILD_EMPTY');
  const visit=(path,id,seen=new Set())=>{
    const key=path+':'+id;check(!seen.has(key)&&seen.size<32,'COMPONENT_CYCLE');
    const resource=resources.get(path)?.get(id);check(resource&&resource.kind!=='materials','BUILD_OBJECT_MISSING',key);
    if(resource.kind==='components'){const next=new Set(seen);next.add(key);for(const c of resource.components)visit(c.path,c.id,next);}
  };
  for(const b of rootBuilds)visit(b.path,b.id);
  for(const m of meshes)if(m.pid!==null){
    const material=resources.get(m.path).get(m.pid);check(material?.kind==='materials'&&m.pindex!==null&&m.pindex<material.bases.length,'MATERIAL_REFERENCE');
  }
  let settings=null,partSlots=[],physicalExtruders=[],manifest=null;
  if(entries.has('Metadata/project_settings.config')){
    settings=parseJson(decoder.decode(entries.get('Metadata/project_settings.config')));
    const config=parseXml(entries.get('Metadata/model_settings.config'));
    check(config.documentElement.localName==='config'&&!config.documentElement.namespaceURI,'ADAPTER_CONFIG_NAMESPACE');
    const slots=settings.filament_colour?.length;check(Number.isInteger(slots)&&slots>0,'MATERIAL_SLOT_MISMATCH');
    const parts=Array.from(config.getElementsByTagName('part'));
    for(const part of parts){
      const id=uint(part.getAttribute('id'));check(meshes.some(m=>m.id===id),'ADAPTER_PART_REFERENCE');
      const refs=Array.from(part.getElementsByTagName('metadata')).filter(m=>m.getAttribute('key')==='extruder');
      check(refs.length===1,'MATERIAL_SLOT_MISMATCH');const slot=uint(refs[0].getAttribute('value'));
      check(slot>=1&&slot<=slots,'MATERIAL_SLOT_MISMATCH');partSlots.push({id,slot});
    }
    for(const m of Array.from(config.getElementsByTagName('metadata')))if(m.getAttribute('key')==='filament_maps')physicalExtruders=m.getAttribute('value').trim().split(/\s+/).map(Number);
    if(adapterId==='export.3mf.snapmaker-project'){
      check(settings.version==='2.2.1'&&settings.printer_model==='Snapmaker U1'&&slots===4,'UNSUPPORTED_SLICER_VERSION');
      check(physicalExtruders.length===4&&physicalExtruders.every(e=>Number.isInteger(e)&&e>=1&&e<=4)&&new Set(physicalExtruders).size===4,'U1_FOUR_HEAD_MAPPING');
    }
    if(adapterId==='export.3mf.bambu-project')check(settings.version==='02.08.02.60'&&settings.printer_model==='Bambu Lab P1S','UNSUPPORTED_SLICER_VERSION');
  }
  if(entries.has('Metadata/printing-manifest.json')){
    manifest=parseJson(decoder.decode(entries.get('Metadata/printing-manifest.json')));
    if(expectedManifest)check(JSON.stringify(manifest)===JSON.stringify(expectedManifest),'MANIFEST_READBACK');
    check(/^[a-f0-9]{64}$/.test(manifest.profileHash)&&/^[a-f0-9]{64}$/.test(manifest.scheduleHash),'MANIFEST_HASH');
    if(settings){
      check(Number(settings.initial_layer_print_height)===manifest.schedule.firstLayerHeight&&Number(settings.layer_height)===manifest.schedule.layerHeight,'SCHEDULE_READBACK');
      for(const p of manifest.parts){
        const ref=partSlots.find(x=>x.id===p.resourceId);check(ref?.slot===p.slot,'MATERIAL_SLOT_MISMATCH');
        check(settings.filament_colour[p.slot-1].toUpperCase()===manifest.materials[p.materialIndex].color,'MATERIAL_COLOR_READBACK');
        if(adapterId==='export.3mf.snapmaker-project')check(physicalExtruders[p.slot-1]===p.extruder,'MATERIAL_EXTRUDER_MISMATCH');
      }
    }
    for(const h of manifest.sourceHashes)check(typeof h.id==='string'&&/^[a-f0-9]{64}$/.test(h.sha256),'SOURCE_HASH');
  }
  return {sha256:await sha256(bytes),byteLength:bytes.length,entryNames:[...entries.keys()],rootPath,relationships,meshes,builds:rootBuilds,settings,partSlots,physicalExtruders,manifest};
}
