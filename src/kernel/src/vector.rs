use std::{collections::{BTreeMap,BTreeSet}, ffi::{c_char,CStr}, ptr, slice};
use arch_vector_source::{Contour,FillRule,ManufacturingStatus,ParseOptions,VectorDocument,parse_svg};
use crate::{Snapshot,BuildControl,checkpoint,quantize_mm,snapshot_from_scene};

unsafe extern "C"{
    fn arch_region_create(xy:*const i64,np:u32,ends:*const u32,nc:u32,rule:u32,error:*mut c_char,cap:u32)->*mut u8;
    fn arch_region_boolean(a:*const u8,b:*const u8,op:u32,error:*mut c_char,cap:u32)->*mut u8;
    fn arch_region_view(region:*const u8,xy:*mut *const i64,np:*mut u32,ends:*mut *const u32,nc:*mut u32)->i32;
    fn arch_region_destroy(region:*mut u8);
    fn arch_region_scene_abi_version()->u32;
    fn arch_scene_build_regions_controlled(regions:*const *const u8,count:u32,colors:*const u32,
        z0:*const f64,z1:*const f64,control:*const BuildControl,error:*mut c_char,cap:u32)->*mut u8;
}
struct Region(*mut u8);
impl Drop for Region{fn drop(&mut self){unsafe{arch_region_destroy(self.0);}}}
impl Region{
    fn result(raw:*mut u8,error:&[c_char;256])->Result<Self,String>{
        if raw.is_null(){Err(unsafe{CStr::from_ptr(error.as_ptr())}.to_string_lossy().into_owned())}else{Ok(Self(raw))}
    }
    fn new(contours:&[Contour],rule:FillRule,scale:f64)->Result<Self,String>{
        let mut xy=Vec::new();let mut ends=Vec::new();
        for contour in contours {
            if contour.len()<3||xy.len()/2+contour.len()>200000{return Err("VECTOR_COMPLEXITY_LIMIT".into());}
            for p in contour{xy.push(quantize_mm(p[0]*scale)?);xy.push(quantize_mm(p[1]*scale)?);}
            ends.push((xy.len()/2) as u32);
        }
        let mut error=[0 as c_char;256];
        Self::result(unsafe{arch_region_create(xy.as_ptr(),(xy.len()/2) as u32,ends.as_ptr(),ends.len() as u32,if rule==FillRule::Evenodd{1}else{0},error.as_mut_ptr(),256)},&error)
    }
    fn boolean(&self,other:&Self,operation:u32)->Result<Self,String>{
        let mut error=[0 as c_char;256];Self::result(unsafe{arch_region_boolean(self.0,other.0,operation,error.as_mut_ptr(),256)},&error)
    }
    fn contours(&self)->Result<Vec<Vec<[i64;2]>>,String>{
        let (mut xy,mut ends)=(ptr::null(),ptr::null());let(mut np,mut nc)=(0,0);
        if unsafe{arch_region_view(self.0,&mut xy,&mut np,&mut ends,&mut nc)}!=1||np>200000||nc>200000{return Err("REGION_ABI_LIMIT".into());}
        if np==0&&nc==0{return Ok(Vec::new());}
        if xy.is_null()||ends.is_null()||nc==0{return Err("REGION_ABI_LAYOUT".into());}
        let xy=unsafe{slice::from_raw_parts(xy,np as usize*2)};let ends=unsafe{slice::from_raw_parts(ends,nc as usize)};
        let mut start=0;let mut contours=Vec::new();
        for end in ends{if *end<=start||*end>np{return Err("REGION_ABI_OFFSETS".into());}
            contours.push((start..*end).map(|p|[xy[p as usize*2],xy[p as usize*2+1]]).collect());start=*end;
        }
        if start!=np{return Err("REGION_ABI_OFFSETS".into());}Ok(contours)
    }
}

fn clip<'a>(id:&str,document:&'a VectorDocument,scale:f64,cache:&mut BTreeMap<String,Region>,active:&mut BTreeSet<String>)->Result<(),String>{
    if cache.contains_key(id){return Ok(());}
    if active.len()>=64||!active.insert(id.into()){return Err("CLIP_CYCLE_OR_DEPTH".into());}
    let definition=document.clips.iter().find(|c|c.id==id).ok_or("CLIP_REFERENCE_MISSING")?;
    let mut region=Region::new(&[],FillRule::Nonzero,scale)?;
    for part in &definition.parts{
        let mut value=Region::new(&part.contours,part.fill_rule,scale)?;
        for dependency in &part.clip_stack{clip(dependency,document,scale,cache,active)?;value=value.boolean(cache.get(dependency).unwrap(),1)?;}
        region=region.boolean(&value,0)?;
    }
    for dependency in &definition.clip_stack{clip(dependency,document,scale,cache,active)?;region=region.boolean(cache.get(dependency).unwrap(),1)?;}
    active.remove(id);cache.insert(id.into(),region);Ok(())
}

