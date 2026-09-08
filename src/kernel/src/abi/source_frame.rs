//! Discrete source-frame isometries. No raw geometry or native pointer input.
use super::{STATE, CONTROL, Ordering, ROOT_BYTE_CAP};
use crate::{Snapshot, Part, Contour, Edge};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
const SCALE:i64=1_000_000;
const MAX:i64=10_000*SCALE;
const MIB:usize=1024*1024;
const WORK:usize=96*MIB;
const LIMIT:usize=200_000;
fn u32_at(b:&[u8],o:usize)->u32{u32::from_le_bytes(b[o..o+4].try_into().unwrap())}
fn i64_at(b:&[u8],o:usize)->i64{i64::from_le_bytes(b[o..o+8].try_into().unwrap())}
fn f64_at(b:&[u8],o:usize)->f64{f64::from_le_bytes(b[o..o+8].try_into().unwrap())}
fn hex(b:&[u8])->String{b.iter().map(|v|format!("{v:02x}")).collect()}
fn digest(b:&[u8])->String{hex(&Sha256::digest(b))}
fn check(g:u32,p:u32)->Result<(),String>{
 if g==0||CONTROL[0].load(Ordering::Acquire)!=g||CONTROL[1].load(Ordering::Acquire)!=1{return Err("STALE_GENERATION".into())}
 if CONTROL[3].load(Ordering::Acquire)==g{return Err("CANCELLED".into())}
 CONTROL[2].fetch_max(p.min(999),Ordering::AcqRel);Ok(())
}
struct Reservation;
impl Reservation{
 fn new()->Result<Self,String>{
  let mut s=STATE.lock().unwrap();
  if s.snapshots.len()>=8||s.next==u32::MAX||s.bytes+s.raster_reserved+WORK>ROOT_BYTE_CAP{return Err("SOURCE_FRAME_MEMORY_LIMIT".into())}
  s.raster_reserved+=WORK;Ok(Self)
 }
}
impl Drop for Reservation{fn drop(&mut self){STATE.lock().unwrap().raster_reserved-=WORK;}}

