//! AFCP/1 + AFCC/1. Serial root runtime, no second allocator or mutable mesh input.
use super::{wire::{self,Result,View,Config,Group},encode::{self,FloatConditioningOptions,FloatConditioningProposal},check,failure,consume,Pin,Reservation,STATE,CONTROL,Ordering,ROOT_BYTE_CAP,OUTPUTS,Output,job_cancelled,job_progress};
use std::{collections::BTreeMap,sync::{LazyLock,Mutex},ffi::{c_char,CStr},ptr};
use serde_json::json;

struct SnapshotHold(u32);
impl Drop for SnapshotHold {fn drop(&mut self){super::super::arch_snapshot_release(self.0);}}
struct NativeMetadata {warnings:u32,transform:[f64;12],bounds:[f64;6],volume_sum:f64,union_volume:f64,tolerance:f64,group:Group,members:Vec<u32>}
impl NativeMetadata {
 fn capture(v:&View)->Result<Self>{
  if v.ng!=1||v.nm>4096{return Err("FLOAT_CONDITIONING_GROUP".into())}
  Ok(Self{warnings:v.warnings,transform:v.transform,bounds:v.bounds,volume_sum:v.volume_sum,union_volume:v.union_volume,tolerance:v.library_tolerance,group:unsafe{wire::borrow(v.groups,1)}?[0],members:unsafe{wire::borrow(v.members,v.nm as usize)}?.to_vec()})
 }
 fn view(&self,p:&FloatConditioningProposal)->View{View{version:1,size:size_of::<View>()as u32,format:1,warnings:self.warnings,nv:(p.original_vertices().len()/3)as u32,nt:(p.original_triangles().len()/3)as u32,ng:1,nm:self.members.len()as u32,transform:self.transform,bounds:self.bounds,volume_sum:self.volume_sum,union_volume:self.union_volume,library_tolerance:self.tolerance,vertices:p.original_vertices().as_ptr(),triangles:p.original_triangles().as_ptr(),groups:&self.group,members:self.members.as_ptr(),..View::default()}}
}
struct Prepared {source:SnapshotHold,source_hash:String,options_hash:String,config:Config,native:NativeMetadata,proposal:FloatConditioningProposal,metadata:Vec<u8>,charge:usize}
static PREPARED:LazyLock<Mutex<BTreeMap<u32,Prepared>>>=LazyLock::new(||Mutex::new(BTreeMap::new()));
fn u64at(b:&[u8],i:usize)->u64{u64::from_le_bytes(b[i..i+8].try_into().unwrap())}
fn parse_prepare(b:&[u8])->Result<(Config,FloatConditioningOptions)>{
 if b.len()<64||wire::u32at(b,0)!=0x50434641||wire::u32at(b,4)!=1||wire::u32at(b,8)!=64{return Err("FLOAT_PREPARE_WIRE_VERSION".into())}
 if b.len()!=wire::u32at(b,12)as usize||64usize.checked_add(wire::u32at(b,16)as usize)!=Some(b.len())||b[20..32].iter().chain(&b[48..64]).any(|&x|x!=0){return Err("FLOAT_PREPARE_WIRE_LENGTH_FLAGS".into())}
 let config=wire::parse(&b[64..])?;let options=FloatConditioningOptions{version:1,maximum_displacement_mm:wire::f64at(b,32),work_limit:u64at(b,40)};
 if !options.maximum_displacement_mm.is_finite()||options.maximum_displacement_mm<=0.||options.maximum_displacement_mm>0.004||options.maximum_displacement_mm>config.options.error||options.work_limit==0||options.work_limit>1_000_000_000{return Err("FLOAT_CONDITIONING_OPTIONS".into())}
 if config.options.format!=1||config.options.inspection!=0||config.verdict!=1{return Err("FLOAT_CONDITIONING_SOURCE_QUALIFICATION".into())}Ok((config,options))
}
fn prepare(snapshot:u32,b:&[u8],generation:u32)->Result<Prepared>{
 check(generation,0)?;wire::layout()?;let(config,options)=parse_prepare(b)?;
 if PREPARED.lock().unwrap().len()>=2{return Err("FLOAT_PROPOSAL_RESOURCE_LIMIT".into())}
 let pin=Pin::new(snapshot,config.revision)?;
 let budget=(config.options.working_bytes as usize).checked_add(pin.len).and_then(|n|n.checked_add((config.options.output_bytes as usize).checked_mul(3)?)).and_then(|n|n.checked_add(4*1024*1024)).ok_or("ROOT_MEMORY_LIMIT")?;
 let _reservation=Reservation::new(budget)?;
 let source_hash=encode::hash(pin.bytes());let options_hash=encode::hash(b);let scene=wire::Scene::decode(pin.bytes(),&config)?;
 let control=crate::BuildControl{data:(&generation as *const u32).cast_mut().cast(),cancelled:job_cancelled,progress:job_progress};let mut error=[0 as c_char;513];
 let raw=unsafe{wire::arch_final_scene_prepare(&scene.view(),config.mapping.as_ptr(),config.mapping.len()as u32,&config.options,&control,error.as_mut_ptr(),513)};
 if raw.is_null(){return Err(unsafe{CStr::from_ptr(error.as_ptr())}.to_string_lossy().into_owned())}
 let owner=wire::Native(raw);let mut view=View::default();if unsafe{wire::arch_final_scene_view(owner.0,&mut view)}!=1{return Err("FINAL_NATIVE_VIEW".into())}
 let native=NativeMetadata::capture(&view)?;
 let proposal=encode::prepare_float_conditioning(&config,&view,&source_hash,options,generation)?;
 let confirmation=json!({"version":"arch-final-float-confirmation/1","proposalHash":hex(&proposal.hash()),"sourceHash":source_hash,"sourceGeneration":config.generation,"sourceRevision":config.revision.to_string(),"optionsHash":options_hash});
 let metadata=serde_json::to_vec(&json!({"version":"arch-final-float-proposal/1","confirmation":confirmation,"conditioning":proposal.metadata(),"originalUnionVolumeMm3":native.union_volume,"originalBoundsMm":native.bounds,"originalTransform":native.transform,"materialMapping":config.mapping.iter().map(|m|json!({"part":m.part,"slot":m.slot,"rgba":m.rgba,"source":m.source,"materialSource":m.material_source})).collect::<Vec<_>>()})).map_err(|_|"FLOAT_METADATA_ENCODING")?;
 if metadata.len()>65536{return Err("FLOAT_METADATA_LIMIT".into())}
 let charge=(proposal.resident_bytes()as usize).checked_add(metadata.capacity()+native.members.capacity()*4+config.mapping.capacity()*size_of::<wire::Material>()+config.filename.capacity()+source_hash.capacity()+options_hash.capacity()+size_of::<Prepared>()).ok_or("ROOT_MEMORY_LIMIT")?;
 check(generation,995)?;
 // Transfer only this internal reader, never the caller's primary snapshot lease.
 let source=SnapshotHold(pin.id);std::mem::forget(pin);
 Ok(Prepared{source,source_hash,options_hash,config,native,proposal,metadata,charge})
}
fn hex(b:&[u8])->String{b.iter().map(|v|format!("{v:02x}")).collect()}
fn validate_confirmation(p:&Prepared,b:&[u8])->Result<[u8;32]>{
 if b.len()!=128||wire::u32at(b,0)!=0x43434641||wire::u32at(b,4)!=1||wire::u32at(b,8)!=128||wire::u32at(b,12)!=0||wire::u32at(b,20)!=0{return Err("FLOAT_CONFIRM_WIRE".into())}
 if wire::u32at(b,16)!=p.config.generation||u64at(b,24)!=p.config.revision{return Err("STALE_REVISION".into())}
 if hex(&b[32..64])!=p.source_hash||hex(&b[96..128])!=p.options_hash{return Err("FLOAT_CONDITIONING_STALE_CONTEXT".into())}
 let hash:[u8;32]=b[64..96].try_into().unwrap();if hash!=p.proposal.hash(){return Err("FLOAT_CONDITIONING_APPROVAL_HASH".into())}Ok(hash)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_float_version()->u32{1}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_float_prepare(snapshot:u32,input:u32,generation:u32)->u32{
 let bytes=match consume(input){Ok(i)=>i,Err(e)=>return failure(&e,generation)};STATE.lock().unwrap().set_error("");
 let prepared=match prepare(snapshot,&bytes.0,generation){Ok(p)=>p,Err(e)=>return failure(&e,generation)};drop(bytes);
 if let Err(e)=check(generation,999){return failure(&e,generation)}
 let mut proposals=PREPARED.lock().unwrap();let mut state=STATE.lock().unwrap();
 if proposals.len()>=2||state.next==u32::MAX||state.bytes.checked_add(state.raster_reserved).and_then(|n|n.checked_add(prepared.charge)).is_none_or(|n|n>ROOT_BYTE_CAP){state.set_error("FLOAT_PROPOSAL_RESOURCE_LIMIT");CONTROL[1].store(3,Ordering::Release);return 0}
 if CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{state.set_error("STALE_GENERATION");return 0}
 if CONTROL[3].load(Ordering::Acquire)==generation{state.set_error("CANCELLED");CONTROL[1].store(4,Ordering::Release);return 0}
 let id=state.next;state.next+=1;state.bytes+=prepared.charge;proposals.insert(id,prepared);CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);id
}
fn confirm(id:u32,b:&[u8],generation:u32)->Result<encode::Encoded>{
 check(generation,0)?;let mut proposals=PREPARED.lock().unwrap();let p=proposals.get_mut(&id).ok_or("FLOAT_PROPOSAL_HANDLE_INVALID")?;let accepted=validate_confirmation(p,b)?;
 // This invokes the same immutable Payload authority guard as legacy finalExport.
 let pin=Pin::new(p.source.0,p.config.revision)?;
 if wire::u32at(pin.bytes(),16)!=p.config.generation||encode::hash(pin.bytes())!=p.source_hash{return Err("FLOAT_CONDITIONING_STALE_CONTEXT".into())}
 let _reservation=Reservation::new((p.config.options.output_bytes as usize).checked_mul(3).and_then(|n|n.checked_add(4*1024*1024)).ok_or("ROOT_MEMORY_LIMIT")?)?;
 let view=p.native.view(&p.proposal);p.proposal.confirm(accepted,&p.config,&view,&p.source_hash,generation)?;
 p.proposal.encode_confirmed(&p.config,&view,&p.source_hash,generation)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_float_confirm(proposal:u32,input:u32,generation:u32)->u32{
 let bytes=match consume(input){Ok(i)=>i,Err(e)=>return failure(&e,generation)};STATE.lock().unwrap().set_error("");
 let encoded=match confirm(proposal,&bytes.0,generation){Ok(o)=>o,Err(e)=>return failure(&e,generation)};drop(bytes);
 if let Err(e)=check(generation,999){return failure(&e,generation)}
 let charge=encoded.bytes.capacity()+encoded.metadata.capacity();let mut state=STATE.lock().unwrap();let mut outputs=OUTPUTS.lock().unwrap();
 if outputs.len()>=4||state.next==u32::MAX||state.bytes.checked_add(state.raster_reserved).and_then(|n|n.checked_add(charge)).is_none_or(|n|n>ROOT_BYTE_CAP){state.set_error("FINAL_OUTPUT_RESOURCE_LIMIT");CONTROL[1].store(3,Ordering::Release);return 0}
 if CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{state.set_error("STALE_GENERATION");return 0}
 if CONTROL[3].load(Ordering::Acquire)==generation{state.set_error("CANCELLED");CONTROL[1].store(4,Ordering::Release);return 0}
 let id=state.next;state.next+=1;state.bytes+=charge;outputs.insert(id,Output{bytes:encoded.bytes,metadata:encoded.metadata,leases:1,charge});CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);id
}
fn buffer(p:&Prepared,kind:u32)->(*const u8,u32){fn b<T>(a:&[T])->(*const u8,u32){(a.as_ptr().cast(),std::mem::size_of_val(a)as u32)}match kind{1=>b(p.proposal.original_vertices()),2=>b(p.proposal.original_triangles()),3=>b(p.proposal.vertices()),4=>b(p.proposal.triangles()),5=>b(p.proposal.vertex_map()),6=>b(p.proposal.retained_face_ids()),7=>b(p.proposal.removed_face_ids()),8=>b(p.proposal.collapsed_edges()),9=>b(&p.metadata),_=>(ptr::null(),0)}}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_float_buffer_ptr(id:u32,kind:u32)->*const u8{PREPARED.lock().unwrap().get(&id).map_or(ptr::null(),|p|buffer(p,kind).0)}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_float_buffer_len(id:u32,kind:u32)->u32{PREPARED.lock().unwrap().get(&id).map_or(0,|p|buffer(p,kind).1)}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_float_release(id:u32)->u32{
 let removed=PREPARED.lock().unwrap().remove(&id);if let Some(p)=removed{STATE.lock().unwrap().bytes-=p.charge;drop(p);1}else{0}
}
