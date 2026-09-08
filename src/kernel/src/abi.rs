//! Handle-based publication: buffers never move while a lease is held. The
//! Worker invokes APIs serially; the main thread reads leased snapshots and
//! atomic control only. Error/input pointers are Worker-local synchronous I/O.
use std::{collections::BTreeMap, sync::{LazyLock,Mutex,atomic::{AtomicU32,Ordering}}};
use crate::Snapshot;
pub(crate) mod raster_runtime;
#[path="../final-scene-export/rust/mod.rs"]
pub(crate) mod final_scene_export;
pub(crate) mod product_runtime;
pub(crate) mod source_frame;
#[path="../../mesh-import/rust/root_runtime.rs"]
pub(crate) mod mesh_runtime;
const ROOT_BYTE_CAP:usize=384*1024*1024;
struct Published { snapshot:Snapshot, metadata:Vec<u8>, leases:u32, product:Option<product_runtime::Payload>, mesh:Option<mesh_runtime::Payload> }
impl Published {
 fn validate_export(&self,revision:Option<u64>)->Result<(),String>{
  if let Some(p)=&self.product{p.validate_manufacturing_export(revision)?;}
  if let Some(p)=&self.mesh{p.validate_manufacturing_export(revision)?;}Ok(())
 }
}
struct State { next:u32, snapshots:BTreeMap<u32,Published>, inputs:BTreeMap<u32,Vec<u8>>, outputs:BTreeMap<u32,Vec<u8>>, error:[u8;513], error_len:usize, bytes:usize, raster:BTreeMap<u32,raster_runtime::Prepared>, raster_reserved:usize, raster_error:u32, product_requests:BTreeMap<u32,product_runtime::Request>, product_proposals:BTreeMap<u32,product_runtime::Proposal>, product_last:u32 }
impl State {
    fn set_error(&mut self,message:&str){
        self.error.fill(0);self.error_len=0;
        for ch in message.chars().filter(|ch|*ch!='\0'){
            let mut encoded=[0;4];let text=ch.encode_utf8(&mut encoded);
            if self.error_len+text.len()>512{break;}
            self.error[self.error_len..self.error_len+text.len()].copy_from_slice(text.as_bytes());self.error_len+=text.len();
        }
    }
}
static STATE:LazyLock<Mutex<State>>=LazyLock::new(||Mutex::new(State{next:1,snapshots:BTreeMap::new(),inputs:BTreeMap::new(),outputs:BTreeMap::new(),error:[0;513],error_len:0,bytes:0,raster:BTreeMap::new(),raster_reserved:0,raster_error:0,product_requests:BTreeMap::new(),product_proposals:BTreeMap::new(),product_last:0}));
// version 1: generation, phase(0 idle/1 running/2 complete/3 failed/4 cancelled),
// progress 0..1000, cancelled generation (0 means none). Four aligned atomics.
static CONTROL:[AtomicU32;4]=[AtomicU32::new(0),AtomicU32::new(0),AtomicU32::new(0),AtomicU32::new(0)];
extern "C" fn job_cancelled(data:*mut std::ffi::c_void)->u32{
    // The synchronous build borrows the generation value from its caller.
    let generation=unsafe{*(data as *const u32)};
    u32::from(CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[3].load(Ordering::Acquire)==generation)
}
extern "C" fn job_progress(data:*mut std::ffi::c_void,units:u32){
    let generation=unsafe{*(data as *const u32)};
    if CONTROL[0].load(Ordering::Acquire)==generation{CONTROL[2].fetch_max(units.min(999),Ordering::AcqRel);}
}