/// Round the exact binary64 rational times the integer scale, without a prior
/// floating-point multiplication (which could double-round a tie).
fn grid(v:f64)->Result<i64,String>{
 if !v.is_finite()||v.abs()>10000.{return Err("SOURCE_FRAME_TRANSLATION_RANGE".into())}
 let bits=v.to_bits();let exp=((bits>>52)&2047)as i32;
 let sig=(bits&((1u64<<52)-1))|if exp==0{0}else{1u64<<52};
 let numerator=(sig as u128)*(SCALE as u128);
 let shift=if exp==0{-1074}else{exp-1023-52};
 let rounded=if shift>=0{numerator.checked_shl(shift as u32).ok_or("SOURCE_FRAME_TRANSLATION_RANGE")?}
 else {
  let n=(-shift)as u32;
  if n>=128 {0} else {
   let whole=numerator>>n;let rem=numerator&((1u128<<n)-1);let half=1u128<<(n-1);
   whole+u128::from(rem>half||(rem==half&&whole&1==1))
  }
 };
 if rounded>MAX as u128{return Err("SOURCE_FRAME_TRANSLATION_RANGE".into())}
 Ok(if bits>>63==0{rounded as i64}else{-(rounded as i64)})
}
struct Frame{matrix:[f64;6],linear:[i64;4],translation:[i64;2],reflection:bool}
impl Frame{
 fn parse(b:&[u8])->Result<Self,String>{
  let mut m=[0.;6];for(i,v)in m.iter_mut().enumerate(){*v=f64_at(b,56+i*8);}
  if m[..4].iter().any(|&v|!matches!(v,-1.|0.|1.)){return Err("SOURCE_FRAME_ISOMETRY_REQUIRED".into())}
  let l=[m[0]as i64,m[1]as i64,m[2]as i64,m[3]as i64];
  if l[0].abs()+l[2].abs()!=1||l[1].abs()+l[3].abs()!=1||l[0].abs()+l[1].abs()!=1||l[2].abs()+l[3].abs()!=1{return Err("SOURCE_FRAME_ISOMETRY_REQUIRED".into())}
  Ok(Self{matrix:m,linear:l,translation:[grid(m[4])?,grid(m[5])?],reflection:l[0]*l[3]-l[1]*l[2]<0})
 }
 fn point(&self,x:i64,y:i64)->Result<[i64;2],String>{
  if x.unsigned_abs()>MAX as u64||y.unsigned_abs()>MAX as u64{return Err("SOURCE_FRAME_COORDINATE_RANGE".into())}
  let l=self.linear;let p=[l[0]*x+l[2]*y+self.translation[0],l[1]*x+l[3]*y+self.translation[1]];
  if p.iter().any(|v|v.abs()>MAX){return Err("SOURCE_FRAME_COORDINATE_RANGE".into())}Ok(p)
 }
}
fn span(b:&[u8],offset:usize,count:usize,stride:usize)->Result<usize,String>{
 let at=u32_at(b,offset)as usize;
 if at<128||at.checked_add(count*stride).is_none_or(|e|e>b.len()){return Err("SOURCE_FRAME_ARCH".into())}Ok(at)
}
fn transform(wire:&[u8],g:u32)->Result<(Snapshot,Vec<u8>),String>{
 check(g,1)?;
 if wire.len()!=112||u32_at(wire,0)!=0x52465341||u32_at(wire,4)!=1||u32_at(wire,8)!=112||u32_at(wire,12)!=0||wire[104..].iter().any(|&v|v!=0){return Err("SOURCE_FRAME_WIRE".into())}
 let frame=Frame::parse(wire)?;
 // Registry lock protects the exact original owner throughout the synchronous
 // read; cancellation only reads atomics, and no allocator registry re-enters.
 let s=STATE.lock().unwrap();let id=u32_at(wire,16);let sg=u32_at(wire,20);
 let src=s.snapshots.get(&id).ok_or("SOURCE_FRAME_HANDLE")?;
 let b=src.snapshot.bytes();
 if b.len()<128||u32_at(b,0)!=0x48435241||u32_at(b,4)!=1||u32_at(b,12)as usize!=b.len(){return Err("SOURCE_FRAME_ARCH".into())}
 if u32_at(b,16)!=sg{return Err("SOURCE_FRAME_GENERATION".into())}
 if src.product.is_some()||src.metadata.len()>2*MIB{return Err("SOURCE_FRAME_KIND".into())}
 let mut m:serde_json::Value=serde_json::from_slice(&src.metadata).map_err(|_|"SOURCE_FRAME_METADATA")?;
 if !matches!(m["kind"].as_str(),Some("svg"|"raster-source-context")){return Err("SOURCE_FRAME_KIND".into())}
 if m.get("sourceFrame").is_some(){return Err("SOURCE_FRAME_ALREADY_APPLIED".into())}
 if m["sourceHash"].as_str()!=Some(hex(&wire[24..56]).as_str()){return Err("SOURCE_FRAME_HASH".into())}
 let width=m["widthMm"].as_f64().ok_or("SOURCE_FRAME_DIMENSIONS")?;
 let height=m["heightMm"].as_f64().ok_or("SOURCE_FRAME_DIMENSIONS")?;
 if width<=0.||height<=0.{return Err("SOURCE_FRAME_DIMENSIONS".into())}
 let(w,h)=(grid(width)?,grid(height)?);
 let corners=[[0,0],[w,0],[w,h],[0,h]].map(|p|frame.point(p[0],p[1])).into_iter().collect::<Result<Vec<_>,_>>()?;
 let np=u32_at(b,32)as usize;let nc=u32_at(b,36)as usize;let ni=u32_at(b,40)as usize;let ne=u32_at(b,44)as usize;let nr=u32_at(b,28)as usize;
 if np==0||nc==0||ne==0||nr==0||nr>256||[np,nc,ni,ne].iter().any(|&n|n>LIMIT){return Err("SOURCE_FRAME_GEOMETRY_LIMIT".into())}
 let pa=span(b,56,nr,40)?;let po=span(b,60,np,16)?;let co=span(b,64,nc,16)?;let io=span(b,68,ni,4)?;let eo=span(b,72,ne,16)?;
 let mut points=Vec::with_capacity(np*2);
 for i in 0..np{if i%1024==0{check(g,50+((i*200)/np)as u32)?}points.extend(frame.point(i64_at(b,po+i*16),i64_at(b,po+i*16+8))?);}
 let mut parts=Vec::with_capacity(nr);
 for i in 0..nr{
  let at=pa+i*40;let first=u32_at(b,at+24);let n=u32_at(b,at+28);let color=u32_at(b,at+16);
  if n==0||first as usize+n as usize>nc||color&255!=255{return Err("SOURCE_FRAME_PART".into())}
  parts.push(Part{color_rgba:color,source_index:u32_at(b,at+20),contour_start:first,contour_count:n,..Default::default()});
 }
 let mut indices=Vec::with_capacity(ni);for i in 0..ni{let p=u32_at(b,io+4*i);if p as usize>=np{return Err("SOURCE_FRAME_INDEX".into())}indices.push(p);}
 let mut contours=Vec::with_capacity(nc);let mut position=0;let mut incidence=BTreeMap::<(u32,u32),(u32,u32)>::new();
 for i in 0..nc{
  if i%256==0{check(g,300+((i*350)/nc)as u32)?}
  let at=co+16*i;let first=u32_at(b,at)as usize;let n=u32_at(b,at+4)as usize;let owner=u32_at(b,at+8);
  if first!=position||n<3||first+n>ni||owner as usize>=nr||u32_at(b,at+12)!=0{return Err("SOURCE_FRAME_CONTOUR".into())}
  let part=&parts[owner as usize];if i<part.contour_start as usize||i>=(part.contour_start+part.contour_count)as usize{return Err("SOURCE_FRAME_PART".into())}
  if frame.reflection{indices[first..first+n].reverse();}
  let mut area=0i128;
  for j in 0..n{
   let a=indices[first+j];let z=indices[first+(j+1)%n];if a==z{return Err("SOURCE_FRAME_TOPOLOGY".into())}
   area+=(points[a as usize*2]as i128)*(points[z as usize*2+1]as i128)-(points[z as usize*2]as i128)*(points[a as usize*2+1]as i128);
   if incidence.insert((a,z),(owner,u32::MAX)).is_some(){return Err("SOURCE_FRAME_TOPOLOGY".into())}
  }
  if area==0{return Err("SOURCE_FRAME_TOPOLOGY".into())}
  contours.push(Contour{index_start:first as u32,index_count:n as u32,part:owner,reserved:0});position=first+n;
 }
 if position!=ni{return Err("SOURCE_FRAME_CONTOUR".into())}
 let mut edges=Vec::with_capacity(ne);
 for i in 0..ne{
  if i%1024==0{check(g,700+((i*150)/ne)as u32)?}
  let at=eo+16*i;let mut a=u32_at(b,at);let mut z=u32_at(b,at+4);let p=u32_at(b,at+8);let q=u32_at(b,at+12);
  if frame.reflection{std::mem::swap(&mut a,&mut z);}
  if incidence.remove(&(a,z))!=Some((p,u32::MAX)){return Err("SOURCE_FRAME_INCIDENCE".into())}
  if q!=u32::MAX&&(q==p||incidence.remove(&(z,a))!=Some((q,u32::MAX))){return Err("SOURCE_FRAME_INCIDENCE".into())}
  edges.push(Edge{point_a:a,point_b:z,part_a:p,part_b:q});
 }
 if !incidence.is_empty(){return Err("SOURCE_FRAME_INCIDENCE".into())}
 check(g,900)?;
 let result=Snapshot::new(g,&[],&[],&parts,&points,&contours,&indices,&edges)?;
 m["planarContextOnly"]=true.into();m["sourceAssemblyRequired"]=true.into();
 m["sourceFrame"]=serde_json::json!({
  "version":"arch-source-frame/1","requestedMatrix":frame.matrix,"linearMatrix":frame.linear,
  "translationGrid":frame.translation,"gridScalePerMm":SCALE,"rounding":"binary64-exact-nearest-ties-even/1",
  "translationErrorUpperMmPerAxis":0.0000005,"sourceSnapshotId":id,"sourceSnapshotGeneration":sg,
  "sourceSnapshotSha256":digest(b),"sourceMetadataSha256":digest(&src.metadata),
  "geometrySha256":digest(result.bytes()),"requestSha256":digest(wire),
  "domainCornersGrid":corners,"totalErrorBoundMm":null
 });
 let metadata=serde_json::to_vec(&m).map_err(|_|"SOURCE_FRAME_METADATA")?;
 if metadata.len()>2*MIB{return Err("SOURCE_FRAME_METADATA_LIMIT".into())}
 check(g,990)?;Ok((result,metadata))
}
#[unsafe(no_mangle)] pub extern "C" fn arch_source_frame_version()->u32{1}
#[unsafe(no_mangle)] pub extern "C" fn arch_source_frame(input:u32,generation:u32)->u32{
 let bytes=STATE.lock().unwrap().inputs.remove(&input);
 let result=(||{
  let b=bytes.ok_or("INPUT_HANDLE_INVALID")?;let _charge=super::raster_runtime::InputCharge(b.capacity());
  check(generation,0)?;let _reserve=Reservation::new()?;
  transform(&b,generation)
 })();
 match result{Ok((snapshot,metadata))=>super::publish_metadata(Ok(snapshot),metadata,generation),
  Err(e)=>super::publish_metadata(Err(e),Vec::new(),generation)}
}
#[cfg(test)] mod tests{
 use super::*;
 #[test]fn exact_grid_ties_and_adjacent_values(){
  // Binary64 1/128 mm times 1e6 =7812.5 exactly; even7812.
  assert_eq!(grid(1./128.).unwrap(),7812);assert_eq!(grid(3./128.).unwrap(),23438);
  assert_eq!(grid(-1./128.).unwrap(),-7812);assert_eq!(grid(-3./128.).unwrap(),-23438);
  let v=1f64/128.;assert_eq!(grid(f64::from_bits(v.to_bits()-1)).unwrap(),7812);assert_eq!(grid(f64::from_bits(v.to_bits()+1)).unwrap(),7813);
  assert_eq!(grid(f64::from_bits(1)).unwrap(),0);assert_eq!(grid(-0.).unwrap(),0);
  assert_eq!(grid(10000.).unwrap(),MAX);assert!(grid(f64::NAN).is_err());assert!(grid(f64::INFINITY).is_err());
 }
}

