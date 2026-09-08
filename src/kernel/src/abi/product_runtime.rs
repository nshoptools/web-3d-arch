//! Product jobs share root registered inputs, snapshot leases and byte admission.
//! No public entry accepts a native pointer from a recipe/document.
mod bundle;
use super::{STATE,CONTROL,Ordering,ROOT_BYTE_CAP,Published};
use crate::{Snapshot,View,BuildControl};
use sha2::{Digest,Sha256};
use std::{ffi::{c_char,CStr},ptr};
const MIB:usize=1024*1024;
const META_CAP:usize=8*MIB;
pub(super) struct Request {wire:Vec<u8>,source:u32,descriptor:[u8;192]}
pub(super) struct Proposal {payload:Payload,source:u32,accepted:bool}
pub(super) struct Payload {buffers:Vec<Block>,guard:Option<std::sync::Arc<super::mesh_runtime::Guard>>}
struct Block {words:Box<[u64]>,length:usize}
impl Block{
 fn new(bytes:&[u8])->Result<Self,String>{
  if bytes.len()>META_CAP{return Err("PRODUCT_METADATA_LIMIT".into())}
  let mut words=Vec::new();words.try_reserve_exact(bytes.len().div_ceil(8)).map_err(|_|"PRODUCT_ALLOCATION")?;
  words.resize(bytes.len().div_ceil(8),0u64);
  for(i,c)in bytes.chunks(8).enumerate(){let mut a=[0;8];a[..c.len()].copy_from_slice(c);words[i]=u64::from_le_bytes(a);}
  Ok(Self{words:words.into_boxed_slice(),length:bytes.len()})
 }
 fn bytes(&self)->&[u8]{unsafe{std::slice::from_raw_parts(self.words.as_ptr().cast(),self.length)}}
 fn ptr(&self)->*const u8{if self.length==0{ptr::null()}else{self.words.as_ptr().cast()}}
}
impl Payload{
 pub(super) fn mesh_guard(&self)->Option<std::sync::Arc<super::mesh_runtime::Guard>>{self.guard.clone()}
 pub(super) fn mesh_semantics(&self)->&[u8]{self.buffers[0].bytes()}
 pub(super) fn owned_bytes(&self)->usize{self.buffers.iter().map(|b|b.words.len()*8).sum::<usize>()+256+self.guard.as_ref().map_or(0,|g|g.owned_bytes())}
 pub(super) fn validate_manufacturing_export(&self,expected_revision:Option<u64>)->Result<(),String>{
  // Authority belongs to the immutable payload published with this handle.
  // Caller flags may add restrictions, but may never remove these restrictions.
  let semantic=self.buffers[0].bytes();let request=self.buffers[1].bytes();let head=self.buffers[3].bytes();
  if semantic.len()<656||request.len()<256||head.len()!=192||u32_at(semantic,148)!=3||u32_at(semantic,152)!=2{return Err("PRODUCT_EXPORT_METADATA".into())}
  if u32_at(semantic,16)!=0{return Err("INVALID_INPUT".into())}
  if u32_at(semantic,20)!=0{return Err("KERNEL_FAILURE".into())}
  if u32_at(semantic,24)!=0{return Err("ASSEMBLY_VIEW".into())}
  let revision=u64::from_le_bytes(head[16..24].try_into().unwrap());
  if revision!=u64::from_le_bytes(request[64..72].try_into().unwrap())||revision!=u64::from_le_bytes(semantic[32..40].try_into().unwrap())||expected_revision.is_some_and(|r|r!=revision){return Err("STALE_REVISION".into())}
  Ok(())
 }
 fn new(semantic:&[u8],wire:&[u8],source:&[u8],head:&[u8])->Result<Self,String>{
  Ok(Self{buffers:[semantic,wire,source,head].iter().map(|b|Block::new(b)).collect::<Result<_,_>>()?,guard:None})
 }
}
unsafe extern "C" {
 fn arch_product_native_build(arch:*const u8,arch_bytes:u32,request:*const u8,request_bytes:u32,control:*const BuildControl,generation:u32)->*mut u8;
 fn arch_product_native_probe(arch:*const u8,arch_bytes:u32,request:*const u8,request_bytes:u32,control:*const BuildControl,generation:u32)->*mut u8;
 fn arch_product_native_mesh(result:*const u8,view:*mut View)->i32;
 fn arch_product_native_metadata(result:*const u8,bytes:*mut u32)->*const u8;
 fn arch_product_native_error(result:*const u8)->*const c_char;
 fn arch_product_native_destroy(result:*mut u8);
}
struct Native(*mut u8);impl Drop for Native{fn drop(&mut self){unsafe{arch_product_native_destroy(self.0)}}}
struct RequestGuard(Request);impl Drop for RequestGuard{fn drop(&mut self){let mut s=STATE.lock().unwrap();s.bytes-=self.0.wire.capacity()+192;drop(s);super::arch_snapshot_release(self.0.source);}}
struct Reservation(usize);impl Reservation{
 fn new(n:usize)->Result<Self,String>{let mut s=STATE.lock().unwrap();if s.bytes+s.raster_reserved+n>ROOT_BYTE_CAP{return Err("PRODUCT_ROOT_MEMORY_LIMIT".into())}s.raster_reserved+=n;Ok(Self(n))}
}impl Drop for Reservation{fn drop(&mut self){STATE.lock().unwrap().raster_reserved-=self.0}}
fn u32_at(b:&[u8],at:usize)->u32{u32::from_le_bytes(b[at..at+4].try_into().unwrap())}
fn hash(parts:&[&[u8]])->[u8;32]{let mut h=Sha256::new();for p in parts{h.update(p)}h.finalize().into()}
fn hex(b:&[u8])->String{b.iter().map(|x|format!("{x:02x}")).collect()}
fn unhex(s:&str)->Result<[u8;32],String>{
 if s.len()!=64||!s.is_ascii(){return Err("PRODUCT_SOURCE_HASH".into())}let mut b=[0;32];
 for(i,v)in b.iter_mut().enumerate(){*v=u8::from_str_radix(&s[i*2..i*2+2],16).map_err(|_|"PRODUCT_SOURCE_HASH")?;}Ok(b)
}
fn check(g:u32,p:u32)->Result<(),String>{
 if g==0||CONTROL[0].load(Ordering::Acquire)!=g||CONTROL[1].load(Ordering::Acquire)!=1{return Err("STALE_GENERATION".into())}
 if CONTROL[3].load(Ordering::Acquire)==g{return Err("CANCELLED".into())}
 CONTROL[2].fetch_max(p.min(999),Ordering::AcqRel);Ok(())
}
fn failure(e:&str,g:u32)->u32{
 let mut s=STATE.lock().unwrap();s.set_error(e);
 if CONTROL[0].load(Ordering::Acquire)==g&&CONTROL[1].load(Ordering::Acquire)==1{CONTROL[1].store(if e=="CANCELLED"{4}else{3},Ordering::Release);}0
}
fn finish(){CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);}
fn start(){let mut s=STATE.lock().unwrap();s.product_last=0;s.set_error("");}
fn consume(id:u32)->Result<Vec<u8>,String>{
 let mut s=STATE.lock().unwrap();let b=s.inputs.remove(&id).ok_or("INPUT_HANDLE_INVALID")?;Ok(b)
}
fn metadata_valid(b:&[u8])->Result<serde_json::Value,String>{
 if b.len()>2*MIB{return Err("PRODUCT_SOURCE_METADATA_LIMIT".into())}
 let m:serde_json::Value=serde_json::from_slice(b).map_err(|_|"PRODUCT_SOURCE_METADATA")?;
 if !matches!(m["kind"].as_str(),Some("svg"|"raster-source-context"|"product-source-bundle")){return Err("PRODUCT_SOURCE_CONTEXT_REQUIRED".into())}
 Ok(m)
}
fn register(source:u32,source_generation:u32,wire:Vec<u8>)->Result<u32,String>{
 let n=wire.capacity();
 let result:Result<u32,String>=(||{
  if wire.len()<256||wire.len()>2*MIB||u32_at(&wire,0)!=0x51525041||u32_at(&wire,4)!=1||u32_at(&wire,8)as usize!=wire.len(){return Err("PRODUCT_REQUEST_VERSION".into())}
  if wire[128..160].iter().all(|&v|v==0){return Err("PRODUCT_HEAD_REQUIRED".into())}
  // Provenance is bounded data only. No objects, names or paths become pointers.
  let plen=u32_at(&wire,40)as usize;if plen==0||plen> MIB||plen>wire.len()-256{return Err("PRODUCT_PROVENANCE_LIMIT".into())}
  let provenance:serde_json::Value=serde_json::from_slice(&wire[wire.len()-plen..]).map_err(|_|"PRODUCT_PROVENANCE_JSON")?;
  if !provenance.is_object(){return Err("PRODUCT_PROVENANCE_OBJECT".into())}
  let mut s=STATE.lock().unwrap();
  if s.product_requests.len()>=4||s.next==u32::MAX||s.bytes+s.raster_reserved+192>ROOT_BYTE_CAP{return Err("PRODUCT_REQUEST_LIMIT".into())}
  let p=s.snapshots.get_mut(&source).ok_or("PRODUCT_SOURCE_HANDLE")?;
  if p.product.is_some()||p.mesh.is_some()||p.leases>=64||u32_at(p.snapshot.bytes(),16)!=source_generation{return Err("PRODUCT_SOURCE_GENERATION_OR_KIND".into())}
  let meta=metadata_valid(&p.metadata)?;
  let source_hash=unhex(meta["sourceHash"].as_str().ok_or("PRODUCT_SOURCE_HASH_MISSING")?)?;
  if source_hash!=wire[96..128]{return Err("PRODUCT_SOURCE_HASH_MISMATCH".into())}
  let param_count=u32_at(&wire,16)as usize;let material_count=u32_at(&wire,20)as usize;let region_count=u32_at(&wire,24)as usize;
  if param_count>128||material_count!=9||region_count==0||region_count>256{return Err("PRODUCT_RECORD_COUNTS".into())}
  let ro=256+param_count*40+material_count*24;
  if ro+region_count*112>wire.len(){return Err("PRODUCT_RECORD_LENGTH".into())}
  let bindings=provenance["regionSources"].as_array().ok_or("PRODUCT_SOURCE_BINDINGS_REQUIRED")?;
  if bindings.len()!=region_count{return Err("PRODUCT_SOURCE_BINDING_COUNT".into())}
  for i in 0..region_count {
   let at=ro+i*112;let sel=u32_at(&wire,at);let slot=u32_at(&wire,at+4);
   let sid=u64::from_le_bytes(wire[at+24..at+32].try_into().unwrap()).to_string();
   let b=bindings.iter().find(|v|v["sourceIndex"].as_u64()==Some(sel as u64)&&v["contextSlot"].as_u64().unwrap_or(0)==slot as u64).ok_or("PRODUCT_SOURCE_BINDING_SELECTOR")?;
   if b["semanticId"].as_str()!=Some(sid.as_str()){return Err("PRODUCT_SEMANTIC_BINDING_MISMATCH".into())}
   let selected_meta=if meta["kind"]=="product-source-bundle" {
    &meta["contexts"].get(slot as usize).ok_or("PRODUCT_CONTEXT_SLOT")?["metadata"]
   }else{if slot!=0{return Err("PRODUCT_CONTEXT_SLOT".into())}&meta};
   let key=if selected_meta["kind"]=="svg" {
    let paint=selected_meta["paints"].get(sel as usize).ok_or("PRODUCT_SVG_PAINT_SELECTOR")?;
    paint["sourceId"].as_str().or_else(||paint["id"].as_str()).ok_or("PRODUCT_SOURCE_KEY")?.to_string()
   }else {
    let a=selected_meta["sourceRegions"].as_array().ok_or("PRODUCT_RASTER_REGION_CONTEXT_REQUIRED")?;
    let r=a.iter().find(|r|r["sourceIndex"].as_u64()==Some(sel as u64)).ok_or("PRODUCT_RASTER_REGION_SELECTOR")?;
    format!("raster-region:{}",r["rasterRegionId"].as_u64().ok_or("PRODUCT_RASTER_REGION_ID")?)
   };
   if b["sourceKey"].as_str()!=Some(key.as_str()){return Err("PRODUCT_SOURCE_KEY_MISMATCH".into())}
  }
  let source_contexts:Vec<&serde_json::Value>=if meta["kind"]=="product-source-bundle" {meta["contexts"].as_array().ok_or("PRODUCT_CONTEXTS_METADATA")?.iter().map(|c|&c["metadata"]).collect()}else{vec![&meta]};
  for context in source_contexts { if context["kind"]=="raster-source-context" {
   let values=context["upstreamValues"].as_array().ok_or("PRODUCT_RASTER_SETTINGS_REQUIRED")?;
   for id in 1..=7 {
    let record=(0..param_count).find(|&i|u32_at(&wire,256+i*40)==id).ok_or("PRODUCT_UPSTREAM_FIELDS")?;
    let at=256+record*40;let value=f64::from_le_bytes(wire[at+24..at+32].try_into().unwrap());
    if u32_at(&wire,at+4)!=0||Some(if id==2&&value>=0.&&value<5.&&value.fract()==0.{[360.,520.,720.,960.,1280.][value as usize]}else{value})!=values[(id-1)as usize].as_f64(){return Err("PRODUCT_UPSTREAM_SOURCE_MISMATCH".into())}
   }
  }
  }
  let snapshot_hash=hash(&[b"arch-product-source-v1\0",p.snapshot.bytes(),&p.metadata]);
  let request_hash=hash(&[b"arch-product-request-v1\0",&snapshot_hash,&wire]);
  let mut descriptor=[0;192];descriptor[..4].copy_from_slice(&0x44485250u32.to_le_bytes());descriptor[4..8].copy_from_slice(&1u32.to_le_bytes());
  descriptor[8..12].copy_from_slice(&192u32.to_le_bytes());
  descriptor[16..24].copy_from_slice(&wire[64..72]);descriptor[24..28].copy_from_slice(&source_generation.to_le_bytes());descriptor[28..32].copy_from_slice(&wire[12..16]);
  descriptor[32..64].copy_from_slice(&source_hash);descriptor[64..96].copy_from_slice(&snapshot_hash);descriptor[96..128].copy_from_slice(&request_hash);descriptor[128..160].copy_from_slice(&wire[128..160]);
  p.leases+=1;
  let id=s.next;s.next+=1;s.bytes+=192;s.product_requests.insert(id,Request{wire,source,descriptor});Ok(id)
 })();
 if result.is_err(){STATE.lock().unwrap().bytes-=n;}result
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_abi_version()->u32{1}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_request_create(source:u32,source_generation:u32,input:u32)->u32{
 start();match consume(input).and_then(|b|register(source,source_generation,b)){Ok(id)=>id,Err(e)=>{STATE.lock().unwrap().set_error(&e);0}}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_request_release(id:u32)->u32{
 let request=STATE.lock().unwrap().product_requests.remove(&id);if let Some(r)=request{drop(RequestGuard(r));1}else{0}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_request_head_ptr(id:u32)->*const u8{
 STATE.lock().unwrap().product_requests.get(&id).map_or(ptr::null(),|r|r.descriptor.as_ptr())
}
fn publish_source(snapshot:Snapshot,metadata:Vec<u8>,g:u32)->Result<u32,String>{
 check(g,250)?;metadata_valid(&metadata)?;let mut s=STATE.lock().unwrap();
 let n=snapshot.bytes().len()+metadata.len();
 if s.snapshots.len()>=8||s.next==u32::MAX||s.bytes+s.raster_reserved+n>ROOT_BYTE_CAP{return Err("PRODUCT_SOURCE_LEASE_LIMIT".into())}
 let id=s.next;s.next+=1;s.bytes+=n;s.snapshots.insert(id,Published{snapshot,metadata,leases:1,product:None,mesh:None});Ok(id)
}
extern "C" fn source_progress(data:*mut std::ffi::c_void,n:u32){super::job_progress(data,n.min(1000)/4)}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_prepare_svg(input:u32,request:u32,thickness:f64,long_edge:f64,tolerance:f64,g:u32)->u32{
 start();
 // Consume both valid inputs even for duplicate/missing handles.
 let source=consume(input).map(|v|{let c=super::raster_runtime::InputCharge(v.capacity());(v,c)});let wire=consume(request).map(|v|{let c=super::raster_runtime::InputCharge(v.capacity());(v,c)});
 let result:Result<u32,String>=(||{
  let (bytes,_charge)=source?;
  let (wire,wire_charge)=wire?;
  check(g,1)?;let _reserve=Reservation::new(128*MIB)?;
  let source=std::str::from_utf8(&bytes).map_err(|_|"SOURCE_UTF8_INVALID")?;
  let c=BuildControl{data:(&g as *const u32).cast_mut().cast(),cancelled:super::job_cancelled,progress:source_progress};
  let built=crate::vector::build_svg_controlled(source,thickness,if long_edge==0.{None}else{Some(long_edge)},tolerance,g,Some(&c))?;
  let metadata=serde_json::to_vec(&built.metadata()).map_err(|_|"PRODUCT_SOURCE_METADATA")?;
  drop(_reserve);let id=publish_source(built.snapshot,metadata,g)?;
  std::mem::forget(wire_charge);let reg=register(id,g,wire);super::arch_snapshot_release(id);reg
 })();
 match result{Ok(id)=>id,Err(e)=>failure(&e,g)}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_prepare_raster(accepted:u32,request:u32,thickness:f64,g:u32)->u32{
 start();let result:Result<u32,String>=(||{
  let wire=consume(request)?;let charge=super::raster_runtime::InputCharge(wire.capacity());check(g,1)?;
  let (snapshot,metadata)=super::raster_runtime::product_source(accepted,thickness,g)?;
  let id=publish_source(snapshot,metadata,g)?;std::mem::forget(charge);
  let reg=register(id,g,wire);super::arch_snapshot_release(id);reg
 })();match result{Ok(id)=>id,Err(e)=>failure(&e,g)}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_build(id:u32,g:u32)->u32{build(id,g,false)}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_datum_probe(id:u32,g:u32)->u32{build(id,g,true)}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_datum_probe_version()->u32{1}
fn build(id:u32,g:u32,probe:bool)->u32{
 start();
 let result:Result<u32,String>=(||{
  let request=STATE.lock().unwrap().product_requests.remove(&id).ok_or("PRODUCT_REQUEST_HANDLE")?;
  let request=RequestGuard(request);let r=&request.0;check(g,260)?;
  let reserve=Reservation::new(192*MIB)?;
  let (p,n,source_metadata)={
   let s=STATE.lock().unwrap();let src=s.snapshots.get(&r.source).ok_or("PRODUCT_SOURCE_HANDLE")?;
   if hash(&[b"arch-product-source-v1\0",src.snapshot.bytes(),&src.metadata])!=r.descriptor[64..96]{return Err("PRODUCT_SOURCE_INTEGRITY".into())}
   (src.snapshot.bytes().as_ptr(),src.snapshot.bytes().len(),src.metadata.clone())
  };
  let c=BuildControl{data:(&g as *const u32).cast_mut().cast(),cancelled:super::job_cancelled,progress:super::job_progress};
  let native=Native(unsafe{if probe{arch_product_native_probe(p,n as u32,r.wire.as_ptr(),r.wire.len()as u32,&c,g)}else{arch_product_native_build(p,n as u32,r.wire.as_ptr(),r.wire.len()as u32,&c,g)}});
  if native.0.is_null(){return Err("PRODUCT_NATIVE_ALLOCATION".into())}
  let error=unsafe{CStr::from_ptr(arch_product_native_error(native.0))}.to_string_lossy().into_owned();
  if !error.is_empty(){return Err(error)}check(g,960)?;
  let mut len=0;let mp=unsafe{arch_product_native_metadata(native.0,&mut len)};
  if len<656||len as usize>META_CAP||mp.is_null(){return Err("PRODUCT_METADATA_ABI".into())}
  let semantic=unsafe{std::slice::from_raw_parts(mp,len as usize)};
  if u32_at(semantic,156)!=if probe{1}else{0}{return Err("PRODUCT_DATUM_PROBE_VERSION".into())}
  let sv=u32_at(semantic,16);let mv=u32_at(semantic,20);
  let mut descriptor=r.descriptor;
  descriptor[160..192].copy_from_slice(&hash(&[b"arch-product-proposal-v1\0",&r.descriptor[..160],semantic]));
  let mut payload=Payload::new(semantic,&r.wire,&source_metadata,&descriptor)?;
  if probe||sv!=0||mv!=0 {
   drop(reserve);check(g,990)?;
   let mut s=STATE.lock().unwrap();
   if s.product_proposals.len()>=4||s.next==u32::MAX||s.bytes+s.raster_reserved+payload.owned_bytes()>ROOT_BYTE_CAP{return Err("PRODUCT_PROPOSAL_LIMIT".into())}
   let owner=s.snapshots.get_mut(&r.source).ok_or("PRODUCT_SOURCE_HANDLE")?;
   if owner.leases>=64{return Err("PRODUCT_SOURCE_READER_LIMIT".into())}owner.leases+=1;
   let id=s.next;s.next+=1;s.bytes+=payload.owned_bytes();s.product_proposals.insert(id,Proposal{payload,source:r.source,accepted:false});s.product_last=id;
   return Err(if probe{"PRODUCT_DATUM_PROBE"}else if mv==3||sv!=0&&has_table(semantic,13){ "PRODUCT_NEEDS_ACCEPTANCE" }else{"PRODUCT_BLOCKED"}.into())
  }
  let mut v:View=unsafe{std::mem::zeroed()};
  if unsafe{arch_product_native_mesh(native.0,&mut v)}!=1||v.abi_version!=1||v.vertex_count>2000000||v.triangle_count>2000000||v.part_count>2048{return Err("PRODUCT_MESH_ABI".into())}
  let snapshot=unsafe{Snapshot::new(g,crate::checked_slice(v.vertices,v.vertex_count as usize*3)?,crate::checked_slice(v.triangles,v.triangle_count as usize*3)?,crate::checked_slice(v.parts,v.part_count as usize)?,&[],&[],&[],&[])?};
  let metadata=serde_json::to_vec(&serde_json::json!({
   "kind":"product","productAbiVersion":1,"sourceAssemblyAbi":1,"sourceDatumExtension":1,"mechanicsAbi":2,"mechanicsSemantics":u32_at(semantic,148),
   "revision":u64::from_le_bytes(r.wire[64..72].try_into().unwrap()).to_string(),
   "sourceHash":hex(&r.descriptor[32..64]),"canonicalSourceHash":hex(&r.descriptor[64..96]),
   "requestHash":hex(&r.descriptor[96..128]),"headHash":hex(&r.descriptor[128..160]),
   "fitQualification":"unqualified","exportBlocked":u32_at(semantic,24)!=0,
   "semanticSchema":"APMS/1","semanticByteLength":len,"totalErrorBoundMm":null,
   "errorLedger":{"upstream":"retained-in-source-metadata","localSource":"typed-stage-records",
    "localMechanics":"typed-curve-records","generalCsg":"unverified","globalBound":"unknown","conditioning":"not-applied"}
  })).map_err(|_|"PRODUCT_METADATA_ENCODING")?;
  payload.guard=Some(unsafe{super::mesh_runtime::Guard::take(native.0)}?);
  drop(native);drop(reserve);check(g,999)?;
  let mut s=STATE.lock().unwrap();let bytes=snapshot.bytes().len()+metadata.len()+payload.owned_bytes();
  if s.snapshots.len()>=8||s.next==u32::MAX||s.bytes+s.raster_reserved+bytes>ROOT_BYTE_CAP{return Err("SNAPSHOT_LEASE_LIMIT".into())}
  let id=s.next;s.next+=1;s.bytes+=bytes;s.snapshots.insert(id,Published{snapshot,metadata,leases:1,product:Some(payload),mesh:None});finish();Ok(id)
 })();
 match result{Ok(id)=>id,Err(e)=>failure(&e,g)}
}
fn has_table(b:&[u8],tag:u32)->bool{
 (0..u32_at(b,12)as usize).any(|i|u32_at(b,256+i*16)==tag&&u32_at(b,264+i*16)>0)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_last_proposal()->u32{STATE.lock().unwrap().product_last}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_buffer_ptr(id:u32,kind:u32)->*const u8{
 let s=STATE.lock().unwrap();let p=s.snapshots.get(&id).and_then(|p|p.product.as_ref()).or_else(||s.product_proposals.get(&id).map(|p|&p.payload));
 p.and_then(|p|kind.checked_sub(1).and_then(|k|p.buffers.get(k as usize))).map_or(ptr::null(),Block::ptr)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_buffer_len(id:u32,kind:u32)->u32{
 let s=STATE.lock().unwrap();let p=s.snapshots.get(&id).and_then(|p|p.product.as_ref()).or_else(||s.product_proposals.get(&id).map(|p|&p.payload));
 p.and_then(|p|kind.checked_sub(1).and_then(|k|p.buffers.get(k as usize))).map_or(0,|b|b.length as u32)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_proposal_release(id:u32)->u32{
 let p=STATE.lock().unwrap().product_proposals.remove(&id);
 if let Some(p)=p{let mut s=STATE.lock().unwrap();s.bytes-=p.payload.owned_bytes();if s.product_last==id{s.product_last=0}drop(s);super::arch_snapshot_release(p.source);1}else{0}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_product_confirm(id:u32,input:u32,accepted:u32,g:u32)->u32{
 let result:Result<u32,String>=(||{
  let bytes=consume(input)?;let _charge=super::raster_runtime::InputCharge(bytes.capacity());check(g,1)?;
  if accepted!=1||bytes.len()!=232{return Err("PRODUCT_CONFIRMATION_REQUIRED".into())}
  let mut s=STATE.lock().unwrap();let p=s.product_proposals.get(&id).ok_or("PRODUCT_PROPOSAL_HANDLE")?;
  if p.accepted{return Err("PRODUCT_PROPOSAL_ALREADY_ACCEPTED".into())}
  let sem=p.payload.buffers[0].bytes();
  if !(u32_at(sem,156)==1&&u32_at(sem,16)==0&&has_table(sem,11))&&!has_table(sem,6)&&!has_table(sem,13){return Err("PRODUCT_PROPOSAL_NOT_APPLICABLE".into())}
  if u32_at(sem,156)==1&&u32_at(sem,16)!=0{return Err("PRODUCT_DATUM_PROBE_BLOCKED".into())}
  let desc=p.payload.buffers[3].bytes();
  if bytes[..192]!=*desc||bytes[192..224]!=desc[128..160]||bytes[224..232]!=desc[16..24]{return Err("PRODUCT_CONFIRMATION_HEAD_MISMATCH".into())}
  if s.outputs.len()>=2||s.next==u32::MAX||s.bytes+s.raster_reserved+192>ROOT_BYTE_CAP{return Err("OUTPUT_RESOURCE_LIMIT".into())}
  let receipt=desc.to_vec();check(g,999)?;s.product_proposals.get_mut(&id).unwrap().accepted=true;
  let out=s.next;s.next+=1;s.bytes+=receipt.len();s.outputs.insert(out,receipt);finish();Ok(out)
 })();match result{Ok(id)=>id,Err(e)=>failure(&e,g)}
}

#[unsafe(no_mangle)] pub extern "C" fn arch_product_prepare_contexts(contexts:u32,request:u32,g:u32)->u32{
 start();
 let sources=consume(contexts).map(|v|{let c=super::raster_runtime::InputCharge(v.capacity());(v,c)});
 let wire=consume(request).map(|v|{let c=super::raster_runtime::InputCharge(v.capacity());(v,c)});
 let result:Result<u32,String>=(||{
  let (sources,_source_charge)=sources?;let (wire,wire_charge)=wire?;check(g,1)?;
  let reserve=Reservation::new(64*MIB)?;
  let (snapshot,metadata)=bundle::combine(&sources,g)?;drop(reserve);
  let id=publish_source(snapshot,metadata,g)?;std::mem::forget(wire_charge);
  let reg=register(id,g,wire);super::arch_snapshot_release(id);reg
 })();match result{Ok(id)=>id,Err(e)=>failure(&e,g)}
}

