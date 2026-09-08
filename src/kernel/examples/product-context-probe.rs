use std::{env,fs,path::PathBuf,slice};
use arch_kernel::*;
use sha2::{Digest,Sha256};
unsafe extern "C" {
 fn arch_build_svg(input:u32,thickness:f64,long_edge:f64,tolerance:f64,g:u32)->u32;
 fn arch_control_reset(g:u32)->u32;fn arch_control_ptr()->*const std::sync::atomic::AtomicU32;
 fn arch_input_create(n:u32)->u32;fn arch_input_ptr(h:u32)->*mut u8;
 fn arch_snapshot_ptr(h:u32)->*const u8;fn arch_snapshot_len(h:u32)->u32;fn arch_snapshot_release(h:u32)->u32;
 fn arch_error_ptr()->*const u8;fn arch_error_len()->u32;
 fn arch_output_ptr(h:u32)->*const u8;fn arch_output_len(h:u32)->u32;fn arch_output_release(h:u32)->u32;
}
fn input(b:&[u8])->u32{unsafe{let id=arch_input_create(b.len()as u32);assert_ne!(id,0);std::ptr::copy_nonoverlapping(b.as_ptr(),arch_input_ptr(id),b.len());id}}
fn error()->String{unsafe{String::from_utf8_lossy(slice::from_raw_parts(arch_error_ptr(),arch_error_len()as usize)).to_string()}}
fn buffer(id:u32,k:u32)->Vec<u8>{unsafe{slice::from_raw_parts(arch_product_buffer_ptr(id,k),arch_product_buffer_len(id,k)as usize).to_vec()}}
fn u(b:&[u8],o:usize)->u32{u32::from_le_bytes(b[o..o+4].try_into().unwrap())}
fn next(g:&mut u32)->u32{*g+=1;assert_eq!(unsafe{arch_control_reset(*g)},1);*g}
fn main(){
 let args:Vec<_>=env::args().collect();assert_eq!(args.len(),3,"probe CASE_DIR OUTPUT_DIR");
 let root=PathBuf::from(env::var("PROJECT_REVIEW_RUN").unwrap()).canonicalize().unwrap();
 let cases=PathBuf::from(&args[1]).canonicalize().unwrap();let out=PathBuf::from(&args[2]).canonicalize().unwrap();
 assert!(cases.starts_with(&root)&&out.starts_with(&root));assert_eq!(arch_product_datum_probe_version(),1);
 let mut files:Vec<_>=fs::read_dir(cases).unwrap().map(|r|r.unwrap().path()).filter(|p|p.extension().is_some_and(|x|x=="json")).collect();files.sort();
 let mut g=0;let mut rows=Vec::new();
 for file in files {
  let v:serde_json::Value=serde_json::from_slice(&fs::read(&file).unwrap()).unwrap();
  let wire:Vec<u8>=serde_json::from_value(v["wire"].clone()).unwrap();let cs=v["contexts"].as_array().unwrap();
  assert!(cs.len()>0&&cs.len()<=33);let mut block=vec![0u8;8+cs.len()*56];block[..4].copy_from_slice(&2u32.to_le_bytes());block[4..8].copy_from_slice(&(cs.len()as u32).to_le_bytes());
  let mut leases=Vec::new();
  for(i,c)in cs.iter().enumerate(){
   let svg=c["svg"].as_str().unwrap().as_bytes();let sha=Sha256::digest(svg).iter().map(|v|format!("{v:02x}")).collect::<String>();
   assert_eq!(sha,c["sourceHash"].as_str().unwrap());
   let id=unsafe{arch_build_svg(input(svg),c["thicknessMm"].as_f64().unwrap(),c["longEdgeMm"].as_f64().unwrap(),c["toleranceMm"].as_f64().unwrap(),next(&mut g))};
   assert_ne!(id,0,"{} {}",file.display(),error());leases.push(id);
   let at=8+i*56;block[at..at+4].copy_from_slice(&id.to_le_bytes());block[at+4..at+8].copy_from_slice(&g.to_le_bytes());block[at+8..at+40].copy_from_slice(&Sha256::digest(svg));
   for j in 0..2{let n:i64=c["translationNm"][j].as_str().unwrap().parse().unwrap();block[at+40+j*8..at+48+j*8].copy_from_slice(&n.to_le_bytes());}
  }
  next(&mut g);let request=arch_product_prepare_contexts(input(&block),input(&wire),g);assert_ne!(request,0,"{} {}",file.display(),error());
  let datum=u(&wire,60)==1;
  let id=if datum {arch_product_datum_probe(request,g)}else{arch_product_build(request,g)};
  let mut receipt=false;let name=file.file_stem().unwrap().to_str().unwrap();
  let handle=if datum{
   assert_eq!(id,0);assert_eq!(error(),"PRODUCT_DATUM_PROBE");let p=arch_product_last_proposal();assert_ne!(p,0);p
  }else{assert_ne!(id,0,"{} {}",file.display(),error());id};
  let sem=buffer(handle,1);assert_eq!(u(&sem,148),3);assert_eq!(u(&sem,152),2);
  let desc=buffer(handle,4);assert_eq!(desc.len(),192);
  if datum{
   assert_eq!(u(&sem,156),1);assert_ne!(u(&sem,24),0);assert_eq!(u(&sem,264),0);assert!(unsafe{arch_snapshot_ptr(handle)}.is_null());
   let mut confirm=desc.clone();confirm.extend_from_slice(&desc[128..160]);confirm.extend_from_slice(&desc[16..24]);
   let mut bad=confirm.clone();bad[192]^=1;
   assert_eq!(arch_product_confirm(handle,input(&bad),1,next(&mut g)),0);
   let output=arch_product_confirm(handle,input(&confirm),1,next(&mut g));assert_eq!(output!=0,u(&sem,16)==0);
   if output!=0{assert_eq!(unsafe{slice::from_raw_parts(arch_output_ptr(output),arch_output_len(output)as usize)},desc);assert_eq!(unsafe{arch_output_release(output)},1);}
   if u(&sem,16)==0 {
    // Second confirmation is rejected; the first receipt is immutable and exactly descriptor bytes.
    let second=arch_product_confirm(handle,input(&confirm),1,next(&mut g));assert_eq!(second,0);assert_eq!(error(),"PRODUCT_PROPOSAL_ALREADY_ACCEPTED");receipt=true;
   }
   assert_eq!(arch_product_proposal_release(handle),1);
  }else{
   let arch=unsafe{slice::from_raw_parts(arch_snapshot_ptr(id),arch_snapshot_len(id)as usize)};fs::write(out.join(format!("{name}.arch")),arch).unwrap();
   assert_eq!(arch_snapshot_release_safe(id),1);
  }
  fs::write(out.join(format!("{name}.apms")),sem).unwrap();
  for kind in 0..4{
   let mut bad=block.clone();next(&mut g);
   if kind==0 {bad[12..16].copy_from_slice(&u32::MAX.to_le_bytes());}
   if kind==1 {bad[16]^=1;}
   if kind==2 {bad[48..56].copy_from_slice(&i64::MAX.to_le_bytes());}
   if kind==3 {unsafe{(*arch_control_ptr().add(3)).store(g,std::sync::atomic::Ordering::Release);}}
   assert_eq!(arch_product_prepare_contexts(input(&bad),input(&wire),g),0);
  }
  for id in leases{assert_eq!(arch_snapshot_release_safe(id),1);}
  assert_eq!(arch_raster_owned_bytes(),0);
  assert_eq!(arch_product_request_release(request),0);
  rows.push(serde_json::json!({"case":name,"probe":datum,"receipt":receipt}));
 }
 fs::write(out.join("summary.json"),serde_json::to_vec_pretty(&rows).unwrap()).unwrap();println!("{} native cases passed",rows.len());
}
fn arch_snapshot_release_safe(id:u32)->u32{unsafe{arch_snapshot_release(id)}}
