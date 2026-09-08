use crate::{Part, Contour, Edge};

/// ARCH/1: 128-byte header, aligned packed arrays, all little endian. This is
/// independent of the native C view. Header offsets are always uint32 bytes.
pub struct Snapshot { bytes: Vec<u8> }
impl Snapshot {
    pub fn bytes(&self)->&[u8]{&self.bytes}
    pub(crate) fn publication_generation(&mut self,g:u32){self.bytes[16..20].copy_from_slice(&g.to_le_bytes());}
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn new(generation:u32,vertices:&[f64],triangles:&[u32],parts:&[Part],
        points:&[i64],contours:&[Contour],indices:&[u32],edges:&[Edge])->Result<Self,String>{
        let mut bytes=vec![0u8;128];
        let mut offsets=Vec::new();
        offsets.push(bytes.len() as u32);
        for v in vertices {bytes.extend_from_slice(&v.to_le_bytes());}
        offsets.push(bytes.len() as u32);
        for v in triangles {bytes.extend_from_slice(&v.to_le_bytes());}
        while bytes.len()%8!=0{bytes.push(0);}
        offsets.push(bytes.len() as u32);
        for p in parts {
            for v in [p.vertex_start,p.vertex_count,p.triangle_start,p.triangle_count,p.color_rgba,p.source_index,p.contour_start,p.contour_count]{bytes.extend_from_slice(&v.to_le_bytes());}
            bytes.extend_from_slice(&p.volume_mm3.to_le_bytes());
        }
        offsets.push(bytes.len() as u32);
        for v in points {bytes.extend_from_slice(&v.to_le_bytes());}
        offsets.push(bytes.len() as u32);
        for c in contours {for v in [c.index_start,c.index_count,c.part,c.reserved]{bytes.extend_from_slice(&v.to_le_bytes());}}
        offsets.push(bytes.len() as u32);
        for v in indices {bytes.extend_from_slice(&v.to_le_bytes());}
        offsets.push(bytes.len() as u32);
        for e in edges {for v in [e.point_a,e.point_b,e.part_a,e.part_b]{bytes.extend_from_slice(&v.to_le_bytes());}}
        if bytes.len()>256*1024*1024{return Err("SNAPSHOT_RESOURCE_LIMIT".into());}
        let header=[0x48435241u32,1,128,bytes.len() as u32,generation,
            (vertices.len()/3) as u32,(triangles.len()/3) as u32,parts.len() as u32,
            (points.len()/2) as u32,contours.len() as u32,indices.len() as u32,edges.len() as u32];
        for (i,v) in header.into_iter().chain(offsets).enumerate(){bytes[i*4..i*4+4].copy_from_slice(&v.to_le_bytes());}
        Ok(Self{bytes})
    }
    fn u32(&self,offset:usize)->u32{u32::from_le_bytes(self.bytes[offset..offset+4].try_into().unwrap())}
    fn f64(&self,offset:usize)->f64{f64::from_le_bytes(self.bytes[offset..offset+8].try_into().unwrap())}
}

/// STL is deliberately per part. A single file concatenating touching color
/// shells would not demonstrate a manifold union and would lose material IDs.
/// The caller chooses the part explicitly; multi-material export uses 3MF.
pub fn write_stl(snapshot:&Snapshot,part_index:u32)->Result<Vec<u8>,String>{
    write_stl_controlled(snapshot,part_index,None)
}
pub(crate) fn write_stl_controlled(snapshot:&Snapshot,part_index:u32,control:Option<&crate::BuildControl>)->Result<Vec<u8>,String>{
    crate::checkpoint(control,0)?;
    if part_index>=snapshot.u32(28){return Err("UNKNOWN_PART".into());}
    let part=snapshot.u32(56) as usize+part_index as usize*40;
    let first=snapshot.u32(part+8) as usize;let count=snapshot.u32(part+12) as usize;
    let mut result=vec![0u8;80];
    let label=b"web-3d-arch | millimetres | single part | ARCH/1";
    result[..label.len()].copy_from_slice(label);result.extend_from_slice(&(count as u32).to_le_bytes());
    let vertices=snapshot.u32(48) as usize;let triangles=snapshot.u32(52) as usize;
    for ti in first..first+count {
        if (ti-first)%2048==0{crate::checkpoint(control,((ti-first)*990/count.max(1)) as u32)?;}
        let mut p=[[0f32;3];3];
        for (corner,target) in p.iter_mut().enumerate(){
            let vi=snapshot.u32(triangles+(ti*3+corner)*4) as usize;
            for (axis,out) in target.iter_mut().enumerate(){*out=snapshot.f64(vertices+(vi*3+axis)*8) as f32;}
        }
        let a=[p[1][0] as f64-p[0][0] as f64,p[1][1] as f64-p[0][1] as f64,p[1][2] as f64-p[0][2] as f64];
        let b=[p[2][0] as f64-p[0][0] as f64,p[2][1] as f64-p[0][1] as f64,p[2][2] as f64-p[0][2] as f64];
        let n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        let length=(n[0]*n[0]+n[1]*n[1]+n[2]*n[2]).sqrt();
        if !length.is_finite()||length<=0.{return Err("STL_FLOAT_DEGENERACY".into());}
        for v in n{result.extend_from_slice(&((v/length) as f32).to_le_bytes());}
        for vertex in p{for v in vertex{result.extend_from_slice(&v.to_le_bytes());}}
        result.extend_from_slice(&0u16.to_le_bytes());
    }
    crate::checkpoint(control,999)?;Ok(result)
}
