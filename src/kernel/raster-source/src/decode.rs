use crate::*;
use image::metadata::Orientation;
use image::{DynamicImage, RgbaImage};
use std::io::Cursor;

fn png_error(e: png::DecodingError) -> RasterError {
    let code = if matches!(e, png::DecodingError::LimitsExceeded) {
        ErrorCode::MemoryLimit
    } else {
        ErrorCode::DecodeFailed
    };
    error(code, format!("Pinned PNG decoder: {e}"))
}
fn webp_error(e: image_webp::DecodingError) -> RasterError {
    let code = if matches!(e, image_webp::DecodingError::MemoryLimitExceeded) {
        ErrorCode::MemoryLimit
    } else {
        ErrorCode::DecodeFailed
    };
    error(code, format!("Pinned WebP decoder: {e}"))
}
fn metadata_len(data: &Option<Vec<u8>>, limits: &Limits) -> Result<(), RasterError> {
    if data
        .as_ref()
        .is_some_and(|d| d.len() as u64 > limits.max_metadata_bytes)
    {
        return Err(error(
            ErrorCode::MetadataLimit,
            "Metadata size limit exceeded",
        ));
    }
    Ok(())
}
fn rgba_from_channels(data: &[u8], channels: usize) -> Result<Vec<u8>, RasterError> {
    let mut rgba = buffer(data.len() / channels * 4, 0u8)?;
    for (src, dst) in data.chunks_exact(channels).zip(rgba.chunks_exact_mut(4)) {
        match channels {
            1 => dst.copy_from_slice(&[src[0], src[0], src[0], 255]),
            2 => dst.copy_from_slice(&[src[0], src[0], src[0], src[1]]),
            3 => dst.copy_from_slice(&[src[0], src[1], src[2], 255]),
            4 => dst.copy_from_slice(src),
            _ => {
                return Err(error(
                    ErrorCode::UnsupportedBitDepth,
                    "Unsupported channel layout",
                ))
            }
        }
    }
    Ok(rgba)
}
fn check_decode_storage(
    limits: &Limits,
    bytes_len: usize,
    width: u32,
    height: u32,
) -> Result<usize, RasterError> {
    let pixels = limits.pixels(width, height)?;
    // Raw decoder output + converted RGBA + orientation copy + bounded input copies.
    let estimate = (pixels as u64) * 16 + (bytes_len as u64) * 3 + limits.max_metadata_bytes * 8;
    if estimate > limits.max_decoded_bytes {
        return Err(error(
            ErrorCode::MemoryLimit,
            "Conservative peak decoded/input storage budget exceeded",
        ));
    }
    if (pixels as u64) * 16 + (bytes_len as u64) * 4 > limits.max_work_units {
        return Err(error(
            ErrorCode::WorkLimit,
            "Decode input/pixel work estimate exceeds budget",
        ));
    }
    Ok(pixels)
}
struct Decoded {
    rgba: Vec<u8>,
    width: u32,
    height: u32,
    exif: Option<Vec<u8>>,
    declared_srgb: bool,
    decoder: &'static str,
    diagnostics: Vec<Diagnostic>,
}

