use super::wire::{self,Config,View,Group,Result};
use sha2::{Digest,Sha256};
use serde_json::{Value,json};
use std::collections::BTreeMap;
pub(super) fn hash(bytes:&[u8])->String{Sha256::digest(bytes).iter().map(|v|format!("{v:02x}")).collect()}
fn stem(s:&str)->String {
    let mut name=String::new();
    for ch in s.chars(){let c=if ch.is_control()||"<>:\"/\\|?*".contains(ch){'_'}else{ch};if name.len()+c.len_utf8()>160{break;}name.push(c);}
    let mut name=name.trim_matches(|c|c==' '||c=='.').to_string();
    for ext in [".stl",".zip",".svg"]{if name.to_ascii_lowercase().ends_with(ext){name.truncate(name.len()-ext.len());break}}
    if name.is_empty(){name="model".into()}
    let device=name.split('.').next().unwrap_or("").to_ascii_uppercase();
    if ["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"].contains(&device.as_str()){name.insert(0,'_')}
    name
}
fn reserve(n:usize,limit:usize)->Result<Vec<u8>>{if n>limit{return Err("EXPORT_OUTPUT_LIMIT".into())}let mut b=Vec::new();b.try_reserve_exact(n).map_err(|_|"EXPORT_ALLOCATION")?;Ok(b)}
fn stl(v:&View,g:&Group,config:&Config,generation:u32)->Result<(Vec<u8>,f64)> {
    let vertices=unsafe{wire::borrow(v.vertices,v.nv as usize*3)}?;let triangles=unsafe{wire::borrow(v.triangles,v.nt as usize*3)}?;
    if g.v0 as u64+g.nv as u64>v.nv as u64||g.t0 as u64+g.nt as u64>v.nt as u64{return Err("FINAL_NATIVE_GROUP_RANGE".into())}
    let count=g.nt as usize;let mut b=reserve(84+50*count,config.options.output_bytes as usize)?;
    b.resize(80,0);let header=b"web-3d-arch | mm | FINAL CSG | geometric union | inspection in metadata";
    b[..header.len()].copy_from_slice(header);b.extend_from_slice(&g.nt.to_le_bytes());
    let mut float_vertices=Vec::<[f32;3]>::new();float_vertices.try_reserve_exact(g.nv as usize).map_err(|_|"EXPORT_ALLOCATION")?;
    let mut unique=BTreeMap::<[u32;3],[u64;3]>::new();let mut error=0f64;
    for i in g.v0..g.v0+g.nv {
        if i%2048==0 {super::check(generation,825)?;}
        let raw=[vertices[3*i as usize],vertices[3*i as usize+1],vertices[3*i as usize+2]];
        let p=raw.map(|x|if x==0.{0.}else{x as f32});
        let e=p.iter().zip(raw).map(|(&a,b)|(a as f64-b).powi(2)).sum::<f64>().sqrt();
        if !e.is_finite()||e>config.options.error{return Err("INVALID_SERIALIZATION:STL_FLOAT_ERROR".into())}error=error.max(e);
        let key=p.map(f32::to_bits);let exact=raw.map(|x|if x==0.{0.0f64.to_bits()}else{x.to_bits()});
        if let Some(other)=unique.insert(key,exact){if other!=exact{return Err("INVALID_SERIALIZATION:STL_FLOAT_COLLISION".into())}}
        float_vertices.push(p);
    }
    for (index,t) in triangles[g.t0 as usize*3..(g.t0+g.nt)as usize*3].chunks_exact(3).enumerate(){
        if index%2048==0{super::check(generation,830)?}
        let mut p=[[0f32;3];3];for i in 0..3{if t[i]<g.v0||t[i]>=g.v0+g.nv{return Err("FINAL_NATIVE_TRIANGLE_RANGE".into())}p[i]=float_vertices[(t[i]-g.v0)as usize];}
        let a=[p[1][0]as f64-p[0][0]as f64,p[1][1]as f64-p[0][1]as f64,p[1][2]as f64-p[0][2]as f64];
        let c=[p[2][0]as f64-p[0][0]as f64,p[2][1]as f64-p[0][1]as f64,p[2][2]as f64-p[0][2]as f64];
        let n=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];let length=n.iter().map(|x|x*x).sum::<f64>().sqrt();
        if !length.is_finite()||length==0.{return Err("INVALID_SERIALIZATION:STL_FLOAT_DEGENERACY".into())}
        for x in n {b.extend_from_slice(&((x/length)as f32).to_le_bytes());}for vertex in p {for x in vertex {b.extend_from_slice(&x.to_le_bytes());}}b.extend_from_slice(&0u16.to_le_bytes());
    }Ok((b,error))
}
fn xml(s:&str)->String{s.replace('&',"&amp;").replace('<',"&lt;").replace('>',"&gt;").replace('"',"&quot;").replace('\'',"&apos;")}
fn text(out:&mut String,s:&str,limit:usize)->Result<()> {if out.len().checked_add(s.len()).is_none_or(|n|n>limit){return Err("EXPORT_OUTPUT_LIMIT".into())}out.try_reserve(s.len()).map_err(|_|"EXPORT_ALLOCATION")?;out.push_str(s);Ok(())}
fn svg(v:&View,c:&Config,manifest:&Value,generation:u32)->Result<Vec<u8>>{
    let groups=unsafe{wire::borrow(v.groups,v.ng as usize)}?;let sections=unsafe{wire::borrow(v.sections,v.ns as usize)}?;
    let contours=unsafe{wire::borrow(v.contours,v.nc as usize)}?;let points=unsafe{wire::borrow(v.points,v.np as usize*2)}?;
    let scale=if c.options.units==0{1.}else{1./25.4};let unit=if c.options.units==0{"mm"}else{"in"};
    let x0=if c.options.side==0{v.bounds[0]}else{-v.bounds[3]};let y0=-v.bounds[4];let width=v.bounds[3]-v.bounds[0];let height=v.bounds[4]-v.bounds[1];
    let limit=c.options.output_bytes as usize;let mut out=String::new();
    text(&mut out,&format!("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}{unit}\" height=\"{}{unit}\" viewBox=\"{} {} {} {}\" data-scope=\"final-post-csg-section\">\n<title>{}</title>\n<metadata>{}</metadata>\n",width*scale,height*scale,x0*scale,y0*scale,width*scale,height*scale,xml(&c.filename),xml(&manifest.to_string())),limit)?;
    let mut sample=None;
    for (si,s) in sections.iter().enumerate(){super::check(generation,850)?;
        if sample!=Some(s.sample){if sample.is_some(){text(&mut out,"</g>\n",limit)?}sample=Some(s.sample);
            text(&mut out,&format!("<g id=\"section-{}\" data-z-mm=\"{}\"{}>\n",s.sample,s.z,if s.sample==0{""}else{" style=\"display:none\""}),limit)?;}
        let Some(g)=groups.get(s.group as usize)else{return Err("FINAL_NATIVE_SECTION_GROUP".into())};
        if s.c0 as u64+s.nc as u64>v.nc as u64{return Err("FINAL_NATIVE_SECTION_RANGE".into())}
        text(&mut out,&format!("<path id=\"slice-{si}-material-{}\" data-slot=\"{}\" data-rgba=\"{:08x}\" fill=\"#{:06x}\" fill-rule=\"nonzero\" d=\"",s.group,g.slot,g.rgba,g.rgba>>8),limit)?;
        for contour in &contours[s.c0 as usize..(s.c0+s.nc)as usize]{
            if contour.section!=si as u32||contour.p0 as u64+contour.np as u64>v.np as u64{return Err("FINAL_NATIVE_CONTOUR_RANGE".into())}
            for (i,p) in points[contour.p0 as usize*2..(contour.p0+contour.np)as usize*2].chunks_exact(2).enumerate(){if i%2048==0{super::check(generation,860)?}
                let x=if c.options.side==0{p[0]}else{-p[0]};text(&mut out,&format!("{}{} {} ",if i==0{"M"}else{"L"},x*scale,-p[1]*scale),limit)?;}
            text(&mut out,"Z ",limit)?;
        }text(&mut out,"\"/>\n",limit)?;
    }
    if sample.is_some(){text(&mut out,"</g>\n",limit)?}text(&mut out,"</svg>\n",limit)?;Ok(out.into_bytes())
}
fn crc32(b:&[u8],generation:u32)->Result<u32>{
    let mut table=[0u32;256];for(i,x)in table.iter_mut().enumerate(){*x=i as u32;for _ in 0..8{*x=(*x>>1)^if *x&1==1{0xedb88320}else{0}}}
    let mut crc=0xffffffff;for(i,&v)in b.iter().enumerate(){if i%65536==0{super::check(generation,910)?}crc=(crc>>8)^table[((crc^v as u32)&255)as usize];}Ok(!crc)
}
fn u16le(b:&mut Vec<u8>,v:u16){b.extend_from_slice(&v.to_le_bytes())}fn u32le(b:&mut Vec<u8>,v:u32){b.extend_from_slice(&v.to_le_bytes())}
fn zip(files:&[(String,Vec<u8>)],limit:usize,generation:u32)->Result<Vec<u8>>{
    if files.len()>257{return Err("EXPORT_ZIP_ENTRY_LIMIT".into())}
    let size=files.iter().try_fold(22usize,|n,(name,data)|n.checked_add(76+name.len()*2+data.len())).ok_or("EXPORT_ZIP_SIZE")?;
    let mut out=reserve(size,limit)?;let mut directory=Vec::new();
    for(name,data)in files{super::check(generation,900)?;let crc=crc32(data,generation)?;let offset=out.len()as u32;
        if name.len()>65535||data.len()>u32::MAX as usize{return Err("EXPORT_ZIP32_LIMIT".into())}
        u32le(&mut out,0x04034b50);for n in [20,0x0800,0,0,0x0021]{u16le(&mut out,n)}
        for n in [crc,data.len()as u32,data.len()as u32]{u32le(&mut out,n)}u16le(&mut out,name.len()as u16);u16le(&mut out,0);out.extend_from_slice(name.as_bytes());
        for chunk in data.chunks(65536){super::check(generation,930)?;out.extend_from_slice(chunk)}
        directory.push((name,crc,data.len()as u32,offset));
    }
    let start=out.len()as u32;
    for(name,crc,len,offset)in directory{u32le(&mut out,0x02014b50);for n in [20,20,0x0800,0,0,0x0021]{u16le(&mut out,n)}for n in [crc,len,len]{u32le(&mut out,n)}
        for n in [name.len()as u16,0,0,0,0]{u16le(&mut out,n)}u32le(&mut out,0);u32le(&mut out,offset);out.extend_from_slice(name.as_bytes());}
    let dirlen=out.len()as u32-start;u32le(&mut out,0x06054b50);for n in [0,0,files.len()as u16,files.len()as u16]{u16le(&mut out,n)}u32le(&mut out,dirlen);u32le(&mut out,start);u16le(&mut out,0);
    if out.len()!=size{return Err("INVALID_SERIALIZATION:ZIP_SIZE".into())}Ok(out)
}
pub(super) struct Encoded {pub bytes:Vec<u8>,pub metadata:Vec<u8>}
pub(super) fn encode(config:&Config,v:&View,snapshot_hash:&str,generation:u32)->Result<Encoded>{
    if v.version!=1||v.size!=size_of::<View>()as u32||v.format!=config.options.format||v.ng>config.options.groups||v.nv>config.options.vertices||v.nt>config.options.triangles||v.np>config.options.points||v.ns>config.options.sections.saturating_mul(config.options.groups)||v.nm!=config.mapping.len()as u32{return Err("FINAL_NATIVE_VIEW".into())}
    let groups=unsafe{wire::borrow(v.groups,v.ng as usize)}?;let members=unsafe{wire::borrow(v.members,v.nm as usize)}?;
    let sections=unsafe{wire::borrow(v.sections,v.ns as usize)}?;
    let mut mapping=Vec::new();for m in &config.mapping{mapping.push(json!({"part":m.part,"slot":m.slot,"colorRGBA":format!("{:08x}",m.rgba),"sourceIndex":m.source,"materialSourceId":m.material_source}));}
    let mut group_meta=Vec::new();for g in groups{if g.m0 as u64+g.nm as u64>v.nm as u64{return Err("FINAL_NATIVE_MEMBERS".into())}
        let ids=&members[g.m0 as usize..(g.m0+g.nm)as usize];if ids.iter().any(|&i|i>=v.nm){return Err("FINAL_NATIVE_MEMBER_INDEX".into())}
        group_meta.push(json!({"slot":g.slot,"colorRGBA":format!("{:08x}",g.rgba),"mappingIndices":ids,"volumeMm3":g.volume}));}
    let format=match config.options.format{1=>"stl-union",2=>"stl-material-zip",3=>"svg-final-section",_=>return Err("UNSUPPORTED_EXPORTER".into())};
    let mut warnings=Vec::new();if config.verdict==0{warnings.push("MESH_UNVERIFIED")}if config.verdict==2{warnings.push("MESH_FAILED")}
    let mut slot_colors=BTreeMap::new();let mut conflicting_slot=false;for m in &config.mapping{if let Some(color)=slot_colors.insert(m.slot,m.rgba){if color!=m.rgba{conflicting_slot=true}}}if conflicting_slot{warnings.push("SLOT_HAS_MULTIPLE_COLORS")}
    if v.warnings&1!=0{warnings.push("EXACT_WELD_TOPOLOGY_FAILED")}if v.warnings&2!=0{warnings.push("MATERIAL_INTERIOR_OVERLAP")}if v.warnings&4!=0{warnings.push("EXPLICIT_REFLECTION")}
    let section_meta:Vec<Value>=sections.iter().map(|s|json!({"sample":s.sample,"group":s.group,"zMm":s.z,"areaMm2":s.area,"contours":s.nc})).collect();
    let mut manifest=json!({"schema":"arch-final-export/1","scope":"final-post-csg-manufacturing-scene","format":format,"sourceSnapshotGeneration":config.generation,"sourceSnapshotSha256":snapshot_hash,"sourceProjectRevision":config.revision.to_string(),"units":if config.options.format==3&&config.options.units==1{"in"}else{"mm"},"stlUnitInstruction":"STL stores no units or color. Import all STL files as millimetres at the unchanged common origin.","filenameRequested":config.filename,"mapping":mapping,"groups":group_meta,"manufacturingBoundsMm":v.bounds,"exportTransformRowMajor":v.transform,"orientation":config.options.orientation,"restOnBed":config.options.rest==1,"inputVolumeSumMm3":v.volume_sum,"unionVolumeMm3":v.union_volume,"warnings":warnings,"qualification":{"sourceIndependentMeshVerdict":match config.verdict{0=>"unverified",1=>"pass",_=>"fail"},"inspection":config.options.inspection==1,"nativeStructuralChecks":if v.warnings&1!=0{"fail"}else{"pass"},"wholePipelineErrorBoundMm":Value::Null,"physicalFit":"unqualified","slicer":"unverified"},"section":{"selectionCoordinates":"manufacturing mm before export pose","boundaryConvention":"bottom included; top excluded; no Z epsilon","mode":if config.options.section_mode==0{"single-z"}else{"explicit-z-sequence"},"side":if config.options.side==0{"front (+Z)"}else{"back (-Z), X mirrored"},"colorPolicy":if config.options.color==0{"black union"}else{"explicit (slot,rgba)"},"rangePresentation":"first sample visible; alternatives in labelled hidden groups; not a projection","samples":section_meta},"errorLedger":{"libraryToleranceMm":v.library_tolerance,"outputLimitMm":config.options.error,"svgQuantizationBoundMm":if config.options.format==3{Some(0.5f64.sqrt()/1e6)}else{None},"stlFloatPositionErrorMm":0.0,"booleanWholePipelineBound":"unverified"},"files":[]});
    let base=stem(&config.filename);let mut files=Vec::<(String,Vec<u8>)>::new();let mut file_meta=Vec::new();let mut max_error=0f64;
    if config.options.format<=2 {
        for (i,g) in groups.iter().enumerate(){super::check(generation,810)?;let (bytes,error)=stl(v,g,config,generation)?;max_error=max_error.max(error);
            let name=if config.options.format==1{format!("{base}.stl")}else{format!("{base}--slot-{}--{:08x}.stl",g.slot,g.rgba)};
            file_meta.push(json!({"name":name,"bytes":bytes.len(),"sha256":hash(&bytes),"group":i,"slot":g.slot,"colorRGBA":format!("{:08x}",g.rgba),"volumeMm3":g.volume}));files.push((name,bytes));}
        manifest["files"]=json!(file_meta);manifest["errorLedger"]["stlFloatPositionErrorMm"]=json!(max_error);
    }else{let bytes=svg(v,config,&manifest,generation)?;let name=format!("{base}.svg");manifest["files"]=json!([{"name":name,"bytes":bytes.len(),"sha256":hash(&bytes)}]);files.push((name,bytes));}
    let filename=if config.options.format==2{format!("{base}.zip")}else{files[0].0.clone()};
    let bytes=if config.options.format==2{let m=serde_json::to_vec_pretty(&manifest).map_err(|_|"EXPORT_MANIFEST_ENCODING")?;files.push(("manifest.json".into(),m));zip(&files,config.options.output_bytes as usize,generation)?}else{files.pop().unwrap().1};
    manifest["download"]=json!({"filename":filename,"bytes":bytes.len(),"sha256":hash(&bytes),"mime":match config.options.format{1=>"model/stl",2=>"application/zip",_=>"image/svg+xml"}});
    let metadata=serde_json::to_vec(&manifest).map_err(|_|"EXPORT_MANIFEST_ENCODING")?;if metadata.len()>2*1024*1024{return Err("EXPORT_METADATA_LIMIT".into())}
    super::check(generation,980)?;Ok(Encoded{bytes,metadata})
}