fn publish(result:Result<Snapshot,String>,generation:u32)->u32 {
    publish_metadata(result,Vec::new(),generation)
}
fn publish_metadata(result:Result<Snapshot,String>,metadata:Vec<u8>,generation:u32)->u32 {
    let mut state=STATE.lock().unwrap();
    state.set_error("");
    if generation==0||CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{
        state.set_error("STALE_GENERATION");return 0;
    }
    if CONTROL[3].load(Ordering::Acquire)==generation {
        CONTROL[1].store(4,Ordering::Release);state.set_error("CANCELLED");return 0;
    }
    match result {
        Ok(snapshot)=>{
            let bytes=snapshot.bytes().len()+metadata.len();
            if state.snapshots.len()>=8||state.bytes+state.raster_reserved+bytes>ROOT_BYTE_CAP||state.next==u32::MAX{
                CONTROL[1].store(3,Ordering::Release);state.set_error("SNAPSHOT_LEASE_LIMIT");return 0;
            }
            let id=state.next;state.next+=1;state.bytes+=bytes;
            state.snapshots.insert(id,Published{snapshot,metadata,leases:1,product:None,mesh:None});
            CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);id
        },
        Err(error)=>{state.set_error(&error);CONTROL[1].store(3,Ordering::Release);0}
    }
}

#[unsafe(no_mangle)] pub extern "C" fn arch_abi_version()->u32{2}
#[unsafe(no_mangle)] pub extern "C" fn arch_control_ptr()->*const AtomicU32{CONTROL.as_ptr()}
#[unsafe(no_mangle)] pub extern "C" fn arch_control_reset(generation:u32)->u32{
    if generation==0||generation==u32::MAX||generation<=CONTROL[0].load(Ordering::Acquire){
        STATE.lock().unwrap().set_error("GENERATION_RANGE");return 0;
    }
    CONTROL[0].store(generation,Ordering::Release);CONTROL[2].store(0,Ordering::Release);
    CONTROL[3].store(0,Ordering::Release);CONTROL[1].store(1,Ordering::Release);1
}
#[unsafe(no_mangle)] pub extern "C" fn arch_snapshot_acquire(id:u32)->*const u8{
    let mut state=STATE.lock().unwrap();
    let Some(p)=state.snapshots.get_mut(&id) else{return std::ptr::null();};
    if p.leases>=64{return std::ptr::null();}p.leases+=1;p.snapshot.bytes().as_ptr()
}
#[unsafe(no_mangle)] pub extern "C" fn arch_snapshot_ptr(id:u32)->*const u8{
    STATE.lock().unwrap().snapshots.get(&id).map_or(std::ptr::null(),|p|p.snapshot.bytes().as_ptr())
}
#[unsafe(no_mangle)] pub extern "C" fn arch_snapshot_len(id:u32)->u32{
    STATE.lock().unwrap().snapshots.get(&id).map_or(0,|p|p.snapshot.bytes().len() as u32)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_metadata_ptr(id:u32)->*const u8{
    STATE.lock().unwrap().snapshots.get(&id).map_or(std::ptr::null(),|p|p.metadata.as_ptr())
}
#[unsafe(no_mangle)] pub extern "C" fn arch_metadata_len(id:u32)->u32{
    STATE.lock().unwrap().snapshots.get(&id).map_or(0,|p|p.metadata.len() as u32)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_snapshot_release(id:u32)->u32{
    let mut state=STATE.lock().unwrap();let Some(p)=state.snapshots.get_mut(&id) else{return 0;};
    p.leases-=1;
    let removed=if p.leases==0{state.snapshots.remove(&id)}else{None};
    let parent=removed.as_ref().and_then(|p|p.mesh.as_ref().map(|m|m.parent));
    if let Some(p)=&removed{state.bytes-=p.snapshot.bytes().len()+p.metadata.len()+p.product.as_ref().map_or(0,|v|v.owned_bytes())+p.mesh.as_ref().map_or(0,|v|v.owned_bytes());}
    drop(state);drop(removed);
    if let Some(parent)=parent{arch_snapshot_release(parent);}1
}
#[unsafe(no_mangle)] pub extern "C" fn arch_error_ptr()->*const u8{STATE.lock().unwrap().error.as_ptr()}
#[unsafe(no_mangle)] pub extern "C" fn arch_error_len()->u32{STATE.lock().unwrap().error_len as u32}

