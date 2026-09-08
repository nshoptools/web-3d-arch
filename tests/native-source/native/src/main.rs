use arch_kernel::*;
use std::{fs,env,path::Path,slice,sync::atomic::{AtomicU32,Ordering}};
unsafe extern "C"{
 fn arch_control_reset(g:u32)->u32;fn arch_control_ptr()->*const AtomicU32;
 fn arch_input_create(n:u32)->u32;fn arch_input_ptr(id:u32)->*mut u8;fn arch_input_release(id:u32)->u32;
 fn arch_build_svg(input:u32,t:f64,long:f64,tol:f64,g:u32)->u32;
 fn arch_snapshot_ptr(id:u32)->*const u8;fn arch_snapshot_len(id:u32)->u32;fn arch_snapshot_release(id:u32)->u32;
 fn arch_metadata_ptr(id:u32)->*const u8;fn arch_metadata_len(id:u32)->u32;
 fn arch_error_ptr()->*const u8;fn arch_error_len()->u32;
}
fn cp(p:*const u8,n:u32)->Vec<u8>{if n==0{vec![]}else{unsafe{slice::from_raw_parts(p,n as usize).to_vec()}}}
fn error()->String{unsafe{String::from_utf8(cp(arch_error_ptr(),arch_error_len())).unwrap()}}
fn bytes(id:u32)->Vec<u8>{unsafe{cp(arch_snapshot_ptr(id),arch_snapshot_len(id))}}
fn metadata(id:u32)->Vec<u8>{unsafe{cp(arch_metadata_ptr(id),arch_metadata_len(id))}}
fn input(b:&[u8])->u32{unsafe{let id=arch_input_create(b.len()as u32);assert_ne!(id,0);std::ptr::copy_nonoverlapping(b.as_ptr(),arch_input_ptr(id),b.len());id}}
fn next(g:&mut u32)->u32{*g+=1;assert_eq!(unsafe{arch_control_reset(*g)},1);*g}
fn wire(id:u32,g:u32,hash:&str,m:[f64;6])->Vec<u8>{
 let mut b=vec![0;112];for(i,v)in[0x52465341,1,112,0,id,g].iter().enumerate(){b[i*4..i*4+4].copy_from_slice(&v.to_le_bytes());}
 for i in 0..32{b[24+i]=u8::from_str_radix(&hash[2*i..2*i+2],16).unwrap();}
 for(i,v)in m.iter().enumerate(){b[56+i*8..64+i*8].copy_from_slice(&v.to_le_bytes());}b
}
fn main(){
 let a:Vec<_>=env::args().collect();
 if a.len()==4&&a[1]=="dump-vector"{let svg=fs::read_to_string(&a[2]).unwrap();let d=build_svg(&svg,0.2,None,0.001,1).unwrap().source;fs::write(&a[3],serde_json::to_vec_pretty(&d).unwrap()).unwrap();return;}
 assert_eq!(a.len(),3,"FIXTURE_DIRECTORY OUTPUT_DIRECTORY or dump-vector SVG OUT.json");
 let fixtures=Path::new(&a[1]);let out=Path::new(&a[2]);fs::create_dir_all(out).unwrap();let mut g=0;let mut checks=Vec::new();
 macro_rules! ck{($x:expr,$name:expr)=>{assert!($x,"{}: {}",$name,error());checks.push($name.to_string());}}
 ck!(arch_source_frame_version()==1,"same root frame version");
 for name in ["combined-vietnamese-original","combined-vietnamese-adopted","shared-hole-accent","oo-multiline","nfd-accent","nfd-regular-multiline"]{
  let svg=fs::read_to_string(fixtures.join(format!("{name}.svg"))).unwrap();
  let src=unsafe{arch_build_svg(input(svg.as_bytes()),0.2,0.,0.001,next(&mut g))};
  ck!(src!=0,format!("{name}: unchanged SVG options accepted"));
  let original=bytes(src);let original_metadata=metadata(src);let m:serde_json::Value=serde_json::from_slice(&original_metadata).unwrap();
  fs::write(out.join(format!("{name}.arch")),&original).unwrap();fs::write(out.join(format!("{name}.json")),&original_metadata).unwrap();
  let sg=g;let hash=m["sourceHash"].as_str().unwrap();
  for (i,matrix)in [[1.,0.,0.,-1.,-15.,-6.25],[-1.,0.,0.,1.,-2.,-3.],[0.,1.,1.,0.,0.,0.],[0.,-1.,1.,0.,0.,0.],
   [1.,0.,0.,1.,1./128.,-3./128.],[-1.,0.,0.,-1.,0.,0.],[0.,1.,-1.,0.,0.,0.],[0.,-1.,-1.,0.,0.,0.]].into_iter().enumerate(){
   let w=wire(src,sg,hash,matrix);let h=arch_source_frame(input(&w),next(&mut g));
   ck!(h!=0,format!("{name}: frame {i}"));
   let result=bytes(h);let md=metadata(h);
   fs::write(out.join(format!("{name}-frame-{i}.arch")),&result).unwrap();fs::write(out.join(format!("{name}-frame-{i}.json")),&md).unwrap();
   let again=wire(h,g,hash,[1.,0.,0.,1.,0.,0.]);ck!(arch_source_frame(input(&again),next(&mut g))==0&&error()=="SOURCE_FRAME_ALREADY_APPLIED","repeat placement rejected");
   ck!(unsafe{arch_snapshot_release(h)}==1&&unsafe{arch_snapshot_release(h)}==0,"primary lease released exactly once");
  }
  let w=wire(src,sg,hash,[1.,0.,0.,-1.,-15.,-6.25]);
  for offset in [0,4,8,12,16,20,24,104]{let mut bad=w.clone();bad[offset]^=1;
   let h=input(&bad);ck!(arch_source_frame(h,next(&mut g))==0,"bad version/handle/generation/hash/reserved rejected");ck!(unsafe{arch_input_release(h)}==0,"invalid wire input consumed");
  }
  for value in [f64::NAN,f64::INFINITY,10000.0001]{let mut bad=w.clone();bad[88..96].copy_from_slice(&value.to_le_bytes());ck!(arch_source_frame(input(&bad),next(&mut g))==0,"nonfinite/outside translation rejected");}
  for matrix in [[2.,0.,0.,1.,0.,0.],[1.,0.,0.5,1.,0.,0.],[1.,0.,0.,1.,10000.,0.]]{
   ck!(arch_source_frame(input(&wire(src,sg,hash,matrix)),next(&mut g))==0,"affine or transformed domain rejected");
  }
  let cancel=next(&mut g);unsafe{(*arch_control_ptr().add(3)).store(cancel,Ordering::Release);}
  let baseline=arch_raster_owned_bytes();ck!(arch_source_frame(input(&w),cancel)==0&&error()=="CANCELLED","cancel before work no publication");
  ck!(arch_raster_owned_bytes()==baseline,"cancel keeps registry accounting");
  let stale=next(&mut g);next(&mut g);ck!(arch_source_frame(input(&w),stale)==0&&error()=="STALE_GENERATION","stale control rejected");
  ck!(original==bytes(src)&&original_metadata==metadata(src),"source bytes and provenance unchanged");
  ck!(unsafe{arch_snapshot_release(src)}==1,"release original");
  ck!(arch_source_frame(input(&w),next(&mut g))==0&&error()=="SOURCE_FRAME_HANDLE","retired source handle rejected");
  ck!(arch_raster_owned_bytes()==0,"all root bytes released");
 }
 let ring=|x:i64,y:i64,w:i64,h:i64|vec![[x*1000000,y*1000000],[(x+w)*1000000,y*1000000],[(x+w)*1000000,(y+h)*1000000],[x*1000000,(y+h)*1000000]];
 let shapes=vec![
  Shape{contours:vec![ring(0,0,10,10),ring(3,3,4,4),ring(22,0,1,1)],fill_rule:1,color_rgba:0xff0000ff,z0:0.,z1:0.2},
  Shape{contours:vec![ring(10,0,10,5)],fill_rule:0,color_rgba:0x0000ffff,z0:0.,z1:0.2},
  Shape{contours:vec![ring(10,5,10,5)],fill_rule:0,color_rgba:0x00ff00ff,z0:0.,z1:0.2}];
 let exact=build(&shapes,1).unwrap();fs::write(out.join("analytic-integer-grid.arch"),exact.bytes()).unwrap();
 let mut rgba=vec![0u8;12*8*4];for y in 2..6{for x in 3..9{rgba[4*(y*12+x)..4*(y*12+x)+4].copy_from_slice(&[224,68,68,255]);}}
 let mut options=vec![0u8;200];for(i,n)in [2u32,200,2,4,520,3,5,1,35,65,0,0,0,0,0,0].iter().enumerate(){options[i*4..i*4+4].copy_from_slice(&n.to_le_bytes());}options[64..72].copy_from_slice(&24f64.to_le_bytes());
 let prepared=arch_raster_prepare_rgba(input(&rgba),12,8,input(&options),0,0,next(&mut g));ck!(prepared!=0,"native default raster prepared");
 let summary=cp(arch_raster_buffer_ptr(prepared,1),256);
 ck!(arch_build_raster(prepared,0.2,next(&mut g))==0&&error()=="CONFIRMATION_REQUIRED","native raster no auto-accept");
 let accepted=arch_raster_confirm(prepared,input(&summary[128..160]),next(&mut g));ck!(accepted!=0,"native explicit exact raster confirmation");
 let raster=arch_build_raster(accepted,0.2,next(&mut g));ck!(raster!=0,"native raster context");
 let rm:serde_json::Value=serde_json::from_slice(&metadata(raster)).unwrap();
 ck!(rm["widthMm"]==24.&&rm["heightMm"]==16.,"native sealed full raster mm dimensions");
 ck!(rm["rasterFrame"]["widthPx"]==12&&rm["rasterFrame"]["heightPx"]==8,"native sealed full pixel dimensions");
 fs::write(out.join("raster-context.arch"),bytes(raster)).unwrap();fs::write(out.join("raster-context.json"),metadata(raster)).unwrap();
 let framed=arch_source_frame(input(&wire(raster,g,rm["sourceHash"].as_str().unwrap(),[1.,0.,0.,-1.,-2.,-3.])),next(&mut g));
 ck!(framed!=0,"native raster frame");
 fs::write(out.join("raster-frame.arch"),bytes(framed)).unwrap();unsafe{arch_snapshot_release(framed);arch_snapshot_release(raster);}
 arch_raster_release(accepted);arch_raster_release(prepared);ck!(arch_raster_owned_bytes()==0,"native raster registry released");
 // Raw source guards are intentionally unchanged; do not reinterpret a
 // sub-grid triangle as a normalized Clipper owner.
 let tiny=Shape{contours:vec![vec![[0,0],[1,0],[0,1]]],fill_rule:0,color_rgba:0x000000ff,z0:0.,z1:0.2};
 ck!(matches!(build(&[tiny],1),Err(e) if e=="REGION_BELOW_BOOLEAN_RESOLUTION"),"raw tiny triangle still fails closed");
 fs::write(out.join("result.json"),serde_json::to_vec_pretty(&serde_json::json!({"status":"pass","checks":checks})).unwrap()).unwrap();
 println!("native source/frame checks: {}",checks.len());
}