// Float conditioning is an explicit proposal, never an automatic STL repair.
// The existing encode()/stl() path and its rejection guards remain unchanged.
use std::collections::{BTreeSet,VecDeque};
#[derive(Clone,Copy,Debug)]
pub(super) struct FloatConditioningOptions {pub version:u32,pub maximum_displacement_mm:f64,pub work_limit:u64}
#[derive(Clone,Debug)]
struct FloatComponent {vertices:u32,edges:u32,faces:u32,euler:i64,orientation:i32,volume:f64}
struct FloatWork {left:u64,used:u64,generation:u32}
impl FloatWork {fn charge(&mut self,n:u64)->Result<()> {self.left=self.left.checked_sub(n).ok_or("FLOAT_CONDITIONING_WORK_LIMIT")?;self.used+=n;if self.used%1024<n {super::check(self.generation,870)?}Ok(())}}
#[derive(Clone,Copy)]
struct FloatInterval {lo:f64,hi:f64}
impl FloatInterval {
 fn point(x:f64)->Self{Self{lo:x,hi:x}}
 fn add(self,b:Self)->Self{Self{lo:(self.lo+b.lo).next_down(),hi:(self.hi+b.hi).next_up()}}
 fn sub(self,b:Self)->Self{Self{lo:(self.lo-b.hi).next_down(),hi:(self.hi-b.lo).next_up()}}
 fn mul(self,b:Self)->Self{let v=[self.lo*b.lo,self.lo*b.hi,self.hi*b.lo,self.hi*b.hi];Self{lo:v.into_iter().fold(f64::INFINITY,f64::min).next_down(),hi:v.into_iter().fold(f64::NEG_INFINITY,f64::max).next_up()}}
 fn sign(self)->Result<i32>{if !self.lo.is_finite()||!self.hi.is_finite(){return Err("FLOAT_CONDITIONING_NUMERIC_LIMIT".into())}if self.lo>0.{Ok(1)}else if self.hi<0.{Ok(-1)}else{Err("FLOAT_CONDITIONING_ORIENTATION_UNPROVEN".into())}}
}
fn fpoint(v:&[f64],i:u32)->[f64;3]{[v[3*i as usize],v[3*i as usize+1],v[3*i as usize+2]]}
fn sorted_edge(a:u32,b:u32)->[u32;2]{if a<b{[a,b]}else{[b,a]}}
fn float_topology(nv:usize,tri:&[u32],work:&mut FloatWork)->Result<(Vec<u32>,Vec<FloatComponent>)>{
 if nv<4||tri.len()%3!=0||tri.len()<12{return Err("FLOAT_CONDITIONING_TOPOLOGY".into())}
 let mut edges=BTreeMap::<[u32;2],Vec<(usize,bool)>>::new();let mut faces=BTreeSet::new();let mut stars=vec![Vec::<[u32;2]>::new();nv];
 for (i,t) in tri.chunks_exact(3).enumerate(){work.charge(1)?;if t.iter().any(|&x|x as usize>=nv)||t[0]==t[1]||t[1]==t[2]||t[2]==t[0]{return Err("FLOAT_CONDITIONING_TOPOLOGY".into())}let mut key=[t[0],t[1],t[2]];key.sort();if !faces.insert(key){return Err("FLOAT_CONDITIONING_DUPLICATE_FACE".into())}
  for k in 0..3{let a=t[k];let b=t[(k+1)%3];let list=edges.entry(sorted_edge(a,b)).or_default();list.push((i,a<b));if list.len()>2{return Err("FLOAT_CONDITIONING_EDGE_INCIDENCE".into())}stars[a as usize].push([b,t[(k+2)%3]])}
 }
 let mut adjacent=vec![Vec::new();tri.len()/3];for list in edges.values(){if list.len()!=2||list[0].1==list[1].1{return Err("FLOAT_CONDITIONING_EDGE_INCIDENCE".into())}adjacent[list[0].0].push(list[1].0);adjacent[list[1].0].push(list[0].0)}
 for star in &stars{work.charge(star.len()as u64+1)?;if star.is_empty(){return Err("FLOAT_CONDITIONING_UNUSED_VERTEX".into())}let mut ring=BTreeMap::<u32,Vec<u32>>::new();for &[a,b]in star{ring.entry(a).or_default().push(b);ring.entry(b).or_default().push(a)}if ring.values().any(|v|v.len()!=2){return Err("FLOAT_CONDITIONING_VERTEX_LINK".into())}let mut seen=BTreeSet::new();let mut q=vec![*ring.keys().next().unwrap()];while let Some(a)=q.pop(){if seen.insert(a){q.extend(&ring[&a])}}if seen.len()!=ring.len(){return Err("FLOAT_CONDITIONING_VERTEX_LINK".into())}}
 let mut labels=vec![u32::MAX;tri.len()/3];let mut components=Vec::new();
 for start in 0..labels.len(){if labels[start]!=u32::MAX{continue}let label=components.len()as u32;let mut q=VecDeque::from([start]);labels[start]=label;let(mut vs,mut es,mut nf)=(BTreeSet::new(),BTreeSet::new(),0u32);while let Some(i)=q.pop_front(){work.charge(1)?;nf+=1;let t=&tri[i*3..i*3+3];for k in 0..3{vs.insert(t[k]);es.insert(sorted_edge(t[k],t[(k+1)%3]));}for &j in &adjacent[i]{if labels[j]==u32::MAX{labels[j]=label;q.push_back(j)}}}components.push(FloatComponent{vertices:vs.len()as u32,edges:es.len()as u32,faces:nf,euler:vs.len()as i64-es.len()as i64+nf as i64,orientation:0,volume:0.})}
 Ok((labels,components))
}
// Full link complexes, including their edges (the tetrahedron counterexample).
fn float_link_collapse(tri:&mut Vec<u32>,face_ids:&mut Vec<u32>,a:u32,b:u32,removed:&mut Vec<u32>,work:&mut FloatWork)->Result<()> {
 let(mut av,mut bv,mut ae,mut be,mut opposite)=(BTreeSet::new(),BTreeSet::new(),BTreeSet::new(),BTreeSet::new(),BTreeSet::new());let mut incident=0;
 for t in tri.chunks_exact(3){work.charge(1)?;let has_a=t.contains(&a);let has_b=t.contains(&b);if has_a {let x:Vec<_>=t.iter().copied().filter(|&x|x!=a).collect();av.extend(&x);ae.insert(sorted_edge(x[0],x[1]));}if has_b{let x:Vec<_>=t.iter().copied().filter(|&x|x!=b).collect();bv.extend(&x);be.insert(sorted_edge(x[0],x[1]));}if has_a&&has_b{incident+=1;opposite.extend(t.iter().copied().filter(|&x|x!=a&&x!=b));}}
 if incident!=2||opposite.len()!=2||av.intersection(&bv).copied().collect::<BTreeSet<_>>()!=opposite||ae.intersection(&be).next().is_some(){return Err("FLOAT_CONDITIONING_LINK_CONDITION".into())}
 let mut nt=Vec::with_capacity(tri.len()-6);let mut ids=Vec::with_capacity(face_ids.len()-2);
 for (i,t)in tri.chunks_exact(3).enumerate(){work.charge(1)?;if t.contains(&a)&&t.contains(&b){removed.push(face_ids[i]);continue}nt.extend(t.iter().map(|&x|if x==b{a}else{x}));ids.push(face_ids[i]);}*tri=nt;*face_ids=ids;Ok(())
}
// Float32 vertices are dyadic rationals. Per-axis scaling is an invertible
// positive diagonal affine map. Checked i128 predicates are exact, or fail.
type FloatExact=[i128;3];
fn fi_add(a:i128,b:i128)->Result<i128>{a.checked_add(b).ok_or_else(||"FLOAT_CONDITIONING_EXACT_RANGE".into())}
fn fi_sub(a:i128,b:i128)->Result<i128>{a.checked_sub(b).ok_or_else(||"FLOAT_CONDITIONING_EXACT_RANGE".into())}
fn fi_mul(a:i128,b:i128)->Result<i128>{a.checked_mul(b).ok_or_else(||"FLOAT_CONDITIONING_EXACT_RANGE".into())}
fn fi_det(a:FloatExact,b:FloatExact,c:FloatExact)->Result<i128>{
 fi_add(fi_sub(fi_mul(a[0],fi_sub(fi_mul(b[1],c[2])?,fi_mul(b[2],c[1])?)?)?,fi_mul(a[1],fi_sub(fi_mul(b[0],c[2])?,fi_mul(b[2],c[0])?)?)?)?,fi_mul(a[2],fi_sub(fi_mul(b[0],c[1])?,fi_mul(b[1],c[0])?)?)?)
}
fn fi_minus(a:FloatExact,b:FloatExact)->Result<FloatExact>{Ok([fi_sub(a[0],b[0])?,fi_sub(a[1],b[1])?,fi_sub(a[2],b[2])?])}
fn fi_orient(a:FloatExact,b:FloatExact,c:FloatExact,d:FloatExact)->Result<i128>{fi_det(fi_minus(b,a)?,fi_minus(c,a)?,fi_minus(d,a)?)}
fn float_dyadic(x:f32)->(i128,i32){let bits=x.to_bits();let e=(bits>>23)&255;let mut m=(bits&0x7fffff)as i128;if e!=0{m|=0x800000}if m==0{return(0,0)}let mut exponent=if e==0{-149}else{e as i32-150};while m%2==0{m/=2;exponent+=1}if bits>>31!=0{m=-m}(m,exponent)}
fn float_exact(v:&[f64])->Result<(Vec<FloatExact>,[i32;3])>{
 let mut exponent=[i32::MAX;3];for p in v.chunks_exact(3){for k in 0..3{let(m,e)=float_dyadic(p[k]as f32);if m!=0{exponent[k]=exponent[k].min(e)}}}for e in &mut exponent{if *e==i32::MAX{*e=0}}
 let mut result=Vec::with_capacity(v.len()/3);for p in v.chunks_exact(3){let mut q=[0;3];for k in 0..3{let(m,e)=float_dyadic(p[k]as f32);if m!=0{let shift=e-exponent[k];if !(0..120).contains(&shift){return Err("FLOAT_CONDITIONING_EXACT_RANGE".into())}q[k]=fi_mul(m,1i128<<shift)?;if q[k].unsigned_abs()>=(1u128<<40){return Err("FLOAT_CONDITIONING_EXACT_RANGE".into())}}}result.push(q)}Ok((result,exponent))
}
fn fi_o2(a:FloatExact,b:FloatExact,c:FloatExact,axes:[usize;2])->Result<i128>{let[x,y]=axes;fi_sub(fi_mul(fi_sub(b[x],a[x])?,fi_sub(c[y],a[y])?)?,fi_mul(fi_sub(b[y],a[y])?,fi_sub(c[x],a[x])?)?)}
fn fi_axes(a:FloatExact,b:FloatExact,c:FloatExact)->Result<[usize;2]>{for axes in [[0,1],[0,2],[1,2]]{if fi_o2(a,b,c,axes)?!=0{return Ok(axes)}}Err("FLOAT_CONDITIONING_DEGENERATE_FACE".into())}
fn same_sign(s:[i128;3])->bool{s.iter().all(|&x|x>=0)||s.iter().all(|&x|x<=0)}
fn fi_inside(p:FloatExact,t:[FloatExact;3],axes:[usize;2])->Result<bool>{Ok(same_sign([fi_o2(t[0],t[1],p,axes)?,fi_o2(t[1],t[2],p,axes)?,fi_o2(t[2],t[0],p,axes)?]))}
fn fi_on(p:FloatExact,a:FloatExact,b:FloatExact,axes:[usize;2])->Result<bool>{Ok(fi_o2(a,b,p,axes)?==0&&axes.iter().all(|&k|p[k]>=a[k].min(b[k])&&p[k]<=a[k].max(b[k])))}
fn fi_segments(v:&[FloatExact],a:[u32;2],b:[u32;2],axes:[usize;2])->Result<bool>{
 let p=a.map(|i|v[i as usize]);let q=b.map(|i|v[i as usize]);let s=[fi_o2(p[0],p[1],q[0],axes)?,fi_o2(p[0],p[1],q[1],axes)?,fi_o2(q[0],q[1],p[0],axes)?,fi_o2(q[0],q[1],p[1],axes)?];
 if s.iter().all(|&x|x==0){let k=axes.into_iter().find(|&k|p[0][k]!=p[1][k]).ok_or("FLOAT_CONDITIONING_DEGENERATE_FACE")?;let lo=p[0][k].min(p[1][k]).max(q[0][k].min(q[1][k]));let hi=p[0][k].max(p[1][k]).min(q[0][k].max(q[1][k]));if lo>hi{return Ok(false)}if lo<hi{return Ok(true)}return Ok(!a.iter().any(|i|b.contains(i)&&v[*i as usize][k]==lo))}
 if a.iter().any(|i|b.contains(i)){return Ok(false)}
 if s[0].signum()*s[1].signum()<0&&s[2].signum()*s[3].signum()<0{return Ok(true)}
 Ok((s[0]==0&&fi_on(q[0],p[0],p[1],axes)?)||(s[1]==0&&fi_on(q[1],p[0],p[1],axes)?)||(s[2]==0&&fi_on(p[0],q[0],q[1],axes)?)||(s[3]==0&&fi_on(p[1],q[0],q[1],axes)?))
}
fn fi_coplanar(v:&[FloatExact],a:[u32;3],b:[u32;3],axes:[usize;2])->Result<bool>{
 let common:Vec<_>=a.iter().copied().filter(|i|b.contains(i)).collect();if common.len()==2{let x=*a.iter().find(|i|!common.contains(i)).unwrap();let y=*b.iter().find(|i|!common.contains(i)).unwrap();return Ok(fi_o2(v[common[0]as usize],v[common[1]as usize],v[x as usize],axes)?.signum()==fi_o2(v[common[0]as usize],v[common[1]as usize],v[y as usize],axes)?.signum())}
 for i in 0..3{for j in 0..3{if fi_segments(v,[a[i],a[(i+1)%3]],[b[j],b[(j+1)%3]],axes)?{return Ok(true)}}}
 for (&i,t)in a.iter().map(|i|(i,b)).chain(b.iter().map(|i|(i,a))){if !common.contains(&i)&&fi_inside(v[i as usize],t.map(|x|v[x as usize]),axes)?{return Ok(true)}}Ok(false)
}
fn fi_triangles_intersect(v:&[FloatExact],a:[u32;3],b:[u32;3])->Result<bool>{
 let p=a.map(|i|v[i as usize]);let q=b.map(|i|v[i as usize]);let sa=[fi_orient(q[0],q[1],q[2],p[0])?,fi_orient(q[0],q[1],q[2],p[1])?,fi_orient(q[0],q[1],q[2],p[2])?];let sb=[fi_orient(p[0],p[1],p[2],q[0])?,fi_orient(p[0],p[1],p[2],q[1])?,fi_orient(p[0],p[1],p[2],q[2])?];
 if [sa,sb].iter().any(|s|s.iter().all(|&x|x>0)||s.iter().all(|&x|x<0)){return Ok(false)}
 if sa==[0;3]{return fi_coplanar(v,a,b,fi_axes(p[0],p[1],p[2])?)}
 if a.iter().filter(|i|b.contains(i)).count()==2{return Ok(false)}
 for (s,t,side)in [(a,b,sa),(b,a,sb)]{let target=t.map(|i|v[i as usize]);let axes=fi_axes(target[0],target[1],target[2])?;
  for j in 0..3{let k=(j+1)%3;let x=v[s[j]as usize];let y=v[s[k]as usize];if side[j]==0&&fi_inside(x,target,axes)?&&!t.contains(&s[j]){return Ok(true)}
   if side[j]==0&&side[k]==0{for e in 0..3{if fi_segments(v,[s[j],s[k]],[t[e],t[(e+1)%3]],axes)?{return Ok(true)}}}
   if side[j].signum()*side[k].signum()<0{let signs=[fi_orient(x,y,target[0],target[1])?,fi_orient(x,y,target[1],target[2])?,fi_orient(x,y,target[2],target[0])?];if same_sign(signs){return Ok(true)}}
  }
 }Ok(false)
}
fn float_embedding(v:&[FloatExact],tri:&[u32],work:&mut FloatWork)->Result<()> {
 let faces:Vec<[u32;3]>=tri.chunks_exact(3).map(|t|[t[0],t[1],t[2]]).collect();let mut boxes=Vec::with_capacity(faces.len());
 for t in &faces{work.charge(1)?;let p=t.map(|i|v[i as usize]);fi_axes(p[0],p[1],p[2])?;boxes.push([0,1,2].map(|k|(p.iter().map(|p|p[k]).min().unwrap(),p.iter().map(|p|p[k]).max().unwrap())))}
 let mut order:Vec<usize>=(0..faces.len()).collect();order.sort_by_key(|&i|(boxes[i][0].0,i));
 for (at,&i) in order.iter().enumerate(){for &j in &order[at+1..]{work.charge(1)?;if boxes[j][0].0>boxes[i][0].1{break}if (1..3).any(|k|boxes[i][k].1<boxes[j][k].0||boxes[j][k].1<boxes[i][k].0){continue}if fi_triangles_intersect(v,faces[i],faces[j])?{return Err(format!("FLOAT_CONDITIONING_SELF_INTERSECTION:{i}:{j}"))}}}Ok(())
}
fn float_interval_det(a:[FloatInterval;3],b:[FloatInterval;3],c:[FloatInterval;3])->FloatInterval {
 a[0].mul(b[1].mul(c[2]).sub(b[2].mul(c[1]))).sub(a[1].mul(b[0].mul(c[2]).sub(b[2].mul(c[0])))).add(a[2].mul(b[0].mul(c[1]).sub(b[1].mul(c[0]))))
}
fn float_component_signs(v:&[f64],tri:&[u32],labels:&[u32],n:usize)->Result<Vec<i32>>{
 let mut anchors=vec![None;n];let mut sums=vec![FloatInterval::point(0.);n];for(i,t)in tri.chunks_exact(3).enumerate(){let k=labels[i]as usize;let a=*anchors[k].get_or_insert(fpoint(v,t[0]));let p:[[FloatInterval;3];3]=std::array::from_fn(|j|{let p=fpoint(v,t[j]);std::array::from_fn(|d|FloatInterval::point(p[d]).sub(FloatInterval::point(a[d])))});sums[k]=sums[k].add(float_interval_det(p[0],p[1],p[2]));}sums.into_iter().map(FloatInterval::sign).collect()
}
fn float_component_bounds(v:&[f64],tri:&[u32],labels:&[u32],n:usize)->Vec<[[f64;2];3]>{let mut boxes=vec![[[f64::INFINITY,f64::NEG_INFINITY];3];n];for(i,t)in tri.chunks_exact(3).enumerate(){let bb=&mut boxes[labels[i]as usize];for &id in t{let p=fpoint(v,id);for k in 0..3{bb[k][0]=bb[k][0].min(p[k]);bb[k][1]=bb[k][1].max(p[k])}}}boxes}
fn float_retained_normals(old:&[f64],source_tri:&[u32],new:&[f64],new_tri:&[u32],face_ids:&[u32])->Result<()> {
 for(i,&id)in face_ids.iter().enumerate(){let a:Vec<_>=source_tri[id as usize*3..id as usize*3+3].iter().map(|&i|fpoint(old,i)).collect();let b:Vec<_>=new_tri[i*3..i*3+3].iter().map(|&i|fpoint(new,i)).collect();let cross=|p:Vec<[f64;3]>|{let u:[FloatInterval;3]=std::array::from_fn(|k|FloatInterval::point(p[1][k]).sub(FloatInterval::point(p[0][k])));let v:[FloatInterval;3]=std::array::from_fn(|k|FloatInterval::point(p[2][k]).sub(FloatInterval::point(p[0][k])));std::array::from_fn::<_,3,_>(|k|u[(k+1)%3].mul(v[(k+2)%3]).sub(u[(k+2)%3].mul(v[(k+1)%3])))};let x=cross(a);let y=cross(b);let dot=(0..3).fold(FloatInterval::point(0.),|v,k|v.add(x[k].mul(y[k])));if dot.sign()?!=1{return Err("FLOAT_CONDITIONING_FACE_FLIP".into())}}
 Ok(())
}
fn float_bytes_hash(vertices:&[f64],triangles:&[u32])->[u8;32]{let mut h=Sha256::new();h.update(b"arch-final-float-geometry/1\0");h.update((vertices.len()as u64).to_le_bytes());for x in vertices{h.update(x.to_bits().to_le_bytes())}h.update((triangles.len()as u64).to_le_bytes());for x in triangles{h.update(x.to_le_bytes())}h.finalize().into()}
fn float_hex(bytes:&[u8])->String{bytes.iter().map(|x|format!("{x:02x}")).collect()}
fn float_context(config:&Config,v:&View,source_hash:&str,o:FloatConditioningOptions)->Result<[u8;32]>{
 if source_hash.len()!=64||!source_hash.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)){return Err("FLOAT_CONDITIONING_SOURCE_HASH".into())}
 let mut h=Sha256::new();h.update(b"arch-final-float-context/1\0");h.update(source_hash.as_bytes());h.update(config.generation.to_le_bytes());h.update(config.revision.to_le_bytes());h.update(config.verdict.to_le_bytes());h.update((config.filename.len()as u64).to_le_bytes());h.update(config.filename.as_bytes());
 let c=&config.options;for u in [c.version,c.size,c.format,c.orientation,c.rest,c.section_mode,c.side,c.color,c.units,c.inspection,c.reserved0,c.reserved1,c.vertices,c.triangles,c.groups,c.sections,c.points,c.output_bytes,c.working_bytes,c.reserved2]{h.update(u.to_le_bytes())}for x in [c.z0,c.z1,c.step,c.error].into_iter().chain(c.matrix){h.update(x.to_bits().to_le_bytes())}
 for m in &config.mapping{for x in [m.part,m.slot,m.rgba,m.source,m.material_source,m.reserved]{h.update(x.to_le_bytes())}}
 for x in [v.version,v.format,v.warnings,v.nv,v.nt,v.ng,v.nm,v.ns,v.nc,v.np,v.reserved]{h.update(x.to_le_bytes())}for x in v.transform.into_iter().chain(v.bounds).chain([v.volume_sum,v.union_volume,v.library_tolerance]){h.update(x.to_bits().to_le_bytes())}
 for g in unsafe{wire::borrow(v.groups,v.ng as usize)}?{for x in [g.slot,g.rgba,g.v0,g.nv,g.t0,g.nt,g.m0,g.nm]{h.update(x.to_le_bytes())}h.update(g.volume.to_bits().to_le_bytes())}for x in unsafe{wire::borrow(v.members,v.nm as usize)}?{h.update(x.to_le_bytes())}
 h.update(float_bytes_hash(unsafe{wire::borrow(v.vertices,v.nv as usize*3)}?,unsafe{wire::borrow(v.triangles,v.nt as usize*3)}?));h.update(o.version.to_le_bytes());h.update(o.maximum_displacement_mm.to_bits().to_le_bytes());h.update(o.work_limit.to_le_bytes());Ok(h.finalize().into())
}
/// Immutable candidate buffers; root owns registry/generation/admission/leases.
/// No public mutator grants geometry or approval authority through metadata.
pub(super) struct FloatConditioningProposal {
 options:FloatConditioningOptions,context:[u8;32],proposal_hash:[u8;32],geometry_hash:[u8;32],confirmed:bool,
 original_vertices:Vec<f64>,original_triangles:Vec<u32>,vertices:Vec<f64>,triangles:Vec<u32>,vertex_map:Vec<u32>,face_ids:Vec<u32>,removed_faces:Vec<u32>,collapsed_edges:Vec<[u32;2]>,
 components:Vec<FloatComponent>,bound:f64,measured:f64,volume:f64,work:u64,admission_bytes:u64,
}
fn float_proposal_hash(context:[u8;32],geometry_hash:[u8;32],bound:f64,volume:f64,vertex_map:&[u32],face_ids:&[u32],removed_faces:&[u32],collapsed_edges:&[[u32;2]],components:&[FloatComponent])->[u8;32]{let mut h=Sha256::new();h.update(b"arch-final-float-proposal/1\0");h.update(context);h.update(geometry_hash);h.update(bound.to_bits().to_le_bytes());h.update(volume.to_bits().to_le_bytes());for list in [vertex_map,face_ids,removed_faces]{h.update((list.len()as u64).to_le_bytes());for x in list{h.update(x.to_le_bytes())}}for pair in collapsed_edges{for x in pair{h.update(x.to_le_bytes())}}for c in components{h.update(c.euler.to_le_bytes());h.update(c.orientation.to_le_bytes());h.update(c.volume.to_bits().to_le_bytes())}h.finalize().into()}
impl FloatConditioningProposal {
 fn validate_seal(&self)->Result<()> {
  let geometry=float_bytes_hash(&self.vertices,&self.triangles);
  if geometry!=self.geometry_hash||float_proposal_hash(self.context,geometry,self.bound,self.volume,&self.vertex_map,&self.face_ids,&self.removed_faces,&self.collapsed_edges,&self.components)!=self.proposal_hash{return Err("FLOAT_CONDITIONING_BUFFER_CHANGED".into())}Ok(())
 }

