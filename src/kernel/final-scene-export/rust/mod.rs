//! Additive root ABI-2 child. No root snapshot/output semantics are changed.
use super::{STATE,CONTROL,ROOT_BYTE_CAP,Ordering,job_cancelled,job_progress};
use std::{collections::BTreeMap,sync::{LazyLock,Mutex},ffi::{c_char,CStr},ptr};
mod wire;
mod encode;
#[cfg(feature="test-fixtures")]
mod test_fixture;
#[cfg(feature="test-fixtures")]
pub use test_fixture::*;
use wire::Result;
struct Output {bytes:Vec<u8>,metadata:Vec<u8>,leases:u32,charge:usize}
static OUTPUTS:LazyLock<Mutex<BTreeMap<u32,Output>>>=LazyLock::new(||Mutex::new(BTreeMap::new()));
fn check(generation:u32,progress:u32)->Result<()> {
    if generation==0||CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{return Err("STALE_GENERATION".into())}
    if CONTROL[3].load(Ordering::Acquire)==generation{return Err("CANCELLED".into())}
    CONTROL[2].fetch_max(progress.min(999),Ordering::AcqRel);Ok(())
}
fn failure(error:&str,generation:u32)->u32 {
    STATE.lock().unwrap().set_error(error);
    if CONTROL[0].load(Ordering::Acquire)==generation&&CONTROL[1].load(Ordering::Acquire)==1{CONTROL[1].store(if error=="CANCELLED"{4}else{3},Ordering::Release)}0
}
struct Input(Vec<u8>);
impl Drop for Input {fn drop(&mut self){STATE.lock().unwrap().bytes-=self.0.capacity()}}
fn consume(id:u32)->Result<Input>{STATE.lock().unwrap().inputs.remove(&id).map(Input).ok_or_else(||"INPUT_HANDLE_INVALID".into())}
struct Pin {id:u32,pointer:*const u8,len:usize}
impl Pin {
    fn new(id:u32,revision:u64)->Result<Self>{
        let mut state=STATE.lock().unwrap();let Some(p)=state.snapshots.get_mut(&id)else{return Err("NO_SNAPSHOT".into())};
        p.validate_export(Some(revision))?;
        if p.leases==u32::MAX{return Err("SNAPSHOT_LEASE_LIMIT".into())}p.leases+=1;
        Ok(Self{id,pointer:p.snapshot.bytes().as_ptr(),len:p.snapshot.bytes().len()})
    }
    fn bytes(&self)->&[u8]{unsafe{std::slice::from_raw_parts(self.pointer,self.len)}}
}
impl Drop for Pin {fn drop(&mut self){super::arch_snapshot_release(self.id);}}
struct Reservation(usize);
impl Reservation {
    fn new(bytes:usize)->Result<Self>{
        let mut s=STATE.lock().unwrap();
        if bytes>ROOT_BYTE_CAP||s.bytes.checked_add(s.raster_reserved).and_then(|n|n.checked_add(bytes)).is_none_or(|n|n>ROOT_BYTE_CAP){return Err("ROOT_MEMORY_LIMIT".into())}
        // Shared root admission charge, not interception of native allocations.
        s.bytes+=bytes;Ok(Self(bytes))
    }
}
impl Drop for Reservation {fn drop(&mut self){STATE.lock().unwrap().bytes-=self.0;}}
fn execute(snapshot:u32,input:&[u8],generation:u32)->Result<encode::Encoded>{
    check(generation,0)?;wire::layout()?;let config=wire::parse(input)?;
    let reservation=(config.options.output_bytes as usize).checked_mul(3)
        .and_then(|n|n.checked_add(config.options.working_bytes as usize))
        .and_then(|n|n.checked_add(4*1024*1024)).ok_or("ROOT_MEMORY_LIMIT")?;
    let _reservation=Reservation::new(reservation)?;
    let pin=Pin::new(snapshot,config.revision)?;let snapshot_hash=encode::hash(pin.bytes());check(generation,5)?;
    let scene=wire::Scene::decode(pin.bytes(),&config)?;
    let c=crate::BuildControl{data:(&generation as *const u32).cast_mut().cast(),cancelled:job_cancelled,progress:job_progress};
    let mut error=[0 as c_char;513];
    let raw=unsafe{wire::arch_final_scene_prepare(&scene.view(),config.mapping.as_ptr(),config.mapping.len()as u32,&config.options,&c,error.as_mut_ptr(),error.len()as u32)};
    if raw.is_null(){return Err(unsafe{CStr::from_ptr(error.as_ptr())}.to_string_lossy().into_owned())}
    let native=wire::Native(raw);let mut view=wire::View::default();
    if unsafe{wire::arch_final_scene_view(native.0,&mut view)}!=1{return Err("FINAL_NATIVE_VIEW".into())}
    check(generation,800)?;encode::encode(&config,&view,&snapshot_hash,generation)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_export_version()->u32{1}
#[unsafe(no_mangle)] pub extern "C" fn arch_export_final(snapshot:u32,options:u32,generation:u32)->u32{
    // Input ownership is consumed even for stale jobs or invalid configuration.
    let input=match consume(options){Ok(i)=>i,Err(e)=>return failure(&e,generation)};
    STATE.lock().unwrap().set_error("");
    let encoded=match execute(snapshot,&input.0,generation){Ok(v)=>v,Err(e)=>return failure(&e,generation)};
    drop(input);
    if let Err(e)=check(generation,999){return failure(&e,generation)}
    let charge=encoded.bytes.capacity()+encoded.metadata.capacity();
    let mut s=STATE.lock().unwrap();let mut outputs=OUTPUTS.lock().unwrap();
    if outputs.len()>=4||s.next==u32::MAX||s.bytes+s.raster_reserved+charge>ROOT_BYTE_CAP{s.set_error("FINAL_OUTPUT_RESOURCE_LIMIT");CONTROL[1].store(3,Ordering::Release);return 0}
    // Recheck immediately before publication. The serial Worker owns mutation;
    // other threads may only update generation-tagged cancellation atomically.
    if CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{s.set_error("STALE_GENERATION");return 0}
    if CONTROL[3].load(Ordering::Acquire)==generation{s.set_error("CANCELLED");CONTROL[1].store(4,Ordering::Release);return 0}
    let id=s.next;s.next+=1;s.bytes+=charge;outputs.insert(id,Output{bytes:encoded.bytes,metadata:encoded.metadata,leases:1,charge});
    CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);id
}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_output_ptr(id:u32)->*const u8{OUTPUTS.lock().unwrap().get(&id).map_or(ptr::null(),|o|o.bytes.as_ptr())}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_output_len(id:u32)->u32{OUTPUTS.lock().unwrap().get(&id).map_or(0,|o|o.bytes.len()as u32)}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_output_metadata_ptr(id:u32)->*const u8{OUTPUTS.lock().unwrap().get(&id).map_or(ptr::null(),|o|o.metadata.as_ptr())}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_output_metadata_len(id:u32)->u32{OUTPUTS.lock().unwrap().get(&id).map_or(0,|o|o.metadata.len()as u32)}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_output_acquire(id:u32)->*const u8{
    let mut outputs=OUTPUTS.lock().unwrap();let Some(o)=outputs.get_mut(&id)else{return ptr::null()};if o.leases==u32::MAX{return ptr::null()}o.leases+=1;o.bytes.as_ptr()
}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_output_release(id:u32)->u32{
    let removed={let mut outputs=OUTPUTS.lock().unwrap();let Some(o)=outputs.get_mut(&id)else{return 0};o.leases-=1;if o.leases==0{outputs.remove(&id)}else{None}};
    if let Some(o)=removed{STATE.lock().unwrap().bytes-=o.charge;}1
}

mod float_runtime;
pub use float_runtime::*;

mod geometry_runtime;
pub use geometry_runtime::*;
