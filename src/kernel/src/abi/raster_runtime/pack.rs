use super::{Block,Payload,OUTPUT_CAP,check,quantize,wire::{self,Config,Result,fail,u32_at,i64_at}};
use arch_raster_source::*;
struct Bytes(Vec<u8>);
impl Bytes {
    fn new()->Self{Self(Vec::new())}
    fn raw(&mut self,b:&[u8])->Result<()>{
        if self.0.len()+b.len()>OUTPUT_CAP{return Err(fail(8,"RASTER_OUTPUT_LIMIT"))}
        self.0.try_reserve(b.len()).map_err(|_|fail(8,"RASTER_ALLOCATION"))?;self.0.extend_from_slice(b);Ok(())
    }
    fn u32(&mut self,v:u32)->Result<()>{self.raw(&v.to_le_bytes())}
    fn u64(&mut self,v:u64)->Result<()>{self.raw(&v.to_le_bytes())}
    fn f64(&mut self,v:f64)->Result<()>{self.raw(&v.to_le_bytes())}
}
struct Store {blocks:Vec<Block>,bytes:usize}
impl Store {
    fn new()->Result<Self>{Ok(Self{blocks:(0..32).map(|_|Block::new(&[])).collect::<Result<_>>()?,bytes:4096})}
    fn put(&mut self,kind:usize,b:&[u8])->Result<()>{
        self.bytes+=b.len().div_ceil(8)*8;
        if self.bytes>OUTPUT_CAP{return Err(fail(8,"RASTER_OUTPUT_LIMIT"))}
        self.blocks[kind]=Block::new(b)?;Ok(())
    }
    fn u32s(&mut self,kind:usize,v:impl IntoIterator<Item=u32>)->Result<()>{
        let mut b=Bytes::new();for n in v {b.u32(n)?}self.put(kind,&b.0)
    }
    fn i64s(&mut self,kind:usize,v:impl IntoIterator<Item=i64>)->Result<()>{
        let mut b=Bytes::new();for n in v {b.raw(&n.to_le_bytes())?}self.put(kind,&b.0)
    }
}
fn tlv(to:&mut Bytes,tag:u16,payload:&[u8])->Result<()>{
    if to.0.len()+8+payload.len().div_ceil(8)*8>1024*1024{return Err(fail(9,"RASTER_METADATA_LIMIT"))}
    to.raw(&tag.to_le_bytes())?;to.raw(&0u16.to_le_bytes())?;to.u32(payload.len()as u32)?;to.raw(payload)?;
    while to.0.len()%8!=0{to.raw(&[0])?}Ok(())
}
fn text(to:&mut Bytes,tag:u16,s:&str)->Result<()>{tlv(to,tag,s.as_bytes())}
fn words(to:&mut Bytes,tag:u16,v:impl IntoIterator<Item=u64>)->Result<()>{
    let mut b=Bytes::new();for x in v{b.u64(x)?}tlv(to,tag,&b.0)
}
pub(super) fn pack(d:&RasterDocument,c:&Config,source:Option<&(u32,u32,String)>,generation:u32)->Result<Payload>{
    let flat=d.flat_geometry(OUTPUT_CAP as u64).map_err(wire::raster_error)?;
    let q=quantize::run(d,&flat,generation)?;
    check(generation,850)?;
    let mut s=Store::new()?;
    s.put(2,d.encoded_source.as_ref().map_or(&[],|v|v.bytes.as_slice()))?;
    s.put(3,&d.original_rgba)?;s.put(4,&d.resampled_rgba)?;s.put(5,&d.processed_rgba)?;
    let mut labels=Bytes::new();for &l in &d.labels{labels.raw(&l.to_le_bytes())?}s.put(6,&labels.0)?;drop(labels);
    s.u32s(7,d.palette.iter().flat_map(|v|[v.label as u32,u32::from_le_bytes([v.color[0],v.color[1],v.color[2],255]),v.initial_pixels as u32,(v.initial_pixels>>32)as u32,v.final_pixels as u32,(v.final_pixels>>32)as u32]))?;
    s.u32s(8,d.graph.vertices.iter().flat_map(|v|[v.x,v.y]))?;
    s.u32s(9,d.graph.edges.iter().flat_map(|v|[v.from,v.to,v.left_label as u32,v.right_label as u32,v.left_region.unwrap_or(u32::MAX),v.right_region.unwrap_or(u32::MAX)]))?;
    s.i64s(10,flat.xy.iter().copied())?;s.u32s(11,flat.source_vertex_ids.iter().copied())?;
    s.u32s(12,flat.edges.iter().flat_map(|v|[v.from,v.to,v.left_label,v.right_label,v.left_region,v.right_region,v.chain,0]))?;
    s.u32s(13,flat.loops.iter().flat_map(|v|[v.first_index,v.index_count,v.region,v.label]))?;
    s.u32s(14,flat.indices.iter().copied())?;
    s.u32s(15,flat.chains.iter().flat_map(|v|[v.first_edge,v.edge_count,v.first_source_edge,v.source_edge_count,v.first_curve,v.curve_count,v.component,0]))?;
    s.u32s(16,flat.source_edges.iter().copied())?;s.i64s(17,flat.curves.iter().flatten().copied())?;
    let mut merges=Bytes::new();
    for m in &d.decisions.merges{
        for v in [m.source_region,m.from_label as u32,m.to_label as u32,0]{merges.u32(v)?}
        merges.u64(m.pixels)?;merges.u64(m.shared_unit_edges)?;
    }
    s.put(19,&merges.0)?;drop(merges);
    s.put(20,&c.options_wire)?;s.put(21,&c.limits_wire)?;s.put(22,&c.origin_wire)?;
    let mut regions=Bytes::new();let mut loops=Bytes::new();let mut directed=Bytes::new();
    for r in &d.regions{
        let start=loops.0.len()/16;
        for l in &r.loops{
            for v in [(directed.0.len()/4)as u32,l.edges.len()as u32,r.id,r.label as u32]{loops.u32(v)?}
            for e in &l.edges{directed.u32(e.edge*2+u32::from(e.reversed))?}
        }
        for v in [r.id,r.label as u32,r.pixel_count as u32,(r.pixel_count>>32)as u32,r.bounds_px[0],r.bounds_px[1],r.bounds_px[2],r.bounds_px[3],u32::from(r.touches_border),start as u32,r.loops.len()as u32,0]{regions.u32(v)?}
    }
    s.put(23,&regions.0)?;s.put(24,&loops.0)?;s.put(25,&directed.0)?;drop((regions,loops,directed));
    let cert=&d.geometry.certificate;
    s.u32s(26,cert.adjacency_pairs.iter().flat_map(|v|[v[0]as u32,v[1]as u32]))?;
    s.u32s(27,cert.pinned_source_vertices.iter().copied())?;
    s.i64s(28,q.points.iter().flatten().copied())?;
    let mut chains=Bytes::new();let mut ranges=Bytes::new();
    for l in &d.geometry.loops{
        for v in [l.source_region,l.source_loop,(chains.0.len()/4)as u32,l.chains.len()as u32]{ranges.u32(v)?}
        for c in &l.chains{chains.u32(c.chain*2+u32::from(c.reversed))?}
    }
    s.put(29,&chains.0)?;s.put(30,&ranges.0)?;drop((chains,ranges));
    s.put(31,d.encoded_source.as_ref().and_then(|v|v.orientation.original_exif.as_deref()).unwrap_or(&[]))?;
    let g=&d.geometry.ledger;let decisions=&d.decisions;
    let mut meta=Bytes::new();
    text(&mut meta,1,SEMANTICS_VERSION)?;text(&mut meta,2,&g.algorithm)?;
    text(&mut meta,3,&decisions.palette_algorithm)?;text(&mut meta,4,&d.ledger.resampling_algorithm)?;
    for v in &d.diagnostics{
        let mut b=Bytes::new();b.u32(v.code.len()as u32)?;b.u32(v.message.len()as u32)?;b.raw(v.code.as_bytes())?;b.raw(v.message.as_bytes())?;tlv(&mut meta,5,&b.0)?;
    }
    for v in &d.confirmation_reasons{text(&mut meta,6,v)?}
    for v in &g.rejected_trials{text(&mut meta,7,v)?}
    let mut exif=Bytes::new();exif.u32(d.encoded_source.as_ref().and_then(|e|e.orientation.exif_value).map_or(0,u32::from))?;
    exif.u32(u32::from(d.encoded_source.as_ref().is_some_and(|e|e.orientation.applied)))?;tlv(&mut meta,8,&exif.0)?;
    words(&mut meta,9,[g.smooth_max_displacement_units as u64,g.simplification_bound_units as u64,g.corner_rounding_bound_units as u64,g.flattening_bound_units as u64,g.source_vertices,g.simplified_vertices,g.output_vertices,g.quadratic_spans])?;
    words(&mut meta,10,[decisions.alpha_input.transparent,decisions.alpha_input.partial,decisions.alpha_input.opaque,
        decisions.alpha_processed.transparent,decisions.alpha_processed.partial,decisions.alpha_processed.opaque,decisions.alpha_changed_pixels,
        decisions.denoise_changed_pixels,decisions.palette_recolored_pixels,decisions.background_excluded_pixels,
        decisions.background_excluded_regions as u64,decisions.unmerged_small_regions as u64])?;
    let mut certificate=Bytes::new();
    for v in [cert.components,cert.loops,cert.holes,cert.junctions]{certificate.u32(v)?}
    certificate.u64(cert.intersection_pairs_checked)?;certificate.u64(cert.nesting_ray_tests)?;
    tlv(&mut meta,11,&certificate.0)?;text(&mut meta,19,&cert.algorithm)?;
    let mut comparison=Bytes::new();comparison.u64(d.comparison.changed_pixels)?;comparison.u64(d.comparison.alpha_changed_pixels)?;
    comparison.f64(d.comparison.max_abs_premultiplied_rgba_error)?;comparison.f64(d.comparison.mean_squared_premultiplied_rgba_error)?;
    tlv(&mut meta,12,&comparison.0)?;text(&mut meta,13,&d.comparison.comparison_domain)?;
    for e in &d.ledger.entries{
        let mut b=Bytes::new();
        for v in [u32::from(e.bound_mm.is_some()),e.stage.len()as u32,e.note.len()as u32,0]{b.u32(v)?}
        b.f64(e.bound_mm.unwrap_or(0.))?;b.raw(e.stage.as_bytes())?;b.raw(e.note.as_bytes())?;tlv(&mut meta,14,&b.0)?;
    }
    text(&mut meta,15,&d.ledger.boundary_construction)?;
    text(&mut meta,16,"global-once-ties-even-1nm-certified-embedding-v1; error <= 0.5nm/axis + binary64 conversion; not source/printer accuracy")?;
    let mut source_record=Bytes::new();
    source_record.u32(match d.encoded_source.as_ref().map(|e|e.format){None=>0,Some(SourceFormat::Png)=>1,Some(SourceFormat::Jpeg)=>2,Some(SourceFormat::Webp)=>3})?;
    source_record.u32(source.map_or(d.input_width,|s|s.0))?;source_record.u32(source.map_or(d.input_height,|s|s.1))?;
    source_record.u32(u32::from(decisions.downsampled))?;tlv(&mut meta,17,&source_record.0)?;
    if let Some(src)=source{text(&mut meta,18,&src.2)?}
    if let Some(encoded)=&d.encoded_source {
        text(&mut meta,20,&encoded.color.interpretation)?;text(&mut meta,21,&encoded.color.note)?;
        let mut b=Bytes::new();b.u32(u32::from(encoded.color.declared_srgb))?;b.u32(u32::from(encoded.color.requires_confirmation))?;tlv(&mut meta,22,&b.0)?;
    }
    tlv(&mut meta,23,&wire::hash(&d.proposal_hash)?)?;
    let mut budget=Bytes::new();
    budget.f64(d.ledger.boundary_approximation_error_px)?;budget.f64(d.ledger.processing_pixel_diagonal_mm)?;
    budget.u32(u32::from(d.ledger.total_source_geometry_error_bound_mm.is_some()))?;budget.u32(decisions.palette_iterations)?;
    budget.f64(d.ledger.total_source_geometry_error_bound_mm.unwrap_or(0.))?;tlv(&mut meta,24,&budget.0)?;
    let mut quant=Bytes::new();quant.u64(q.radius as u64)?;quant.u64(q.checked)?;quant.f64(0.5e-6+10000.*8.*f64::EPSILON)?;
    tlv(&mut meta,25,&quant.0)?;
    text(&mut meta,26,&d.transform.coordinates)?;text(&mut meta,27,&d.transform.quantization)?;
    s.put(18,&meta.0)?;
    let mut base=[0u8;256];
    let mut put32=|offset:usize,v:u32|base[offset..offset+4].copy_from_slice(&v.to_le_bytes());
    let flags=u32::from(d.encoded_source.is_some())|u32::from(matches!(d.options.origin,RgbaOrigin::ConfirmedRender{..}))<<1|u32::from(g.constrained_identity)<<2|u32::from(d.requires_confirmation)<<3;
    for (at,v) in [(0,0x50534152),(4,SCHEMA_VERSION),(8,256),(12,match d.status{ProcessingStatus::Ready=>0,ProcessingStatus::Empty=>1,ProcessingStatus::RequiresConfirmation=>2}),
        (20,flags),(24,d.input_width),(28,d.input_height),(32,d.width),(36,d.height),(40,d.material_count as u32),(44,d.regions.len()as u32),
        (48,d.graph.vertices.len()as u32),(52,d.graph.edges.len()as u32),(56,d.geometry.vertices.len()as u32),(60,flat.edges.len()as u32),
        (64,flat.loops.len()as u32),(68,flat.chains.len()as u32),(72,flat.curves.len()as u32),(76,flat.units_per_pixel as u32),
        (240,g.attenuation_steps as u32),(244,g.rejected_trials.len()as u32),(248,1)]{put32(at,v);}
    for (at,v) in [(80,d.transform.width_mm),(88,d.transform.height_mm),(96,d.transform.mm_per_pixel_x),(104,d.transform.mm_per_pixel_y),(112,d.derived_geometry_error_bound_mm())]{
        base[at..at+8].copy_from_slice(&v.to_le_bytes())
    }
    base[120..128].copy_from_slice(&(g.total_linf_bound_units as u64).to_le_bytes());
    base[160..192].copy_from_slice(&wire::hash(&d.original_rgba_hash)?);
    if let Some(e)=&d.encoded_source{base[192..224].copy_from_slice(&wire::hash(&e.hash)?)}
    else if let RgbaOrigin::ConfirmedRender{source_hash,..}=&d.options.origin{base[192..224].copy_from_slice(&wire::hash(source_hash)?)}
    base[224..232].copy_from_slice(&d.ledger.work_units.to_le_bytes());base[232..240].copy_from_slice(&d.ledger.estimated_working_bytes.to_le_bytes());
    let mut p=Payload{buffers:s.blocks,base,hash:[0;32],bytes:s.bytes};p.hash=p.seal();check(generation,980)?;Ok(p)
}
pub(super) fn shapes(p:&Payload,thickness:f64,generation:u32)->Result<Vec<crate::Shape>>{
    let xy=p.buffers[28].bytes();let loops=p.buffers[13].bytes();let ids=p.buffers[14].bytes();let palette=p.buffers[7].bytes();
    if loops.is_empty(){return Err(fail(108,"RASTER_EMPTY_CONTEXT"))}
    if ids.len()/4>200000||loops.len()/16>100000{return Err(fail(19,"ROOT_CONTOUR_LIMIT"))}
    let mut by_label=std::collections::BTreeMap::new();
    let mut contours=std::collections::BTreeMap::<u32,Vec<Vec<[i64;2]>>>::new();
    for c in palette.chunks_exact(24){by_label.insert(u32_at(c,0),u32_at(c,4).swap_bytes());}
    for (i,l) in loops.chunks_exact(16).enumerate(){
        if i%256==0{check(generation,100)?;}
        let first=u32_at(l,0) as usize;let count=u32_at(l,4) as usize;let label=u32_at(l,12);
        if count<4||first.checked_add(count).is_none_or(|n|n>ids.len()/4){return Err(fail(24,"LOOP_BUFFER_INVARIANT"))}
        let mut ring=Vec::with_capacity(count-1);
        for j in first..first+count-1{
            let id=u32_at(ids,j*4)as usize;
            if id>=xy.len()/16{return Err(fail(24,"POINT_BUFFER_INVARIANT"))}
            ring.push([i64_at(xy,id*16),i64_at(xy,id*16+8)]);
        }
        contours.entry(label).or_default().push(ring);
    }
    contours.into_iter().map(|(label,contours)|{
        Ok(crate::Shape{contours,fill_rule:0,color_rgba:*by_label.get(&label).ok_or_else(||fail(24,"PALETTE_LABEL_INVARIANT"))?,z0:0.,z1:thickness})
    }).collect()
}

