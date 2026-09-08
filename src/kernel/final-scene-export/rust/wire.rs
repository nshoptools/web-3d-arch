use std::{ffi::c_char,ptr};
pub(super) type Result<T> = std::result::Result<T,String>;
#[repr(C)]
#[derive(Clone,Copy,Default)]
pub(super) struct Options {
    pub version:u32,pub size:u32,pub format:u32,pub orientation:u32,
    pub rest:u32,pub section_mode:u32,pub side:u32,pub color:u32,
    pub units:u32,pub inspection:u32,pub reserved0:u32,pub reserved1:u32,
    pub z0:f64,pub z1:f64,pub step:f64,pub error:f64,pub matrix:[f64;12],
    pub vertices:u32,pub triangles:u32,pub groups:u32,pub sections:u32,
    pub points:u32,pub output_bytes:u32,pub working_bytes:u32,pub reserved2:u32,
}
#[repr(C)]
#[derive(Clone,Copy,Debug,Default)]
pub(super) struct Material {pub part:u32,pub slot:u32,pub rgba:u32,pub source:u32,pub material_source:u32,pub reserved:u32}
#[repr(C)]
#[derive(Clone,Copy,Debug,Default)]
pub(super) struct Group {pub slot:u32,pub rgba:u32,pub v0:u32,pub nv:u32,pub t0:u32,pub nt:u32,pub m0:u32,pub nm:u32,pub volume:f64}
#[repr(C)]
#[derive(Clone,Copy,Debug,Default)]
pub(super) struct Section {pub sample:u32,pub group:u32,pub c0:u32,pub nc:u32,pub z:f64,pub area:f64}
#[repr(C)]
#[derive(Clone,Copy,Default)]
pub(super) struct Contour {pub p0:u32,pub np:u32,pub section:u32,pub reserved:u32}
#[repr(C)]
pub(super) struct View {
    pub version:u32,pub size:u32,pub format:u32,pub warnings:u32,
    pub nv:u32,pub nt:u32,pub ng:u32,pub nm:u32,pub ns:u32,pub nc:u32,pub np:u32,pub reserved:u32,
    pub transform:[f64;12],pub bounds:[f64;6],pub volume_sum:f64,pub union_volume:f64,pub library_tolerance:f64,
    pub vertices:*const f64,pub triangles:*const u32,pub groups:*const Group,pub members:*const u32,
    pub sections:*const Section,pub contours:*const Contour,pub points:*const f64,
}
impl Default for View {fn default()->Self {Self {version:0,size:0,format:0,warnings:0,nv:0,nt:0,ng:0,nm:0,ns:0,nc:0,np:0,reserved:0,transform:[0.;12],bounds:[0.;6],volume_sum:0.,union_volume:0.,library_tolerance:0.,vertices:ptr::null(),triangles:ptr::null(),groups:ptr::null(),members:ptr::null(),sections:ptr::null(),contours:ptr::null(),points:ptr::null()}}}
#[repr(C)]
pub(super) struct SceneView {
    pub version:u32,pub nv:u32,pub nt:u32,pub np:u32,pub nxy:u32,pub nc:u32,pub ni:u32,pub ne:u32,
    pub vertices:*const f64,pub triangles:*const u32,pub parts:*const crate::Part,
    pub points:*const i64,pub contours:*const crate::Contour,pub indices:*const u32,pub edges:*const crate::Edge,
}
unsafe extern "C" {
    pub(super) fn arch_final_native_abi_version()->u32;
    pub(super) fn arch_final_native_layout(kind:u32)->u32;
    pub(super) fn arch_final_scene_prepare(scene:*const SceneView,material:*const Material,nm:u32,options:*const Options,
      control:*const crate::BuildControl,error:*mut c_char,capacity:u32)->*mut u8;
    pub(super) fn arch_final_scene_view(result:*const u8,view:*mut View)->u32;
    pub(super) fn arch_final_scene_destroy(result:*mut u8);
}
pub(super) struct Native(pub *mut u8);
impl Drop for Native {fn drop(&mut self){unsafe {arch_final_scene_destroy(self.0)}}}
pub(super) fn layout()->Result<()> {
    let expected=[size_of::<Options>(),size_of::<Material>(),size_of::<Group>(),size_of::<Section>(),size_of::<Contour>(),size_of::<View>(),std::mem::offset_of!(View,vertices)];
    if unsafe{arch_final_native_abi_version()}!=1||expected.iter().enumerate().any(|(i,&n)|unsafe{arch_final_native_layout(i as u32)}!=n as u32){return Err("FINAL_NATIVE_ABI_MISMATCH".into())}Ok(())
}
pub(super) fn u32at(b:&[u8],i:usize)->u32 {u32::from_le_bytes(b[i..i+4].try_into().unwrap())}
fn u64at(b:&[u8],i:usize)->u64 {u64::from_le_bytes(b[i..i+8].try_into().unwrap())}
pub(super) fn f64at(b:&[u8],i:usize)->f64 {f64::from_le_bytes(b[i..i+8].try_into().unwrap())}
pub(super) struct Config {pub options:Options,pub mapping:Vec<Material>,pub filename:String,pub generation:u32,pub verdict:u32,pub revision:u64}
pub(super) fn parse(b:&[u8])->Result<Config> {
    if b.len()<256||u32at(b,208)!=0x58454641||u32at(b,212)!=1{return Err("EXPORT_WIRE_VERSION".into())}
    let u:Vec<u32>=(0..12).map(|i|u32at(b,4*i)).collect();let mut matrix=[0.;12];for(i,v)in matrix.iter_mut().enumerate(){*v=f64at(b,80+8*i)}
    let l:Vec<u32>=(0..8).map(|i|u32at(b,176+4*i)).collect();
    let o=Options{version:u[0],size:u[1],format:u[2],orientation:u[3],rest:u[4],section_mode:u[5],side:u[6],color:u[7],units:u[8],inspection:u[9],reserved0:u[10],reserved1:u[11],z0:f64at(b,48),z1:f64at(b,56),step:f64at(b,64),error:f64at(b,72),matrix,vertices:l[0],triangles:l[1],groups:l[2],sections:l[3],points:l[4],output_bytes:l[5],working_bytes:l[6],reserved2:l[7]};
    if o.version!=1||o.size!=208{return Err("EXPORT_OPTIONS_ABI".into())}
    if !(1..=3).contains(&o.format){return Err("UNSUPPORTED_EXPORTER".into())}
    let gates=u32at(b,220);if gates&!15!=0{return Err("EXPORT_GATE_FLAGS".into())}
    for (bit,name) in [(1,"INVALID_INPUT"),(2,"KERNEL_FAILURE"),(4,"ASSEMBLY_VIEW"),(8,"UNAPPLIED_MESH_EDIT")] {if gates&bit!=0{return Err(name.into())}}
    let verdict=u32at(b,224);if verdict>2||u32at(b,228)>1||u32at(b,228)!=o.inspection{return Err("EXPORT_VERDICT_FIELDS".into())}
    if verdict!=1&&o.inspection==0{return Err("MESH_VERIFICATION_REQUIRED".into())}
    let generation=u32at(b,216);let revision=u64at(b,240);
    if generation==0||revision==0||revision!=u64at(b,248){return Err("STALE_REVISION".into())}
    let n=u32at(b,232)as usize;let len=u32at(b,236)as usize;
    if n==0||n>4096||len==0||len>240||b.len()!=256+n*24+len{return Err("EXPORT_WIRE_LENGTH".into())}
    let mut mapping=Vec::new();mapping.try_reserve_exact(n).map_err(|_|"EXPORT_ALLOCATION")?;
    for i in 0..n {let at=256+24*i;mapping.push(Material{part:u32at(b,at),slot:u32at(b,at+4),rgba:u32at(b,at+8),source:u32at(b,at+12),material_source:u32at(b,at+16),reserved:u32at(b,at+20)});}
    let filename=std::str::from_utf8(&b[256+n*24..]).map_err(|_|"EXPORT_FILENAME_UTF8")?.to_string();
    if filename.contains('\0'){return Err("EXPORT_FILENAME_NUL".into())}
    Ok(Config{options:o,mapping,filename,generation,verdict,revision})
}
pub(super) struct Scene {vertices:Vec<f64>,triangles:Vec<u32>,parts:Vec<crate::Part>}
impl Scene {
    pub fn decode(b:&[u8],config:&Config)->Result<Self>{
        if b.len()<128||u32at(b,0)!=0x48435241||u32at(b,4)!=1||u32at(b,8)!=128||u32at(b,12)as usize!=b.len(){return Err("FINAL_SNAPSHOT_LAYOUT".into())}
        if u32at(b,16)!=config.generation{return Err("STALE_REVISION".into())}
        let nv=u32at(b,20)as usize;let nt=u32at(b,24)as usize;let np=u32at(b,28)as usize;
        if nv==0||nt==0||np==0{return Err("NO_SNAPSHOT".into())}
        if nv>config.options.vertices as usize||nt>config.options.triangles as usize||np!=config.mapping.len(){return Err("FINAL_SNAPSHOT_COUNTS".into())}
        let offsets=[(u32at(b,48)as usize,nv*24),(u32at(b,52)as usize,nt*12),(u32at(b,56)as usize,np*40)];
        let mut previous=128;for (off,len) in offsets{if off<previous||off.checked_add(len).is_none_or(|end|end>b.len()){return Err("FINAL_SNAPSHOT_RANGE".into())}previous=off+len;}
        let mut vertices=Vec::new();vertices.try_reserve_exact(nv*3).map_err(|_|"EXPORT_ALLOCATION")?;
        for i in 0..nv*3{vertices.push(f64at(b,offsets[0].0+i*8));}
        let mut triangles=Vec::new();triangles.try_reserve_exact(nt*3).map_err(|_|"EXPORT_ALLOCATION")?;
        for i in 0..nt*3{triangles.push(u32at(b,offsets[1].0+i*4));}
        let mut parts=Vec::new();parts.try_reserve_exact(np).map_err(|_|"EXPORT_ALLOCATION")?;
        for i in 0..np{let at=offsets[2].0+i*40;parts.push(crate::Part{vertex_start:u32at(b,at),vertex_count:u32at(b,at+4),triangle_start:u32at(b,at+8),triangle_count:u32at(b,at+12),color_rgba:u32at(b,at+16),source_index:u32at(b,at+20),contour_start:0,contour_count:0,volume_mm3:f64at(b,at+32)});}
        Ok(Self{vertices,triangles,parts})
    }
    pub fn view(&self)->SceneView{SceneView{version:1,nv:(self.vertices.len()/3)as u32,nt:(self.triangles.len()/3)as u32,np:self.parts.len()as u32,nxy:0,nc:0,ni:0,ne:0,vertices:self.vertices.as_ptr(),triangles:self.triangles.as_ptr(),parts:self.parts.as_ptr(),points:ptr::null(),contours:ptr::null(),indices:ptr::null(),edges:ptr::null()}}
}
pub(super) unsafe fn borrow<'a,T>(p:*const T,n:usize)->Result<&'a[T]>{
    if n==0{return Ok(&[])}
    if p.is_null()||(p as usize)%align_of::<T>()!=0||n.checked_mul(size_of::<T>()).is_none_or(|b|b>320*1024*1024){return Err("FINAL_NATIVE_POINTER".into())}
    // Private call only: the Native owner outlives all borrowed result slices.
    Ok(unsafe{std::slice::from_raw_parts(p,n)})
}