#[unsafe(no_mangle)] pub extern "C" fn arch_input_create(length:u32)->u32{
    let mut state=STATE.lock().unwrap();
    if length==0||length>16*1024*1024||state.inputs.len()>=4||state.next==u32::MAX||state.bytes+state.raster_reserved+length as usize>ROOT_BYTE_CAP{return 0;}
    let mut buffer=Vec::new();if buffer.try_reserve_exact(length as usize).is_err(){return 0;}
    buffer.resize(length as usize,0);let id=state.next;state.next+=1;state.bytes+=buffer.capacity();state.inputs.insert(id,buffer);id
}
#[unsafe(no_mangle)] pub extern "C" fn arch_input_ptr(id:u32)->*mut u8{
    STATE.lock().unwrap().inputs.get_mut(&id).map_or(std::ptr::null_mut(),|p|p.as_mut_ptr())
}
#[unsafe(no_mangle)] pub extern "C" fn arch_input_release(id:u32)->u32{
    let mut s=STATE.lock().unwrap();if let Some(b)=s.inputs.remove(&id){s.bytes-=b.capacity();1}else{0}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_export_stl(snapshot:u32,part:u32,generation:u32)->u32{
    let control=crate::BuildControl{data:(&generation as *const u32).cast_mut().cast(),cancelled:job_cancelled,progress:job_progress};
    let mut state=STATE.lock().unwrap();state.set_error("");
    if generation==0||CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{state.set_error("STALE_GENERATION");return 0;}
    if state.outputs.len()>=2||state.next==u32::MAX{state.set_error("OUTPUT_RESOURCE_LIMIT");CONTROL[1].store(3,Ordering::Release);return 0;}
    let result=match state.snapshots.get(&snapshot){
        Some(p)=>p.validate_export(None)
            .and_then(|()|crate::snapshot::write_stl_controlled(&p.snapshot,part,Some(&control))),
        None=>Err("SNAPSHOT_HANDLE_INVALID".into())
    };
    match result{
        Ok(bytes)=>{
            if bytes.len()>256*1024*1024||state.bytes+state.raster_reserved+bytes.len()>ROOT_BYTE_CAP{state.set_error("OUTPUT_RESOURCE_LIMIT");CONTROL[1].store(3,Ordering::Release);return 0;}
            let id=state.next;state.next+=1;state.bytes+=bytes.len();state.outputs.insert(id,bytes);
            CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);id
        },Err(error)=>{CONTROL[1].store(if error=="CANCELLED"{4}else{3},Ordering::Release);state.set_error(&error);0}
    }
}
#[unsafe(no_mangle)] pub extern "C" fn arch_output_ptr(id:u32)->*const u8{STATE.lock().unwrap().outputs.get(&id).map_or(std::ptr::null(),|b|b.as_ptr())}
#[unsafe(no_mangle)] pub extern "C" fn arch_output_len(id:u32)->u32{STATE.lock().unwrap().outputs.get(&id).map_or(0,|b|b.len() as u32)}
#[unsafe(no_mangle)] pub extern "C" fn arch_output_release(id:u32)->u32{let mut s=STATE.lock().unwrap();if let Some(b)=s.outputs.remove(&id){s.bytes-=b.len();1}else{0}}
#[unsafe(no_mangle)] pub extern "C" fn arch_build_svg(input:u32,thickness:f64,long_edge:f64,tolerance:f64,generation:u32)->u32{
    // Consume the input handle before work, releasing the registry lock. No
    // pointer supplied by the host is dereferenced without a registered owner.
    let Some(bytes)=STATE.lock().unwrap().inputs.remove(&input) else{return publish(Err("INPUT_HANDLE_INVALID".into()),generation);};
    let _input_charge=raster_runtime::InputCharge(bytes.capacity());
    if generation==0||CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{return publish(Err("STALE_GENERATION".into()),generation);}
    if CONTROL[3].load(Ordering::Acquire)==generation{return publish(Err("CANCELLED".into()),generation);}
    let source=match std::str::from_utf8(&bytes){Ok(s)=>s,Err(_)=>return publish(Err("SOURCE_UTF8_INVALID".into()),generation)};
    let control=crate::BuildControl{data:(&generation as *const u32).cast_mut().cast(),cancelled:job_cancelled,progress:job_progress};
    match crate::vector::build_svg_controlled(source,thickness,if long_edge==0.{None}else{Some(long_edge)},tolerance,generation,Some(&control)){
        Ok(result)=>{
            let metadata=match serde_json::to_vec(&result.metadata()){Ok(m)=>m,Err(_)=>return publish(Err("METADATA_ENCODING".into()),generation)};
            publish_metadata(Ok(result.snapshot),metadata,generation)
        },Err(e)=>publish(Err(e),generation)
    }
}

