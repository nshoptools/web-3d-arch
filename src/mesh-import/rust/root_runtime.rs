//! Canonical imported mesh root child. Serial Worker, root byte admission and
//! registered inputs/leases. No pointer is accepted from a project document.
use super::{STATE,CONTROL,ROOT_BYTE_CAP,Published,Ordering};
use std::{collections::{BTreeMap,BTreeSet},sync::{LazyLock,Mutex,Arc},ffi::{c_void,CStr},ptr};
use sha2::{Digest,Sha256};
use serde_json::{Value,json};
use crate::Snapshot;
mod wire;
type Result<T> = std::result::Result<T,String>;
const MIB:usize=1024*1024;
const CAP:usize=2*MIB;
pub(super) struct Guard {raw:usize,charge:usize}
unsafe impl Send for Guard {}
unsafe impl Sync for Guard {}
impl Guard {
 pub(super) unsafe fn take(native:*mut u8)->Result<Arc<Self>>{
  let p=unsafe{wire::arch_product_native_take_guard(native)};
  if p.is_null(){return Err("MESH_PRODUCT_FINAL_GUARD_MISSING".into())}
  let n=unsafe{wire::arch_mech_guard_charge(p)}as usize;
  if n==0||n>128*MIB{unsafe{wire::arch_mech_guard_destroy(p)};return Err("MESH_GUARD_RESOURCE_LIMIT".into())}
  Ok(Arc::new(Self{raw:p as usize,charge:n}))
 }
 pub(super) fn owned_bytes(&self)->usize{self.charge}
}
impl Drop for Guard{fn drop(&mut self){unsafe{wire::arch_mech_guard_destroy(self.raw as *mut c_void)}}}
struct Import(u32);impl Drop for Import{fn drop(&mut self){unsafe{wire::archmi_release(self.0);}}}
struct Csg(u32);impl Drop for Csg{fn drop(&mut self){unsafe{wire::archcsg_release(self.0);}}}
struct Pin(u32);impl Drop for Pin{fn drop(&mut self){super::arch_snapshot_release(self.0);}}
struct Input(Vec<u8>);impl Drop for Input{fn drop(&mut self){STATE.lock().unwrap().bytes-=self.0.capacity();}}
struct Reserve(usize);impl Reserve{
 fn new(n:usize)->Result<Self>{let mut s=STATE.lock().unwrap();admit(&s,n)?;s.raster_reserved+=n;Ok(Self(n))}
}impl Drop for Reserve{fn drop(&mut self){STATE.lock().unwrap().raster_reserved-=self.0;}}
struct Stage{import:Import,wire:Vec<u8>,report:Vec<u8>,preview:Snapshot,approval:Value,charge:usize}
struct Proposal{snapshot:Snapshot,metadata:Vec<u8>,payload:Payload,charge:usize}
pub(super) struct Payload {
 pub(super) parent:u32,csg:Csg,confirmation:Vec<u8>,command:Vec<u8>,stage:Vec<u8>,
 import_report:Vec<u8>,revision:u64,base_revision:u64,base_head:String,passed:bool,charge:usize
}
impl Payload{
 pub(super) fn owned_bytes(&self)->usize{self.charge}
 pub(super) fn validate_manufacturing_export(&self,r:Option<u64>)->Result<()>{
  if !self.passed{return Err("MESH_POST_CSG_GATES_BLOCKED".into())}
  if r.is_some_and(|v|v!=self.revision){return Err("STALE_REVISION".into())}Ok(())
 }
}
static STAGES:LazyLock<Mutex<BTreeMap<u32,Stage>>>=LazyLock::new(||Mutex::new(BTreeMap::new()));
static PROPOSALS:LazyLock<Mutex<BTreeMap<u32,Proposal>>>=LazyLock::new(||Mutex::new(BTreeMap::new()));
fn hash(parts:&[&[u8]])->String{let mut h=Sha256::new();for p in parts{h.update(p)}h.finalize().iter().map(|v|format!("{v:02x}")).collect()}
fn admit(s:&super::State,n:usize)->Result<()>{
 if s.next==u32::MAX||s.bytes.checked_add(s.raster_reserved).and_then(|v|v.checked_add(n)).is_none_or(|v|v>ROOT_BYTE_CAP){return Err("MESH_ROOT_MEMORY_LIMIT".into())}Ok(())
}
fn check(g:u32,p:u32)->Result<()>{
 if g==0||CONTROL[0].load(Ordering::Acquire)!=g||CONTROL[1].load(Ordering::Acquire)!=1{return Err("STALE_GENERATION".into())}
 if CONTROL[3].load(Ordering::Acquire)==g{return Err("CANCELLED".into())}CONTROL[2].fetch_max(p.min(999),Ordering::AcqRel);Ok(())
}
fn fail(e:&str,g:u32)->u32{STATE.lock().unwrap().set_error(e);if CONTROL[0].load(Ordering::Acquire)==g&&CONTROL[1].load(Ordering::Acquire)==1{CONTROL[1].store(if e=="CANCELLED"{4}else{3},Ordering::Release)}0}
fn finish(){CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);}
fn consume(id:u32)->Result<Input>{STATE.lock().unwrap().inputs.remove(&id).map(Input).ok_or("INPUT_HANDLE_INVALID".into())}
fn parse(b:&[u8],version:&str)->Result<Value>{
 if b.is_empty()||b.len()>CAP{return Err("MESH_COMMAND_SIZE".into())}
 let v:Value=serde_json::from_slice(b).map_err(|_|"MESH_COMMAND_JSON")?;
 if v["version"]!=version{return Err("MESH_COMMAND_VERSION".into())}Ok(v)
}
fn context(v:&Value)->Result<(u64,String)>{
 let r=wire::id(&v["revision"])?;let head=wire::hash_text(&v["headHash"])?.to_string();
 for k in ["userId","projectId"]{if v[k].as_str().is_none_or(|s|s.is_empty()||s.len()>256||s.contains('\0')){return Err("MESH_CONTEXT_REQUIRED".into())}}
 Ok((r,head))
}
fn same_context(a:&Value,b:&Value)->bool{["userId","projectId","revision","headHash"].iter().all(|k|a[k]==b[k])}
unsafe fn borrow<'a,T>(p:*const T,n:usize,max:usize)->Result<&'a[T]>{
 if n>max||n>0&&p.is_null(){return Err("MESH_NATIVE_BUFFER_BOUND".into())}
 if n==0{return Ok(&[])}Ok(unsafe{std::slice::from_raw_parts(p,n)})
}
fn stage(importer:u32,input:&[u8],g:u32)->Result<Stage>{
 check(g,1)?;let approval=parse(input,"arch-mesh-stage/1")?;context(&approval)?;
 if approval["approved"]!=true||approval["repair"]!="none"||approval["conditioning"]!="none"{return Err("MESH_EXACT_INPUT_APPROVAL_REQUIRED".into())}
 let transform=wire::exact_matrix(&approval["transform"],&approval["transformBinary64LE"])?;
 if approval["transformBinary64LE"]!=wire::matrix_hex(&transform){return Err("MESH_TRANSFORM_APPROVAL_MISMATCH".into())}
 unsafe{if wire::archmi_publishable(importer)!=1||wire::archmi_acquire(importer)==0{return Err("MESH_IMPORT_NOT_READY".into())}}
 let import=Import(importer);
 let original=unsafe{borrow(wire::archmi_source_at_ptr(importer,0),wire::archmi_source_len(importer)as usize,64_000_000)}?;
 let report=unsafe{borrow(wire::archmi_report(importer).cast::<u8>(),wire::archmi_report_len(importer)as usize,CAP)}?;
 if wire::hash_text(&approval["sourceHash"])?!=hash(&[original])||wire::hash_text(&approval["nativeReportHash"])?!=hash(&[report]){return Err("MESH_IMPORT_APPROVAL_HASH".into())}
 let native:Value=serde_json::from_slice(report).map_err(|_|"MESH_IMPORT_REPORT")?;
 if native["state"]!="ready"||native["unitOrigin"]!="user"||native["unit"]!=approval["unit"]||!matches!(native["format"].as_str(),Some("stl"|"obj")){return Err("MESH_IMPORT_UNITS_FORMAT".into())}
 wire::id(&approval["sourceNumericId"])?;wire::id(&approval["provenanceNumericId"])?;
 let materials=approval["materials"].as_array().filter(|a|!a.is_empty()&&a.len()<=16).ok_or("MESH_IMPORT_MATERIAL_MAPPING")?;
 let actual=native["materials"].as_array().ok_or("MESH_IMPORT_MATERIALS")?;
 if actual.len()!=materials.len(){return Err("MESH_IMPORT_MATERIAL_MAPPING".into())}
 let mut names=BTreeSet::new();let mut ids=BTreeSet::new();
 for m in materials{
  let name=m["sourceMaterialId"].as_str().ok_or("MESH_MATERIAL_SOURCE_ID")?;
  if !names.insert(name)||!ids.insert(wire::id(&m["materialId"])?)||!(1..=16).contains(&wire::number(&m["slot"])?) {return Err("MESH_MATERIAL_COLLISION".into())}
  let a=actual.iter().find(|a|a["id"]==m["sourceMaterialId"]).ok_or("MESH_MATERIAL_SOURCE_MISSING")?;
  if a["rgba"]!=m["rgba"]{return Err("MESH_MATERIAL_COLOR_MISMATCH".into())}
 }
 let nv=unsafe{wire::archmi_vertex_count(importer)}as usize;let nt=unsafe{wire::archmi_face_count(importer)}as usize;let np=unsafe{wire::archmi_part_count(importer)}as usize;
 let preview=unsafe{Snapshot::new(g,borrow(wire::archmi_vertices(importer),nv*3,3_000_000)?,borrow(wire::archmi_triangles(importer),nt*3,1_200_000)?,borrow(wire::archmi_parts(importer),np,128)?,&[],&[],&[],&[])}?;
 let charge=original.len()+nv*24+nt*32+np*4096+4*MIB+preview.bytes().len()+input.len()+2*report.len();
 check(g,990)?;Ok(Stage{import,wire:input.to_vec(),report:report.to_vec(),preview,approval,charge})
}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_runtime_version()->u32{1}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_operation_mask()->u32{unsafe{wire::archcsg_operation_mask()}}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_stage(importer:u32,input:u32,g:u32)->u32{
 let result:Result<u32>=(||{let input=consume(input)?;let p=stage(importer,&input.0,g)?;drop(input);
  check(g,999)?;let mut states=STAGES.lock().unwrap();let mut s=STATE.lock().unwrap();
  if states.len()>=4{return Err("MESH_PREPARED_LIMIT".into())}admit(&s,p.charge)?;check(g,999)?;
  let id=s.next;s.next+=1;s.bytes+=p.charge;states.insert(id,p);s.set_error("");finish();Ok(id)})();
 match result{Ok(id)=>id,Err(e)=>fail(&e,g)}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_prepared_release(id:u32)->u32{
 let p=STAGES.lock().unwrap().remove(&id);if let Some(p)=p{STATE.lock().unwrap().bytes-=p.charge;drop(p);1}else{0}
}
extern "C" fn current(p:*mut c_void,g:u32,r:u64)->u32{let x=unsafe{&*(p as *const (u32,u64))};u32::from(x.0==g&&x.1==r&&check(g,200).is_ok())}
extern "C" fn cancelled(p:*mut c_void)->u32{let x=unsafe{&*(p as *const (u32,u64))};u32::from(check(x.0,200).is_err())}
extern "C" fn progress(p:*mut c_void,n:u32){let x=unsafe{&*(p as *const (u32,u64))};let _=check(x.0,200+n*6/10);}
fn prepare(snapshot:u32,stage:&Stage,input:&[u8],g:u32)->Result<Proposal>{
 check(g,1)?;let command=parse(input,"arch-mesh-csg-request/1")?;let(revision,head)=context(&command)?;
 if !same_context(&stage.approval,&command){return Err("MESH_STALE_CONTEXT".into())}
 let transform=wire::exact_matrix(&command["transform"],&command["transformBinary64LE"])?;
 if command["transformBinary64LE"]!=wire::matrix_hex(&transform)||command["transformBinary64LE"]!=stage.approval["transformBinary64LE"]{return Err("MESH_TRANSFORM_APPROVAL_MISMATCH".into())}
 // An app transaction binds its prospective immutable project head before
 // CSG. Standalone geometry callers can derive under the same captured head.
 let (published_revision,published_head)=if command["publication"].is_null(){(revision,head.clone())}else{
  let p=&command["publication"];
  if p["version"]!="arch-mesh-publication/1"||p["revision"]!=revision.checked_add(1).ok_or("MESH_PUBLICATION_REVISION")?.to_string(){return Err("MESH_PUBLICATION_REVISION".into())}
  wire::hash_text(&p["transactionHash"])?;
  let h=wire::hash_text(&p["headHash"])?.to_string();
  if h==head{return Err("MESH_PUBLICATION_HEAD".into())}(revision+1,h)
 };
 let feature=wire::id(&command["featureId"])?;
 let source_generation=wire::number(&command["snapshotGeneration"])?;
 let (p,n,semantic,base_meta,guard)={
  let mut s=STATE.lock().unwrap();let parent=s.snapshots.get_mut(&snapshot).ok_or("MESH_GENERATED_HANDLE")?;
  let product=parent.product.as_ref().ok_or("MESH_GENERATED_BASE_PRODUCT_REQUIRED")?;
  product.validate_manufacturing_export(Some(revision))?;
  if parent.leases>=64||wire::u32(parent.snapshot.bytes(),16)!=source_generation{return Err("MESH_GENERATED_GENERATION".into())}
  let meta:Value=serde_json::from_slice(&parent.metadata).map_err(|_|"MESH_GENERATED_METADATA")?;
  if meta["headHash"]!=head{return Err("MESH_GENERATED_HEAD".into())}
  let guard=product.mesh_guard().ok_or("MESH_FINAL_GUARD_MISSING")?;
  let semantic=product.mesh_semantics().to_vec();parent.leases+=1;
  (parent.snapshot.bytes().as_ptr(),parent.snapshot.bytes().len(),semantic,meta,guard)
 };
 let pin=Pin(snapshot);let reserve=Reserve::new(128*MIB)?;
 let arch=unsafe{borrow(p,n,256*MIB)}?;let count=wire::u32(arch,28)as usize;
 if count==0||count>128{return Err("MESH_GENERATED_PART_LIMIT".into())}
 let info=wire::table(&semantic,1,160)?;let features=wire::table(&semantic,2,176)?;
 if info.len()!=count*160{return Err("MESH_GENERATED_PART_INFO".into())}
 let bm=command["bindings"].as_array().filter(|b|b.len()==count).ok_or("MESH_EXPLICIT_PART_BINDINGS")?;
 let table=command["materials"].as_array().filter(|b|!b.is_empty()&&b.len()<=16).ok_or("MESH_GENERATED_MATERIALS")?;
 let materials:Vec<wire::Material>=table.iter().map(|m|Ok(wire::Material{id:wire::id(&m["materialId"])?,rgba:wire::number(&m["rgba"])?,slot:wire::number(&m["slot"])?})).collect::<Result<_>>()?;
 let mut bindings=Vec::new();let mut ids=BTreeSet::new();
 for(i,b)in bm.iter().enumerate(){
  let record=&info[i*160..(i+1)*160];let fi=wire::u32(record,0)as usize;
  if fi>=features.len()/176{return Err("MESH_FEATURE_INDEX".into())}let f=&features[fi*176..(fi+1)*176];
  let mat=wire::number(&b["materialIndex"])? as usize;let sid=wire::id(&b["semanticId"])?;
  let source=wire::id(&b["sourceId"])?;let provenance=wire::id(&b["provenanceId"])?;
  let part=wire::u32(arch,56)as usize+i*40;
  if mat>=materials.len()||!ids.insert(sid)||wire::number(&b["sourceIndex"])?!=wire::u32(arch,part+20)||
   source!=wire::u64(f,112)||provenance!=wire::u64(record,24)||materials[mat].slot!=wire::u32(record,8)||materials[mat].rgba!=wire::u32(arch,part+16){return Err("MESH_GENERATED_LINEAGE_MISMATCH".into())}
  bindings.push(wire::Binding{semantic:sid,source,provenance,source_index:wire::u32(arch,part+20),material:mat as u32});
 }
 let operation=match command["operation"].as_str(){Some("union")=>0,Some("difference")=>1,Some("intersection")=>2,Some("import-as-part")=>3,_=>return Err("MESH_OPERATION".into())};
 let targets:Vec<u64>=command["targets"].as_array().filter(|a|a.len()<=128&&(operation==3||!a.is_empty())).ok_or("MESH_EXPLICIT_TARGETS")?.iter().map(wire::id).collect::<Result<_>>()?;
 let mut target_groups=BTreeSet::new();for id in &targets{
  let pi=bindings.iter().position(|b|b.semantic==*id).ok_or("MESH_TARGET_ORPHAN")?;target_groups.insert(wire::u32(&info,pi*160+16));
 }
 if operation==3{
  if !targets.is_empty(){return Err("MESH_IMPORT_AS_PART_HAS_NO_TARGET".into())}
  if command["separateImportedAssemblyGroup"]!=2{return Err("MESH_SEPARATE_ASSEMBLY_APPROVAL_REQUIRED".into())}
 }else if target_groups.len()!=1{return Err("MESH_TARGET_ASSEMBLY_GROUP_AMBIGUOUS".into())}
 let policy=match command["materialPolicy"].as_str(){Some("requireDisjointMaterials")=>0,Some("keepSelectedTargetMaterial")=>1,_=>return Err("MESH_MATERIAL_POLICY".into())};
 if operation==3&&policy!=0{return Err("MESH_IMPORT_AS_PART_PRESERVES_MATERIALS".into())}
 let tolerance=command["queryToleranceCeilingMm"].as_f64().filter(|x|x.is_finite()&&*x>0.&&*x<=0.002).ok_or("MESH_QUERY_BUDGET")?;
 let limit=|key:&str,max:u32|->Result<u32>{let n=wire::number(&command["limits"][key])?;if n==0||n>max{return Err("MESH_RESOURCE_LIMIT".into())}Ok(n)};
 let r=wire::Request{abi:1,operation,policy,generation:g,revision,feature,snapshot,source_generation,importer:stage.import.0,reserved:0,
  arch:p,arch_bytes:n as u32,part_count:count as u32,bindings:bindings.as_ptr(),materials:materials.as_ptr(),material_count:materials.len()as u32,
  target_count:targets.len()as u32,targets:targets.as_ptr(),transform:transform.as_ptr(),tolerance,
  max_vertices:limit("vertices",1_000_000)?,max_triangles:limit("triangles",400_000)?,max_parts:limit("parts",128)?,max_operations:limit("operations",2_000_000)?,
  provenance:input.as_ptr().cast(),provenance_bytes:input.len()as u32};
 let identity=(g,revision);let control=wire::Control{data:(&identity as *const(u32,u64)).cast_mut().cast(),current,cancelled,progress};
 let csg=Csg(unsafe{wire::archcsg_compute(&r,&control)});
 if csg.0==0{return Err(unsafe{CStr::from_ptr(wire::archcsg_error())}.to_string_lossy().into())}
 let mut view=wire::View::default();if unsafe{wire::archcsg_view(csg.0,&mut view)}!=1||view.abi!=1{return Err("MESH_CSG_VIEW".into())}
 let report=unsafe{borrow(view.report.cast::<u8>(),view.report_bytes as usize,CAP)}?;
 let native:Value=serde_json::from_slice(report).map_err(|_|"MESH_CSG_REPORT")?;
 if view.verdict!=0{return Err(native["diagnostic"].as_str().unwrap_or("MESH_CSG_REJECTED").into())}
 check(g,800)?;
 let results=native["parts"].as_array().filter(|a|a.len()==view.part_count as usize).ok_or("MESH_CSG_PARTS")?;
 let mut owners=Vec::new();let mut groups=Vec::new();let mut ledger=Vec::new();let mut slots=BTreeMap::new();let mut material_ids=BTreeMap::new();let mut part_ids=BTreeSet::new();
 for (i,o) in results.iter().enumerate(){
  let side=wire::number(&o["volumeOwnerOperand"])?;let pi=wire::number(&o["volumeOwnerPart"])? as usize;
  let (owner,group,id,slot,rgba,source,provenance)=if side==0{
   if pi>=count{return Err("MESH_CSG_OWNER".into())}let bind=&bindings[pi];let mat=&materials[bind.material as usize];
   (pi as u32,wire::u32(&info,pi*160+16),mat.id,mat.slot,mat.rgba,bind.source,bind.provenance)
  }else if side==1{
   if command["separateImportedAssemblyGroup"]!=2{return Err("MESH_SEPARATE_ASSEMBLY_APPROVAL_REQUIRED".into())}
   let m=stage.approval["materials"].as_array().unwrap().iter().find(|m|m["sourceMaterialId"]==o["materialId"]).ok_or("MESH_IMPORTED_MATERIAL_ORPHAN")?;
   (u32::MAX,2,wire::id(&m["materialId"])?,wire::number(&m["slot"])?,wire::number(&m["rgba"])?,wire::id(&stage.approval["sourceNumericId"])?,wire::id(&stage.approval["provenanceNumericId"])?)
  }else{return Err("MESH_CSG_OWNER_SIDE".into())};
  if slots.insert(slot,(id,rgba)).is_some_and(|old|old!=(id,rgba)){return Err("MESH_FINAL_SLOT_COLLISION".into())}
  if material_ids.insert(id,(slot,rgba)).is_some_and(|old|old!=(slot,rgba)){return Err("MESH_FINAL_MATERIAL_ID_COLLISION".into())}
  let part_identity=if side==0{format!("generated:{}",bindings[pi].semantic)}else{format!("imported:{feature}:{source}:{pi}")};
  if !part_ids.insert(part_identity.clone()){return Err("MESH_FINAL_PART_ID_COLLISION".into())}
  owners.push(owner);groups.push(group);
  ledger.push(json!({"part":i,"partIdentity":part_identity,"identityVersion":"arch-mesh-part-identity/1","sourceIndex":o["sourceRow"],"materialId":id.to_string(),"rgba":rgba,"slot":slot,
   "sourceId":source.to_string(),"provenanceId":provenance.to_string(),"assemblyGroup":group,"volumeOwner":o}));
 }
 if material_ids.len()>16{return Err("MESH_FINAL_MATERIAL_COUNT".into())}
 let mut gate=vec![0u8;65536];
 let verdict=unsafe{wire::arch_mesh_check_final(guard.raw as *const c_void,csg.0,owners.as_ptr(),groups.as_ptr(),view.part_count,g,gate.as_mut_ptr().cast(),gate.len()as u32)};
 let len=gate.iter().position(|&b|b==0).ok_or("MESH_GATE_REPORT_LIMIT")?;gate.truncate(len);
 let gates:Value=serde_json::from_slice(&gate).map_err(|_|"MESH_GATE_REPORT")?;
 let passed=verdict==1&&gates["verdict"]==0&&gates["exportBlocked"]==false;
 check(g,970)?;
 let derived=unsafe{Snapshot::new(g,borrow(view.vertices,view.vertex_count as usize*3,3_000_000)?,borrow(view.triangles,view.triangle_count as usize*3,1_200_000)?,borrow(view.parts,view.part_count as usize,128)?,&[],&[],&[],&[])}?;
 let source_hash=hash(&[arch]);let derived_hash=hash(&[derived.bytes()]);let command_hash=hash(&[input]);
 let descriptor=unsafe{borrow(view.confirmation,view.confirmation_bytes as usize,CAP)}?;
 let proposal_hash=hash(&[b"arch-root-mesh-proposal-v1\0",source_hash.as_bytes(),derived_hash.as_bytes(),descriptor,&gate,input,&stage.wire]);
 let confirmation=serde_json::to_vec(&json!({"version":"arch-mesh-confirmation/1","revision":revision.to_string(),"headHash":head,
  "userId":command["userId"],"projectId":command["projectId"],"sourceSnapshotHash":source_hash,"derivedSnapshotHash":derived_hash,
  "proposalHash":proposal_hash,"commandHash":command_hash,"approved":true})).map_err(|_|"MESH_CONFIRMATION_ENCODING")?;
 let metadata=serde_json::to_vec(&json!({
  "kind":"mesh-scene","version":"arch-derived-mesh-scene/1","revision":published_revision.to_string(),"headHash":published_head,"generation":g,
  "parentRevision":revision.to_string(),"parentHeadHash":head,
  "parentSnapshotId":snapshot,"parentSnapshotGeneration":source_generation,"parentSnapshotHash":source_hash,
  "sourceHash":base_meta["sourceHash"],"importedSourceHash":stage.approval["sourceHash"],"derivedSnapshotHash":derived_hash,
  "inputApproval":stage.approval,"command":command,"proposalHash":proposal_hash,"nativeCsg":native,"postCsgGates":gates,
  "materialLineage":ledger,"operationCapability":if operation==3{"import-as-part"}else{"triangle-csg"},"generatedGeometryPreserved":operation==3,"baseProduct":base_meta,"sourceSemantics":2,"mechanicsSemantics":3,
  "exportBlocked":!passed,"applied":false,"publication":"prepared-only","totalErrorBoundMm":null,"physicalFit":"unqualified",
  "sectionMeshCapability":"unsupported","originals":"immutable","parameterBindings":"preserved-no-rewrite"
 })).map_err(|_|"MESH_METADATA_ENCODING")?;
 if metadata.len()>4*MIB{return Err("MESH_METADATA_LIMIT".into())}
 let native_charge=unsafe{wire::archmi_source_len(stage.import.0)}as usize+unsafe{wire::archmi_vertex_count(stage.import.0)}as usize*24+
  unsafe{wire::archmi_face_count(stage.import.0)}as usize*32+view.vertex_count as usize*24+view.triangle_count as usize*28+4*MIB;
 let charge=native_charge+confirmation.capacity()+input.len()+stage.wire.len()+stage.report.len();
 let payload=Payload{parent:snapshot,csg,confirmation,command:input.to_vec(),stage:stage.wire.clone(),import_report:stage.report.clone(),revision:published_revision,base_revision:revision,base_head:head,passed,charge};
 let total=derived.bytes().len()+metadata.len()+payload.owned_bytes();
 drop(reserve);check(g,990)?;std::mem::forget(pin);
 Ok(Proposal{snapshot:derived,metadata,payload,charge:total})
}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_prepare(snapshot:u32,prepared:u32,input:u32,g:u32)->u32{
 let result:Result<u32>=(||{
  let input=consume(input)?;
  let stages=STAGES.lock().unwrap();let stage=stages.get(&prepared).ok_or("MESH_PREPARED_HANDLE")?;
  let p=prepare(snapshot,stage,&input.0,g)?;drop(stages);drop(input);
  let hold=Pin(p.payload.parent);
  check(g,999)?;let mut q=PROPOSALS.lock().unwrap();let mut s=STATE.lock().unwrap();
  if q.len()>=4{return Err("MESH_PROPOSAL_LIMIT".into())}admit(&s,p.charge)?;check(g,999)?;
  let id=s.next;s.next+=1;s.bytes+=p.charge;q.insert(id,p);std::mem::forget(hold);s.set_error("");finish();Ok(id)
 })();match result{Ok(id)=>id,Err(e)=>fail(&e,g)}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_proposal_release(id:u32)->u32{
 let p=PROPOSALS.lock().unwrap().remove(&id);if let Some(p)=p{STATE.lock().unwrap().bytes-=p.charge;let parent=p.payload.parent;drop(p);super::arch_snapshot_release(parent);1}else{0}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_confirm(id:u32,input:u32,g:u32)->u32{
 let result:Result<u32>=(||{
  let input=consume(input)?;check(g,1)?;
  let mut q=PROPOSALS.lock().unwrap();let p=q.get(&id).ok_or("MESH_PROPOSAL_HANDLE")?;
  if !p.payload.passed{return Err("MESH_POST_CSG_GATES_BLOCKED".into())}
  if input.0!=p.payload.confirmation{return Err("MESH_EXACT_CONFIRMATION_MISMATCH".into())}
  let mut state=STATE.lock().unwrap();let parent=state.snapshots.get(&p.payload.parent).ok_or("MESH_PARENT_RETIRED")?;
  let product=parent.product.as_ref().ok_or("MESH_GENERATED_BASE_PRODUCT_REQUIRED")?;
  product.validate_manufacturing_export(Some(p.payload.base_revision))?;
  let meta:Value=serde_json::from_slice(&parent.metadata).map_err(|_|"MESH_PARENT_METADATA")?;
  if meta["headHash"]!=p.payload.base_head{return Err("MESH_STALE_HEAD".into())}
  // Move the geometry arrays exactly. Only the ARCH transport generation
  // changes; both prepared and published snapshot hashes are recorded.
  if state.snapshots.len()>=8||state.next==u32::MAX{return Err("SNAPSHOT_LEASE_LIMIT".into())}
  check(g,999)?;
  let mut published:Value=serde_json::from_slice(&p.metadata).map_err(|_|"MESH_METADATA")?;
  published["applied"]=json!(true);published["publication"]=json!("confirmed-root-snapshot");
  published["preparedSnapshotHash"]=published["derivedSnapshotHash"].clone();
  published["preparedGeneration"]=published["generation"].clone();published["generation"]=json!(g);
  let old=p.snapshot.bytes();let generation=g.to_le_bytes();
  published["derivedSnapshotHash"]=json!(hash(&[&old[..16],&generation,&old[20..]]));
  let metadata=serde_json::to_vec(&published).map_err(|_|"MESH_METADATA")?;
  let extra=metadata.len().saturating_sub(p.metadata.len());admit(&state,extra)?;
  check(g,999)?;let mut p=q.remove(&id).unwrap();p.snapshot.publication_generation(g);let next=state.next;state.next+=1;
  state.bytes=state.bytes-p.metadata.len()+metadata.len();
  state.snapshots.insert(next,Published{snapshot:p.snapshot,metadata,leases:1,product:None,mesh:Some(p.payload)});
  state.set_error("");finish();Ok(next)
 })();match result{Ok(id)=>id,Err(e)=>fail(&e,g)}
}
fn payload_buffer(p:&Payload,kind:u32)->(*const u8,usize){
 match kind{
  3=>(p.confirmation.as_ptr(),p.confirmation.len()),
  4=>unsafe{(wire::archcsg_source_ptr(p.csg.0,0),wire::archcsg_source_len(p.csg.0,0)as usize)},
  5=>{let mut v=wire::View::default();if unsafe{wire::archcsg_view(p.csg.0,&mut v)}==1{(v.origins.cast(),v.origin_count as usize*16)}else{(ptr::null(),0)}},
  6=>(p.import_report.as_ptr(),p.import_report.len()),7=>(p.command.as_ptr(),p.command.len()),
  9=>(p.stage.as_ptr(),p.stage.len()),_ =>(ptr::null(),0)
 }
}
fn buffer(id:u32,kind:u32)->(*const u8,usize){
 {
  let states=STAGES.lock().unwrap();if let Some(p)=states.get(&id){return match kind{
   1=>(p.preview.bytes().as_ptr(),p.preview.bytes().len()),2|9=>(p.wire.as_ptr(),p.wire.len()),
   4=>unsafe{(wire::archmi_source_at_ptr(p.import.0,0),wire::archmi_source_len(p.import.0)as usize)},
   6=>(p.report.as_ptr(),p.report.len()),_ =>(ptr::null(),0)
  }}
 }
 {
  let q=PROPOSALS.lock().unwrap();if let Some(p)=q.get(&id){return match kind{
   1=>(p.snapshot.bytes().as_ptr(),p.snapshot.bytes().len()),2=>(p.metadata.as_ptr(),p.metadata.len()),
   _=>payload_buffer(&p.payload,kind)
  }}
 }
 let s=STATE.lock().unwrap();if let Some(p)=s.snapshots.get(&id){if let Some(mesh)=&p.mesh{return match kind{
  1=>(p.snapshot.bytes().as_ptr(),p.snapshot.bytes().len()),2=>(p.metadata.as_ptr(),p.metadata.len()),
  8=>s.snapshots.get(&mesh.parent).and_then(|p|p.product.as_ref()).map(|p|{let b=p.mesh_semantics();(b.as_ptr(),b.len())}).unwrap_or((ptr::null(),0)),
  _=>payload_buffer(mesh,kind)
 }}}
 (ptr::null(),0)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_buffer_ptr(id:u32,kind:u32)->*const u8{buffer(id,kind).0}
#[unsafe(no_mangle)] pub extern "C" fn arch_mesh_buffer_len(id:u32,kind:u32)->u32{buffer(id,kind).1 as u32}
