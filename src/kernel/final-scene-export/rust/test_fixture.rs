use super::wire::{self,SceneView};
use std::ptr;
unsafe extern "C" {
 fn arch_final_fixture_create(index:u32)->*mut u8;
 fn arch_final_fixture_view(handle:*const u8,view:*mut SceneView)->u32;
 fn arch_final_fixture_destroy(handle:*mut u8);
}
struct Fixture(*mut u8);
impl Drop for Fixture{fn drop(&mut self){unsafe{arch_final_fixture_destroy(self.0)}}}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_test_stats(kind:u32)->u32{
 if kind==4{return super::OUTPUTS.lock().unwrap().len()as u32}
 let s=super::STATE.lock().unwrap();match kind{0=>s.bytes as u32,1=>s.snapshots.len()as u32,2=>s.inputs.len()as u32,3=>s.outputs.len()as u32,_=>u32::MAX}
}
#[unsafe(no_mangle)] pub extern "C" fn arch_final_test_fixture(index:u32,generation:u32)->u32{
 let result=(||{
  super::check(generation,0)?;
  let handle=unsafe{arch_final_fixture_create(index)};if handle.is_null(){return Err("UNKNOWN_FINAL_FIXTURE".into())}let fixture=Fixture(handle);
  let mut v=SceneView{version:0,nv:0,nt:0,np:0,nxy:0,nc:0,ni:0,ne:0,vertices:ptr::null(),triangles:ptr::null(),parts:ptr::null(),points:ptr::null(),contours:ptr::null(),indices:ptr::null(),edges:ptr::null()};
  if unsafe{arch_final_fixture_view(fixture.0,&mut v)}!=1{return Err("FINAL_FIXTURE_VIEW".into())}
  unsafe{crate::Snapshot::new(generation,wire::borrow(v.vertices,v.nv as usize*3)?,wire::borrow(v.triangles,v.nt as usize*3)?,wire::borrow(v.parts,v.np as usize)?,&[],&[],&[],&[])}
 })();
 super::super::publish(result,generation)
}
