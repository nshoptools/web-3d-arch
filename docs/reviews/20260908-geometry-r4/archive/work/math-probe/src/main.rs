#![allow(dead_code,improper_ctypes)]
struct BuildControl;struct Contour;struct Edge;
struct Part {vertex_start:u32,vertex_count:u32,triangle_start:u32,triangle_count:u32,color_rgba:u32,source_index:u32,contour_start:u32,contour_count:u32,volume_mm3:f64}
#[path="../../review-source/src/kernel/final-scene-export/rust/wire.rs"] mod wire;
fn check(_:u32,_:u32)->wire::Result<()> {Ok(())}
mod encode {
 include!("../../review-source/src/kernel/final-scene-export/rust/encode.rs");
 pub fn pair(v:Vec<[i128;3]>,a:[u32;3],b:[u32;3])->Result<bool>{fi_triangles_intersect(&v,a,b)}
 pub fn prepare_probe(v:&[f64],t:&[u32])->std::result::Result<serde_json::Value,String> {
  let c=Config {options:wire::Options{version:1,size:208,format:1,error:0.004,vertices:65536,triangles:131072,groups:1,output_bytes:16*1024*1024,working_bytes:128*1024*1024,..Default::default()},mapping:vec![wire::Material{part:0,slot:1,rgba:0xffffffff,source:0,material_source:1,reserved:0}],filename:"probe".into(),generation:1,verdict:1,revision:1};
  let group=wire::Group{slot:1,rgba:0xffffffff,nv:v.len()as u32/3,nt:t.len()as u32/3,nm:1,volume:1.,..Default::default()};let member=[0u32];
  let view=wire::View{version:1,size:std::mem::size_of::<wire::View>()as u32,format:1,nv:group.nv,nt:group.nt,ng:1,nm:1,vertices:v.as_ptr(),triangles:t.as_ptr(),groups:&group,members:member.as_ptr(),..Default::default()};
  prepare_float_conditioning(&c,&view,&"0".repeat(64),FloatConditioningOptions{version:1,maximum_displacement_mm:0.004,work_limit:50_000_000},1).map(|p|p.metadata())
 }
}
fn main(){use std::io::{self,BufRead,Write};let mut out=io::BufWriter::new(io::stdout().lock());for l in io::stdin().lock().lines(){let l=l.unwrap();let x:serde_json::Value=serde_json::from_str(&l).unwrap();let r=if x["kind"]=="prepare"{let v:Vec<f64>=serde_json::from_value(x["v"].clone()).unwrap();let t:Vec<u32>=serde_json::from_value(x["t"].clone()).unwrap();encode::prepare_probe(&v,&t).map(|m|serde_json::json!({"ok":true,"metadata":m})).unwrap_or_else(|e|serde_json::json!({"ok":false,"error":e}))}else{let v=serde_json::from_value(x["v"].clone()).unwrap();let a=serde_json::from_value(x["a"].clone()).unwrap();let b=serde_json::from_value(x["b"].clone()).unwrap();match encode::pair(v,a,b){Ok(r)=>serde_json::json!({"intersect":r}),Err(e)=>serde_json::json!({"error":e})}};writeln!(out,"{}",r).unwrap();out.flush().unwrap();}}
