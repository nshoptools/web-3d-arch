import {VERSION,assert,error,data,uuid,sha256,canonicalJSON,decode,parseJSON,boundedBytes,fileName,adapter,sameOrigin,freeze,assertTicket,keys,utf8} from './common.mjs';
import {inspectRescuePackage,importRescueCopy} from '../storage/index.mjs';
import {contentEdit,validateState,verifyDocument} from './documents.mjs';
import {boundedSourceMetadata,sourceConfirmation,sourceReceipt,createSourceContext,sourcePreparation} from './source-approval.mjs';
import {candidateHash} from './proposals.mjs';
import {validateProductMaterialExtension} from '../contracts/product-material.mjs';

const MATERIAL_KEYS=['id','label','color','slot','role','overridden','backgroundEligible','excluded','areaPercent','heightLayers','excludedReason','excludedCause','product'];
const MATERIAL_REQUIRED=['id','label','color','slot','role','overridden','backgroundEligible','excluded'];
function adoptionMaterials(input){
 const list=data(input);assert(Array.isArray(list)&&list.length<=256,'SOURCE_ADOPTION_MATERIALS');
 for(const material of list){
   keys(material,MATERIAL_KEYS,MATERIAL_REQUIRED);
   if(material.product!==undefined)validateProductMaterialExtension(material.product);
  assert(typeof material.id==='string'&&material.id.length>0&&material.id.length<=200&&!/[\x00-\x1f]/.test(material.id)&&!['__proto__','prototype','constructor'].includes(material.id),'SOURCE_ADOPTION_MATERIAL_ID');
  assert(typeof material.label==='string'&&material.label.length>0&&material.label.length<=200&&typeof material.backgroundEligible==='boolean','SOURCE_ADOPTION_MATERIALS');
  if(material.areaPercent!==undefined)assert(Number.isFinite(material.areaPercent)&&material.areaPercent>=0&&material.areaPercent<=100,'SOURCE_ADOPTION_MATERIALS');
  if(material.excludedReason!==undefined)assert(typeof material.excludedReason==='string'&&material.excludedReason.length<=2000,'SOURCE_ADOPTION_MATERIALS');
  if(material.excludedCause!==undefined)assert(['background','below-min-detail','merged','other'].includes(material.excludedCause),'SOURCE_ADOPTION_MATERIALS');
 }
 return list;
}
function validateAdoption(reply,ticket,base,source){
 const value=data(reply);keys(value,['version','ticket','productBindings','materials','materialDefaults']);assertTicket(value,ticket);
 assert(utf8.encode(canonicalJSON(value)).length<=262144,'SOURCE_ADOPTION_BUDGET');
 const bindings=boundedSourceMetadata(value.productBindings),materials=adoptionMaterials(value.materials),defaults=adoptionMaterials(value.materialDefaults);
 const metadata=boundedSourceMetadata({...source.metadata,productBindings:bindings});
 const state=(list)=>({...data(base),sourceKind:source.kind,content:{...data(base.content),app:{...data(base.content.app),source:{...source,metadata},materials:list,materialDefaults:defaults}}});
 // validateState currently checks only materials; run it against BOTH lists.
 validateState(state(materials));validateState(state(defaults));
 const ids=new Set(materials.map(m=>m.id));assert(defaults.length===materials.length&&defaults.every(m=>ids.has(m.id)),'SOURCE_ADOPTION_DEFAULT_IDS');
 return {metadata,materials,materialDefaults:defaults};
}


function initialSourceReferences(source){
 const c=source.metadata?.sourceConversion,p=source.metadata?.rasterPreparation,lineage=source.metadata?.productEditLineage,refs=[
  lineage?.fromRGBA,lineage?.fromPreview,...(lineage?.edits??[]).flatMap(e=>[e.fromRGBA,e.toRGBA,e.fromPreview,e.toPreview]),
  c?.original?.hash,c?.raster?.sha256,c?.raster?.pngHash,
  ...(Array.isArray(c?.assets)?c.assets.map(a=>a?.sha256):[]),
  p?.input?.originalHash,p?.input?.rgbaHash,p?.input?.lineage?.initialRGBAHash,p?.input?.lineage?.initialPreviewHash,
  ...(Array.isArray(p?.buffers)?p.buffers.map(a=>a?.hash):[])
 ];
 const present=new Set(source.assetHashes);
 // Only declared, already-owned asset refs; metadata cannot introduce arbitrary assets.
 return new Set(refs.filter(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)&&present.has(h)));
}

