use std::{ffi::{c_void,CStr,CString},fs,path::PathBuf};
unsafe extern "C" {
 fn arch_abi_version()->u32;
 fn arch_control_reset(g:u32)->u32;
 fn arch_test_fixture(i:u32,g:u32)->u32;
 fn arch_snapshot_ptr(id:u32)->*const u8;
 fn arch_snapshot_len(id:u32)->u32;
 fn arch_snapshot_release(id:u32)->u32;
 fn arch_snapshot_acquire(id:u32)->*const u8;
 fn arch3mf_create()->*mut c_void;
 fn arch3mf_destroy(p:*mut c_void);
 fn arch3mf_error(p:*mut c_void)->*const i8;
 fn arch3mf_add_material(p:*mut c_void,name:*const i8,color:u32)->i32;
 fn arch3mf_add_snapshot_part(p:*mut c_void,id:u32,g:u32,part:u32,name:*const i8,mat:u32)->i32;
 fn arch3mf_finish(p:*mut c_void)->i32;
 fn arch3mf_bytes(p:*mut c_void)->*const u8;
 fn arch3mf_size(p:*mut c_void)->u32;
 fn hb_version_string()->*const i8;
}
fn main(){
 assert_eq!(arch_kernel::quantize_mm(1.0).unwrap(),1_000_000);
 let out=PathBuf::from(std::env::args().nth(1).expect("own-run output path"));fs::create_dir_all(&out).unwrap();
 unsafe {
  assert_eq!(arch_abi_version(),2);
  let hb=CStr::from_ptr(hb_version_string()).to_str().unwrap();println!("Same native image HarfBuzz: {hb}");
  for (fixture,name) in ["hole","seam","t-junction"].iter().enumerate(){
   let g=fixture as u32+1;assert_eq!(arch_control_reset(g),1);
   let id=arch_test_fixture(fixture as u32,g);assert_ne!(id,0);
   let ptr=arch_snapshot_ptr(id);let len=arch_snapshot_len(id);
   let raw=std::slice::from_raw_parts(ptr,len as usize);
   let word=|o:usize|u32::from_le_bytes(raw[o..o+4].try_into().unwrap());
   let np=word(28);let po=word(56) as usize;
   let c=arch3mf_create();assert!(!c.is_null());
   for i in 0..np {
    let label=CString::new(format!("part-{i}")).unwrap();
    assert!(arch3mf_add_material(c,label.as_ptr(),word(po+i as usize*40+16))>=0);
   }
   for i in 0..np {
    let label=CString::new(format!("part-{i}")).unwrap();
    assert!(arch3mf_add_snapshot_part(c,id,g,i,label.as_ptr(),i)>0);
   }
   assert_eq!(arch3mf_finish(c),0,"{}",CStr::from_ptr(arch3mf_error(c)).to_string_lossy());
   let data=std::slice::from_raw_parts(arch3mf_bytes(c),arch3mf_size(c) as usize);
   fs::write(out.join(format!("native-unified-{name}.3mf")),data).unwrap();
   arch3mf_destroy(c);
   // Success already supplied the primary lease: no acquire on this path.
   assert_eq!(arch_snapshot_release(id),1);assert!(arch_snapshot_ptr(id).is_null());assert_eq!(arch_snapshot_release(id),0);
  }
  assert_eq!(arch_control_reset(4),1);let id=arch_test_fixture(0,4);assert_ne!(id,0);
  assert!(!arch_snapshot_acquire(id).is_null()); // Explicit SECOND reader, separate release.
  let c=arch3mf_create();let label=CString::new("part").unwrap();
  assert_eq!(arch3mf_add_material(c,label.as_ptr(),0x0080ffff),0);
  assert!(arch3mf_add_snapshot_part(c,id,5,0,label.as_ptr(),0)<0);
  assert!(CStr::from_ptr(arch3mf_error(c)).to_str().unwrap().contains("SNAPSHOT_GENERATION"));
  assert_eq!(arch3mf_size(c),0);arch3mf_destroy(c);
  assert_eq!(arch_snapshot_release(id),1);assert!(!arch_snapshot_ptr(id).is_null());
  assert_eq!(arch_snapshot_release(id),1);assert!(arch_snapshot_ptr(id).is_null());
  println!("Native unified pass: 3 exports, generation rejection, primary/additional leases.");
 }
}
