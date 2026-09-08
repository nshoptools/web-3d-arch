use std::ffi::{c_char,c_void};
use super::{Result,Value};
#[repr(C)] pub struct Binding{pub semantic:u64,pub source:u64,pub provenance:u64,pub source_index:u32,pub material:u32}
#[repr(C)] pub struct Material{pub id:u64,pub rgba:u32,pub slot:u32}
#[repr(C)] pub struct Request{
 pub abi:u32,pub operation:u32,pub policy:u32,pub generation:u32,pub revision:u64,pub feature:u64,
 pub snapshot:u32,pub source_generation:u32,pub importer:u32,pub reserved:u32,pub arch:*const u8,
 pub arch_bytes:u32,pub part_count:u32,pub bindings:*const Binding,pub materials:*const Material,
 pub material_count:u32,pub target_count:u32,pub targets:*const u64,pub transform:*const f64,
 pub tolerance:f64,pub max_vertices:u32,pub max_triangles:u32,pub max_parts:u32,pub max_operations:u32,
 pub provenance:*const c_char,pub provenance_bytes:u32,
}
#[repr(C)] pub struct Control{
 pub data:*mut c_void,pub current:extern "C" fn(*mut c_void,u32,u64)->u32,
 pub cancelled:extern "C" fn(*mut c_void)->u32,pub progress:extern "C" fn(*mut c_void,u32)
}
#[repr(C)] #[derive(Default)] pub struct View{
 pub abi:u32,pub verdict:u32,pub final_gates:u32,pub reserved:u32,
 pub vertices:*const f64,pub triangles:*const u32,pub parts:*const crate::Part,pub origins:*const u32,
 pub vertex_count:u32,pub triangle_count:u32,pub part_count:u32,pub origin_count:u32,
 pub report:*const c_char,pub report_bytes:u32,pub confirmation:*const u8,pub confirmation_bytes:u32
}
unsafe extern "C"{
 pub fn archmi_publishable(id:u32)->u32;
 pub fn archmi_acquire(id:u32)->u32;
 pub fn archmi_release(id:u32)->u32;
 pub fn archmi_source_at_ptr(id:u32,index:u32)->*const u8;
 pub fn archmi_source_len(id:u32)->u32;
 pub fn archmi_vertex_count(id:u32)->u32;
 pub fn archmi_face_count(id:u32)->u32;
 pub fn archmi_part_count(id:u32)->u32;
 pub fn archmi_vertices(id:u32)->*const f64;
 pub fn archmi_triangles(id:u32)->*const u32;
 pub fn archmi_parts(id:u32)->*const crate::Part;
 pub fn archmi_report(id:u32)->*const c_char;
 pub fn archmi_report_len(id:u32)->u32;
 pub fn archcsg_operation_mask()->u32;
 pub fn archcsg_compute(request:*const Request,control:*const Control)->u32;
 pub fn archcsg_view(id:u32,view:*mut View)->u32;
 pub fn archcsg_release(id:u32)->u32;
 pub fn archcsg_source_ptr(id:u32,source:u32)->*const u8;
 pub fn archcsg_source_len(id:u32,source:u32)->u32;
 pub fn archcsg_error()->*const c_char;
 pub fn arch_product_native_take_guard(id:*mut u8)->*mut c_void;
 pub fn arch_mech_guard_charge(guard:*const c_void)->u64;
 pub fn arch_mech_guard_destroy(guard:*mut c_void);
 pub fn arch_mesh_check_final(guard:*const c_void,csg:u32,owners:*const u32,groups:*const u32,count:u32,generation:u32,report:*mut c_char,cap:u32)->u32;
}
pub fn u32(b:&[u8],at:usize)->u32{u32::from_le_bytes(b[at..at+4].try_into().unwrap())}
pub fn u64(b:&[u8],at:usize)->u64{u64::from_le_bytes(b[at..at+8].try_into().unwrap())}
pub fn number(v:&Value)->Result<u32>{v.as_u64().filter(|&n|n<=u32::MAX as u64).map(|n|n as u32).ok_or("MESH_INTEGER".into())}
pub fn id(v:&Value)->Result<u64>{
 let s=v.as_str().ok_or("MESH_ID_STRING")?;let n=s.parse::<u64>().map_err(|_|"MESH_ID_RANGE")?;
 if n==0||n.to_string()!=s{return Err("MESH_ID_CANONICAL".into())}Ok(n)
}
pub fn hash_text(v:&Value)->Result<&str>{
 let s=v.as_str().ok_or("MESH_HASH_REQUIRED")?;
 if s.len()!=64||!s.bytes().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(&c)){return Err("MESH_HASH_FORMAT".into())}Ok(s)
}
pub fn table(b:&[u8],tag:u32,stride:usize)->Result<&[u8]>{
 if b.len()<656||u32(b,0)!=0x534d5041||u32(b,4)!=1||u32(b,12)>25{return Err("MESH_PRODUCT_METADATA".into())}
 for i in 0..u32(b,12)as usize{
  let at=256+i*16;if u32(b,at)==tag{
   let n=u32(b,at+8)as usize;let start=u32(b,at+12)as usize;
   if u32(b,at+4)as usize!=stride||start>b.len()||n.checked_mul(stride).is_none_or(|n|n>b.len()-start){return Err("MESH_PRODUCT_TABLE".into())}
   return Ok(&b[start..start+n*stride])
  }
 }Err("MESH_PRODUCT_TABLE_MISSING".into())
}
pub fn matrix(v:&Value)->Result<[f64;12]>{
 let a=v.as_array().filter(|a|a.len()==12).ok_or("MESH_EXPLICIT_TRANSFORM_REQUIRED")?;let mut m=[0.;12];
 for(i,v)in a.iter().enumerate(){m[i]=v.as_f64().filter(|n|n.is_finite()&&n.abs()<=10000.).ok_or("MESH_TRANSFORM_DOMAIN")?;}
 Ok(m)
}
pub fn matrix_hex(m:&[f64;12])->String{m.iter().flat_map(|v|v.to_le_bytes()).map(|v|format!("{v:02x}")).collect()}

// JSON numbers cannot carry negative zero through every transport. The exact
// approved LE coefficients are authoritative; the display array must be equal
// numerically, and every coefficient remains bounded/finite.
pub fn exact_matrix(v:&Value,bits:&Value)->Result<[f64;12]>{
 let shown=matrix(v)?;let s=bits.as_str().filter(|s|s.len()==192).ok_or("MESH_TRANSFORM_APPROVAL_MISMATCH")?;
 if !s.is_ascii(){return Err("MESH_TRANSFORM_APPROVAL_MISMATCH".into())}
 let mut m=[0.;12];
 for i in 0..12{
  let mut b=[0u8;8];
  for j in 0..8{b[j]=u8::from_str_radix(&s[i*16+j*2..i*16+j*2+2],16).map_err(|_|"MESH_TRANSFORM_APPROVAL_MISMATCH")?;}
  m[i]=f64::from_le_bytes(b);
  if !m[i].is_finite()||m[i]!=shown[i]||m[i].abs()>10000.{return Err("MESH_TRANSFORM_APPROVAL_MISMATCH".into())}
 }
 if matrix_hex(&m)!=s{return Err("MESH_TRANSFORM_APPROVAL_MISMATCH".into())}Ok(m)
}
