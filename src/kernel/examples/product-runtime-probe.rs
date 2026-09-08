use std::{env,fs,path::PathBuf,slice};
use arch_kernel::*;
use sha2::{Digest,Sha256};
unsafe extern "C" {
 fn arch_build_svg(input:u32,thickness:f64,long_edge:f64,tolerance:f64,g:u32)->u32;
 fn arch_control_reset(g:u32)->u32;fn arch_control_ptr()->*const std::sync::atomic::AtomicU32;
 fn arch_input_create(n:u32)->u32;fn arch_input_ptr(h:u32)->*mut u8;fn arch_input_release(h:u32)->u32;
 fn arch_snapshot_ptr(h:u32)->*const u8;fn arch_snapshot_len(h:u32)->u32;fn arch_snapshot_release(h:u32)->u32;fn arch_snapshot_acquire(h:u32)->*const u8;
 fn arch_error_ptr()->*const u8;fn arch_error_len()->u32;
 fn arch_metadata_ptr(h:u32)->*const u8;fn arch_metadata_len(h:u32)->u32;
 fn arch_export_stl(h:u32,p:u32,g:u32)->u32;fn arch_output_ptr(h:u32)->*const u8;fn arch_output_len(h:u32)->u32;fn arch_output_release(h:u32)->u32;
}
fn input(b:&[u8])->u32{unsafe{let id=arch_input_create(b.len()as u32);assert_ne!(id,0);std::ptr::copy_nonoverlapping(b.as_ptr(),arch_input_ptr(id),b.len());id}}
fn error()->String{unsafe{String::from_utf8_lossy(slice::from_raw_parts(arch_error_ptr(),arch_error_len()as usize)).to_string()}}
fn buffer(id:u32,kind:u32)->Vec<u8>{let n=arch_product_buffer_len(id,kind);if n==0{return vec![]}unsafe{slice::from_raw_parts(arch_product_buffer_ptr(id,kind),n as usize).to_vec()}}
fn main(){
 let args:Vec<_>=env::args().collect();assert_eq!(args.len(),4,"probe SVG REQUEST OUTBASE");
 let root=PathBuf::from(env::var("PROJECT_REVIEW_RUN").unwrap()).canonicalize().unwrap();
 let out=PathBuf::from(&args[3]);assert!(out.parent().unwrap().canonicalize().unwrap().starts_with(&root));
 let source=fs::read(&args[1]).unwrap();let wire=fs::read(&args[2]).unwrap();
 let before=arch_raster_owned_bytes();assert_eq!(arch_product_abi_version(),1);
 assert_eq!(unsafe{arch_control_reset(1)},1);
 let (h,job_generation)=if args[1].ends_with(".contexts.json"){
  let entries:Vec<String>=serde_json::from_slice(&source).unwrap();assert!(!entries.is_empty()&&entries.len()<=33);
  let mut contexts=vec![0u8;8+entries.len()*40];contexts[..4].copy_from_slice(&1u32.to_le_bytes());contexts[4..8].copy_from_slice(&(entries.len()as u32).to_le_bytes());
  let mut leases=Vec::new();
  for(i,file)in entries.iter().enumerate(){
   let path=PathBuf::from(file).canonicalize().unwrap();assert!(path.starts_with(&root));
   let b=fs::read(path).unwrap();let g=i as u32+1;if g>1{assert_eq!(unsafe{arch_control_reset(g)},1);}
   let id=unsafe{arch_build_svg(input(&b),0.2,0.,0.001,g)};assert_ne!(id,0,"{}",error());leases.push(id);
   contexts[8+i*40..12+i*40].copy_from_slice(&id.to_le_bytes());contexts[12+i*40..16+i*40].copy_from_slice(&g.to_le_bytes());
   contexts[16+i*40..48+i*40].copy_from_slice(&Sha256::digest(&b));
  }
  let g=entries.len()as u32+1;assert_eq!(unsafe{arch_control_reset(g)},1);
  let req=arch_product_prepare_contexts(input(&contexts),input(&wire),g);
  for id in leases{assert_eq!(unsafe{arch_snapshot_release(id)},1);}(req,g)
 }else if args[1].ends_with(".rgba"){
  assert_eq!(source.len(),64*48*4);let mut options=vec![0u8;200];
  let words=[2u32,200,2,2,360,0,0,0,0,0,0,0,0,0,0,0];
  for(i,v)in words.into_iter().enumerate(){options[i*4..i*4+4].copy_from_slice(&v.to_le_bytes());}
  options[64..72].copy_from_slice(&40f64.to_le_bytes());
  let proposal=arch_raster_prepare_rgba(input(&source),64,48,input(&options),0,0,1);assert_ne!(proposal,0,"{}",error());
  let summary=unsafe{slice::from_raw_parts(arch_raster_buffer_ptr(proposal,1),256)};
  let hash=summary[128..160].to_vec();assert_eq!(unsafe{arch_control_reset(2)},1);
  let accepted=arch_raster_confirm(proposal,input(&hash),2);assert_ne!(accepted,0,"{}",error());arch_raster_release(proposal);
  assert_eq!(unsafe{arch_control_reset(3)},1);
  let h=arch_product_prepare_raster(accepted,input(&wire),0.2,3);arch_raster_release(accepted);(h,3)
 }else{(arch_product_prepare_svg(input(&source),input(&wire),0.2,0.,0.001,1),1)};
 if h==0{
  fs::write(out.with_extension("json"),serde_json::to_vec_pretty(&serde_json::json!({"stage":"prepare","error":error(),"ownedBefore":before,"ownedAfter":arch_raster_owned_bytes()})).unwrap()).unwrap();return;
 }
 let descriptor=unsafe{slice::from_raw_parts(arch_product_request_head_ptr(h),192).to_vec()};
 let id=arch_product_build(h,job_generation);assert_eq!(arch_product_request_release(h),0);
 if id==0 {
  let e=error();let proposal=arch_product_last_proposal();
  if proposal!=0{for kind in 1..=4{fs::write(out.with_extension(format!("buf{kind}")),buffer(proposal,kind)).unwrap();}arch_product_proposal_release(proposal);}
  fs::write(out.with_extension("json"),serde_json::to_vec_pretty(&serde_json::json!({"stage":"build","error":e,"proposal":proposal!=0,"ownedBefore":before,"ownedAfter":arch_raster_owned_bytes()})).unwrap()).unwrap();return;
 }
 let bytes=unsafe{slice::from_raw_parts(arch_snapshot_ptr(id),arch_snapshot_len(id)as usize).to_vec()};
 let meta=unsafe{slice::from_raw_parts(arch_metadata_ptr(id),arch_metadata_len(id)as usize).to_vec()};
 fs::write(out.with_extension("arch"),&bytes).unwrap();fs::write(out.with_extension("metadata.json"),meta).unwrap();
 for kind in 1..=4{fs::write(out.with_extension(format!("buf{kind}")),buffer(id,kind)).unwrap();}
 assert_eq!(unsafe{arch_snapshot_acquire(id)},unsafe{arch_snapshot_ptr(id)});
 assert_eq!(unsafe{arch_snapshot_release(id)},1);assert!(!unsafe{arch_snapshot_ptr(id)}.is_null());
 let stl=unsafe{arch_export_stl(id,0,job_generation+1)};assert_eq!(stl,0); // reset is mandatory
 assert_eq!(unsafe{arch_control_reset(job_generation+1)},1);
 let stl=unsafe{arch_export_stl(id,0,job_generation+1)};
 let export_error=if stl==0{Some(error())}else{
  fs::write(out.with_extension("stl"),unsafe{slice::from_raw_parts(arch_output_ptr(stl),arch_output_len(stl)as usize)}).unwrap();
  assert_eq!(unsafe{arch_output_release(stl)},1);None
 };
 assert_eq!(unsafe{slice::from_raw_parts(arch_snapshot_ptr(id),bytes.len())},bytes);
 if args[1].ends_with(".svg"){
  let held=arch_raster_owned_bytes();
  // A product mesh cannot be impersonated as an original source context.
  assert_eq!(arch_product_request_create(id,job_generation,input(&wire)),0);
  assert_eq!(arch_raster_owned_bytes(),held);
  let cancelled=job_generation+2;assert_eq!(unsafe{arch_control_reset(cancelled)},1);
  unsafe{(*arch_control_ptr().add(3)).store(cancelled,std::sync::atomic::Ordering::Release);}
  assert_eq!(arch_product_prepare_svg(input(&source),input(&wire),0.2,0.,0.001,cancelled),0);
  assert_eq!(error(),"CANCELLED");assert_eq!(arch_raster_owned_bytes(),held);
  let cancelled=job_generation+3;assert_eq!(unsafe{arch_control_reset(cancelled)},1);
  let req=arch_product_prepare_svg(input(&source),input(&wire),0.2,0.,0.001,cancelled);assert_ne!(req,0,"{}",error());
  unsafe{(*arch_control_ptr().add(3)).store(cancelled,std::sync::atomic::Ordering::Release);}
  assert_eq!(arch_product_build(req,cancelled),0);assert_eq!(error(),"CANCELLED");assert_eq!(arch_raster_owned_bytes(),held);
  assert_eq!(arch_product_request_release(req),0);
  assert_eq!(unsafe{slice::from_raw_parts(arch_snapshot_ptr(id),bytes.len())},bytes);
 }
 assert_eq!(unsafe{arch_snapshot_release(id)},1);assert_eq!(unsafe{arch_snapshot_release(id)},0);
 assert_eq!(unsafe{arch_input_release(0)},0);
 assert_eq!(arch_raster_owned_bytes(),before);
 fs::write(out.with_extension("json"),serde_json::to_vec_pretty(&serde_json::json!({"stage":"complete","snapshotBytes":bytes.len(),"exportError":export_error,"descriptorBytes":descriptor.len(),"ownedBefore":before,"ownedAfter":arch_raster_owned_bytes(),"immutable":true})).unwrap()).unwrap();
}
