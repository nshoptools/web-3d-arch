import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {check} from './stl.mjs';

export const OBJ_LIMITS=Object.freeze({bytes:64_000_000,lines:2_000_000,vertices:1_000_000,faces:400_000,parts:128,materials:16,records:8192,line:8192});
const number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const integer=/^-?[1-9]\d*$/;
const encoder=new TextEncoder();
function label(s){check(s.length<=256&&encoder.encode(s).length<=256&&!/[\x00-\x1f\x7f]/.test(s),'OBJ_NAME_BOUND');return s;}
function scalar(token,coordinate=false){
 check(number.test(token),'OBJ_NUMBER');const n=Number(token);
 check(Number.isFinite(n)&&Number.isFinite(Math.fround(n)),'OBJ_NONFINITE');
 if(coordinate)check(token.split(/[eE]/)[0].replace(/[^0-9]/g,'').replace(/^0+/,'').length<=15,'OBJ_DECIMAL_PRECISION');
 return n;
}
function reference(token,count){
 check(integer.test(token),'OBJ_INDEX_SYNTAX');const n=Number(token);
 check(Number.isSafeInteger(n),'OBJ_INDEX_RANGE');const i=n>0?n-1:count+n;
 check(i>=0&&i<count,'OBJ_INDEX_RANGE');return i;
}
// Preflight intentionally accepts TRIANGULATED polygonal surfaces only.
// Never call OBJLoader's fan triangulation on a polygon/hole/freeform record.
export function decodeOBJ(bytes){
 check(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=OBJ_LIMITS.bytes,'OBJ_BYTE_BOUND');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{check(false,'OBJ_UTF8');}
 check(!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text),'OBJ_CONTROL_CHARACTER');
 check(!text.includes('\\'),'OBJ_CONTINUATION_UNSUPPORTED');
 const vertices=[],parts=[],materialNames=[],libraries=[],declarations=[];
 const materialIndex=new Map(),usedVertices=new Set();
 let uvCount=0,normalCount=0,faces=0,error=0,currentMaterial=null,declared=false,referenceStyle=null;
 const part=name=>({name,refs:[],sourceFaceIndices:[],sourceMaterialRefs:[]});
 let current=part('');
 function sourceMaterial(name){
  if(!materialIndex.has(name)){check(materialNames.length<OBJ_LIMITS.materials,'OBJ_MATERIAL_BOUND');materialIndex.set(name,materialNames.length);materialNames.push(name);}
  return materialIndex.get(name);
 }
 // Bound line-array allocation before either our split or OBJLoader's split.
 let lineCount=1;for(let at=0;at<text.length;at++)if(text.charCodeAt(at)===10)check(++lineCount<=OBJ_LIMITS.lines,'OBJ_LINE_COUNT_BOUND');
 const lines=text.split('\n');
 for(let lineIndex=0;lineIndex<lines.length;lineIndex++){
  const raw=lines[lineIndex].replace(/\r$/,'');check(raw.length<=OBJ_LIMITS.line,'OBJ_LINE_BOUND');
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  check(!line.includes('#'),'OBJ_INLINE_COMMENT_UNSUPPORTED');
  const tokens=line.split(/\s+/),kind=tokens[0],args=tokens.slice(1);
  if(kind==='v'){
   check(args.length===3,'OBJ_VERTEX_EXTENSION_UNSUPPORTED');check(vertices.length/3<OBJ_LIMITS.vertices,'OBJ_VERTEX_BOUND');
   for(const token of args){const n=scalar(token,true);vertices.push(n);error=Math.max(error,Math.abs(n-Math.fround(n))+Math.abs(n)*8*Number.EPSILON);}
  }else if(kind==='vt'){
   check(args.length===2,'OBJ_TEXCOORD_DIMENSION_UNSUPPORTED');args.forEach(t=>scalar(t));check(++uvCount<=OBJ_LIMITS.vertices,'OBJ_ATTRIBUTE_BOUND');
  }else if(kind==='vn'){
   check(args.length===3,'OBJ_NORMAL_DIMENSION');args.forEach(t=>scalar(t));check(++normalCount<=OBJ_LIMITS.vertices,'OBJ_ATTRIBUTE_BOUND');
  }else if(kind==='f'){
   check(args.length===3,'OBJ_POLYGON_REQUIRES_TRIANGULATION');check(faces<OBJ_LIMITS.faces,'OBJ_FACE_BOUND');
   const refs=[];
   for(const token of args){
    const fields=token.split('/');check(fields.length<=3&&fields[0]!==''&&!(fields.length===2&&fields[1]==='')&&!(fields.length===3&&fields[2]===''),'OBJ_FACE_REFERENCE');
    const style=fields.length===1?'v':fields.length===2?'v/vt':fields[1]===''?'v//vn':'v/vt/vn';
    if(referenceStyle===null)referenceStyle=style;check(style===referenceStyle,'OBJ_MIXED_REFERENCE_LAYOUT_UNSUPPORTED');
    const vi=reference(fields[0],vertices.length/3);refs.push(vi);usedVertices.add(vi);
    if(fields.length>=2&&fields[1]!=='')reference(fields[1],uvCount);
    if(fields.length===3)reference(fields[2],normalCount);
   }
   current.refs.push(...refs);current.sourceFaceIndices.push(faces++);current.sourceMaterialRefs.push(sourceMaterial(currentMaterial));
  }else if(kind==='o'||kind==='g'){
   const name=label(args.join(' '));check(kind!=='g'||args.length<=1,'OBJ_MULTI_GROUP_UNSUPPORTED');
   check(declarations.length<OBJ_LIMITS.records,'OBJ_DECLARATION_BOUND');declarations.push({kind,name,line:lineIndex+1});
   if(!declared){current.name=name;declared=true;}else{if(current.refs.length)parts.push(current);current=part(name);}
   check(parts.length<OBJ_LIMITS.parts,'OBJ_PART_BOUND');
  }else if(kind==='usemtl'){
   check(line.startsWith('usemtl ')&&args.length>0,'OBJ_MATERIAL_NAME');currentMaterial=label(args.join(' '));
   sourceMaterial(currentMaterial); // Preserve even an unused declaration; never fetch MTL.
  }else if(kind==='mtllib'){
   check(line.startsWith('mtllib ')&&args.length>0,'OBJ_LIBRARY_DIRECTIVE');
   check(libraries.length<128,'OBJ_LIBRARY_BOUND');libraries.push(label(args.join(' ')));
  }else if(kind==='s'){
   check(args.length===1&&(args[0]==='off'||args[0]==='0'||/^[1-9]\d{0,8}$/.test(args[0])),'OBJ_SMOOTHING_UNSUPPORTED');
  }else if(['cstype','deg','bmat','step','curv','curv2','surf','parm','trim','hole','scrv','sp','end','con'].includes(kind)){
   check(false,'OBJ_FREEFORM_UNSUPPORTED');
  }else check(false,'OBJ_RECORD_UNSUPPORTED');
 }
 if(current.refs.length)parts.push(current);
 check(faces>0&&parts.length>0&&parts.length<=OBJ_LIMITS.parts,'OBJ_EMPTY_OR_PART_BOUND');
 check(usedVertices.size===vertices.length/3,'OBJ_UNREFERENCED_VERTEX');
 const container=new OBJLoader().parse(text);
 try{
  check(container.children.length===parts.length,'OBJ_LIBRARY_PART_MISMATCH');
  let total=0;
  for(let pi=0;pi<parts.length;pi++){
   const p=parts[pi],child=container.children[pi],geometry=child.geometry;
   check(child.isMesh===true&&child.name===p.name,'OBJ_LIBRARY_PART_MISMATCH');
   const positions=geometry?.getAttribute('position')?.array;
   check(positions instanceof Float32Array&&positions.length===p.refs.length*3,'OBJ_LIBRARY_FACE_MISMATCH');
   check(!geometry.index&&!geometry.getAttribute('color'),'OBJ_LIBRARY_LAYOUT');
   const materials=Array.isArray(child.material)?child.material:[child.material],groups=geometry.groups;
   let materialCursor=0;
   const materialAt=offset=>{
    if(!Array.isArray(child.material))return materials[0]?.name??'';
    while(materialCursor<groups.length&&offset>=groups[materialCursor].start+groups[materialCursor].count)materialCursor++;
    const group=groups[materialCursor];
    check(group&&offset>=group.start&&offset<group.start+group.count,'OBJ_LIBRARY_MATERIAL_GROUP');
    check(group,'OBJ_LIBRARY_MATERIAL_GROUP');return materials[group.materialIndex]?.name??'';
   };
   // Index by the ORIGINAL v record, never by coordinates. Duplicate coincident
   // source vertices remain separate, and Manifold/topology decide validity.
   const remap=new Map(),xyz=[],indices=[],sourceVertices=[];
   for(let i=0;i<p.refs.length;i++){
    const sourceIndex=p.refs[i];
    for(let k=0;k<3;k++)check(positions[i*3+k]===Math.fround(vertices[sourceIndex*3+k]),'OBJ_LIBRARY_COORDINATE_MISMATCH');
    if(!remap.has(sourceIndex)){remap.set(sourceIndex,remap.size);sourceVertices.push(sourceIndex);xyz.push(...positions.subarray(i*3,i*3+3));}
    indices.push(remap.get(sourceIndex));
    if(i%3===0)check(materialAt(i)===(materialNames[p.sourceMaterialRefs[i/3]]??''),'OBJ_LIBRARY_MATERIAL_MISMATCH');
   }
   p.vertices=new Float64Array(xyz);p.triangles=new Uint32Array(indices);p.sourceVertexIndices=new Uint32Array(sourceVertices);
   p.sourceFaceIndices=new Uint32Array(p.sourceFaceIndices);p.sourceMaterialRefs=new Uint32Array(p.sourceMaterialRefs);
   delete p.refs;total+=p.vertices.length/3;check(total<=OBJ_LIMITS.vertices,'OBJ_VERTEX_BOUND');
  }
  return {parts,materialNames,libraries,declarations,sourceVertexCount:vertices.length/3,sourceFaceCount:faces,
   uvCount,normalCount,referenceStyle,conversionError:error,decoder:'three/OBJLoader@0.185.1',encoding:'utf-8',
   triangulation:'source-triangles-only; polygons-and-holes-as-records-rejected',indexing:'original-v-record; no-coordinate-welding'};
 }finally{for(const child of container.children){child.geometry?.dispose();for(const m of (Array.isArray(child.material)?child.material:[child.material]))m?.dispose();}}
}
export function resolveOBJMaterials(parsed,input){
 const table=input.materials??[],overrides=input.partMaterialIds??[],assignments=input.sourceMaterialAssignments??[];
 check(Array.isArray(table)&&table.length<=16&&Array.isArray(overrides)&&Array.isArray(assignments)&&assignments.length<=16,'OBJ_MATERIAL_TABLE');
 check(overrides.length===0||overrides.length===parsed.parts.length,'OBJ_PART_MATERIAL_MAPPING');
 const ids=new Map();table.forEach((m,i)=>{
  check(m&&typeof m.id==='string'&&m.id.length>0&&m.id.isWellFormed()&&!m.id.includes('\0')&&encoder.encode(m.id).length<=256&&!ids.has(m.id),'MATERIAL_ID');
  check(typeof m.name==='string'&&m.name.isWellFormed()&&!m.name.includes('\0')&&encoder.encode(m.name).length<=256&&Number.isInteger(m.rgba)&&m.rgba>=0&&m.rgba<=0xffffffff,'MATERIAL_VALUE');ids.set(m.id,i);
 });
 const bySource=new Map();for(const assignment of assignments){
  check(assignment&&(assignment.sourceName===null||typeof assignment.sourceName==='string')&&parsed.materialNames.includes(assignment.sourceName)&&!bySource.has(assignment.sourceName)&&ids.has(assignment.materialId),'OBJ_SOURCE_MATERIAL_MAPPING');
  bySource.set(assignment.sourceName,ids.get(assignment.materialId));
 }
 const parts=parsed.parts.map((p,i)=>{
  if(overrides.length)check(ids.has(overrides[i]),'OBJ_PART_MATERIAL_REFERENCE');
  return {...p,faceMaterialIds:Uint32Array.from(p.sourceMaterialRefs,ref=>overrides.length?ids.get(overrides[i]):bySource.get(parsed.materialNames[ref])??0xffffffff)};
 });
 return {parts,table,choices:{materials:table,partMaterialIds:overrides,sourceMaterialAssignments:assignments,
  wholePartOverride:overrides.length>0,unmapped:'material-proposal',externalMaterialLibraries:'literal-references-only; never-read-or-fetched'}};
}
