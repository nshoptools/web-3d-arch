//! Public geometry inputs are millimetres quantized to the 1 nm integer grid.
//! The C++ boundary borrows flat arrays. Published snapshots use a separate,
//! explicitly encoded little-endian layout, with no native pointers in bytes.
mod snapshot;
mod abi;
pub use abi::raster_runtime::*;
pub use abi::final_scene_export::*;
pub use abi::product_runtime::*;
pub use abi::mesh_runtime::*;
pub use abi::source_frame::*;
mod vector;
pub use vector::{SvgBuild,build_svg};
pub use snapshot::{Snapshot, write_stl};
use std::{ffi::{c_char,c_void,CStr}, ptr, slice};

#[repr(C)]
pub(crate) struct BuildControl {
    pub data:*mut c_void,
    pub cancelled:extern "C" fn(*mut c_void)->u32,
    pub progress:extern "C" fn(*mut c_void,u32),
}
pub(crate) fn checkpoint(control:Option<&BuildControl>,units:u32)->Result<(),String>{
    if let Some(c)=control {
        if (c.cancelled)(c.data)!=0{return Err("CANCELLED".into());}
        (c.progress)(c.data,units);
    }Ok(())
}

#[derive(Clone, Debug)]
pub struct Shape {
    pub contours: Vec<Vec<[i64; 2]>>,
    pub fill_rule: u32,
    pub color_rgba: u32,
    pub z0: f64,
    pub z1: f64,
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Part {
    pub vertex_start: u32, pub vertex_count: u32,
    pub triangle_start: u32, pub triangle_count: u32,
    pub color_rgba: u32, pub source_index: u32,
    pub contour_start: u32, pub contour_count: u32,
    pub volume_mm3: f64,
}
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Contour { pub index_start: u32, pub index_count: u32, pub part: u32, pub reserved: u32 }
#[repr(C)]
#[derive(Clone, Copy, Debug, Default)]
pub struct Edge { pub point_a: u32, pub point_b: u32, pub part_a: u32, pub part_b: u32 }
#[repr(C)]
struct View {
    abi_version: u32,
    vertex_count: u32, triangle_count: u32, part_count: u32,
    point_count: u32, contour_count: u32, contour_index_count: u32, edge_count: u32,
    vertices: *const f64, triangles: *const u32, parts: *const Part,
    points: *const i64, contours: *const Contour, indices: *const u32, edges: *const Edge,
}
unsafe extern "C" {
    fn arch_geometry_abi_version() -> u32;
    fn arch_scene_build_controlled(xy:*const i64, np:u32, ends:*const u32, nc:u32,
        shape_ends:*const u32, ns:u32, rules:*const u32, colors:*const u32,
        z0:*const f64, z1:*const f64, control:*const BuildControl,error:*mut c_char, cap:u32) -> *mut u8;
    fn arch_scene_view(scene:*const u8, view:*mut View) -> i32;
    fn arch_scene_destroy(scene:*mut u8);
}
struct Scene(*mut u8);
impl Drop for Scene { fn drop(&mut self) { unsafe { arch_scene_destroy(self.0); } } }
unsafe fn checked_slice<'a,T>(pointer:*const T,count:usize)->Result<&'a[T],String>{
    if count==0{return Ok(&[]);}
    if pointer.is_null()||(pointer as usize)%std::mem::align_of::<T>()!=0{return Err("GEOMETRY_ABI_POINTER".into());}
    // Caller owns the native Scene and has verified its array length limits.
    Ok(unsafe{slice::from_raw_parts(pointer,count)})
}

pub fn quantize_mm(value: f64) -> Result<i64, String> {
    if !value.is_finite() || value.abs()>10000. { return Err("COORDINATE_RANGE".into()); }
    Ok((value*1_000_000.).round_ties_even() as i64)
}

pub fn build(shapes: &[Shape], generation: u32) -> Result<Snapshot, String> {
    build_controlled(shapes,generation,None)
}
pub(crate) fn build_controlled(shapes:&[Shape],generation:u32,control:Option<&BuildControl>)->Result<Snapshot,String>{
    checkpoint(control,250)?;
    if shapes.is_empty() || shapes.len()>4096 {return Err("INVALID_SHAPE_COUNT".into());}
    let mut xy=Vec::new(); let mut ends=Vec::new(); let mut shape_ends=Vec::new();
    let mut rules=Vec::new(); let mut colors=Vec::new(); let mut z0=Vec::new(); let mut z1=Vec::new();
    for shape in shapes {
        if shape.contours.is_empty(){return Err("EMPTY_SHAPE".into());}
        for contour in &shape.contours {
            if contour.len()<3 || contour.len()>200000 || xy.len()/2+contour.len()>200000 {
                return Err("CONTOUR_COMPLEXITY_LIMIT".into());
            }
            for p in contour {xy.extend_from_slice(p);}
            ends.push((xy.len()/2) as u32);
        }
        shape_ends.push(ends.len() as u32); rules.push(shape.fill_rule); colors.push(shape.color_rgba);
        z0.push(shape.z0);z1.push(shape.z1);
    }
    let mut error=[0 as c_char;256];
    // SAFETY: Each flat input has the validated length advertised to C++;
    // allocations remain alive throughout the synchronous call.
    let raw=unsafe {
        if arch_geometry_abi_version()!=1 {return Err("GEOMETRY_ABI_MISMATCH".into());}
        arch_scene_build_controlled(xy.as_ptr(),(xy.len()/2) as u32,ends.as_ptr(),ends.len() as u32,
            shape_ends.as_ptr(),shapes.len() as u32,rules.as_ptr(),colors.as_ptr(),
            z0.as_ptr(),z1.as_ptr(),control.map_or(ptr::null(),|c|c as *const _),error.as_mut_ptr(),error.len() as u32)
    };
    snapshot_from_scene(raw,&error,generation)
}
// Every internal native builder uses the same checked output layout and owner.
pub(crate) fn snapshot_from_scene(raw:*mut u8,error:&[c_char],generation:u32)->Result<Snapshot,String>{
    if raw.is_null(){return Err(unsafe{CStr::from_ptr(error.as_ptr())}.to_string_lossy().into_owned());}
    let scene=Scene(raw);
    let mut view=View{abi_version:0,vertex_count:0,triangle_count:0,part_count:0,point_count:0,
        contour_count:0,contour_index_count:0,edge_count:0,vertices:ptr::null(),triangles:ptr::null(),
        parts:ptr::null(),points:ptr::null(),contours:ptr::null(),indices:ptr::null(),edges:ptr::null()};
    unsafe {
        if arch_scene_view(scene.0,&mut view)!=1 || view.abi_version!=1{return Err("GEOMETRY_ABI_MISMATCH".into());}
        // The C++ implementation caps these arrays before publication. This
        // second bound check guards mismatched builds at the FFI boundary.
        if view.vertex_count>2000000||view.triangle_count>4000000||view.part_count>4096||
            view.point_count>2000000||view.contour_index_count>2000000||view.edge_count>2000000||view.contour_count>200000{
            return Err("GEOMETRY_ABI_LIMIT".into());
        }
        Snapshot::new(generation,
            checked_slice(view.vertices,view.vertex_count as usize*3)?,
            checked_slice(view.triangles,view.triangle_count as usize*3)?,
            checked_slice(view.parts,view.part_count as usize)?,
            checked_slice(view.points,view.point_count as usize*2)?,
            checked_slice(view.contours,view.contour_count as usize)?,
            checked_slice(view.indices,view.contour_index_count as usize)?,
            checked_slice(view.edges,view.edge_count as usize)?)
    }
}

pub fn analytic_fixture(name:&str)->Result<Vec<Shape>,String>{
    fn rect(x0:i64,y0:i64,x1:i64,y1:i64)->Vec<[i64;2]>{
        vec![[x0*1000000,y0*1000000],[x1*1000000,y0*1000000],[x1*1000000,y1*1000000],[x0*1000000,y1*1000000]]
    }
    let shape=|contours,fill_rule,color_rgba|Shape{contours,fill_rule,color_rgba,z0:0.,z1:2.};
    match name {
        "hole"=>Ok(vec![shape(vec![rect(0,0,20,10),rect(8,3,12,7)],1,0x0080ffff)]),
        "seam"=>Ok(vec![shape(vec![rect(0,0,10,10)],0,0xff0000ff),shape(vec![rect(10,0,20,10)],0,0x0000ffff)]),
        "t-junction"=>Ok(vec![shape(vec![rect(0,0,10,10)],0,0xff0000ff),shape(vec![rect(10,0,20,5)],0,0x0000ffff),shape(vec![rect(10,5,20,10)],0,0x00ff00ff)]),
        "overlap"=>Ok(vec![shape(vec![rect(0,0,20,10)],0,0xff0000ff),shape(vec![rect(10,0,20,10)],0,0x0000ffff)]),
        _=>Err("UNKNOWN_ANALYTIC_FIXTURE".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn native_control_checkpoints_cancel_without_publishing_or_changing_prior_bytes(){
        struct Probe{cancel_at:u32,latest:u32,seen:Vec<u32>}
        extern "C" fn cancel(data:*mut c_void)->u32{let p=unsafe{&*(data as *const Probe)};u32::from(p.latest>=p.cancel_at)}
        extern "C" fn progress(data:*mut c_void,value:u32){let p=unsafe{&mut *(data as *mut Probe)};p.latest=value;p.seen.push(value);}
        let shapes=analytic_fixture("t-junction").unwrap();let prior=build(&shapes,1).unwrap();let before=prior.bytes().to_vec();
        let mut probe=Probe{cancel_at:400,latest:0,seen:Vec::new()};
        let control=BuildControl{data:(&mut probe as *mut Probe).cast(),cancelled:cancel,progress};
        assert!(matches!(build_controlled(&shapes,2,Some(&control)),Err(ref e) if e=="CANCELLED"));
        assert!(probe.latest>=400&&probe.latest<600);assert_eq!(prior.bytes(),before);
        probe.cancel_at=u32::MAX;probe.latest=0;probe.seen.clear();
        let rebuilt=build_controlled(&shapes,3,Some(&control)).unwrap();
        assert!(probe.seen.windows(2).all(|p|p[0]<=p[1]));assert_eq!(probe.latest,980);
        assert_eq!(prior.bytes()[20..],rebuilt.bytes()[20..]);
    }
    #[test] fn native_ffi_layout(){
        assert_eq!(size_of::<Part>(),40);assert_eq!(std::mem::offset_of!(Part,volume_mm3),32);
        assert_eq!(size_of::<Contour>(),16);assert_eq!(size_of::<Edge>(),16);
        assert_eq!(std::mem::offset_of!(View,vertices),32);
    }
    #[test] fn precise_grid_and_input_rejection(){
        assert_eq!(quantize_mm(0.0000005).unwrap(),0);assert_eq!(quantize_mm(0.0000015).unwrap(),2);
        assert!(quantize_mm(f64::NAN).is_err());assert!(quantize_mm(10000.1).is_err());
        let mut fixture=analytic_fixture("hole").unwrap();fixture[0].z1=0.;assert!(build(&fixture,1).is_err());
    }
    #[test] fn rejects_corner_contact_but_retains_disconnected_islands(){
        let mut shapes=analytic_fixture("seam").unwrap();
        let mut shifted=shapes[1].contours[0].clone();
        for p in &mut shifted{p[1]+=10_000_000;}
        shapes[0].contours.push(shifted);shapes.truncate(1);
        assert!(matches!(build(&shapes,1),Err(ref e) if e=="PLANAR_POINT_CONTACT"));
        for p in &mut shapes[0].contours[1]{p[1]+=1_000_000;}
        assert!(build(&shapes,2).is_ok(),"disconnected accents must remain allowed");
    }
    #[test] fn near_vertical_in_domain_lines_and_empty_ffi_views(){
        let shape=Shape{contours:vec![vec![[9_000_000_000,-9_000_000_000],[9_000_000_001,9_000_000_000],[8_999_000_000,9_000_000_000],[8_999_000_000,-9_000_000_000]]],fill_rule:0,color_rgba:0xffffffff,z0:0.,z1:2.};
        assert!(build(&[shape],1).is_ok());
        assert!(unsafe{checked_slice::<u32>(std::ptr::null(),0)}.unwrap().is_empty());
        assert!(unsafe{checked_slice::<u32>(std::ptr::null(),1)}.is_err());
    }
    #[test] fn tiny_region_is_rejected_explicitly_even_beside_a_valid_material(){
        let mut shapes=analytic_fixture("seam").unwrap();shapes.truncate(1);
        shapes.push(Shape{contours:vec![vec![[20_000_000,0],[20_000_001,1_000_000_000],[20_000_000,1_000_000_000]]],fill_rule:0,color_rgba:0xff0000ff,z0:0.,z1:2.});
        assert!(matches!(build(&shapes,1),Err(ref e) if e=="REGION_BELOW_BOOLEAN_RESOLUTION"));
        shapes[1].contours[0][1][0]+=9;
        assert!(build(&shapes,2).is_ok(),"10 nm source is retained, without claiming it is printable");
    }
}