/// Official streaming PNG decoder supplies chunk events. Passing None skips
/// compressed pixel output; no independent PNG framing or codec is implemented.
fn png_preflight(bytes: &[u8], limits: &Limits) -> Result<Vec<Diagnostic>, RasterError> {
    let mut config = png::DecodeOptions::default();
    config.set_ignore_checksums(false);
    config.set_skip_ancillary_crc_failures(false);
    config.set_ignore_text_chunk(true);
    let mut stream = png::StreamingDecoder::new_with_options(config);
    let mut offset = 0usize;
    let mut metadata = 0u64;
    let mut events = 0u64;
    let mut ignored = std::collections::BTreeSet::new();
    loop {
        events += 1;
        if events > bytes.len() as u64 * 2 + 16 {
            return Err(error(ErrorCode::WorkLimit, "PNG event budget exhausted"));
        }
        let (used, event) = stream.update(&bytes[offset..], None).map_err(png_error)?;
        offset += used;
        match event {
            png::Decoded::ChunkBegin(length, kind) => {
                let name = kind.0;
                if !matches!(&name, b"IDAT") {
                    metadata = metadata.checked_add(u64::from(length)).ok_or_else(|| {
                        error(ErrorCode::MetadataLimit, "PNG metadata count overflow")
                    })?;
                    if metadata > limits.max_metadata_bytes {
                        return Err(error(
                            ErrorCode::MetadataLimit,
                            "PNG cumulative nonpixel chunk limit exceeded",
                        ));
                    }
                }
                match &name {
                    b"iCCP"|b"cICP"|b"mDCV"|b"cLLI"=>return Err(error(ErrorCode::ColorManagementRequired,
                        "PNG color profile/HDR chunk requires explicit validated conversion, including malformed profile payloads")),
                    b"acTL"|b"fcTL"|b"fdAT"=>return Err(error(ErrorCode::AnimationUnsupported,"APNG is not an implicit static image")),
                    b"IHDR"|b"PLTE"|b"IDAT"|b"IEND"|b"tRNS"|b"sRGB"|b"gAMA"|b"cHRM"|b"eXIf"=>{},
                    b"bKGD"|b"pHYs"|b"sBIT"|b"tIME"|b"tEXt"|b"zTXt"|b"iTXt"|b"oFFs"=>{
                        ignored.insert(name);
                    }
                    _=>return Err(error(ErrorCode::UnsupportedMetadata,format!(
                        "PNG chunk {} is outside the audited metadata subset",String::from_utf8_lossy(&name)))),
                }
            }
            png::Decoded::ChunkComplete(kind) if kind.0 == *b"IHDR" => {
                let info = stream
                    .info()
                    .ok_or_else(|| error(ErrorCode::DecodeFailed, "Missing PNG IHDR info"))?;
                check_decode_storage(limits, bytes.len(), info.width, info.height)?;
            }
            png::Decoded::BadAncillaryChunk(kind) => {
                return Err(error(
                    ErrorCode::DecodeFailed,
                    format!(
                        "Malformed PNG ancillary chunk {} was reported by the codec",
                        String::from_utf8_lossy(&kind.0)
                    ),
                ))
            }
            png::Decoded::ChunkComplete(kind) if kind.0 == *b"IEND" => {
                if offset != bytes.len() {
                    return Err(error(
                        ErrorCode::DecodeFailed,
                        "PNG has trailing bytes after IEND",
                    ));
                }
                break;
            }
            png::Decoded::Nothing if used == 0 => {
                return Err(error(ErrorCode::DecodeFailed, "Truncated PNG event stream"))
            }
            _ => {}
        }
        if offset == bytes.len() {
            return Err(error(
                ErrorCode::DecodeFailed,
                "PNG ended before complete IEND",
            ));
        }
    }
    Ok(ignored.into_iter().map(|name|Diagnostic {code:"png_metadata_retained_without_application".into(),
        message:format!("{} remains in original bytes; explicit alpha/design extent takes precedence. Text/XMP is not interpreted.",
            String::from_utf8_lossy(&name))}).collect())
}

fn png_decode(bytes: &[u8], limits: &Limits) -> Result<Decoded, RasterError> {
    let metadata_diagnostics = png_preflight(bytes, limits)?;
    let mut decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: usize::try_from(limits.max_metadata_bytes).map_err(|_| {
                error(
                    ErrorCode::MemoryLimit,
                    "PNG scratch size exceeds address space",
                )
            })?,
        },
    );
    decoder.set_ignore_text_chunk(true);
    decoder.ignore_checksums(false);
    let header = decoder.read_header_info().map_err(png_error)?;
    let (width, height) = (header.width, header.height);
    check_decode_storage(limits, bytes.len(), width, height)?;
    if header.bit_depth == png::BitDepth::Sixteen {
        return Err(error(
            ErrorCode::UnsupportedBitDepth,
            "16-bit PNG to RGBA8 needs explicit precision conversion",
        ));
    }
    decoder.set_transformations(png::Transformations::EXPAND);
    let mut reader = decoder.read_info().map_err(png_error)?;
    if let Some(a) = reader.info().animation_control {
        return Err(error(
            ErrorCode::AnimationUnsupported,
            format!(
                "APNG has {} frames; select/render a frame explicitly",
                a.num_frames
            ),
        ));
    }
    let size = reader
        .output_buffer_size()
        .ok_or_else(|| error(ErrorCode::MemoryLimit, "PNG output size overflow"))?;
    if size as u64 > limits.max_decoded_bytes {
        return Err(error(
            ErrorCode::MemoryLimit,
            "PNG output size exceeds limit",
        ));
    }
    let mut raw = buffer(size, 0u8)?;
    let out = reader.next_frame(&mut raw).map_err(png_error)?;
    reader.finish().map_err(png_error)?;
    let info = reader.info();
    if info.icc_profile.is_some()
        || info.coding_independent_code_points.is_some()
        || info.mastering_display_color_volume.is_some()
        || info.content_light_level.is_some()
        || (info.srgb.is_none() && (info.gama_chunk.is_some() || info.chrm_chunk.is_some()))
    {
        return Err(error(ErrorCode::ColorManagementRequired,
            "PNG ICC/CICP/HDR or non-sRGB gamma/chromaticities require a validated color conversion; original input is not normalized silently"));
    }
    if out.bit_depth != png::BitDepth::Eight {
        return Err(error(
            ErrorCode::UnsupportedBitDepth,
            "PNG expansion did not produce 8-bit channels",
        ));
    }
    let channels = match out.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        _ => {
            return Err(error(
                ErrorCode::DecodeFailed,
                "PNG palette was not expanded",
            ))
        }
    };
    let exif = info.exif_metadata.as_ref().map(|e| e.to_vec());
    metadata_len(&exif, limits)?;
    Ok(Decoded {
        rgba: rgba_from_channels(&raw[..out.buffer_size()], channels)?,
        width,
        height,
        exif,
        declared_srgb: info.srgb.is_some(),
        decoder: "png=0.18.1",
        diagnostics: metadata_diagnostics,
    })
}

