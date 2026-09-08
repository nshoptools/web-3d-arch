// Conservative straight-line isotopy guard for the one global mm quantization.
// Disjoint nonincident swept tubes plus stable incident-ray order preserve the
// planar embedding (and therefore holes/nesting/material adjacency).
use super::{wire::{Result,fail},check};
use arch_raster_source::{RasterDocument,FlatGeometry};
use rstar::{RTree,RTreeObject,AABB};
use std::collections::BTreeMap;
type P=[i64;2];
fn cross(a:P,b:P,c:P)->i128{(b[0]-a[0])as i128*(c[1]-a[1])as i128-(b[1]-a[1])as i128*(c[0]-a[0])as i128}
fn hull(mut p:Vec<P>)->Vec<P>{
    p.sort_unstable();p.dedup();let mut h=Vec::new();
    for &v in &p {while h.len()>=2&&cross(h[h.len()-2],h[h.len()-1],v)<=0{h.pop();}h.push(v);}
    let n=h.len();
    for &v in p.iter().rev().skip(1){while h.len()>n&&cross(h[h.len()-2],h[h.len()-1],v)<=0{h.pop();}h.push(v);}
    h.pop();h
}
fn capsule(a:P,b:P,r:i64)->Vec<P>{
    let mut p=Vec::with_capacity(8);
    for p0 in [a,b]{for dx in [-r,r]{for dy in [-r,r]{p.push([p0[0]+dx,p0[1]+dy]);}}}
    hull(p)
}
fn separated(a:&[P],b:&[P])->bool{
    for poly in [a,b] {
        for i in 0..poly.len(){
            let p=poly[i];let q=poly[(i+1)%poly.len()];
            let axis=[-(q[1]-p[1])as i128,(q[0]-p[0])as i128];
            let project=|v:P|v[0]as i128*axis[0]+v[1]as i128*axis[1];
            let range=|v:&[P]|v.iter().fold((i128::MAX,i128::MIN),|(lo,hi),&p|{let d=project(p);(lo.min(d),hi.max(d))});
            let (al,ah)=range(a);let (bl,bh)=range(b);
            if ah<bl||bh<al{return true}
        }
    }false
}
#[derive(Clone)]struct Bound{index:usize,box_:AABB<P>}
impl RTreeObject for Bound{type Envelope=AABB<P>;fn envelope(&self)->Self::Envelope{self.box_}}
pub(super) struct Quantized{pub points:Vec<P>,pub radius:i64,pub checked:u64}
pub(super) fn run(d:&RasterDocument,f:&FlatGeometry,generation:u32)->Result<Quantized>{
    let scratch=(d.geometry.vertices.len() as u64)*256+(f.edges.len() as u64)*384+4096;
    if scratch>32*1024*1024{return Err(fail(8,"QUANTIZATION_SCRATCH_LIMIT"))}
    let scale=f.units_per_pixel as f64;
    let min_mm=d.transform.mm_per_pixel_x.min(d.transform.mm_per_pixel_y);
    // Includes binary64 mm conversion (8 ulps over the domain), grid rounding,
    // and two source dyadic units. No printer/source-continuous bound implied.
    let radius=((0.5e-6+10000.*8.*f64::EPSILON)/min_mm*scale).ceil()+2.;
    if !radius.is_finite()||radius>scale/8. {return Err(fail(107,"QUANTIZATION_SCALE_TOO_SMALL"))}
    let radius=radius as i64;
    let mut points=Vec::with_capacity(d.geometry.vertices.len());
    let mut unique=BTreeMap::new();
    for v in &d.geometry.vertices{
        let mm=d.point_mm(v.id).map_err(super::wire::raster_error)?;
        let p=[crate::quantize_mm(mm[0]).map_err(|e|fail(107,&e))?,crate::quantize_mm(mm[1]).map_err(|e|fail(107,&e))?];
        if unique.insert(p,v.id).is_some(){return Err(fail(107,"QUANTIZATION_VERTEX_COLLISION"))}points.push(p);
    }
    let old:Vec<P>=f.xy.chunks_exact(2).map(|p|[p[0],p[1]]).collect();
    let mut rays=vec![Vec::new();points.len()];
    let mut bounds=Vec::with_capacity(f.edges.len());
    for (i,e) in f.edges.iter().enumerate(){
        let a=e.from as usize;let b=e.to as usize;
        if a>=old.len()||b>=old.len()||a==b{return Err(fail(24,"INVALID_SHARED_EDGE"))}
        // Manifold 2-grid-unit near-point predicate must not silently erase data.
        if (points[a][0]-points[b][0]).abs()<2&&(points[a][1]-points[b][1]).abs()<2{return Err(fail(107,"QUANTIZATION_EDGE_TOO_SHORT"))}
        if (old[a][0]-old[b][0]).abs().max((old[a][1]-old[b][1]).abs())<=2*radius{return Err(fail(107,"QUANTIZATION_EDGE_SWEEP_UNCERTIFIED"))}
        rays[a].push(b);rays[b].push(a);
        bounds.push(Bound{index:i,box_:AABB::from_corners(
            [old[a][0].min(old[b][0])-radius,old[a][1].min(old[b][1])-radius],
            [old[a][0].max(old[b][0])+radius,old[a][1].max(old[b][1])+radius])});
    }
    for (i,ray) in rays.iter().enumerate(){
        for a in 0..ray.len(){for b in a+1..ray.len(){
            let u=[old[ray[a]][0]-old[i][0],old[ray[a]][1]-old[i][1]];
            let v=[old[ray[b]][0]-old[i][0],old[ray[b]][1]-old[i][1]];
            let bound=2*radius as i128*(u[0].abs()+u[1].abs()+v[0].abs()+v[1].abs())as i128+8*(radius as i128).pow(2);
            let det=cross([0,0],u,v);
            let dot=u[0]as i128*v[0]as i128+u[1]as i128*v[1]as i128;
            if det.abs()<=bound&&dot>=-bound{return Err(fail(107,"QUANTIZATION_JUNCTION_UNCERTIFIED"))}
        }}
    }
    let tree=RTree::bulk_load(bounds.clone());let mut checked=0u64;
    let budget=d.options.limits.max_work_units.min(10_000_000);
    for (i,e) in f.edges.iter().enumerate(){
        if i%256==0 {check(generation,800)?;}
        for candidate in tree.locate_in_envelope_intersecting(bounds[i].box_) {
            let j=candidate.index;if j<=i{continue}let q=&f.edges[j];
            if [e.from,e.to].iter().any(|v|*v==q.from||*v==q.to){continue}
            checked+=1;if checked%1024==0{check(generation,800)?;}if checked>budget{return Err(fail(18,"QUANTIZATION_WORK_LIMIT"))}
            let a=capsule(old[e.from as usize],old[e.to as usize],radius);
            let b=capsule(old[q.from as usize],old[q.to as usize],radius);
            if !separated(&a,&b){return Err(fail(107,"QUANTIZATION_SWEEP_UNCERTIFIED"))}
        }
    }
    // Independently retain each ring's nonzero orientation after quantization.
    for l in &f.loops {
        let ids=&f.indices[l.first_index as usize..(l.first_index+l.index_count)as usize];
        let area=|p:&[P]|ids.windows(2).fold(0i128,|s,v|s+cross([0,0],p[v[0]as usize],p[v[1]as usize]));
        let a=area(&old);let b=area(&points);
        if a==0||b==0||a.signum()!=b.signum(){return Err(fail(107,"QUANTIZATION_RING_ORIENTATION"))}
    }
    Ok(Quantized{points,radius,checked})
}