export class SourceOperations {
 async convertSource(target){
  this.requireProject();assert(target==='raster','CONVERSION_TARGET');const source=this.doc.state.content.app.source,a=adapter(this.adapters.source);assert(source&&typeof a.convert==='function','SOURCE_CONVERSION_UNSUPPORTED');
  const file={name:source.name,mediaType:source.mediaType,bytes:new Uint8Array(this.assets.get(source.raw.hash).bytes)},state=freeze(data(this.doc.state));
  return this.sourceJob(async control=>({file,result:await a.convert({...control,target,state,source:data(source),assets:new Map([...this.assets].map(([h,a])=>[h,new Uint8Array(a.bytes)]))})}),'source',{operation:'convert',forceProposal:true,changes:['Convert source to bounded raster for editing','Retain original source bytes and pre-edit raster']});
 }
 async addAsset(bytes,kind,map){assert(bytes instanceof Uint8Array&&map.size<10000&&[...map.values()].reduce((n,a)=>n+a.byteLength,0)+bytes.byteLength<=512*1024*1024,'ASSET_BUDGET');bytes=boundedBytes(bytes);const hash=await sha256(bytes);if(!map.has(hash))map.set(hash,{hash,byteLength:bytes.length,bytes,kind});return {hash,byteLength:bytes.length};}
 async previewDescriptor(p,map){
  assert(Number.isInteger(p.width)&&Number.isInteger(p.height)&&p.width>0&&p.height>0&&p.width*p.height<=16777216&&Number.isFinite(p.pixelSizeMm)&&p.pixelSizeMm>0&&p.mediaType==='image/png','SOURCE_PREVIEW');
  assert(p.png instanceof Uint8Array&&p.png.length>=8&&p.png[0]===137&&p.png[1]===80&&p.png[2]===78&&p.png[3]===71,'SOURCE_PREVIEW_TYPE');
  this.validatePNG(p.png,p.width,p.height);const asset=await this.addAsset(p.png,'derived',map);return {width:p.width,height:p.height,pixelSizeMm:p.pixelSizeMm,png:asset.hash,mediaType:'image/png'};
 }
 validatePNG(png,width,height){
  assert(png instanceof Uint8Array&&png.length>=33&&[137,80,78,71,13,10,26,10].every((v,i)=>png[i]===v),'PNG_SIGNATURE');
  const header=new DataView(png.buffer,png.byteOffset,png.byteLength);assert(header.getUint32(8)===13&&header.getUint32(12)===0x49484452&&header.getUint32(16)===width&&header.getUint32(20)===height,'PNG_DIMENSIONS');
 }
 async rasterDescriptor(r,map,original=null){
  assert(r.data instanceof Uint8ClampedArray&&r.data.length===r.width*r.height*4&&Number.isInteger(r.width)&&Number.isInteger(r.height)&&r.width>0&&r.height>0&&r.width*r.height<=16777216&&r.pixelSizeMm>0&&Number.isFinite(r.pixelSizeMm),'RASTER_SCHEMA');
  this.validatePNG(r.preview,r.width,r.height);
  const raw=await this.addAsset(new Uint8Array(r.data.buffer,r.data.byteOffset,r.data.byteLength),'derived',map),preview=await this.addAsset(r.preview,'derived',map);
  assert(r.previewMediaType==='image/png'&&r.preview.length>=8&&r.preview[0]===137&&r.preview[1]===80&&r.preview[2]===78&&r.preview[3]===71,'RASTER_PREVIEW_TYPE');
  return {width:r.width,height:r.height,pixelSizeMm:r.pixelSizeMm,rgba:raw.hash,preview:preview.hash,originalPreview:original??preview.hash};
 }
 async sourceJob(factory,purpose,{operation='import',forceProposal=false,changes=[],sourceState=null,sourceCommand=null}={}){
  this.requireProject();const base=this.doc.state,baseHead=this.headRevision;
  const renderingState=sourceState?validateState(data(sourceState)):data(base);
  if(sourceState){const withoutText=s=>{const v=data(s);delete v.content.app.text;return v;};assert(canonicalJSON(withoutText(renderingState))===canonicalJSON(withoutText(base)),'SOURCE_PROSPECTIVE_SCOPE');}
  const sourceContext=purpose==='font'?null:createSourceContext(operation,purpose==='mesh'?base.content.app.mesh:base.content.app.source);
  const job=this.startJob('import'),map=new Map(this.assets),control={...this.jobControl(job),...(sourceContext?{sourceContext}:{})};
  try{
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   const prepared=await factory(control);this.jobGuard(job);const file=prepared.file;fileName(file.name);file.bytes=boundedBytes(file.bytes);
   const raw=await this.addAsset(file.bytes,purpose==='font'?'dependency':'source',map);
   this.jobGuard(job);const a=adapter(this.adapters.source),reply=prepared.result??await a.ingest({...control,file,purpose,state:freeze(data(renderingState)),...(sourceState?{baseState:freeze(data(base))}:{})});this.jobGuard(job);
   const result=reply.status==='proposal'?reply.result:reply;
   if(reply.confirmation&&result.confirmation)assert(canonicalJSON(reply.confirmation)===canonicalJSON(result.confirmation),'SOURCE_CONFIRMATION_CONFLICT');
   const confirmation=reply.confirmation??result.confirmation?sourceConfirmation(reply.confirmation??result.confirmation):null;
   const needsProposal=forceProposal||reply.status==='proposal'||!!result.raster&&result.kind!=='raster'||!!confirmation;
   if(confirmation)assert(typeof a.acceptProposal==='function','SOURCE_APPROVAL_ADAPTER_REQUIRED');
   assertTicket(result,job.ticket);
   if(purpose==='font'){
    assert(result.kind==='text','FONT_ADAPTER_RESULT');assert(!confirmation,'FONT_CONFIRMATION_UNSUPPORTED');this.requireOnline();
    const references=this.remote.settings?.values.uploadedFontReferences??[];assert(references.length<8,'FONT_BUDGET');
    const metadata=boundedSourceMetadata(result.metadata);
    const next=contentEdit(base,(a,n)=>{a.fontAssets=[...new Set([...(a.fontAssets??[]),raw.hash])];n.provenance={...n.provenance,inputFonts:{...n.provenance.inputFonts,[raw.hash]:metadata}};});
    await this.enqueue(()=>{this.jobGuard(job);return this.edit(next,{type:'source.font-import'},{assets:map,signal:job.abort.signal});});
    this.guard(job.epoch);assert(this.projectId===job.ticket.projectId,'STALE_PROJECT');
    await this.remote.settingsUpdate({uploadedFontReferences:[...references,{id:uuid(),name:file.name,hash:raw.hash,byteLength:raw.byteLength,projectId:this.projectId}]});return;
   }
   assert(['raster','svg','emoji','text','mesh'].includes(result.kind),'SOURCE_KIND');assert(purpose==='mesh'?result.kind==='mesh':result.kind!=='mesh','SOURCE_PURPOSE');
   const hashes=[raw.hash];for(const extra of result.assets??[])hashes.push((await this.addAsset(extra.bytes,extra.kind,map)).hash);
   const raster=result.raster?await this.rasterDescriptor(result.raster,map):null;if(raster)hashes.push(raster.rgba,raster.preview,raster.originalPreview);
   const preview=result.preview?await this.previewDescriptor(result.preview,map):null;if(preview)hashes.push(preview.png);
   const metadata=data(result.metadata);delete metadata.confirmationReceipt;delete metadata.rasterReceipt;
   if(operation==='convert')assert(result.kind===base.content.app.source.kind&&raw.hash===sourceContext.predecessor.rawHash,'SOURCE_CONVERSION_IDENTITY');
   const desc={id:sourceContext.id,name:file.name,kind:result.kind,raw,mediaType:file.mediaType,revision:sourceContext.revision,assetHashes:[...new Set(hashes)],metadata:{...metadata,sourceContext:data(sourceContext)},...(preview?{preview}:{}),...(raster?{raster}:{})};
   const productTransaction=purpose==='source'&&this.adapters.productTransactions!==undefined;
   let adopted=null;
   if(purpose==='source'&&!productTransaction&&a.prepareAdoption!==undefined){
    assert(typeof a.prepareAdoption==='function','SOURCE_ADOPTION_ADAPTER');
    this.jobGuard(job);
    desc.metadata=boundedSourceMetadata(desc.metadata);
    const materials=result.materials??base.content.app.materials,materialDefaults=result.materials??base.content.app.materialDefaults;
    // Validate the complete descriptor without advancing the domain revision.
    validateState({...data(base),sourceKind:desc.kind,content:{...data(base.content),app:{...data(base.content.app),source:desc,materials,materialDefaults}}});
    const reply=await a.prepareAdoption({...control,purpose:'source',operation,state:freeze(data(base)),source:freeze(data(desc)),
     materials:freeze(data(materials)),materialDefaults:freeze(data(materialDefaults)),
     assets:new Map([...map].map(([hash,asset])=>[hash,new Uint8Array(asset.bytes)]))});
    this.jobGuard(job);assert(this.doc.state===base&&this.headRevision===baseHead,'STALE_SOURCE_ADOPTION');
    adopted=validateAdoption(reply,job.ticket,base,desc);desc.metadata=adopted.metadata;
   }
   // Source role is adopted atomically. Replacing a text design by an image
   // turns the source switch off in this same undoable command.
   if(purpose==='source'&&!sourceState)renderingState.content.app.text.asSource=false;
   const next=contentEdit(renderingState,(a,n)=>{if(purpose==='mesh')a.mesh={...desc,applied:false};else{a.source=desc;n.sourceKind=result.kind;}
    if(adopted){a.materials=adopted.materials;a.materialDefaults=adopted.materialDefaults;}
    else if(result.materials){a.materials=data(result.materials);a.materialDefaults=data(result.materials);}});
   this.jobGuard(job);
   if(confirmation)sourcePreparation({control,confirmation,source:desc});
   if(productTransaction){
    const outputHash=await candidateHash(next,map),head=this.headRevision;this.jobGuard(job);
    const stage=async accepted=>{
     this.jobGuard(job);assert(this.headRevision===head&&!this.pendingOperation&&this.doc.state===base,'STALE_CONFIRMATION');
     assert(await candidateHash(next,map)===outputHash,'PROPOSAL_OUTPUT_CHANGED');this.jobGuard(job);
     const source=data(desc);
     if(confirmation)source.metadata=boundedSourceMetadata({...source.metadata,confirmationReceipt:sourceReceipt({version:accepted.version,ticket:accepted.ticket,confirmation:accepted.confirmation,receipt:accepted.receipt},{control,confirmation,source:desc,acceptedAtRevision:next.revision})});
     // The old source ticket is used to accept its private receipt. A fresh job
     // owns the later native proposal, so releasing the first consent cannot
     // cancel the second one. No document was changed at this boundary.
     this.finishJob(job);
     return this.prepareProductAdoption({source,map,operation,command:sourceCommand??{type:'source.import',purpose,name:file.name},text:data(renderingState.content.app.text),
      materials:result.materials??base.content.app.materials,materialDefaults:result.materials??base.content.app.materialDefaults,
      sourceAuthority:accepted?.sourceAuthority});
    };
    if(needsProposal){
     const apply=()=>confirmation?a.acceptProposal({...control,state:freeze(data(base)),confirmation:freeze(data(confirmation)),source:freeze(data(desc)),
      assets:new Map([...map].map(([hash,asset])=>[hash,new Uint8Array(asset.bytes)])),acceptedAtRevision:next.revision},stage):stage(null);
     job.stage='source confirmation';
     await this.proposeOperation({kind:forceProposal?'source conversion':'source import',changes:reply.changes??(changes.length?changes:['Adopt validated derivative; keep original bytes']),
      outputHash,control,verify:()=>candidateHash(next,map),apply,release:()=>this.finishJob(job)});
    }
    return await stage(null);
   }
   if(needsProposal){
    const outputHash=await candidateHash(next,map),head=this.headRevision;this.jobGuard(job);
    const apply=async()=>{
     let accepted=next;
     if(confirmation){
      this.jobGuard(job);
      const reply=await a.acceptProposal({...control,confirmation:freeze(data(confirmation)),source:freeze(data(desc)),
       assets:new Map([...map].map(([hash,asset])=>[hash,new Uint8Array(asset.bytes)])),acceptedAtRevision:next.revision});
      const receipt=sourceReceipt(reply,{control,confirmation,source:desc,acceptedAtRevision:next.revision});
      this.jobGuard(job);assert(this.headRevision===head&&!this.pendingOperation,'STALE_CONFIRMATION');
      assert(await candidateHash(next,map)===outputHash,'PROPOSAL_OUTPUT_CHANGED');this.jobGuard(job);
      accepted=data(next);const source=purpose==='mesh'?accepted.content.app.mesh:accepted.content.app.source;
      source.metadata=adopted?boundedSourceMetadata({...source.metadata,confirmationReceipt:receipt}):{...source.metadata,confirmationReceipt:receipt};
      accepted=validateState(accepted);
     }
     return this.enqueue(()=>{this.jobGuard(job);return this.edit(accepted,{type:'source.import',purpose,name:file.name},{assets:map,signal:job.abort.signal});});
    };
    job.stage='source confirmation';
    await this.proposeOperation({kind:forceProposal?'source conversion':'source import',
     changes:reply.changes??(changes.length?changes:['Adopt validated derivative; keep original bytes']),
     outputHash,control,verify:()=>candidateHash(next,map),apply,release:()=>this.finishJob(job)});
   }
   await this.enqueue(()=>{this.jobGuard(job);return this.edit(next,{type:'source.import',purpose,name:file.name},{assets:map,signal:job.abort.signal});});
  }finally{if(this.pendingOperation?.control!==control)this.finishJob(job);}
 }
 importFile(file,purpose='source'){return this.result(async()=>{
  if(purpose==='printer-profile'){this.requireOnline();await this.profileLibrary.prepare(file);return;}
  assert(file&&typeof file.arrayBuffer==='function'&&Number.isSafeInteger(file.size)&&file.size<=128*1024*1024,'FILE_BUDGET');fileName(file.name);
  const epoch=this.epoch,revision=this.doc?.state.revision,id=this.projectId;if(this.onlineSession)await this.preflight(epoch);const bytes=new Uint8Array(await file.arrayBuffer());assert(bytes.length===file.size,'FILE_SIZE');this.guard(epoch);
  assert(this.doc?.state.revision===revision&&this.projectId===id,'STALE_PROJECT');
  if(purpose==='settings'){this.requireOnline();await this.remote.importSettings('merge',decode(bytes),true);return;}
  if(purpose==='preset'){
   const p=parseJSON(decode(bytes));assert(p.kind==='app-preset'&&p.version===1,'PRESET_VERSION');assert(this.doc,'PROJECT_REQUIRED');validateState({...data(this.doc.state),parameters:p.parameters,schedule:p.schedule,product:p.product});
   this.requireOnline();const list=this.remote.settings?.values.presets??[];assert(list.length<20,'PRESET_BUDGET');await this.remote.settingsUpdate({presets:[...list,{...p,id:uuid()}]});return;
  }
  if(purpose==='project'){
   this.rawImport={kind:'bytes',bytes,name:file.name};
   const inspected=await inspectRescuePackage(bytes);if(inspected.status==='read-only')throw error('PROJECT_READ_ONLY');
   const assets=new Map(inspected.manifest.assets.map(a=>[a.hash,{...a,bytes:inspected.files.get('assets/'+a.hash+'.bin')}]));
   await verifyDocument(inspected.manifest.document,assets);this.guard(epoch);
   await this.enqueue(async()=>{this.guard(epoch);const copyId=uuid();await importRescueCopy(this.store,bytes,{projectId:copyId});this.guard(epoch);await this.open(copyId);await this.refreshLibrary();});return;
  }
  assert(['source','mesh','font'].includes(purpose),'IMPORT_PURPOSE');
  await this.sourceJob(async()=>({file:{name:file.name,mediaType:file.type,bytes}}),purpose);
 });}
 editSource(gesture){return this.result(async()=>{
  this.requireProject();const s=this.doc.state,source=s.content.app.source,a=adapter(this.adapters.editing);
  assert(source?.raster&&gesture.projectRevision===s.revision&&gesture.sourceRevision===source.revision,'SOURCE_REVISION_CONFLICT');
  const r=source.raster,preserved=initialSourceReferences(source),map=new Map(this.assets),mat=s.content.app.materials.find(m=>m.id===s.content.app.editor.colorMaterialId),color=mat?mat.color:null;
  assert(color||['erase','cut','crop','heal'].includes(gesture.tool),'MATERIAL_SELECTION_REQUIRED');const rgba=color?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).concat(255):[0,0,0,255];
  const job=this.startJob('edit-source');
  try{
   if(this.onlineSession){await this.preflight(job.epoch,job.abort.signal);this.jobGuard(job);}
   const result=await a.edit({...this.jobControl(job),gesture:data(gesture),editor:data(s.content.app.editor),color:rgba,source:{id:source.id,hash:source.raw.hash,revision:source.revision},
    raster:{width:r.width,height:r.height,pixelSizeMm:r.pixelSizeMm,data:new Uint8ClampedArray(this.assets.get(r.rgba).bytes),preview:new Uint8Array(this.assets.get(r.preview).bytes),previewMediaType:'image/png'}});
   this.jobGuard(job);assertTicket(result,job.ticket);if(!result.changed)return;const raster=await this.rasterDescriptor(result.raster,map,r.originalPreview);this.jobGuard(job);
   const editLineage=this.adapters.productTransactions?.recordRasterEdit?await this.adapters.productTransactions.recordRasterEdit({source:data(source),nextSource:{...data(source),revision:source.revision+1,raster},gesture:data(gesture),assets:new Map([...map].map(([h,a])=>[h,new Uint8Array(a.bytes)]))}):null;
   this.jobGuard(job);
   if(editLineage){preserved.add(r.rgba);preserved.add(r.preview);}
   const next=contentEdit(s,a=>{const src=a.source;src.revision++;src.raster=raster;src.assetHashes=[...new Set([src.raw.hash,...src.assetHashes.filter(h=>![r.rgba,r.preview].includes(h)||preserved.has(h)),raster.rgba,raster.preview,r.originalPreview])];
    if(editLineage)src.metadata=boundedSourceMetadata({...src.metadata,productEditLineage:editLineage});});
   await this.enqueue(()=>{this.jobGuard(job);return this.edit(next,{type:'editor.gesture',id:gesture.id,tool:gesture.tool},{assets:map,signal:job.abort.signal});});
  }finally{this.finishJob(job);}
 });}
 url(hash){if(!hash)return undefined;if(!this.urls.has(hash)){const a=this.assets.get(hash);if(!a)return undefined;this.urls.set(hash,this.objectURLs.createObjectURL(new Blob([a.bytes],{type:'image/png'})));}return this.urls.get(hash);}
 async queryEmoji(query,collectionId,offset){const a=adapter(this.adapters.source);assert(a.queryEmoji,'EMOJI_UNSUPPORTED');const result=await a.queryEmoji(query,collectionId,offset);for(const e of result.entries)e.previewUrl=sameOrigin(this.origin,e.previewUrl).href;return result;}
 async queryFonts(query){const a=adapter(this.adapters.source);assert(a.queryFonts,'FONT_CATALOG_UNSUPPORTED');return a.queryFonts(query);}
 selectEmoji(id,collectionId){return this.result(()=>this.sourceJob(async control=>{const a=adapter(this.adapters.source);assert(a.selectEmoji,'EMOJI_UNSUPPORTED');return a.selectEmoji({...control,id,collectionId});},'source'));}
}
