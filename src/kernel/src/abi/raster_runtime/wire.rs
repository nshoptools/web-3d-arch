use arch_raster_source::*;
pub(super) struct Failure {pub code:u32,pub message:String}
pub(super) type Result<T> = std::result::Result<T,Failure>;
pub(super) fn fail(code:u32,message:&str)->Failure{Failure{code,message:message.into()}}
pub(super) fn raster_error(e:RasterError)->Failure{
    let code=match e.code {
        ErrorCode::InvalidOptions=>1,ErrorCode::UnsupportedFormat=>2,ErrorCode::UnsupportedMetadata=>3,
        ErrorCode::SvgIsNotRaster=>4,ErrorCode::SourceLimit=>5,ErrorCode::DimensionLimit=>6,
        ErrorCode::PixelLimit=>7,ErrorCode::MemoryLimit=>8,ErrorCode::MetadataLimit=>9,
        ErrorCode::DecodeFailed=>10,ErrorCode::AnimationUnsupported=>11,ErrorCode::UnsupportedBitDepth=>12,
        ErrorCode::ColorManagementRequired=>13,ErrorCode::OrientationUnknown=>14,
        ErrorCode::AlphaPolicyRequired=>15,ErrorCode::RenderConfirmationRequired=>16,
        ErrorCode::CapabilityUnavailable=>17,ErrorCode::WorkLimit=>18,ErrorCode::GraphLimit=>19,
        ErrorCode::RegionLimit=>20,ErrorCode::ConfirmationMismatch=>21,ErrorCode::ConfirmationRequired=>22,
        ErrorCode::InvalidBuffer=>23,ErrorCode::InvariantViolation=>24,
    };fail(code,&e.to_string())
}
pub(super) fn hex(v:&[u8])->String{v.iter().map(|b|format!("{b:02x}")).collect()}
pub(super) fn hash(s:&str)->Result<[u8;32]>{
    if s.len()!=64||!s.is_ascii(){return Err(fail(24,"HASH_ENCODING"))}
    let mut out=[0;32];
    for (i,b) in out.iter_mut().enumerate(){*b=u8::from_str_radix(&s[2*i..2*i+2],16).map_err(|_|fail(24,"HASH_ENCODING"))?;}
    Ok(out)
}
pub(super) fn u32_at(b:&[u8],at:usize)->u32{u32::from_le_bytes(b[at..at+4].try_into().unwrap())}
pub(super) fn i64_at(b:&[u8],at:usize)->i64{i64::from_le_bytes(b[at..at+8].try_into().unwrap())}
pub(super) fn f64_at(b:&[u8],at:usize)->f64{f64::from_le_bytes(b[at..at+8].try_into().unwrap())}
pub(super) struct Config {pub options:ProcessingOptions,pub options_wire:Vec<u8>,pub limits_wire:Vec<u8>,pub origin_wire:Vec<u8>}
pub(super) fn parse(o:&[u8],l:&[u8],origin:&[u8],rgba:bool)->Result<Config>{
    if o.len()!=200||u32_at(o,0)!=2||u32_at(o,4)!=200||u32_at(o,8)!=2{return Err(fail(1,"OPTIONS_VERSION_OR_SIZE"))}
    let w:Vec<u32>=(0..16).map(|i|u32_at(o,4*i)).collect();
    let extent=f64_at(o,64);
    if !(2..=16).contains(&w[3])||![360,520,720,960,1280].contains(&w[4])||w[5]>6||w[6]>100||w[7]>3||w[8]>100||w[9]>100
        ||w[10]>2||w[11]>255||w[12]>0xffffff||w[13]>w[3]||w[14]>16||w[15]>1
        ||!extent.is_finite()||extent<=0.||extent>10000. {
        return Err(fail(1,"OPTIONS_DOMAIN"))
    }
    if (w[10]==0&&(w[11]!=0||w[12]!=0))||(w[10]==1&&(w[11]==0||w[12]!=0))||(w[10]==2&&w[11]!=0) {
        return Err(fail(1,"UNUSED_ALPHA_FIELDS_OR_CUTOFF"))
    }
    if !rgba&&w[15]!=0{return Err(fail(1,"ENCODED_ORIGIN_MUST_BE_EXPLICIT"))}
    let mut palette=Vec::new();let mut bg=Vec::new();
    for i in 0..16 {
        let p=u32_at(o,72+4*i);let b=u32_at(o,136+4*i);
        if i<w[13] as usize {
            if p>0xffffff{return Err(fail(1,"PALETTE_RGB_RANGE"))}
            let rgb=[p as u8,(p>>8)as u8,(p>>16)as u8];
            if palette.contains(&rgb){return Err(fail(1,"DUPLICATE_PALETTE"))}palette.push(rgb);
        }else if p!=0{return Err(fail(1,"UNUSED_PALETTE_FIELD"))}
        if i<w[14] as usize {
            if b==0||b>16||bg.contains(&(b as u16)){return Err(fail(1,"BACKGROUND_LABEL_DOMAIN"))}bg.push(b as u16);
        }else if b!=0{return Err(fail(1,"UNUSED_BACKGROUND_FIELD"))}
    }
    let limits=limits(l)?;
    let origin_value=if w[15]==0 {
        if !origin.is_empty(){return Err(fail(1,"UNUSED_ORIGIN_BLOCK"))}RgbaOrigin::ExplicitSrgb
    }else{
        if origin.len()<72{return Err(fail(16,"RENDER_ORIGIN_SIZE"))}
        let a=u32_at(origin,64) as usize;let b=u32_at(origin,68) as usize;
        if a==0||a>256||b==0||b>256||origin.len()!=72+a+b{return Err(fail(16,"RENDER_ORIGIN_SIZE"))}
        let renderer=std::str::from_utf8(&origin[72..72+a]).map_err(|_|fail(16,"RENDER_ORIGIN_UTF8"))?;
        let confirmation=std::str::from_utf8(&origin[72+a..]).map_err(|_|fail(16,"RENDER_ORIGIN_UTF8"))?;
        if renderer.contains('\0')||confirmation.contains('\0'){return Err(fail(16,"RENDER_ORIGIN_NUL"))}
        RgbaOrigin::ConfirmedRender{source_hash:hex(&origin[..32]),settings_hash:hex(&origin[32..64]),renderer:renderer.into(),confirmation_id:confirmation.into()}
    };
    let alpha_policy=match w[10] {
        0=>AlphaPolicy::RejectPartial,1=>AlphaPolicy::Threshold{cutoff:w[11]as u8},
        _=>AlphaPolicy::MattePartialEncodedSrgb{color:[w[12]as u8,(w[12]>>8)as u8,(w[12]>>16)as u8]}
    };
    Ok(Config{
        limits_wire:encode_limits(&limits),
        options:ProcessingOptions{
            parameters:RasterParameters{semantics_version:SEMANTICS_VERSION.into(),k:w[3]as u8,res:w[4],smooth:w[5]as u8,min_area_pixels:w[6],denoise:w[7]as u8,eps:w[8]as f64,tension:w[9]as f64},
            alpha_policy,background:if bg.is_empty(){BackgroundPolicy::Keep}else{BackgroundPolicy::ExcludeBoundaryConnected{label_ids:bg}},
            fixed_palette:if palette.is_empty(){None}else{Some(palette)},origin:origin_value,
            design_long_edge_mm:extent,limits,accepted_proposal_hash:None,
        }, options_wire:o.to_vec(),origin_wire:origin.to_vec()
    })
}
fn limits(b:&[u8])->Result<Limits>{
    let d=Limits{max_source_bytes:16*1024*1024,max_decoded_pixels:4_194_304,max_decoded_bytes:32*1024*1024,
        max_metadata_bytes:1024*1024,max_working_bytes:96*1024*1024,..Limits::default()};
    if b.is_empty(){return Ok(d)}
    if b.len()!=104||u32_at(b,0)!=1||u32_at(b,4)!=104{return Err(fail(1,"LIMITS_VERSION_OR_SIZE"))}
    let mut v=[0u64;12];for(i,x)in v.iter_mut().enumerate(){*x=u64::from_le_bytes(b[8+i*8..16+i*8].try_into().unwrap());}
    let caps=[d.max_source_bytes,d.max_dimension as u64,d.max_decoded_pixels,d.max_decoded_bytes,d.max_metadata_bytes,d.max_working_bytes,
        d.max_processing_pixels,d.max_unique_colors as u64,d.max_vertices as u64,d.max_edges as u64,d.max_regions as u64,d.max_work_units];
    if v.iter().zip(caps).any(|(&v,max)|v==0||v>max){return Err(fail(1,"LIMITS_EXCEED_RUNTIME_CAP_OR_ZERO"))}
    Ok(Limits{max_source_bytes:v[0],max_dimension:v[1]as u32,max_decoded_pixels:v[2],max_decoded_bytes:v[3],
        max_metadata_bytes:v[4],max_working_bytes:v[5],max_processing_pixels:v[6],max_unique_colors:v[7]as u32,
        max_vertices:v[8]as u32,max_edges:v[9]as u32,max_regions:v[10]as u32,max_work_units:v[11]})
}
pub(super) fn encode_limits(l:&Limits)->Vec<u8>{
    let mut b=Vec::with_capacity(104);b.extend_from_slice(&1u32.to_le_bytes());b.extend_from_slice(&104u32.to_le_bytes());
    for v in [l.max_source_bytes,l.max_dimension as u64,l.max_decoded_pixels,l.max_decoded_bytes,l.max_metadata_bytes,
        l.max_working_bytes,l.max_processing_pixels,l.max_unique_colors as u64,l.max_vertices as u64,l.max_edges as u64,l.max_regions as u64,l.max_work_units]{
        b.extend_from_slice(&v.to_le_bytes())
    }b
}
