use arch_kernel::*;
use std::{fs,env,path::PathBuf,slice,ffi::CString};
use serde_json::{Value,json};
use sha2::{Digest,Sha256};
unsafe extern "C"{
 fn arch_control_reset(g:u32)->u32;fn arch_control_ptr()->*const std::sync::atomic::AtomicU32;
 fn arch_input_create(n:u32)->u32;fn arch_input_ptr(id:u32)->*mut u8;fn arch_input_release(id:u32)->u32;
 fn arch_snapshot_ptr(id:u32)->*const u8;fn arch_snapshot_len(id:u32)->u32;fn arch_snapshot_release(id:u32)->u32;fn arch_snapshot_acquire(id:u32)->*const u8;
 fn arch_error_ptr()->*const u8;fn arch_error_len()->u32;fn arch_metadata_ptr(id:u32)->*const u8;fn arch_metadata_len(id:u32)->u32;
 fn archmi_begin(n:u32)->u32;fn archmi_source_ptr(id:u32)->*mut u8;fn archmi_release(id:u32)->u32;
 fn archmi_set_provenance(id:u32,source:*const i8,name:*const i8)->i32;
 fn archmi_report(id:u32)->*const u8;fn archmi_report_len(id:u32)->u32;fn archmi_publishable(id:u32)->u32;
 fn archmi_stage_stl(id:u32,xyz:*const f64,faces:u32,unit:u32,rgba:u32,chosen:u32,name:*const i8,material:*const i8,material_name:*const i8,error:f64)->i32;
 fn archmi_validate(id:u32,error:f64)->i32;
}
fn hash(b:&[u8])->String{Sha256::digest(b).iter().map(|x|format!("{x:02x}")).collect()}
fn err()->String{unsafe{String::from_utf8_lossy(slice::from_raw_parts(arch_error_ptr(),arch_error_len()as usize)).into()}}
fn input(b:&[u8])->u32{unsafe{let h=arch_input_create(b.len()as u32);assert_ne!(h,0);std::ptr::copy_nonoverlapping(b.as_ptr(),arch_input_ptr(h),b.len());h}}
fn text(v:&Value)->Vec<u8>{serde_json::to_vec(v).unwrap()}
fn snapshot(id:u32)->Vec<u8>{unsafe{slice::from_raw_parts(arch_snapshot_ptr(id),arch_snapshot_len(id)as usize).to_vec()}}
fn buf(id:u32,k:u32)->Vec<u8>{unsafe{let n=arch_mesh_buffer_len(id,k);if n==0{vec![]}else{slice::from_raw_parts(arch_mesh_buffer_ptr(id,k),n as usize).to_vec()}}}
fn product_buf(id:u32,k:u32)->Vec<u8>{unsafe{slice::from_raw_parts(arch_product_buffer_ptr(id,k),arch_product_buffer_len(id,k)as usize).to_vec()}}
fn u32at(b:&[u8],o:usize)->u32{u32::from_le_bytes(b[o..o+4].try_into().unwrap())}
fn u64at(b:&[u8],o:usize)->u64{u64::from_le_bytes(b[o..o+8].try_into().unwrap())}
fn table(b:&[u8],tag:u32)->(usize,usize){for i in 0..u32at(b,12)as usize{let o=256+16*i;if u32at(b,o)==tag{return(u32at(b,o+12)as usize,u32at(b,o+8)as usize)}}panic!("table")}
fn main(){
 let run=PathBuf::from(env::var("PROJECT_REVIEW_RUN").unwrap()).canonicalize().unwrap();
 let args:Vec<_>=env::args().collect();assert_eq!(args.len(),3);
 let fixture=PathBuf::from(&args[1]).canonicalize().unwrap();let out=PathBuf::from(&args[2]);assert!(fixture.starts_with(&run));assert!(out.canonicalize().unwrap().starts_with(&run));
 let data:Value=serde_json::from_slice(&fs::read(&fixture).unwrap()).unwrap();let base=fixture.parent().unwrap();
 let read=|name:&str|{let p=base.join(name).canonicalize().unwrap();assert!(p.starts_with(&run));let b=fs::read(p).unwrap();assert!(b.len()<=64_000_000);b};
 let mut generation=0u32;let mut reset=||{generation+=1;assert_eq!(unsafe{arch_control_reset(generation)},1);generation};
 assert_eq!(arch_mesh_operation_mask()&8,8);
 let before=arch_raster_owned_bytes();let g=reset();
 let request=arch_product_prepare_svg(input(&read("product.svg")),input(&read("product.aprq")),0.2,0.,0.001,g);
 assert_ne!(request,0,"{}",err());let parent=arch_product_build(request,g);assert_ne!(parent,0,"{}",err());
 let original=snapshot(parent);let semantic=product_buf(parent,1);let meta:Value=unsafe{serde_json::from_slice(slice::from_raw_parts(arch_metadata_ptr(parent),arch_metadata_len(parent)as usize)).unwrap()};
 fs::write(out.join("parent.arch"),&original).unwrap();
 let(po,count)=table(&semantic,1);let(fo,_)=table(&semantic,2);let parts=u32at(&original,56)as usize;
 let mut mats=Vec::new();let mut binds=Vec::new();let mut target=0;
 for pi in 0..count{
  let at=po+160*pi;let feature=u32at(&semantic,at)as usize;let slot=u32at(&semantic,at+8);let rgba=u32at(&original,parts+40*pi+16);
  let mi=mats.iter().position(|m:&Value|m["slot"]==slot&&m["rgba"]==rgba).unwrap_or_else(||{mats.push(json!({"materialId":(900+slot).to_string(),"slot":slot,"rgba":rgba}));mats.len()-1});
  if u32at(&semantic,at+4)==0{target=pi;}
  binds.push(json!({"semanticId":(10000+pi).to_string(),"sourceId":u64at(&semantic,fo+176*feature+112).to_string(),
   "provenanceId":u64at(&semantic,at+24).to_string(),"sourceIndex":u32at(&original,parts+40*pi+20),"materialIndex":mi}));
 }
 let mut records=Vec::new();
 for case in data["cases"].as_array().unwrap(){
  let name=case["name"].as_str().unwrap();let raw=read(case["source"].as_str().unwrap());let positions=read(case["positions"].as_str().unwrap());
  assert_eq!(positions.len()%72,0);let xyz:Vec<f64>=positions.chunks_exact(8).map(|b|f64::from_le_bytes(b.try_into().unwrap())).collect();
  let id=unsafe{archmi_begin(raw.len()as u32)};assert_ne!(id,0);
  let sid=CString::new("authored-analytic-import").unwrap();let filename=CString::new("tool.stl").unwrap();
  assert_eq!(unsafe{archmi_set_provenance(id,sid.as_ptr(),filename.as_ptr())},0);
  unsafe{std::ptr::copy_nonoverlapping(raw.as_ptr(),archmi_source_ptr(id),raw.len());}
  let label=CString::new("analytic-prism").unwrap();let mat=CString::new("800").unwrap();let matname=CString::new("Imported analytic tool").unwrap();
  assert_eq!(unsafe{archmi_stage_stl(id,xyz.as_ptr(),(xyz.len()/9)as u32,case["unitCode"].as_u64().unwrap()as u32,0x30353bff,1,label.as_ptr(),mat.as_ptr(),matname.as_ptr(),case["conversionError"].as_f64().unwrap())},0);
  unsafe{archmi_validate(id,0.002);}assert_eq!(unsafe{archmi_publishable(id)},1);
  let report=unsafe{slice::from_raw_parts(archmi_report(id),archmi_report_len(id)as usize)};let transform=case["transform"].clone();
  let matrix:Vec<f64>=transform.as_array().unwrap().iter().map(|v|v.as_f64().unwrap()).collect();
  let bits:String=matrix.iter().flat_map(|v|v.to_le_bytes()).map(|v|format!("{v:02x}")).collect();
  let mut stage=case["selection"].clone();stage["version"]=json!("arch-mesh-stage/1");stage["approved"]=json!(true);
  for k in ["userId","projectId"]{stage[k]=data["context"][k].clone();}
  stage["revision"]=meta["revision"].clone();stage["headHash"]=meta["headHash"].clone();stage["transform"]=transform.clone();stage["transformBinary64LE"]=json!(bits);
  stage["sourceHash"]=json!(hash(&raw));stage["nativeReportHash"]=json!(hash(report));
  let g=reset();let prepared=arch_mesh_stage(id,input(&text(&stage)),g);assert_ne!(prepared,0,"{}",err());assert_eq!(unsafe{archmi_release(id)},1);
  let mut cmd=case["command"].clone();
  for k in ["revision","headHash","userId","projectId","transform","transformBinary64LE"]{cmd[k]=stage[k].clone();}
  cmd["version"]=json!("arch-mesh-csg-request/1");cmd["snapshotGeneration"]=json!(1);cmd["bindings"]=json!(binds);cmd["materials"]=json!(mats);cmd["targets"]=json!([]);
  // Fault-inject a still-closed translated parent representation. The retained
  // guard must reject it independently of caller metadata/ancestry. Restore
  // the exact old snapshot before leaving the probe branch.
  if name=="stl-mm"{
   unsafe{let bytes=slice::from_raw_parts_mut(arch_snapshot_ptr(parent)as *mut u8,original.len());let vo=u32at(&original,48)as usize;
    for v in 0..u32at(&original,20)as usize{let at=vo+24*v;let x=f64::from_le_bytes(bytes[at..at+8].try_into().unwrap());bytes[at..at+8].copy_from_slice(&(x+1.).to_le_bytes());}}
   let bad=arch_mesh_prepare(parent,prepared,input(&text(&cmd)),reset());
   unsafe{std::ptr::copy_nonoverlapping(original.as_ptr(),arch_snapshot_ptr(parent)as *mut u8,original.len());}
   assert_ne!(bad,0,"{}",err());let bad_meta:Value=serde_json::from_slice(&buf(bad,2)).unwrap();
   assert_eq!(bad_meta["exportBlocked"],true);assert!(bad_meta["postCsgGates"]["checks"].to_string().contains("APPEND_GUARD_ORIGINAL_PART_CHANGED"));
   let exact=buf(bad,3);assert_eq!(arch_mesh_confirm(bad,input(&exact),reset()),0);assert_eq!(arch_mesh_proposal_release(bad),1);assert_eq!(snapshot(parent),original);
   fs::write(out.join("changed-generated-guard.json"),serde_json::to_vec_pretty(&bad_meta["postCsgGates"]).unwrap()).unwrap();
  }
  let retained=arch_raster_owned_bytes();let g=reset();
  let proposal=arch_mesh_prepare(parent,prepared,input(&text(&cmd)),g);assert_ne!(proposal,0,"{}",err());
  let metadata:Value=serde_json::from_slice(&buf(proposal,2)).unwrap();let geometry=buf(proposal,1);
  fs::write(out.join(format!("{name}.arch")),&geometry).unwrap();fs::write(out.join(format!("{name}.json")),serde_json::to_vec_pretty(&metadata).unwrap()).unwrap();
  assert_eq!(snapshot(parent),original);assert_eq!(buf(proposal,4),raw);
  let vo=u32at(&geometry,48)as usize;let oldvo=u32at(&original,48)as usize;let nv=u32at(&original,20)as usize;
  let to=u32at(&geometry,52)as usize;let oldto=u32at(&original,52)as usize;let nt=u32at(&original,24)as usize;
  assert_eq!(&geometry[vo..vo+nv*24],&original[oldvo..oldvo+nv*24]);
  assert_eq!(&geometry[to..to+nt*12],&original[oldto..oldto+nt*12]);
  assert_eq!(u32at(&geometry,28),u32at(&original,28)+1);
  assert_eq!(metadata["operationCapability"],"import-as-part");assert_eq!(metadata["generatedGeometryPreserved"],true);
  assert!(unsafe{arch_snapshot_ptr(proposal)}.is_null(),"proposal cannot impersonate published root snapshot");
  let exact=buf(proposal,3);let mut bad=exact.clone();bad[0]^=1;let g=reset();
  assert_eq!(arch_mesh_confirm(proposal,input(&bad),g),0);assert_eq!(snapshot(parent),original);
  let blocked=metadata["exportBlocked"]==true;assert_eq!(blocked,case["expectedBlocked"].as_bool().unwrap(),"{name}: {metadata}");
  if !blocked{
   let g=reset();let published=arch_mesh_confirm(proposal,input(&exact),g);assert_ne!(published,0,"{}",err());
   assert_eq!(arch_mesh_proposal_release(proposal),0);
   let bytes=snapshot(published);assert_eq!(u32at(&bytes,16),g);assert_eq!(&bytes[20..],&geometry[20..]);
   assert_eq!(unsafe{arch_snapshot_acquire(published)},unsafe{arch_snapshot_ptr(published)});assert_eq!(unsafe{arch_snapshot_release(published)},1);
   fs::write(out.join(format!("{name}.published.arch")),bytes).unwrap();
   assert_eq!(unsafe{arch_snapshot_release(published)},1);assert_eq!(unsafe{arch_snapshot_release(published)},0);
  }else{let g=reset();assert_eq!(arch_mesh_confirm(proposal,input(&exact),g),0);assert_eq!(err(),"MESH_POST_CSG_GATES_BLOCKED");arch_mesh_proposal_release(proposal);}
  assert_eq!(arch_raster_owned_bytes(),retained);
  arch_mesh_prepared_release(prepared);assert_eq!(snapshot(parent),original);
  records.push(json!({"name":name,"published":!blocked,"parentUnchanged":true,"originalBytesExact":true,"noPartialOnBadConfirmation":true,"retainedBytes":retained}));
 }
 assert_eq!(unsafe{arch_snapshot_release(parent)},1);assert_eq!(arch_raster_owned_bytes(),before);
 fs::write(out.join("summary.json"),serde_json::to_vec_pretty(&json!({"records":records,"ownedBefore":before,"ownedAfter":arch_raster_owned_bytes()})).unwrap()).unwrap();
}
