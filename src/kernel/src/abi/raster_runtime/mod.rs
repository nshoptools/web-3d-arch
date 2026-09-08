use arch_raster_source as raster;
use sha2::{Digest,Sha256};
use std::{sync::Arc,ptr};
use super::{STATE,CONTROL,Ordering,ROOT_BYTE_CAP};
mod wire;
mod pack;
mod quantize;
use wire::{Failure,Result,fail};

const MIB:usize=1024*1024;
const OUTPUT_CAP:usize=64*MIB;
const ENTRY_COST:usize=1024;
const MAX_RESULTS:usize=8;
pub(super) struct Prepared { payload:Arc<Payload>, summary:Block, leases:u32, accepted:bool }
struct Payload { buffers:Vec<Block>, base:[u8;256], hash:[u8;32], bytes:usize }
struct Block { data:Box<[u64]>, len:usize }
impl Block {
    fn new(bytes:&[u8])->Result<Self>{
        if bytes.len()>OUTPUT_CAP{return Err(fail(8,"RASTER_OUTPUT_LIMIT"))}
        let n=bytes.len().div_ceil(8);
        let mut data=Vec::new();
        data.try_reserve_exact(n).map_err(|_|fail(8,"RASTER_ALLOCATION"))?;
        data.resize(n,0u64);
        for (i,c) in bytes.chunks(8).enumerate(){
            let mut word=[0u8;8];word[..c.len()].copy_from_slice(c);
            data[i]=u64::from_ne_bytes(word);
        }
        Ok(Self{data:data.into_boxed_slice(),len:bytes.len()})
    }
    fn bytes(&self)->&[u8]{
        // Box<u64> owns at least len bytes, and remains immovable while leased.
        unsafe{std::slice::from_raw_parts(self.data.as_ptr().cast(),self.len)}
    }
    fn ptr(&self)->*const u8{if self.len==0{ptr::null()}else{self.data.as_ptr().cast()}}
}
impl Payload {
    fn seal(&self)->[u8;32]{
        let mut h=Sha256::new();h.update(b"arch-root-raster-proposal-v1\0");
        let mut canonical=self.base;
        // Resource admission estimates depend on native usize width; they are
        // diagnostics, not derived source geometry or processing semantics.
        canonical[232..240].fill(0);
        h.update(canonical);
        for (kind,b) in self.buffers.iter().enumerate().skip(2) {
            h.update((kind as u32).to_le_bytes());h.update((b.len as u64).to_le_bytes());h.update(b.bytes());
        }
        h.finalize().into()
    }
    fn verify(&self)->Result<()>{
        if self.hash!=self.seal(){return Err(fail(104,"RASTER_PAYLOAD_INTEGRITY"))}Ok(())
    }
}
fn check(generation:u32,progress:u32)->Result<()>{
    if generation==0||CONTROL[0].load(Ordering::Acquire)!=generation||CONTROL[1].load(Ordering::Acquire)!=1 {
        return Err(fail(101,"STALE_GENERATION"));
    }
    if CONTROL[3].load(Ordering::Acquire)==generation{return Err(fail(102,"CANCELLED"))}
    CONTROL[2].fetch_max(progress.min(999),Ordering::AcqRel);Ok(())
}
fn failure(error:Failure,generation:u32)->u32{
    let mut s=STATE.lock().unwrap();s.raster_error=error.code;s.set_error(&error.message);
    if CONTROL[0].load(Ordering::Acquire)==generation && CONTROL[1].load(Ordering::Acquire)==1 {
        CONTROL[1].store(if error.code==102 {4}else{3},Ordering::Release);
    }0
}
fn start(){let mut s=STATE.lock().unwrap();s.raster_error=0;s.set_error("");}
fn finish(){CONTROL[2].store(1000,Ordering::Release);CONTROL[1].store(2,Ordering::Release);}
/// Removed inputs retain their byte charge until this guard is dropped.
pub(super) struct InputCharge(pub usize);
impl Drop for InputCharge {fn drop(&mut self){STATE.lock().unwrap().bytes-=self.0;}}
struct Inputs { values:Vec<Vec<u8>>, bytes:usize }
impl Drop for Inputs {fn drop(&mut self){STATE.lock().unwrap().bytes-=self.bytes;}}
fn consume(ids:&[u32],required:&[usize])->Result<Inputs>{
    let mut s=STATE.lock().unwrap();let mut valid=true;let mut seen=std::collections::BTreeSet::new();
    let mut values=Vec::with_capacity(ids.len());let mut bytes=0usize;
    for (i,&id) in ids.iter().enumerate(){
        if id==0 {if required.contains(&i){valid=false;} values.push(Vec::new());continue}
        if !seen.insert(id){valid=false;values.push(Vec::new());continue}
        match s.inputs.remove(&id) {
            Some(v)=>{bytes+=v.capacity();values.push(v);}
            None=>{valid=false;values.push(Vec::new());}
        }
    }
    drop(s);
    let out=Inputs{values,bytes};
    if !valid{return Err(fail(100,"INPUT_HANDLE_INVALID_OR_DUPLICATE"))}
    Ok(out)
}
struct Reservation(usize);
impl Reservation {
    fn new(bytes:usize)->Result<Self>{
        let mut s=STATE.lock().unwrap();
        if bytes>ROOT_BYTE_CAP||s.bytes+s.raster_reserved+bytes>ROOT_BYTE_CAP{return Err(fail(8,"ROOT_MEMORY_LIMIT"))}
        s.raster_reserved+=bytes;Ok(Self(bytes))
    }
}
impl Drop for Reservation {fn drop(&mut self){STATE.lock().unwrap().raster_reserved-=self.0;}}
fn summary(payload:&Payload,generation:u32,accepted:bool)->Result<Block>{
    let mut b=payload.base;
    b[16..20].copy_from_slice(&generation.to_le_bytes());
    b[128..160].copy_from_slice(&payload.hash);
    if accepted{
        let mut flags=u32::from_le_bytes(b[20..24].try_into().unwrap());flags=(flags&!8)|16;
        b[20..24].copy_from_slice(&flags.to_le_bytes());
        if u32::from_le_bytes(b[12..16].try_into().unwrap())==2 {b[12..16].copy_from_slice(&0u32.to_le_bytes());}
    }
    Block::new(&b)
}
fn publish(payload:Payload,generation:u32)->Result<u32>{
    check(generation,995)?;
    let header=summary(&payload,generation,false)?;
    let mut s=STATE.lock().unwrap();
    if s.raster.len()>=MAX_RESULTS||s.next==u32::MAX{return Err(fail(103,"RASTER_LEASE_LIMIT"))}
    if s.bytes+s.raster_reserved+payload.bytes+ENTRY_COST>ROOT_BYTE_CAP{return Err(fail(8,"ROOT_MEMORY_LIMIT"))}
    // One serialized Worker owns all calls. Cancellation's last load is the
    // publication linearization point; a later cancel concerns an already done job.
    check(generation,999)?;
    let id=s.next;s.next+=1;s.bytes+=payload.bytes+ENTRY_COST;
    s.raster.insert(id,Prepared{payload:Arc::new(payload),summary:header,leases:1,accepted:false});
    finish();Ok(id)
}
fn prepare(ids:&[u32],dimensions:Option<(u32,u32)>,generation:u32)->u32{
    start();
    let result=(||{
        let input=consume(ids,&[0,1])?;check(generation,1)?;
        let config=wire::parse(&input.values[1],&input.values[2],input.values.get(3).map_or(&[],|v|v.as_slice()),dimensions.is_some())?;
        // Account codec/source duplicates, the crate working budget, flat arrays,
        // aligned packing and metadata separately. This is a conservative admission
        // reservation, not an allocator interception or an OS-memory guarantee.
        let reserved=config.options.limits.max_working_bytes as usize
            +3*config.options.limits.max_decoded_bytes as usize+2*OUTPUT_CAP+32*MIB+2*MIB+2*input.values[0].len();
        let reservation=Reservation::new(reserved)?;
        let (document,source_meta)=if let Some((w,h))=dimensions {
            (raster::process_rgba(&input.values[0],w,h,config.options.clone()).map_err(wire::raster_error)?,None)
        }else{
            let image=raster::decode_image(&input.values[0],raster::DecodeOptions{limits:config.options.limits.clone()}).map_err(wire::raster_error)?;
            check(generation,100)?;
            let meta=(image.encoded_width,image.encoded_height,image.decoder.clone());
            (raster::process_image(&image,config.options.clone()).map_err(wire::raster_error)?,Some(meta))
        };
        check(generation,700)?;
        let payload=pack::pack(&document,&config,source_meta.as_ref(),generation)?;
        drop(document);drop(input);drop(reservation);
        publish(payload,generation)
    })();
    match result{Ok(id)=>id,Err(e)=>failure(e,generation)}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_abi_version()->u32{1}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_error_code()->u32{STATE.lock().unwrap().raster_error}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_owned_bytes()->u32{
    // Total root logical ownership and transient reservations, not process RSS.
    let s=STATE.lock().unwrap();(s.bytes+s.raster_reserved) as u32
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_prepare_encoded(input:u32,options:u32,limits:u32,generation:u32)->u32 {
    prepare(&[input,options,limits],None,generation)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_prepare_rgba(input:u32,width:u32,height:u32,options:u32,limits:u32,origin:u32,generation:u32)->u32{
    prepare(&[input,options,limits,origin],Some((width,height)),generation)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_confirm(proposal:u32,accepted_hash_input:u32,generation:u32)->u32{
    start();
    let result=(||{
        let inputs=consume(&[accepted_hash_input],&[0])?;check(generation,5)?;
        let payload={
            let s=STATE.lock().unwrap();
            s.raster.get(&proposal).map(|p|Arc::clone(&p.payload)).ok_or_else(||fail(105,"RASTER_HANDLE_INVALID"))?
        };
        if inputs.values[0].len()!=32{return Err(fail(23,"CONFIRMATION_HASH_SIZE"))}
        if inputs.values[0].as_slice()!=payload.hash{return Err(fail(21,"CONFIRMATION_MISMATCH"))}
        payload.verify()?;check(generation,900)?;
        let header=summary(&payload,generation,true)?;
        let mut s=STATE.lock().unwrap();
        let existing=s.raster.iter().find(|(_,p)|p.accepted&&Arc::ptr_eq(&p.payload,&payload)).map(|(&id,_)|id);
        if let Some(id)=existing {
            let p=s.raster.get_mut(&id).unwrap();
            if p.leases>=64{return Err(fail(103,"RASTER_READER_LIMIT"))}
            check(generation,999)?;p.leases+=1;finish();return Ok(id)
        }
        if s.raster.len()>=MAX_RESULTS||s.next==u32::MAX{return Err(fail(103,"RASTER_LEASE_LIMIT"))}
        if s.bytes+s.raster_reserved+ENTRY_COST>ROOT_BYTE_CAP{return Err(fail(8,"ROOT_MEMORY_LIMIT"))}
        check(generation,999)?;
        let id=s.next;s.next+=1;s.bytes+=ENTRY_COST;
        s.raster.insert(id,Prepared{payload,summary:header,leases:1,accepted:true});finish();Ok(id)
    })();
    match result{Ok(id)=>id,Err(e)=>failure(e,generation)}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_acquire(id:u32)->u32{
    let mut s=STATE.lock().unwrap();let Some(p)=s.raster.get_mut(&id)else{return 0};
    if p.leases>=64{return 0}p.leases+=1;id
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_release(id:u32)->u32{
    let mut s=STATE.lock().unwrap();let Some(p)=s.raster.get_mut(&id)else{return 0};
    p.leases-=1;
    if p.leases==0 {
        let p=s.raster.remove(&id).unwrap();s.bytes-=ENTRY_COST;
        // All ABI calls are serialized; no operation holds an unpublished Arc here.
        if Arc::strong_count(&p.payload)==1 {s.bytes-=p.payload.bytes;}
    }1
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_buffer_ptr(id:u32,kind:u32)->*const u8{
    let s=STATE.lock().unwrap();let Some(p)=s.raster.get(&id)else{return ptr::null()};
    if kind==1{return p.summary.ptr()}
    p.payload.buffers.get(kind as usize).map_or(ptr::null(),Block::ptr)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_raster_buffer_bytes(id:u32,kind:u32)->u32{
    let s=STATE.lock().unwrap();let Some(p)=s.raster.get(&id)else{return 0};
    if kind==1{return p.summary.len as u32}
    p.payload.buffers.get(kind as usize).map_or(0,|b|b.len as u32)
}
#[unsafe(no_mangle)] pub extern "C" fn arch_build_raster(id:u32,thickness:f64,generation:u32)->u32{
    start();
    let result=canonical_source(id,thickness,generation);
    match result {
        Ok((snapshot,metadata))=>{
            let id=super::publish_metadata(Ok(snapshot),metadata,generation);
            if id==0 {let mut s=STATE.lock().unwrap();s.raster_error=if CONTROL[0].load(Ordering::Acquire)!=generation{101}else if CONTROL[1].load(Ordering::Acquire)==4{102}else{8};}id
        },
        Err(e)=>failure(e,generation)
    }
}
#[cfg(feature="raster-runtime-tests")] pub mod test_suite;

// All canonical source contexts keep regions separate, even when colors match.
// Public accepted-token builds and product preparation share this exact path.
pub(super) fn product_source(id:u32,thickness:f64,generation:u32)->std::result::Result<(crate::Snapshot,Vec<u8>),String>{
 canonical_source(id,thickness,generation).map_err(|e|e.message)
}
fn canonical_source(id:u32,thickness:f64,generation:u32)->std::result::Result<(crate::Snapshot,Vec<u8>),wire::Failure>{
 (||{
  check(generation,1)?;
  if !thickness.is_finite()||thickness<=0.||thickness>10000.{return Err(fail(1,"THICKNESS_RANGE"))}
  let payload={let s=STATE.lock().unwrap();let p=s.raster.get(&id).ok_or_else(||fail(105,"RASTER_HANDLE_INVALID"))?;
   if !p.accepted{return Err(fail(22,"CONFIRMATION_REQUIRED"))}Arc::clone(&p.payload)};
  payload.verify()?;if payload.buffers[13].bytes().is_empty(){return Err(fail(108,"RASTER_EMPTY_CONTEXT"))}
  let _reserve=Reservation::new(128*MIB)?;
  let (shapes,source_regions)=pack::product_shapes(&payload,generation,thickness)?;
  extern "C" fn progress(data:*mut std::ffi::c_void,n:u32){super::job_progress(data,n.min(1000)/4);}
  let c=crate::BuildControl{data:(&generation as *const u32).cast_mut().cast(),cancelled:super::job_cancelled,progress};
  let snapshot=crate::build_controlled(&shapes,generation,Some(&c)).map_err(|e|fail(if e=="CANCELLED"{102}else{106},&e))?;
  check(generation,990)?;
  let hash=if payload.base[192..224].iter().any(|&v|v!=0){&payload.base[192..224]}else{&payload.base[160..192]};
  let o=payload.buffers[20].bytes();
  let metadata=serde_json::to_vec(&serde_json::json!({
   "schemaVersion":1,"rasterAbiVersion":1,"kind":"raster-source-context","sourceHash":wire::hex(hash),
   "z0":0,"z1":thickness,"quantization":"global-once-ties-even-1nm-certified-embedding-v1",
   "originalRgbaHash":wire::hex(&payload.base[160..192]),"proposalHash":wire::hex(&payload.hash),
   "sourceAssemblyRequired":true,"sourceRegions":source_regions,"coordinateScalePerMm":1000000,
   "widthMm":wire::f64_at(&payload.base,80),"heightMm":wire::f64_at(&payload.base,88),
   "rasterFrame":sealed_frame(&payload),
   "upstreamValues":(3..10).map(|i|wire::u32_at(o,4*i)).collect::<Vec<_>>(),
   "sourceOptionsHex":wire::hex(o),"sourceLedgerTlvHex":wire::hex(payload.buffers[18].bytes()),
   "totalErrorBoundMm":null,"confirmation":"accepted-runtime-proposal","regionGrouping":"source-region"
  })).map_err(|_|fail(9,"METADATA_ENCODING"))?;
  Ok((snapshot,metadata))
 })()
}


// Full input rectangle, including transparent/excluded margins. Values were
// hashed in RASP before acceptance, never inferred from manufactured ink.
fn sealed_frame(payload:&Payload)->serde_json::Value{
 serde_json::json!({"version":"arch-raster-frame/1",
  "widthPx":wire::u32_at(&payload.base,24),"heightPx":wire::u32_at(&payload.base,28),
  "processedWidthPx":wire::u32_at(&payload.base,32),"processedHeightPx":wire::u32_at(&payload.base,36),
  "widthMm":wire::f64_at(&payload.base,80),"heightMm":wire::f64_at(&payload.base,88),
  "mmPerPixelX":wire::f64_at(&payload.base,96),"mmPerPixelY":wire::f64_at(&payload.base,104),
  "axis":"x-right-y-down","originMm":[0,0],"source":"sealed-RASP/2"})
}
