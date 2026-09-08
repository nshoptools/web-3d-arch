use arch_kernel::{arch_final_test_fixture,arch_final_test_stats,arch_export_final,arch_final_output_ptr,arch_final_output_len,arch_final_output_metadata_ptr,arch_final_output_metadata_len,arch_final_output_release,arch_final_output_acquire};
use std::{fs,env,sync::atomic::{AtomicU32,Ordering}};
unsafe extern "C"{
 fn arch_control_reset(generation:u32)->u32;fn arch_control_ptr()->*const AtomicU32;
 fn arch_snapshot_ptr(handle:u32)->*const u8;fn arch_snapshot_len(handle:u32)->u32;fn arch_snapshot_release(handle:u32)->u32;
 fn arch_input_create(length:u32)->u32;fn arch_input_ptr(handle:u32)->*mut u8;fn arch_input_release(handle:u32)->u32;
 fn arch_error_ptr()->*const u8;fn arch_error_len()->u32;
 fn arch_export_stl(snapshot:u32,part:u32,generation:u32)->u32;fn arch_output_ptr(id:u32)->*const u8;fn arch_output_len(id:u32)->u32;fn arch_output_release(id:u32)->u32;
 fn arch_final_native_layout(kind:u32)->u32;
}
fn main(){
 let args:Vec<String>=env::args().collect();if args.len()!=4{panic!("fixture-index options.bin output-stem")}
 if args[1]=="runtime"{runtime(&fs::read(&args[2]).unwrap(),&args[3]);return}
 let index:u32=args[1].parse().unwrap();let options=fs::read(&args[2]).unwrap();let dest=&args[3];
 unsafe{
  assert_eq!(arch_control_reset(1),1);let source=arch_final_test_fixture(index,1);assert!(source>0);
  let before=std::slice::from_raw_parts(arch_snapshot_ptr(source),arch_snapshot_len(source)as usize).to_vec();
  let input=arch_input_create(options.len()as u32);assert!(input>0);std::ptr::copy_nonoverlapping(options.as_ptr(),arch_input_ptr(input),options.len());
  assert_eq!(arch_control_reset(2),1);
  let cancel=env::var("ARCH_FINAL_CANCEL_AT").ok().and_then(|s|s.parse::<u32>().ok());
  let control=arch_control_ptr()as usize;
  let stop=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));let worker_stop=stop.clone();
  let barrier=std::sync::Arc::new(std::sync::Barrier::new(2));let thread_barrier=barrier.clone();
  let thread=cancel.map(|at|std::thread::spawn(move||{thread_barrier.wait();while !worker_stop.load(Ordering::Acquire){let p=control as *const AtomicU32;if (*p.add(2)).load(Ordering::Acquire)>=at{(*p.add(3)).store(2,Ordering::Release);break}std::thread::yield_now();}}));
  if thread.is_some(){barrier.wait();}
  let output=arch_export_final(source,input,2);stop.store(true,Ordering::Release);if let Some(t)=thread{t.join().unwrap()}
  let unchanged=before==std::slice::from_raw_parts(arch_snapshot_ptr(source),arch_snapshot_len(source)as usize);
  let consumed=arch_input_release(input)==0;
  let error=String::from_utf8_lossy(std::slice::from_raw_parts(arch_error_ptr(),arch_error_len()as usize)).into_owned();
  let mut metadata=serde_json::Value::Null;
  if output>0{let bytes=std::slice::from_raw_parts(arch_final_output_ptr(output),arch_final_output_len(output)as usize);fs::write(format!("{dest}.bin"),bytes).unwrap();metadata=serde_json::from_slice(std::slice::from_raw_parts(arch_final_output_metadata_ptr(output),arch_final_output_metadata_len(output)as usize)).unwrap();}
  let result=serde_json::json!({"ok":output>0,"error":error,"sourceUnchanged":unchanged,"inputConsumed":consumed,"phase":(*arch_control_ptr().add(1)).load(Ordering::Acquire),"progress":(*arch_control_ptr().add(2)).load(Ordering::Acquire),"layout":(0..7).map(|i|arch_final_native_layout(i)).collect::<Vec<_>>(),"metadata":metadata});
  fs::write(format!("{dest}.json"),serde_json::to_vec_pretty(&result).unwrap()).unwrap();
  assert!(unchanged&&consumed);assert_eq!(arch_snapshot_release(source),1);
  if output>0{assert!(!arch_final_output_ptr(output).is_null());assert_eq!(arch_final_output_release(output),1);assert_eq!(arch_final_output_release(output),0);}
  assert!((0..5).all(|k|arch_final_test_stats(k)==0));
 }
}