#[cfg(feature="test-fixtures")]
#[unsafe(no_mangle)] pub extern "C" fn arch_test_fixture(index:u32,generation:u32)->u32{
    let Some(name)=["hole","seam","t-junction","overlap"].get(index as usize) else{return publish(Err("UNKNOWN_FIXTURE".into()),generation);};
    if generation==0||CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1{return publish(Err("STALE_GENERATION".into()),generation);}
    if CONTROL[3].load(Ordering::Acquire)==generation{return publish(Err("CANCELLED".into()),generation);}
    publish(crate::analytic_fixture(name).and_then(|shapes|crate::build(&shapes,generation)),generation)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn publication_generation_error_lifetime_and_leases(){
        let error_ptr=arch_error_ptr();
        assert_eq!(arch_control_reset(0),0);assert_eq!(arch_control_reset(1),1);
        let old=publish(crate::build(&crate::analytic_fixture("hole").unwrap(),1),1);
        assert!(old>0);let pointer=arch_snapshot_ptr(old);
        assert_eq!(arch_snapshot_acquire(old),pointer);
        assert_eq!(arch_control_reset(2),1);
        let stale=publish(crate::build(&crate::analytic_fixture("seam").unwrap(),1),1);
        assert_eq!(stale,0);assert_eq!(CONTROL[1].load(Ordering::Acquire),1);
        CONTROL[3].store(1,Ordering::Release);
        let current=publish(crate::build(&crate::analytic_fixture("seam").unwrap(),2),2);
        assert!(current>0,"old cancellation must not cancel a new generation");
        assert_eq!(arch_control_reset(3),1);CONTROL[3].store(3,Ordering::Release);
        assert_eq!(publish(crate::build(&crate::analytic_fixture("hole").unwrap(),3),3),0);
        assert_eq!(CONTROL[1].load(Ordering::Acquire),4);
        assert_eq!(arch_error_ptr(),error_ptr,"fixed buffer address never freed by publication");
        {let mut state=STATE.lock().unwrap();state.set_error(&"ế".repeat(300));
         assert_eq!(state.error_len,510);assert!(std::str::from_utf8(&state.error[..state.error_len]).is_ok());}
        assert_eq!(arch_error_ptr(),error_ptr);assert_eq!(arch_snapshot_ptr(old),pointer);
        assert_eq!(arch_snapshot_release(old),1);assert_eq!(arch_snapshot_ptr(old),pointer);
        assert_eq!(arch_snapshot_release(old),1);assert!(arch_snapshot_ptr(old).is_null());
        assert_eq!(arch_snapshot_release(old),0);assert_eq!(arch_snapshot_release(current),1);
        assert_eq!(arch_control_reset(4),1);
        let source=publish(crate::build(&crate::analytic_fixture("hole").unwrap(),4),4);assert!(source>0);
        assert_eq!(arch_control_reset(5),1);let output=arch_export_stl(source,0,5);assert!(output>0);
        let output_ptr=arch_output_ptr(output);let output_len=arch_output_len(output);assert!(output_len>84&&!output_ptr.is_null());
        let copied=unsafe{std::slice::from_raw_parts(output_ptr,output_len as usize)}.to_vec();
        assert_eq!(arch_control_reset(6),1);CONTROL[3].store(6,Ordering::Release);
        assert_eq!(arch_export_stl(source,0,6),0);assert_eq!(CONTROL[1].load(Ordering::Acquire),4);
        assert_eq!(arch_output_ptr(output),output_ptr);assert_eq!(arch_output_len(output),output_len);
        assert_eq!(arch_snapshot_release(source),1);assert_eq!(unsafe{std::slice::from_raw_parts(output_ptr,output_len as usize)},copied);
        assert_eq!(arch_output_release(output),1);assert_eq!(arch_output_release(output),0);assert!(arch_output_ptr(output).is_null());
    }
}