fn jpeg_decode(bytes: &[u8], limits: &Limits) -> Result<Decoded, RasterError> {
    use zune_core::{bytestream::ZCursor, colorspace::ColorSpace, options::DecoderOptions};
    let config = DecoderOptions::new_safe()
        .set_strict_mode(true)
        .set_max_width(65535)
        .set_max_height(65535)
        .jpeg_set_max_scans(64)
        .jpeg_set_out_colorspace(ColorSpace::RGB);
    let mut decoder = zune_jpeg::JpegDecoder::new_with_options(ZCursor::new(bytes), config);
    let jpeg_error = |e| {
        error(
            ErrorCode::DecodeFailed,
            format!("Pinned strict JPEG decoder: {e:?}"),
        )
    };
    decoder.decode_headers().map_err(jpeg_error)?;
    let (width, height) = decoder
        .dimensions()
        .ok_or_else(|| error(ErrorCode::DecodeFailed, "JPEG has no dimensions"))?;
    let (width, height) = (width as u32, height as u32);
    let pixels = check_decode_storage(limits, bytes.len(), width, height)?;
    if !matches!(
        decoder.input_colorspace(),
        Some(ColorSpace::Luma | ColorSpace::RGB | ColorSpace::YCbCr)
    ) {
        return Err(error(
            ErrorCode::ColorManagementRequired,
            "JPEG CMYK/YCCK or other input colorspace requires a validated conversion",
        ));
    }
    let profile = decoder.icc_profile();
    metadata_len(&profile, limits)?;
    if profile.is_some() {
        return Err(error(
            ErrorCode::ColorManagementRequired,
            "JPEG ICC profile requires validated conversion to sRGB",
        ));
    }
    let exif = decoder.exif().cloned();
    metadata_len(&exif, limits)?;
    decoder.set_options(decoder.options().jpeg_set_out_colorspace(ColorSpace::RGB));
    if decoder.output_buffer_size() != Some(pixels * 3) {
        return Err(error(
            ErrorCode::UnsupportedBitDepth,
            "JPEG output is not the requested RGB8 layout",
        ));
    }
    let mut rgb = buffer(pixels * 3, 0u8)?;
    decoder.decode_into(&mut rgb).map_err(jpeg_error)?;
    Ok(Decoded {rgba:rgba_from_channels(&rgb,3)?,width,height,exif,declared_srgb:false,
        decoder:"zune-jpeg=0.5.15 / zune-core=0.5.3 / strict,safe,max-scans=64",
        diagnostics:vec![Diagnostic {code:"jpeg_decoder_policy".into(),
            message:"Strict JPEG decode, safe scalar path, at most 64 scans; only Luma/RGB/YCbCr accepted. Other APP/XMP metadata remains in original bytes and is not interpreted.".into()}]})
}

fn webp_decode(bytes: &[u8], limits: &Limits) -> Result<Decoded, RasterError> {
    let mut decoder = image_webp::WebPDecoder::new(Cursor::new(bytes)).map_err(webp_error)?;
    let (width, height) = decoder.dimensions();
    let pixels = check_decode_storage(limits, bytes.len(), width, height)?;
    decoder.set_memory_limit(limits.max_metadata_bytes as usize);
    if decoder.is_animated() {
        return Err(error(
            ErrorCode::AnimationUnsupported,
            format!(
                "Animated WebP has {} frames; frame selection is not implicit",
                decoder.num_frames()
            ),
        ));
    }
    let profile = decoder.icc_profile().map_err(webp_error)?;
    metadata_len(&profile, limits)?;
    if profile.is_some() {
        return Err(error(
            ErrorCode::ColorManagementRequired,
            "WebP ICC profile requires validated conversion to sRGB",
        ));
    }
    let exif = decoder.exif_metadata().map_err(webp_error)?;
    metadata_len(&exif, limits)?;
    let channels = if decoder.has_alpha() { 4 } else { 3 };
    decoder.set_memory_limit(limits.max_decoded_bytes as usize);
    let mut raw = buffer(pixels * channels, 0u8)?;
    decoder.read_image(&mut raw).map_err(webp_error)?;
    Ok(Decoded {
        rgba: rgba_from_channels(&raw, channels)?,
        width,
        height,
        exif,
        declared_srgb: false,
        decoder: "image-webp=0.2.4",
        diagnostics: Vec::new(),
    })
}