pub(super) fn product_shapes(p:&Payload,generation:u32,thickness:f64)->Result<(Vec<crate::Shape>,Vec<serde_json::Value>)>{
 let xy=p.buffers[28].bytes();let loops=p.buffers[13].bytes();let ids=p.buffers[14].bytes();let palette=p.buffers[7].bytes();
 if loops.is_empty()||ids.len()/4>200000{return Err(fail(19,"ROOT_CONTOUR_LIMIT"))}
 let colors:std::collections::BTreeMap<u32,u32>=palette.chunks_exact(24).map(|c|(u32_at(c,0),u32_at(c,4).swap_bytes())).collect();
 let mut grouped=std::collections::BTreeMap::<(u32,u32),Vec<Vec<[i64;2]>>>::new();
 for (i,l)in loops.chunks_exact(16).enumerate(){
  if i%256==0{check(generation,100)?}
  let first=u32_at(l,0)as usize;let count=u32_at(l,4)as usize;let region=u32_at(l,8);let label=u32_at(l,12);
  if count<4||first.checked_add(count).is_none_or(|n|n>ids.len()/4){return Err(fail(24,"LOOP_BUFFER_INVARIANT"))}
  let mut ring=Vec::with_capacity(count-1);
  for j in first..first+count-1{let v=u32_at(ids,j*4)as usize;if v>=xy.len()/16{return Err(fail(24,"POINT_BUFFER_INVARIANT"))}ring.push([i64_at(xy,v*16),i64_at(xy,v*16+8)]);}
  grouped.entry((region,label)).or_default().push(ring);
 }
 let mut shapes=Vec::new();let mut mapping=Vec::new();
 for((region,label),contours)in grouped{
  mapping.push(serde_json::json!({"sourceIndex":shapes.len(),"rasterRegionId":region,"label":label,"contourCount":contours.len()}));
  shapes.push(crate::Shape{contours,fill_rule:0,color_rgba:*colors.get(&label).ok_or_else(||fail(24,"PALETTE_LABEL_INVARIANT"))?,z0:0.,z1:thickness});
 }Ok((shapes,mapping))
}