pub struct SvgBuild {
    pub snapshot:Snapshot,
    pub source:VectorDocument,
    pub scale:f64,
    pub paint_indices:Vec<usize>,
}
impl SvgBuild{
    pub fn metadata(&self)->serde_json::Value{
        serde_json::json!({"kind":"svg","sourceHash":self.source.source_hash,
            "widthMm":self.source.width_mm.map(|n|n*self.scale),"heightMm":self.source.height_mm.map(|n|n*self.scale),
            "scale":self.scale,"diagnostics":self.source.diagnostics,"importLedger":self.source.ledger,
            "integerGridMm":0.000001,"quantizationRule":"ties-to-even","totalErrorBoundMm":null,"regionPipeline":"owned-normalized-regions/1",
            "paints":self.paint_indices.iter().map(|i|{let s=&self.source.shapes[*i];serde_json::json!({"id":s.id,"color":s.color,"paintOrder":s.paint_order,"sourceId":s.provenance.source_id})}).collect::<Vec<_>>()})
    }
}

pub fn build_svg(svg:&str,thickness_mm:f64,long_edge_mm:Option<f64>,tolerance_mm:f64,generation:u32)->Result<SvgBuild,String>{
    build_svg_controlled(svg,thickness_mm,long_edge_mm,tolerance_mm,generation,None)
}
pub(crate) fn build_svg_controlled(svg:&str,thickness_mm:f64,long_edge_mm:Option<f64>,tolerance_mm:f64,generation:u32,control:Option<&BuildControl>)->Result<SvgBuild,String>{
    checkpoint(control,10)?;
    if !thickness_mm.is_finite()||thickness_mm<=0.||thickness_mm>10000.||!tolerance_mm.is_finite()||tolerance_mm<=0.||tolerance_mm>0.004{
        return Err("SVG_BUILD_OPTIONS".into());
    }
    let mut document=parse_svg(svg,ParseOptions{flatten_tolerance_mm:tolerance_mm,..Default::default()}).map_err(|e|format!("SVG_{:?}",e.code))?;
    checkpoint(control,75)?;
    if document.status!=ManufacturingStatus::Contours{return Err(format!("SVG_{:?}",document.status));}
    let size=document.width_mm.unwrap().max(document.height_mm.unwrap());
    let scale=match long_edge_mm {Some(n) if n.is_finite()&&n>0.&&n<=10000.=>n/size,None=>1.,_=>return Err("SVG_SIZE_RANGE".into())};
    if scale>1.{
        document=parse_svg(svg,ParseOptions{flatten_tolerance_mm:tolerance_mm/scale,..Default::default()}).map_err(|e|format!("SVG_{:?}",e.code))?;
        if document.status!=ManufacturingStatus::Contours{return Err("SVG_REPARSE_STATUS".into());}
    }
    let viewport=Region::new(&[document.viewport_clip.clone().ok_or("SVG_VIEWPORT_MISSING")?],FillRule::Nonzero,scale)?;
    let mut clips=BTreeMap::new();let mut active=BTreeSet::new();let mut regions=Vec::new();let mut colors=Vec::new();let mut paint_indices=Vec::new();
    for (index,shape) in document.shapes.iter().enumerate(){
        checkpoint(control,100+150*index as u32/document.shapes.len().max(1) as u32)?;
        let mut region=Region::new(&shape.contours,shape.fill_rule,scale)?;
        for dependency in &shape.clip_stack{clip(dependency,&document,scale,&mut clips,&mut active)?;region=region.boolean(clips.get(dependency).unwrap(),1)?;}
        region=region.boolean(&viewport,1)?;
        let contours=region.contours()?;
        if !contours.is_empty(){paint_indices.push(index);colors.push(u32::from_be_bytes(shape.color));regions.push(region);}
    }
    if regions.is_empty(){return Err("SVG_EMPTY_CLIPPED_GEOMETRY".into());}
    let pointers:Vec<*const u8>=regions.iter().map(|r|r.0.cast_const()).collect();
    let z0=vec![0.;regions.len()];let z1=vec![thickness_mm;regions.len()];let mut error=[0 as c_char;256];
    // Region owners (including all resolved clips) stay alive throughout the
    // synchronous native call. No raw integer paths can impersonate an owner.
    let raw=unsafe{
        if arch_region_scene_abi_version()!=1{return Err("REGION_SCENE_ABI_MISMATCH".into());}
        arch_scene_build_regions_controlled(pointers.as_ptr(),pointers.len()as u32,colors.as_ptr(),z0.as_ptr(),z1.as_ptr(),
            control.map_or(ptr::null(),|c|c as *const _),error.as_mut_ptr(),256)
    };
    Ok(SvgBuild{snapshot:snapshot_from_scene(raw,&error,generation)?,source:document,scale,paint_indices})
}