/// Content-sniffed PNG/JPEG/WebP decode using pinned codecs and in-memory Cursor only.
/// Unsupported metadata/animation are typed errors; source bytes remain owned by the caller.
pub fn decode_image(bytes: &[u8], options: DecodeOptions) -> Result<SourceImage, RasterError> {
    options.limits.validate()?;
    if bytes.len() as u64 > options.limits.max_source_bytes {
        return Err(error(
            ErrorCode::SourceLimit,
            "Encoded source byte limit exceeded",
        ));
    }
    let source_hash = hash(bytes);
    let result = (|| {
        let format = match image::guess_format(bytes) {
            Ok(image::ImageFormat::Png) => SourceFormat::Png,
            Ok(image::ImageFormat::Jpeg) => SourceFormat::Jpeg,
            Ok(image::ImageFormat::WebP) => SourceFormat::Webp,
            _ => {
                let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]);
                if prefix.contains("<svg") || prefix.contains(":svg") {
                    return Err(error(
                        ErrorCode::SvgIsNotRaster,
                        "SVG must use vector-source or an explicitly confirmed external renderer",
                    ));
                }
                return Err(error(
                    ErrorCode::UnsupportedFormat,
                    "Only content-identified PNG, JPEG and WebP are enabled",
                ));
            }
        };
        let decoded = match format {
            SourceFormat::Png => png_decode(bytes, &options.limits)?,
            SourceFormat::Jpeg => jpeg_decode(bytes, &options.limits)?,
            SourceFormat::Webp => webp_decode(bytes, &options.limits)?,
        };
        let orientation=match &decoded.exif {
            None=>None,
            Some(data)=>Some(Orientation::from_exif_chunk(data).ok_or_else(||error(
                ErrorCode::OrientationUnknown,"EXIF chunk has no recognized primary IFD0 orientation; refusing implicit identity"))?),
        };
        let mut image = DynamicImage::ImageRgba8(
            RgbaImage::from_raw(decoded.width, decoded.height, decoded.rgba)
                .ok_or_else(|| error(ErrorCode::InvalidBuffer, "Decoder RGBA length mismatch"))?,
        );
        if let Some(orientation) = orientation {
            image.apply_orientation(orientation);
        }
        let (width, height) = (image.width(), image.height());
        options.limits.pixels(width, height)?;
        let rgba = image.into_rgba8().into_raw();
        let mut diagnostics=vec![Diagnostic {code:"decoder_resource_scope".into(),
            message:"Header/pixel/output budgets enforced; dependency scratch limits are best effort, host watchdog still required".into()}];
        if !decoded.declared_srgb {
            diagnostics.push(Diagnostic {code:"untagged_color_assumption".into(),
                message:"Decoder RGB is untagged; treating it as sRGB requires confirmation before manufacturing. No ICC conversion was performed".into()});
        }
        diagnostics.extend(decoded.diagnostics);
        let alpha = alpha_summary(&rgba);
        Ok(SourceImage {
            schema_version:SCHEMA_VERSION,original_bytes:bytes.to_vec(),source_hash:source_hash.clone(),
            format,decoder:decoded.decoder.into(),encoded_width:decoded.width,encoded_height:decoded.height,
            width,height,rgba_hash:hash(&rgba),rgba,orientation:OrientationRecord {
                exif_value:orientation.map(Orientation::to_exif),
                applied:orientation.is_some_and(|v|v!=Orientation::NoTransforms),original_exif:decoded.exif,
            },alpha,color:ColorRecord {
                interpretation:if decoded.declared_srgb{"declared_srgb8"}else{"untagged_decoder_rgb_assumed_srgb8"}.into(),
                declared_srgb:decoded.declared_srgb,requires_confirmation:!decoded.declared_srgb,
                note:"Original metadata stays in encoded source. Unsupported profiles and ambiguous orientation are typed failures.".into(),
            },diagnostics,
        })
    })();
    result.map_err(|mut e: RasterError| {
        e.source_hash = Some(source_hash);
        e
    })
}