 pub(super) fn hash(&self)->[u8;32]{self.proposal_hash}
 pub(super) fn vertices(&self)->&[f64]{&self.vertices}
 pub(super) fn triangles(&self)->&[u32]{&self.triangles}
 pub(super) fn original_vertices(&self)->&[f64]{&self.original_vertices}
 pub(super) fn original_triangles(&self)->&[u32]{&self.original_triangles}
 pub(super) fn vertex_map(&self)->&[u32]{&self.vertex_map}
 pub(super) fn retained_face_ids(&self)->&[u32]{&self.face_ids}
 pub(super) fn removed_face_ids(&self)->&[u32]{&self.removed_faces}
 pub(super) fn collapsed_edges(&self)->&[[u32;2]]{&self.collapsed_edges}
 pub(super) fn resident_bytes(&self)->u64{((self.original_vertices.capacity()+self.vertices.capacity())*8+(self.original_triangles.capacity()+self.triangles.capacity()+self.vertex_map.capacity()+self.face_ids.capacity()+self.removed_faces.capacity())*4+self.collapsed_edges.capacity()*8+self.components.capacity()*size_of::<FloatComponent>()+size_of::<Self>())as u64}
 pub(super) fn metadata(&self)->Value{json!({"version":"arch-final-float-conditioning/1","algorithm":"nearest-binary32-paired-edge-link-quotient/1","requiresConfirmation":true,"confirmed":self.confirmed,"proposalHash":float_hex(&self.proposal_hash),"geometryHash":float_hex(&self.geometry_hash),"contextHash":float_hex(&self.context),"sourceVertices":self.original_vertices.len()/3,"sourceTriangles":self.original_triangles.len()/3,"candidateVertices":self.vertices.len()/3,"candidateTriangles":self.triangles.len()/3,"collapsedEdges":self.collapsed_edges.len(),"removedDegenerateFaceImages":self.removed_faces.len(),"maximumDisplacementMm":self.measured,"hausdorffUpperBoundMm":self.bound,"requestedLimitMm":self.options.maximum_displacement_mm,"proof":"affine original-triangle image; collapsed images covered by retained edges; full link condition; exact dyadic embedding predicates","components":self.components.iter().map(|c|json!({"vertices":c.vertices,"edges":c.edges,"faces":c.faces,"euler":c.euler,"orientation":c.orientation,"volumeMm3":c.volume})).collect::<Vec<_>>(),"candidateVolumeMm3":self.volume,"workUnits":self.work,"workLimit":self.options.work_limit,"workingAdmissionBytes":self.admission_bytes,"residentBytes":self.resident_bytes(),"qualification":{"wholePipelineErrorBoundMm":Value::Null,"physicalFit":"unqualified","ambientIsotopy":"unverified","materialPolicy":"union STL only; original material mapping retained"}})}
 pub(super) fn confirm(&mut self,approval_hash:[u8;32],config:&Config,original:&View,source_hash:&str,generation:u32)->Result<()> {
  super::check(generation,880)?;self.validate_seal()?;if approval_hash!=self.proposal_hash{return Err("FLOAT_CONDITIONING_APPROVAL_HASH".into())}if float_context(config,original,source_hash,self.options)?!=self.context{return Err("FLOAT_CONDITIONING_STALE_CONTEXT".into())}self.confirmed=true;Ok(())
 }
 pub(super) fn encode_confirmed(&self,config:&Config,original:&View,source_hash:&str,generation:u32)->Result<Encoded>{
  super::check(generation,885)?;self.validate_seal()?;if !self.confirmed{return Err("FLOAT_CONDITIONING_CONFIRMATION_REQUIRED".into())}if float_context(config,original,source_hash,self.options)?!=self.context{return Err("FLOAT_CONDITIONING_STALE_CONTEXT".into())}
  let mut group=*unsafe{wire::borrow(original.groups,1)}?.first().ok_or("FLOAT_CONDITIONING_GROUP")?;group.v0=0;group.nv=self.vertices.len()as u32/3;group.t0=0;group.nt=self.triangles.len()as u32/3;group.volume=self.volume;
  let view=View{version:original.version,size:original.size,format:original.format,warnings:original.warnings,nv:group.nv,nt:group.nt,ng:1,nm:original.nm,ns:0,nc:0,np:0,reserved:0,transform:original.transform,bounds:original.bounds,volume_sum:original.volume_sum,union_volume:self.volume,library_tolerance:original.library_tolerance,vertices:self.vertices.as_ptr(),triangles:self.triangles.as_ptr(),groups:&group,members:original.members,sections:std::ptr::null(),contours:std::ptr::null(),points:std::ptr::null()};
  let mut output=encode(config,&view,source_hash,generation)?;let mut meta:Value=serde_json::from_slice(&output.metadata).map_err(|_|"EXPORT_MANIFEST_ENCODING")?;meta["floatConditioning"]=self.metadata();meta["originalUnionVolumeMm3"]=json!(original.union_volume);meta["errorLedger"]["floatConditioningHausdorffUpperBoundMm"]=json!(self.bound);meta["errorLedger"]["stlFloatPositionErrorMm"]=json!(self.measured);meta["warnings"].as_array_mut().ok_or("EXPORT_MANIFEST_ENCODING")?.push(json!("EXPLICITLY_CONFIRMED_FLOAT_CONDITIONING"));output.metadata=serde_json::to_vec(&meta).map_err(|_|"EXPORT_MANIFEST_ENCODING")?;if output.metadata.len()>2*1024*1024{return Err("EXPORT_METADATA_LIMIT".into())}super::check(generation,980)?;Ok(output)
 }
}
pub(super) fn prepare_float_conditioning(config:&Config,v:&View,source_hash:&str,o:FloatConditioningOptions,generation:u32)->Result<FloatConditioningProposal>{
 super::check(generation,840)?;
 if o.version!=1{return Err("FLOAT_CONDITIONING_VERSION".into())}
 if !o.maximum_displacement_mm.is_finite()||o.maximum_displacement_mm<=0.||o.maximum_displacement_mm>0.004||o.maximum_displacement_mm>config.options.error||o.work_limit==0||o.work_limit>1_000_000_000{return Err("FLOAT_CONDITIONING_OPTIONS".into())}
 if config.generation==0||config.revision==0||config.options.version!=1||config.options.size!=208||!config.options.error.is_finite()||config.options.error<1e-9||config.options.error>0.004{return Err("FLOAT_CONDITIONING_CONTEXT_OPTIONS".into())}
 if config.options.format!=1||v.format!=1||v.ng!=1||v.ns!=0||v.nc!=0||v.np!=0{return Err("FLOAT_CONDITIONING_UNION_STL_ONLY".into())}
 if config.verdict!=1||config.options.inspection!=0||v.warnings&!4!=0{return Err("FLOAT_CONDITIONING_SOURCE_QUALIFICATION".into())}
 if v.version!=1||v.size!=size_of::<View>()as u32||v.reserved!=0||v.nv>config.options.vertices||v.nt>config.options.triangles||v.nm!=config.mapping.len()as u32||v.nv<4||v.nt<4{return Err("FLOAT_CONDITIONING_VIEW".into())}
 if v.nv>65536||v.nt>131072{return Err("FLOAT_CONDITIONING_GEOMETRY_LIMIT".into())}
 let admission_bytes=(v.nv as u64)*1024+(v.nt as u64)*2048+1024*1024;
 if admission_bytes>config.options.working_bytes as u64{return Err("FLOAT_CONDITIONING_WORKING_LIMIT".into())}
 let group=&unsafe{wire::borrow(v.groups,1)}?[0];if group.v0!=0||group.t0!=0||group.nv!=v.nv||group.nt!=v.nt{return Err("FLOAT_CONDITIONING_GROUP".into())}
 let context=float_context(config,v,source_hash,o)?;let original_vertices=unsafe{wire::borrow(v.vertices,v.nv as usize*3)}?.to_vec();let original_triangles=unsafe{wire::borrow(v.triangles,v.nt as usize*3)}?.to_vec();
 let mut work=FloatWork{left:o.work_limit,used:0,generation};let mut rounded=Vec::with_capacity(original_vertices.len());let mut originals=BTreeSet::new();let mut clusters=BTreeMap::<[u32;3],Vec<u32>>::new();let(mut bound,mut measured)=(0f64,0f64);
 for(i,p)in original_vertices.chunks_exact(3).enumerate(){work.charge(1)?;if p.iter().any(|x|!x.is_finite()||x.abs()>10000.){return Err("FLOAT_CONDITIONING_COORDINATE_RANGE".into())}let raw=[p[0],p[1],p[2]];let key=raw.map(|x|if x==0.{0}else{x.to_bits()});if !originals.insert(key){return Err("FLOAT_CONDITIONING_SOURCE_ALIAS".into())}let q=raw.map(|x|{let x=x as f32;if x==0.{0.}else{x}});clusters.entry(q.map(f32::to_bits)).or_default().push(i as u32);rounded.extend(q.map(|x|x as f64));let mut squared_upper=0f64;let mut squared=0f64;for k in 0..3{let d=FloatInterval::point(raw[k]).sub(FloatInterval::point(q[k]as f64));let m=d.lo.abs().max(d.hi.abs());squared_upper=(squared_upper+(m*m).next_up()).next_up();squared+=(raw[k]-q[k]as f64).powi(2)}bound=bound.max(squared_upper.sqrt().next_up());measured=measured.max(squared.sqrt());}
 if bound>o.maximum_displacement_mm{return Err("FLOAT_CONDITIONING_DISPLACEMENT_LIMIT".into())}
 let mut collapsed_edges=Vec::new();for ids in clusters.values(){if ids.len()>2{return Err("FLOAT_CONDITIONING_CLUSTER_LIMIT".into())}if ids.len()==2{collapsed_edges.push(sorted_edge(ids[0],ids[1]))}}collapsed_edges.sort();if collapsed_edges.is_empty(){return Err("FLOAT_CONDITIONING_NOT_NEEDED".into())}
 let (old_labels,old_components)=float_topology(v.nv as usize,&original_triangles,&mut work)?;if old_components.len()>256{return Err("FLOAT_CONDITIONING_COMPONENT_LIMIT".into())}let signs=float_component_signs(&original_vertices,&original_triangles,&old_labels,old_components.len())?;
 let mut triangles=original_triangles.clone();let mut face_ids:Vec<u32>=(0..v.nt).collect();let mut removed_faces=Vec::new();let mut roots:Vec<u32>=(0..v.nv).collect();
 for &[a,b] in &collapsed_edges{float_link_collapse(&mut triangles,&mut face_ids,a,b,&mut removed_faces,&mut work)?;roots[b as usize]=a;}
 let mut compact=vec![u32::MAX;v.nv as usize];let mut vertices=Vec::new();for i in 0..v.nv {if roots[i as usize]==i{compact[i as usize]=vertices.len()as u32/3;vertices.extend_from_slice(&rounded[3*i as usize..3*i as usize+3])}}
 let vertex_map:Vec<u32>=roots.iter().map(|&r|compact[r as usize]).collect();for i in &mut triangles{*i=compact[*i as usize]}
 let mut retained_edges=BTreeSet::new();for t in triangles.chunks_exact(3){for k in 0..3{retained_edges.insert(sorted_edge(t[k],t[(k+1)%3]));}}
 for &i in &removed_faces{let t=&original_triangles[3*i as usize..3*i as usize+3];let ids:BTreeSet<_>=t.iter().map(|&x|vertex_map[x as usize]).collect();if ids.len()>2{return Err("FLOAT_CONDITIONING_FACE_IMAGE".into())}if ids.len()==2{let ids:Vec<_>=ids.into_iter().collect();if !retained_edges.contains(&[ids[0],ids[1]]){return Err("FLOAT_CONDITIONING_UNCOVERED_COLLAPSE".into())}}}
 for (i,&source)in face_ids.iter().enumerate(){if !original_triangles[source as usize*3..source as usize*3+3].iter().map(|&x|vertex_map[x as usize]).eq(triangles[i*3..i*3+3].iter().copied()){return Err("FLOAT_CONDITIONING_FACE_MAP".into())}}
 let (new_labels,mut components)=float_topology(vertices.len()/3,&triangles,&mut work)?;
 if old_components.len()!=components.len(){return Err("FLOAT_CONDITIONING_COMPONENT_CHANGE".into())}
 let mut correspondence=vec![u32::MAX;components.len()];for(i,&id)in face_ids.iter().enumerate(){let current=new_labels[i]as usize;let old=old_labels[id as usize];if correspondence[current]!=u32::MAX&&correspondence[current]!=old{return Err("FLOAT_CONDITIONING_COMPONENT_CHANGE".into())}correspondence[current]=old;}
 if correspondence.iter().copied().collect::<BTreeSet<_>>().len()!=old_components.len(){return Err("FLOAT_CONDITIONING_COMPONENT_CHANGE".into())}
 let (exact,exponents)=float_exact(&vertices)?;float_retained_normals(&original_vertices,&original_triangles,&vertices,&triangles,&face_ids)?;float_embedding(&exact,&triangles,&mut work)?;
 let mut dets=vec![0i128;components.len()];let mut anchors=vec![None;components.len()];for(i,t)in triangles.chunks_exact(3).enumerate(){work.charge(1)?;let label=new_labels[i]as usize;let p=[exact[t[0]as usize],exact[t[1]as usize],exact[t[2]as usize]];let anchor=*anchors[label].get_or_insert(p[0]);dets[label]=fi_add(dets[label],fi_det(fi_minus(p[0],anchor)?,fi_minus(p[1],anchor)?,fi_minus(p[2],anchor)?)?)?;}
 let mut total=0i128;for(i,c)in components.iter_mut().enumerate(){let old=correspondence[i]as usize;if c.euler!=old_components[old].euler||dets[i].signum()!=signs[old]as i128{return Err("FLOAT_CONDITIONING_TOPOLOGY_CHANGE".into())}c.orientation=dets[i].signum()as i32;c.volume=(dets[i]as f64)*2f64.powi(exponents.iter().sum())/6.;total=fi_add(total,dets[i])?;}
 if total<=0{return Err("FLOAT_CONDITIONING_NONPOSITIVE_VOLUME".into())}let volume=(total as f64)*2f64.powi(exponents.iter().sum())/6.;if !volume.is_finite()||volume<=0.{return Err("FLOAT_CONDITIONING_VOLUME_RANGE".into())}
 // This first capability proves component separation with strict AABB planes.
 // Nested/overlapping component boxes require a stronger containment proof.
 let old_boxes=float_component_bounds(&original_vertices,&original_triangles,&old_labels,old_components.len());let new_boxes=float_component_bounds(&vertices,&triangles,&new_labels,components.len());
 for i in 0..components.len(){for j in 0..i{work.charge(1)?;let a=old_boxes[correspondence[i]as usize];let b=old_boxes[correspondence[j]as usize];let x=new_boxes[i];let y=new_boxes[j];if !(0..3).any(|k|(a[k][1]<b[k][0]&&x[k][1]<y[k][0])||(b[k][1]<a[k][0]&&y[k][1]<x[k][0])){return Err("FLOAT_CONDITIONING_COMPONENT_RELATION_UNPROVEN".into())}}}
 let geometry_hash=float_bytes_hash(&vertices,&triangles);let proposal_hash=float_proposal_hash(context,geometry_hash,bound,volume,&vertex_map,&face_ids,&removed_faces,&collapsed_edges,&components);
 super::check(generation,879)?;Ok(FloatConditioningProposal{options:o,context,proposal_hash,geometry_hash,confirmed:false,original_vertices,original_triangles,vertices,triangles,vertex_map,face_ids,removed_faces,collapsed_edges,components,bound,measured,volume,work:work.used,admission_bytes})
}



#[cfg(test)]
#[path = "float_tests.rs"]
mod float_tests;
