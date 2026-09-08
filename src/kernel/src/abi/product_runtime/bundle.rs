//! Multiple already-built root contexts keep prepared text separate from the
//! main paint partition. All sources are registered leases, never mesh JSON.
use super::*;
pub(super) fn combine(bytes:&[u8],g:u32)->Result<(Snapshot,Vec<u8>),String>{
 if bytes.len()<8||!matches!(u32_at(bytes,0),1|2){return Err("PRODUCT_CONTEXTS_VERSION".into())}
 let version=u32_at(bytes,0);let stride=if version==1{40}else{56};
 let count=u32_at(bytes,4)as usize;
 if count==0||count>33||bytes.len()!=8+stride*count{return Err("PRODUCT_CONTEXTS_LIMIT".into())}
 let mut points=Vec::new();let mut contours=Vec::new();let mut indices=Vec::new();let mut parts=Vec::new();let mut contexts=Vec::new();
 let mut seen=std::collections::BTreeSet::new();
 let s=STATE.lock().unwrap();
 for slot in 0..count{
  check(g,20)?;
  let id=u32_at(bytes,8+stride*slot);let generation=u32_at(bytes,12+stride*slot);
  let translation=if version==2{
   [i64::from_le_bytes(bytes[48+stride*slot..56+stride*slot].try_into().unwrap()),
    i64::from_le_bytes(bytes[56+stride*slot..64+stride*slot].try_into().unwrap())]
  }else{[0,0]};
  if translation.iter().any(|v|*v < -10000000000||*v > 10000000000){return Err("PRODUCT_CONTEXT_TRANSLATION_RANGE".into())}
  if !seen.insert(id){return Err("PRODUCT_CONTEXT_DUPLICATE".into())}
  let src=s.snapshots.get(&id).ok_or("PRODUCT_SOURCE_HANDLE")?;
  let b=src.snapshot.bytes();if src.product.is_some()||u32_at(b,16)!=generation{return Err("PRODUCT_SOURCE_GENERATION_OR_KIND".into())}
  let m=metadata_valid(&src.metadata)?;
  if m["kind"]=="product-source-bundle"{return Err("PRODUCT_CONTEXT_NESTING".into())}
  let h=unhex(m["sourceHash"].as_str().ok_or("PRODUCT_SOURCE_HASH_MISSING")?)?;
  if h!=bytes[16+stride*slot..48+stride*slot]{return Err("PRODUCT_SOURCE_HASH_MISMATCH".into())}
  let np=u32_at(b,32)as usize;let nc=u32_at(b,36)as usize;let ni=u32_at(b,40)as usize;let nr=u32_at(b,28)as usize;
  if points.len()/2+np>200000||contours.len()+nc>200000||indices.len()+ni>200000||parts.len()+nr>256{return Err("PRODUCT_COMBINED_GEOMETRY_LIMIT".into())}
  let (po,co,io,pa)=(points.len()/2,contours.len(),indices.len(),parts.len());
  let point_at=u32_at(b,60)as usize;let contour_at=u32_at(b,64)as usize;let index_at=u32_at(b,68)as usize;let part_at=u32_at(b,56)as usize;
  if point_at+np*16>b.len()||contour_at+nc*16>b.len()||index_at+ni*4>b.len()||part_at+nr*40>b.len(){return Err("PRODUCT_CONTEXT_ARCH".into())}
  for i in 0..np*2{
   if i%2048==0{check(g,20)?;}
   let original=i64::from_le_bytes(b[point_at+8*i..point_at+8*i+8].try_into().unwrap());
   let value=original.checked_add(translation[i%2]).ok_or("PRODUCT_CONTEXT_TRANSLATION_OVERFLOW")?;
   if !(-10000000000..=10000000000).contains(&original)||!(-10000000000..=10000000000).contains(&value){return Err("PRODUCT_CONTEXT_COORDINATE_RANGE".into())}
   points.push(value);
  }
  for i in 0..nc{
   let at=contour_at+16*i;let first=u32_at(b,at)as usize;let n=u32_at(b,at+4)as usize;let owner=u32_at(b,at+8)as usize;
   if first+n>ni||owner>=nr||n<3{return Err("PRODUCT_CONTEXT_CONTOUR".into())}
   contours.push(crate::Contour{index_start:(io+first)as u32,index_count:n as u32,part:(pa+owner)as u32,reserved:0});
  }
  for i in 0..ni{let v=u32_at(b,index_at+4*i)as usize;if v>=np{return Err("PRODUCT_CONTEXT_INDEX".into())}indices.push((po+v)as u32);}
  for i in 0..nr{
   let at=part_at+40*i;let source=u32_at(b,at+20);let first=u32_at(b,at+24)as usize;let n=u32_at(b,at+28)as usize;
   if source>=4096||first+n>nc{return Err("PRODUCT_CONTEXT_PART".into())}
   parts.push(crate::Part{color_rgba:u32_at(b,at+16),source_index:((slot as u32)*4096)+source,contour_start:(co+first)as u32,contour_count:n as u32,..Default::default()});
  }
  contexts.push(serde_json::json!({"slot":slot,"generation":generation,"canonicalHash":hex(&hash(&[b"arch-product-source-v1\0",b,&src.metadata])),"metadata":m,"translationNm":translation.map(|n|n.to_string()),"translationErrorBoundMm":0,"transformation":"integer-nm-translation-v1"}));
 }
 let source_hash=contexts[0]["metadata"]["sourceHash"].clone();
 let metadata=serde_json::to_vec(&serde_json::json!({"kind":"product-source-bundle","sourceHash":source_hash,"contexts":contexts,"totalErrorBoundMm":null})).map_err(|_|"PRODUCT_SOURCE_METADATA")?;
 if metadata.len()>2*MIB{return Err("PRODUCT_SOURCE_METADATA_LIMIT".into())}
 Ok((Snapshot::new(g,&[],&[],&parts,&points,&contours,&indices,&[])?,metadata))
}