fn runtime(options:&[u8],dest:&str){unsafe{
 let mut checks=Vec::<String>::new();
 macro_rules! check {($condition:expr,$name:expr)=>{{assert!($condition,"{}",$name);checks.push($name.to_string());}}}
 let input=||{let id=arch_input_create(options.len()as u32);assert!(id>0);std::ptr::copy_nonoverlapping(options.as_ptr(),arch_input_ptr(id),options.len());id};
 let read=|p:*const u8,n:u32|std::slice::from_raw_parts(p,n as usize).to_vec();
 assert_eq!(arch_control_reset(1),1);let source=arch_final_test_fixture(2,1);assert!(source>0);let before=read(arch_snapshot_ptr(source),arch_snapshot_len(source));
 assert_eq!(arch_control_reset(2),1);let good=arch_export_final(source,input(),2);check!(good>0,"initial final output");let p=arch_final_output_ptr(good);let payload=read(p,arch_final_output_len(good));
 check!(arch_final_output_acquire(good)==p,"additional output lease");
 check!(arch_output_release(good)==0&&arch_snapshot_release(good)==0&&arch_input_release(good)==0,"wrong handle kind releases rejected");
 assert_eq!(arch_control_reset(3),1);let legacy=arch_export_stl(source,0,3);check!(legacy>0,"legacy exporter callable");let old=read(arch_output_ptr(legacy),arch_output_len(legacy));check!(arch_final_output_release(legacy)==0,"final release preserves legacy output");
 assert_eq!(arch_control_reset(4),1);(*arch_control_ptr().add(3)).store(4,Ordering::Release);let cancelled_input=input();check!(arch_export_final(source,cancelled_input,4)==0,"cancel has no publication");check!(arch_input_release(cancelled_input)==0,"cancel consumes options");check!((*arch_control_ptr().add(1)).load(Ordering::Acquire)==4,"cancel phase");
 assert_eq!(arch_control_reset(5),1);let stale=input();check!(arch_export_final(source,stale,4)==0&&arch_input_release(stale)==0,"stale job consumes options");
 assert_eq!(arch_control_reset(6),1);(*arch_control_ptr().add(3)).store(4,Ordering::Release);let recovered=arch_export_final(source,input(),6);check!(recovered>0,"old cancellation ignored");arch_final_output_release(recovered);
 check!(read(arch_snapshot_ptr(source),arch_snapshot_len(source))==before,"source unchanged after cancel/stale");check!(read(arch_final_output_ptr(good),arch_final_output_len(good))==payload,"final reader unchanged");check!(read(arch_output_ptr(legacy),arch_output_len(legacy))==old,"legacy reader unchanged");
 let mut held=Vec::new();for generation in 7..10{assert_eq!(arch_control_reset(generation),1);let id=arch_export_final(source,input(),generation);check!(id>0,format!("output slot {}",generation-5));held.push(id);}
 assert_eq!(arch_control_reset(10),1);check!(arch_export_final(source,input(),10)==0,"output registry limit");check!(read(arch_final_output_ptr(good),arch_final_output_len(good))==payload,"limit preserves earlier reader");for id in held{arch_final_output_release(id);}
 check!(arch_snapshot_release(source)==1&&arch_snapshot_ptr(source).is_null(),"source primary release, internal pin gone");
 check!(arch_final_output_release(good)==1&&arch_final_output_ptr(good)==p,"second reader keeps output alive");check!(arch_final_output_release(good)==1&&arch_final_output_ptr(good).is_null(),"last output reader invalidates pointer");check!(arch_output_release(legacy)==1,"legacy release preserved");check!((0..5).all(|k|arch_final_test_stats(k)==0),"all root byte charges/registries released");
 fs::write(format!("{dest}.json"),serde_json::to_vec_pretty(&serde_json::json!({"passed":checks.len(),"checks":checks})).unwrap()).unwrap();
}}
