import {readProductSemantics,readProductHead,ProductOperationError} from './product-operations.mjs';
const need=(v,c)=>{if(!v)throw new ProductOperationError(c);};
const decimal=v=>{need(typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)||typeof v==='bigint','PRODUCT_MATERIAL_PROVENANCE');return String(v);};
/** Read current live root lease, without copying triangles. This descriptor is
 * an exact part/material mapping, NOT an exporter or a physical qualification.
 * Native source/derived feature IDs remain IDs; mesh indices are routing only.
 * User/source-owned materialBindings supply stable IDs, never synthesized from
 * a slot, color or current array index. Grouping by (slot,RGBA) retains all IDs.
 * Caller supplies the authoritative current head for stale-project rejection.
 */
export function productExportDescriptor(lease,{headHash,revision,materialBindings}){
 const bytes=lease.bytes(),metadata=lease.metadata;
 need(bytes instanceof Uint8Array&&bytes.length>=128,'PRODUCT_EXPORT_SNAPSHOT');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=o=>d.getUint32(o,true);
 need(u(0)===0x48435241&&u(4)===1&&u(8)===128&&u(12)===bytes.length&&u(16)===lease.generation,'PRODUCT_EXPORT_SNAPSHOT');
 const sem=readProductSemantics(metadata.semanticBytes),head=readProductHead(metadata.descriptor);
 need(head.headHash===headHash&&head.revision===String(revision)&&sem.revision===head.revision,'PRODUCT_EXPORT_HEAD_MISMATCH');
 need(!sem.exportBlocked&&sem.sourceVerdict===0&&sem.mechanicsVerdict===0,'PRODUCT_EXPORT_BLOCKED');
 const count=u(28),partAt=u(56);
 need(count>0&&count<=2048&&count===sem.parts.length&&partAt>=128&&partAt%8===0&&partAt+count*40<=bytes.length,'PRODUCT_EXPORT_PARTS');
 const bindings=materialBindings??sem.provenance.materials;
 need(Array.isArray(bindings)&&bindings.length<=4096,'PRODUCT_MATERIAL_BINDINGS_REQUIRED');
 const byProvenance=new Map(),ids=new Set();
 for(const b of bindings){
  const key=decimal(b.provenanceId);
  need(typeof b.id==='string'&&b.id.length>0&&b.id.length<=256&&!/[\u0000-\u001f]/.test(b.id)&&!ids.has(b.id)&&!byProvenance.has(key),'PRODUCT_MATERIAL_ID');
  ids.add(b.id);byProvenance.set(key,b);
 }
 const seen=new Set(),groups=new Map();
 const parts=sem.parts.map(p=>{
  need(!seen.has(p.id)&&p.id.length>0,'PRODUCT_SEMANTIC_PART_ID');seen.add(p.id);
  const sourceLineage=sem.lineage.filter(l=>l.slabId===p.sourceId);
  const materialOrigins=new Set(sourceLineage.map(l=>l.materialProvenanceId));
  need(materialOrigins.size<=1,'PRODUCT_EXPORT_MATERIAL_LINEAGE');
  const materialProvenanceId=materialOrigins.size?[...materialOrigins][0]:p.provenanceId;
  const rgba=u(partAt+p.meshPart*40+16),binding=byProvenance.get(materialProvenanceId);
  need(binding&&binding.slot===p.slot&&binding.rgba===rgba&&(rgba&255)===255,'PRODUCT_EXPORT_MATERIAL_MISMATCH');
  const groupKey=p.slot+':'+rgba.toString(16).padStart(8,'0');
  const item={id:p.id,name:p.id,partIndex:p.meshPart,materialId:binding.id,materialProvenanceId,geometryProvenanceId:p.provenanceId,
   sourceId:p.sourceId,sourceSemanticIds:[...new Set(sourceLineage.length?sourceLineage.map(l=>l.sourceId):[p.sourceId])],featureIndex:p.featureIndex,role:p.role,origin:p.origin,assemblyGroup:p.assemblyGroup,
   slot:p.slot,rgba,color:'#'+rgba.toString(16).padStart(8,'0').slice(0,6).toUpperCase(),
   previewTransform:p.previewTransform.slice(),manufacturingTransform:'already-in-ARCH1-coordinates'};
  if(!groups.has(groupKey))groups.set(groupKey,{slot:p.slot,rgba,color:item.color,parts:[],materialIds:[]});
  const group=groups.get(groupKey);group.parts.push({id:item.id,partIndex:item.partIndex,assemblyGroup:item.assemblyGroup});
  if(!group.materialIds.includes(item.materialId))group.materialIds.push(item.materialId);
  return item;
 });
 return {schemaVersion:1,kind:'product-export-descriptor',runtimeAbi:2,mechanicsSemantics:sem.mechanicsSemantics,sourceSemantics:sem.sourceSemantics,format:'ARCH/1',
  snapshotId:lease.id,snapshotGeneration:lease.generation,epoch:lease.epoch??null,head,
  sourceId:sem.sourceId,sourceMetadata:metadata.sourceMetadata,sourceHashes:[{id:sem.sourceId,sha256:head.sourceHash}],
  parts,groups:[...groups.values()],lineage:sem.lineage,fitQualification:'unqualified',totalErrorBoundMm:null,
  exportCapabilities:{mapping:true,finalSceneUnion:'external-child-module',groupGeometry:'external-child-module',svgSection:'external-child-module'}};
}
