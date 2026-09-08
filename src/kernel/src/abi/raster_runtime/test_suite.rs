use super::*;
use super::super::{arch_control_reset,arch_input_create,arch_input_ptr,arch_input_release,
    arch_snapshot_ptr,arch_snapshot_len,arch_snapshot_release,arch_snapshot_acquire,
    arch_error_ptr,arch_error_len,arch_control_ptr,arch_build_svg,arch_export_stl,
    arch_output_ptr,arch_output_len,arch_output_release,arch_metadata_ptr,arch_metadata_len};
use serde_json::{Value,json};
static REPORT:std::sync::Mutex<Vec<u8>>=std::sync::Mutex::new(Vec::new());
fn assert_ok(value:bool,what:&str)->std::result::Result<(),String>{if value{Ok(())}else{Err(format!("{what}: {}",last_error()))}}
fn last_error()->String{
    let p=arch_error_ptr();let n=arch_error_len();
    let b=unsafe{std::slice::from_raw_parts(p,n as usize)};
    format!("code={} {}",arch_raster_error_code(),String::from_utf8_lossy(b))
}
fn input(b:&[u8])->u32{
    let id=arch_input_create(b.len()as u32);
    if id!=0{unsafe{std::ptr::copy_nonoverlapping(b.as_ptr(),arch_input_ptr(id),b.len());}}id
}
fn bytes(id:u32,kind:u32)->Vec<u8>{
    let n=arch_raster_buffer_bytes(id,kind)as usize;
    if n==0{return Vec::new()}
    unsafe{std::slice::from_raw_parts(arch_raster_buffer_ptr(id,kind),n)}.to_vec()
}
fn options(defaults:bool)->Vec<u8>{
    let mut b=vec![0u8;200];
    for(i,v)in [2,200,2,4,520,if defaults{3}else{0},if defaults{5}else{0},if defaults{1}else{0},if defaults{35}else{0},if defaults{65}else{0},0,0,0,0,0,0].into_iter().enumerate(){
        b[i*4..i*4+4].copy_from_slice(&(v as u32).to_le_bytes());
    }
    b[64..72].copy_from_slice(&20f64.to_le_bytes());b
}
fn digest(b:&[u8])->String{wire::hex(&Sha256::digest(b))}
fn next(g:&mut u32)->u32{*g+=1;assert_eq!(arch_control_reset(*g),1);*g}
fn confirmed(p:u32,g:&mut u32)->std::result::Result<u32,String>{
    let h=bytes(p,1)[128..160].to_vec();let id=arch_raster_confirm(p,input(&h),next(g));
    assert_ok(id>0,"confirm")?;Ok(id)
}
fn record(id:u32,name:&str)->Value{
    let summary=bytes(id,1);
    json!({"case":name,"proposalHash":wire::hex(&summary[128..160]),
        "width":wire::u32_at(&summary,32),"height":wire::u32_at(&summary,36),
        "materials":wire::u32_at(&summary,40),"derivedVertices":wire::u32_at(&summary,56),
        "labels":digest(&bytes(id,6)),"geometry":digest(&bytes(id,28)),
        "original":digest(&bytes(id,3))})
}
fn run_suite()->std::result::Result<Vec<Value>,String>{
    let mut g=CONTROL[0].load(Ordering::Acquire);let mut records=Vec::new();
    assert_ok(arch_raster_owned_bytes()==0,"initial budget")?;
    let data=[255,0,0,255,0,0,255,255];
    let o=options(false);let p=arch_raster_prepare_rgba(input(&data),2,1,input(&o),0,0,next(&mut g));
    assert_ok(p>0,"analytic seam prepare")?;
    let old=bytes(p,1);let old_ptr=arch_raster_buffer_ptr(p,1);
    for k in 1..32 {assert_ok(arch_raster_buffer_bytes(p,k)==0||arch_raster_buffer_ptr(p,k)as usize%8==0,"aligned buffers")?;}
    records.push(record(p,"seam"));
    assert_ok(bytes(p,6)==[2u16.to_le_bytes(),1u16.to_le_bytes()].concat(),"automatic RGB lexicographic palette: blue=1, red=2")?;
    let edges=bytes(p,12);let shared=edges.chunks_exact(32).filter(|e|wire::u32_at(e,8)>0&&wire::u32_at(e,12)>0).count();
    assert_ok(shared==1,"one shared seam")?;
    assert_ok(arch_build_raster(p,2.,next(&mut g))==0&&arch_raster_error_code()==22,"unaccepted build rejects")?;
    let bad=input(&[3;32]);assert_ok(arch_raster_confirm(p,bad,next(&mut g))==0&&arch_raster_error_code()==21,"bad hash")?;
    assert_ok(arch_input_ptr(bad).is_null(),"bad hash consumed")?;
    let a=confirmed(p,&mut g)?;let a2=confirmed(p,&mut g)?;assert_ok(a2==a,"confirm idempotence")?;
    assert_ok(arch_raster_release(a2)==1,"idempotent additional lease")?;
    let snapshot=arch_build_raster(a,2.,next(&mut g));assert_ok(snapshot>0,"accepted build")?;
    let n=arch_snapshot_len(snapshot)as usize;let sp=arch_snapshot_ptr(snapshot);
    let copied=unsafe{std::slice::from_raw_parts(sp,n)}.to_vec();
    assert_ok(wire::u32_at(&copied,0)==0x48435241&&wire::u32_at(&copied,28)==2,"ARCH material parts")?;
    let parts=wire::u32_at(&copied,56)as usize;
    // PSB01 routes canonical parts by source region, not sorted palette color.
    // Check each routed label's exact color rather than assuming label order.
    let meta:Value=serde_json::from_slice(unsafe{std::slice::from_raw_parts(arch_metadata_ptr(snapshot),arch_metadata_len(snapshot)as usize)}).unwrap();
    assert_ok(meta["sourceHash"]==digest(&data)&&meta["originalRgbaHash"]==digest(&data)&&meta["proposalHash"]==wire::hex(&old[128..160]),"canonical source provenance")?;
    assert_ok(meta["regionGrouping"]=="source-region"&&meta["totalErrorBoundMm"].is_null(),"explicit canonical grouping and unknown whole bound")?;
    let rows=meta["sourceRegions"].as_array().unwrap();assert_ok(rows.len()==2,"source region coverage")?;
    for (i,row) in rows.iter().enumerate(){
     let color=match row["label"].as_u64().unwrap(){1=>0x0000ffff,2=>0xff0000ff,_=>return Err("unexpected palette label".into())};
     assert_ok(row["sourceIndex"]==i&&wire::u32_at(&copied,parts+i*40+20)==i as u32&&wire::u32_at(&copied,parts+i*40+16)==color,"root source-routed color encoding RRGGBBAA")?;
    }
    let volume=wire::f64_at(&copied,parts+32)+wire::f64_at(&copied,parts+40+32);
    assert_ok((volume-400.).abs()<1e-6,"analytic 20x10x2 total volume")?;
    assert_ok(arch_snapshot_acquire(snapshot)==sp,"root snapshot acquire")?;
    let output=arch_export_stl(snapshot,0,next(&mut g));assert_ok(output>0&&arch_output_len(output)>84&&!arch_output_ptr(output).is_null(),"same root STL path")?;
    assert_ok(arch_output_release(output)==1,"STL release")?;
    assert_ok(arch_raster_acquire(p)==p,"raster acquire")?;
    arch_raster_release(p);
    assert_ok(bytes(p,1)==old&&arch_raster_buffer_ptr(p,1)==old_ptr,"old raster immutable")?;
    arch_raster_release(a);
    assert_ok(unsafe{std::slice::from_raw_parts(sp,n)}==copied,"snapshot survives source accepted release")?;
    assert_ok(arch_snapshot_release(snapshot)==1&&arch_snapshot_release(snapshot)==1&&arch_snapshot_release(snapshot)==0,"snapshot primary and acquired leases")?;
    assert_ok(arch_raster_release(p)==1&&arch_raster_release(p)==0&&arch_raster_buffer_ptr(p,1).is_null(),"raster last release")?;
    assert_ok(arch_build_raster(a,2.,next(&mut g))==0&&arch_raster_error_code()==105,"stale accepted handle")?;
    // Default shared curved boundary / holes / junctions retain a certified graph.
    for name in ["curved-default","hole","t-junction","islands","empty"]{
        let(w,h)=(24u32,20u32);let mut pixels=Vec::new();
        for y in 0..h{for x in 0..w{
            let label=match name{
                "curved-default"=>if x<8+y/3{1}else{2},
                "hole"=>if (8..16).contains(&x)&&(6..14).contains(&y){0}else{1},
                "t-junction"=>if x<12{1}else if y<10{2}else{3},
                "islands"=>if (2..6).contains(&x)&&(2..6).contains(&y)||(18..22).contains(&x)&&(14..18).contains(&y){1}else{0},
                _=>0
            };
            pixels.extend_from_slice(&match label{0=>[0,0,0,0],1=>[255,0,0,255],2=>[0,0,255,255],_=>[0,255,0,255]});
        }}
        let op=options(name=="curved-default");
        let p=arch_raster_prepare_rgba(input(&pixels),w,h,input(&op),0,0,next(&mut g));
        assert_ok(p>0,&format!("{name} prepare"))?;records.push(record(p,name));
        if name=="curved-default"{assert_ok(arch_raster_buffer_bytes(p,17)>0,"default tension produces curves")?;}
        let a=confirmed(p,&mut g)?;
        let mesh=arch_build_raster(a,1.,next(&mut g));
        if name=="empty"{assert_ok(mesh==0&&arch_raster_error_code()==108,"empty source explicit")?;}
        else{
         assert_ok(mesh>0,&format!("{name} build"))?;
         if name=="islands"{
          let m:Value=serde_json::from_slice(unsafe{std::slice::from_raw_parts(arch_metadata_ptr(mesh),arch_metadata_len(mesh)as usize)}).unwrap();
          let rows=m["sourceRegions"].as_array().unwrap();
          assert_ok(rows.len()==2&&rows[0]["rasterRegionId"]!=rows[1]["rasterRegionId"]&&rows[0]["label"]==rows[1]["label"],"same-color islands preserve distinct source regions")?;
          let b=unsafe{std::slice::from_raw_parts(arch_snapshot_ptr(mesh),arch_snapshot_len(mesh)as usize)};
          assert_ok(wire::u32_at(b,28)==2,"same-color islands are not merged by palette")?;
         }
         arch_snapshot_release(mesh);
        }
        arch_raster_release(p);arch_raster_release(a);
    }
    let fixture_base=concat!(env!("CARGO_MANIFEST_DIR"),"/raster-source/tests/fixtures/");
    let _=fixture_base;
    let encoded:&[(&str,&[u8])]=&[
        ("png",include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"),"/raster-source/tests/fixtures/synthetic-rgba.png"))),
        ("jpeg",include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"),"/raster-source/tests/fixtures/synthetic-rgb.jpg"))),
        ("exif6",include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"),"/raster-source/tests/fixtures/synthetic-exif6.jpg"))),
        ("webp-lossless",include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"),"/raster-source/tests/fixtures/synthetic-rgba.webp"))),
        ("webp-vp8",include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"),"/raster-source/tests/fixtures/synthetic-lossy-vp8.webp")))
    ];
    for &(name,encoded) in encoded{
        let mut op=options(true);op[40..44].copy_from_slice(&1u32.to_le_bytes());op[44..48].copy_from_slice(&128u32.to_le_bytes());
        let p=arch_raster_prepare_encoded(input(encoded),input(&op),0,next(&mut g));
        assert_ok(p>0,&format!("{name} decoded prepare"))?;
        assert_ok(bytes(p,2)==encoded,"original encoded retained")?;
        records.push(record(p,name));
        let a=confirmed(p,&mut g)?;
        assert_ok(bytes(a,3)==bytes(p,3),"confirmation preserves original RGBA")?;
        let mesh=arch_build_raster(a,1.,next(&mut g));
        if mesh==0 {assert_ok(arch_raster_error_code()==108,"only empty minA output permitted for tiny decoder fixture")?;}else{arch_snapshot_release(mesh);}
        arch_raster_release(p);arch_raster_release(a);
    }
    // Registered handles, exact options, limits, origins, nonfinite and stale jobs.
    let mut errors=Vec::new();
    for name in ["duplicate","forged","short-options","nan","invalid-limits","huge-dimensions","bad-bytes","svg","cancelled","stale","partial-alpha"]{
        let mut op=options(false);
        let generation=next(&mut g);
        let id=match name{
            "duplicate"=>{let i=input(&op);arch_raster_prepare_rgba(i,1,1,i,0,0,generation)},
            "forged"=>arch_raster_prepare_rgba(u32::MAX,1,1,input(&op),0,0,generation),
            "short-options"=>arch_raster_prepare_rgba(input(&data),2,1,input(&[0;199]),0,0,generation),
            "nan"=>{op[64..72].copy_from_slice(&f64::NAN.to_le_bytes());arch_raster_prepare_rgba(input(&data),2,1,input(&op),0,0,generation)},
            "invalid-limits"=>{let mut lim=vec![255;104];lim[..4].copy_from_slice(&1u32.to_le_bytes());lim[4..8].copy_from_slice(&104u32.to_le_bytes());arch_raster_prepare_rgba(input(&data),2,1,input(&op),input(&lim),0,generation)},
            "huge-dimensions"=>arch_raster_prepare_rgba(input(&data),u32::MAX,u32::MAX,input(&op),0,0,generation),
            "bad-bytes"=>arch_raster_prepare_encoded(input(b"bad"),input(&op),0,generation),
            "svg"=>arch_raster_prepare_encoded(input(b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>"),input(&op),0,generation),
            "cancelled"=>{CONTROL[3].store(generation,Ordering::Release);arch_raster_prepare_rgba(input(&data),2,1,input(&op),0,0,generation)},
            "stale"=>arch_raster_prepare_rgba(input(&data),2,1,input(&op),0,0,generation-1),
            _=>arch_raster_prepare_rgba(input(&[255,0,0,128]),1,1,input(&op),0,0,generation)
        };
        assert_ok(id==0,name)?;errors.push(json!({"case":name,"code":arch_raster_error_code()}));
        assert_ok(arch_raster_owned_bytes()==0,"failed call leaked root ownership")?;
    }
    // Fixed input count and per-input cap, type confusion, readers and result cap.
    assert_ok(arch_input_create(0)==0&&arch_input_create(16*1024*1024+1)==0,"input byte bounds")?;
    let four:Vec<_>=(0..4).map(|_|input(&[0])).collect();
    assert_ok(four.iter().all(|&id|id>0)&&input(&[0])==0,"input count bound")?;
    for id in four {arch_input_release(id);}
    let mut held=Vec::new();
    for _ in 0..8 {
        let p=arch_raster_prepare_rgba(input(&data),2,1,input(&o),0,0,next(&mut g));
        assert_ok(p>0,"eight immutable prepared slots")?;held.push(p);
    }
    let existing=bytes(held[0],1);
    let rejected=arch_raster_prepare_rgba(input(&data),2,1,input(&o),0,0,next(&mut g));
    assert_ok(rejected==0&&arch_raster_error_code()==103,"ninth result bounded")?;
    assert_ok(bytes(held[0],1)==existing,"capacity failure preserves old result")?;
    assert_ok(arch_snapshot_ptr(held[0]).is_null()&&arch_snapshot_release(held[0])==0&&arch_input_release(held[0])==0,"typed registry namespaces")?;
    for _ in 1..64{assert_ok(arch_raster_acquire(held[0])==held[0],"additional reader")?;}
    assert_ok(arch_raster_acquire(held[0])==0,"reader limit")?;
    for _ in 1..64{arch_raster_release(held[0]);}
    for p in held{arch_raster_release(p);}
    // Admission reserves codec + working + packing, on top of registered bytes.
    let holders=[arch_input_create(16*1024*1024),arch_input_create(16*1024*1024)];
    let large=arch_input_create(16*1024*1024);let option_id=input(&o);
    assert_ok(holders.iter().all(|&id|id>0)&&large>0&&option_id>0,"budget setup")?;
    assert_ok(arch_raster_prepare_encoded(large,option_id,0,next(&mut g))==0&&arch_raster_error_code()==8,"aggregate transient budget")?;
    for id in holders{arch_input_release(id);}
    assert_ok(arch_raster_owned_bytes()==0,"budget reservation released")?;
    // Precision cannot silently erase a sub-grid source feature.
    let mut tiny=o.clone();tiny[64..72].copy_from_slice(&1e-9f64.to_le_bytes());
    assert_ok(arch_raster_prepare_rgba(input(&data),2,1,input(&tiny),0,0,next(&mut g))==0&&arch_raster_error_code()==107,"sub-grid geometry explicit")?;
    // Size, options and renderer settings have separate proposal hashes.
    let p=arch_raster_prepare_rgba(input(&data),2,1,input(&o),0,0,next(&mut g));
    let old_hash=bytes(p,1)[128..160].to_vec();
    let mut changed=o.clone();changed[64..72].copy_from_slice(&21f64.to_le_bytes());
    let p2=arch_raster_prepare_rgba(input(&data),2,1,input(&changed),0,0,next(&mut g));
    assert_ok(bytes(p2,1)[128..160]!=old_hash,"extent bound in derived proposal")?;
    assert_ok(arch_raster_confirm(p2,input(&old_hash),next(&mut g))==0&&arch_raster_error_code()==21,"old hash rejects resized proposal")?;
    arch_raster_release(p);arch_raster_release(p2);
    // Renderer provenance bound to the proposal, verified without renderer I/O.
    let mut op=options(false);op[60..64].copy_from_slice(&1u32.to_le_bytes());
    let mut origin=vec![1u8;64];origin.extend_from_slice(&1u32.to_le_bytes());origin.extend_from_slice(&1u32.to_le_bytes());origin.extend_from_slice(b"rc");
    let p=arch_raster_prepare_rgba(input(&data),2,1,input(&op),0,input(&origin),next(&mut g));
    assert_ok(p>0,"confirmed rendered RGBA")?;records.push(record(p,"rendered"));
    let before=bytes(p,1);
    unsafe{let p=arch_raster_buffer_ptr(p,28).cast_mut();*p^=1;}
    assert_ok(arch_raster_confirm(p,input(&before[128..160]),next(&mut g))==0&&arch_raster_error_code()==104,"tampered buffer integrity")?;
    arch_raster_release(p);
    // Existing SVG ABI remains usable in the same root module / allocator.
    let svg=b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20mm\" height=\"10mm\"><path d=\"M0 0H20V10H0Z\"/></svg>";
    let snapshot=arch_build_svg(input(svg),1.,0.,0.004,next(&mut g));
    assert_ok(snapshot>0,"same module existing SVG build")?;arch_snapshot_release(snapshot);
    assert_ok(arch_input_release(u32::MAX)==0&&arch_raster_owned_bytes()==0,"all ownership released")?;
    let _=arch_control_ptr();records.push(json!({"errors":errors}));Ok(records)
}
#[unsafe(no_mangle)]pub extern "C" fn arch_raster_test_run()->u32{
    let result=run_suite();let ok=result.is_ok();
    let value=match result{Ok(records)=>json!({"passed":true,"records":records}),Err(e)=>json!({"passed":false,"error":e})};
    *REPORT.lock().unwrap()=serde_json::to_vec(&value).unwrap();u32::from(ok)
}
#[unsafe(no_mangle)]pub extern "C" fn arch_raster_test_report_ptr()->*const u8{REPORT.lock().unwrap().as_ptr()}
#[unsafe(no_mangle)]pub extern "C" fn arch_raster_test_report_len()->u32{REPORT.lock().unwrap().len()as u32}
