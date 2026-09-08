use arch_raster_source::*;
use sha2::{Digest, Sha256};
#[path = "support/fixtures.rs"]
mod fixtures;
fn sha(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
fn decode(bytes: &[u8]) -> SourceImage {
    decode_image(bytes, Default::default()).unwrap()
}
#[test]
fn actual_png_and_webp_preserve_pixels_source_bytes_hash_alpha() {
    for (bytes, format, srgb) in [
        (
            include_bytes!("fixtures/synthetic-rgba.png").as_slice(),
            SourceFormat::Png,
            true,
        ),
        (
            include_bytes!("fixtures/synthetic-rgba.webp").as_slice(),
            SourceFormat::Webp,
            false,
        ),
    ] {
        let d = decode(bytes);
        assert_eq!(d.format, format);
        assert_eq!((d.width, d.height), (3, 2));
        assert_eq!(d.original_bytes, bytes);
        assert_eq!(d.source_hash, sha(bytes));
        assert_eq!(d.rgba, fixtures::RGBA);
        assert_eq!(d.rgba_hash, sha(&fixtures::RGBA));
        assert_eq!(
            d.alpha,
            AlphaSummary {
                transparent: 1,
                partial: 1,
                opaque: 4
            }
        );
        assert_eq!(d.color.declared_srgb, srgb);
        assert_eq!(d.color.requires_confirmation, !srgb);
        assert_eq!(d.orientation.exif_value, None);
    }
}
#[test]
fn actual_jpeg_decode_and_exif_rotation_use_independent_index_mapping() {
    let normal = decode(include_bytes!("fixtures/synthetic-rgb.jpg"));
    let rotated = decode(include_bytes!("fixtures/synthetic-exif6.jpg"));
    assert_eq!(normal.format, SourceFormat::Jpeg);
    assert_eq!((normal.width, normal.height), (16, 8));
    assert_eq!((rotated.encoded_width, rotated.encoded_height), (16, 8));
    assert_eq!((rotated.width, rotated.height), (8, 16));
    assert_eq!(rotated.orientation.exif_value, Some(6));
    assert!(rotated.orientation.applied);
    assert_eq!(rotated.alpha.opaque, 128);
    let mut expected = vec![0; normal.rgba.len()];
    for y in 0..8 {
        for x in 0..16 {
            let old = (y * 16 + x) * 4;
            let new = (x * 8 + 7 - y) * 4;
            expected[new..new + 4].copy_from_slice(&normal.rgba[old..old + 4]);
        }
    }
    assert_eq!(rotated.rgba, expected);
    let rgb = fixtures::jpeg_grid();
    let mse = normal
        .rgba
        .chunks_exact(4)
        .zip(rgb.chunks_exact(3))
        .flat_map(|(a, b)| (0..3).map(move |c| (f64::from(a[c]) - f64::from(b[c])).powi(2)))
        .sum::<f64>()
        / 384.0;
    assert!(mse < 10.0, "synthetic JPEG quality sanity MSE={mse}");
}
#[test]
fn all_eight_exif_orientations_are_applied_exactly_for_lossless_png() {
    let data: Vec<u8> = (1..=6).flat_map(|v| [v, 0, 0, 255]).collect();
    let expected = [
        vec![1, 2, 3, 4, 5, 6],
        vec![3, 2, 1, 6, 5, 4],
        vec![6, 5, 4, 3, 2, 1],
        vec![4, 5, 6, 1, 2, 3],
        vec![1, 4, 2, 5, 3, 6],
        vec![4, 1, 5, 2, 6, 3],
        vec![6, 3, 5, 2, 4, 1],
        vec![3, 6, 2, 5, 1, 4],
    ];
    for value in 1..=8 {
        let bytes = fixtures::png_rgba(&data, 3, 2, Some(fixtures::exif(value)), true);
        let d = decode(&bytes);
        assert_eq!(d.orientation.exif_value, Some(value));
        assert_eq!(d.orientation.applied, value != 1);
        assert_eq!(
            d.rgba.chunks_exact(4).map(|p| p[0]).collect::<Vec<_>>(),
            expected[value as usize - 1]
        );
        assert_eq!(
            (d.width, d.height),
            if value <= 4 { (3, 2) } else { (2, 3) }
        );
        assert_eq!(d.orientation.original_exif, Some(fixtures::exif(value)));
    }
}
#[test]
fn webp_exif_is_not_ignored() {
    let bytes = fixtures::webp_rgba(&fixtures::RGBA, 3, 2, Some(fixtures::exif(8)), None);
    let d = decode(&bytes);
    assert_eq!((d.width, d.height), (2, 3));
    assert_eq!(d.orientation.exif_value, Some(8));
}
#[test]
fn invalid_and_absent_orientation_in_present_exif_are_typed() {
    for exif in [
        fixtures::exif(0),
        fixtures::exif(9),
        vec![1, 2, 3],
        vec![b'I', b'I', 42, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ] {
        let bytes = fixtures::png_rgba(&[255; 4], 1, 1, Some(exif), true);
        let e = decode_image(&bytes, Default::default()).unwrap_err();
        assert_eq!(e.code, ErrorCode::OrientationUnknown);
        assert_eq!(e.source_hash, Some(sha(&bytes)));
    }
}
#[test]
fn process_image_keeps_encoded_provenance_and_requires_untagged_color_confirmation() {
    let source = decode(include_bytes!("fixtures/synthetic-rgb.jpg"));
    let o = ProcessingOptions::default();
    let d = process_image(&source, o.clone()).unwrap();
    assert!(d.requires_confirmation);
    assert!(d
        .confirmation_reasons
        .iter()
        .any(|r| r == "untagged_source_color_assumed_srgb"));
    assert_eq!(
        d.encoded_source.as_ref().unwrap().bytes,
        source.original_bytes
    );
    assert_eq!(d.original_rgba, source.rgba);
    let mut approved = o;
    approved.accepted_proposal_hash = Some(d.proposal_hash.clone());
    assert!(
        !process_image(&source, approved)
            .unwrap()
            .requires_confirmation
    );
    let mut corrupt = source;
    corrupt.rgba[0] ^= 1;
    assert_eq!(
        process_image(&corrupt, Default::default())
            .unwrap_err()
            .code,
        ErrorCode::InvalidBuffer
    );
}
#[test]
fn unsupported_icc_gamma_high_precision_and_animation_do_not_silently_normalize() {
    let jpeg = fixtures::jpeg_rgb(&[0, 0, 0], 1, 1, None, Some(vec![0; 128]));
    let webp = fixtures::webp_rgba(&[0, 0, 0, 255], 1, 1, None, Some(vec![0; 128]));
    for bytes in [jpeg, webp] {
        assert_eq!(
            decode_image(&bytes, Default::default()).unwrap_err().code,
            ErrorCode::ColorManagementRequired
        );
    }
    let mut gamma = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut gamma, 1, 1);
        enc.set_color(png::ColorType::Rgb);
        enc.set_depth(png::BitDepth::Eight);
        enc.set_source_gamma(png::ScaledFloat::new(0.5));
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[0, 0, 0]).unwrap();
        w.finish().unwrap();
    }
    assert_eq!(
        decode_image(&gamma, Default::default()).unwrap_err().code,
        ErrorCode::ColorManagementRequired
    );
    let mut deep = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut deep, 1, 1);
        enc.set_color(png::ColorType::Grayscale);
        enc.set_depth(png::BitDepth::Sixteen);
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[0, 0]).unwrap();
        w.finish().unwrap();
    }
    assert_eq!(
        decode_image(&deep, Default::default()).unwrap_err().code,
        ErrorCode::UnsupportedBitDepth
    );
    let mut animated = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut animated, 1, 1);
        enc.set_color(png::ColorType::Rgba);
        enc.set_animated(2, 0).unwrap();
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[0, 0, 0, 255]).unwrap();
        w.write_image_data(&[255, 0, 0, 255]).unwrap();
        w.finish().unwrap();
    }
    assert_eq!(
        decode_image(&animated, Default::default())
            .unwrap_err()
            .code,
        ErrorCode::AnimationUnsupported
    );
}
#[test]
fn indexed_png_transparency_expands_without_dropping_alpha() {
    let mut bytes = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut bytes, 2, 1);
        enc.set_color(png::ColorType::Indexed);
        enc.set_depth(png::BitDepth::One);
        enc.set_palette([255, 0, 0, 0, 255, 0].as_slice());
        enc.set_trns([255, 128].as_slice());
        enc.set_source_srgb(png::SrgbRenderingIntent::Perceptual);
        let mut w = enc.write_header().unwrap();
        w.write_image_data(&[0b01000000]).unwrap();
        w.finish().unwrap();
    }
    let d = decode(&bytes);
    assert_eq!(d.rgba, [255, 0, 0, 255, 0, 255, 0, 128]);
}
#[test]
fn bad_bytes_truncation_unknown_svg_and_header_bombs_fail_typed() {
    for bytes in [b"".as_slice(), b"GIF89a", b"%PDF-x", b"random binary"] {
        assert_eq!(
            decode_image(bytes, Default::default()).unwrap_err().code,
            ErrorCode::UnsupportedFormat
        );
    }
    assert_eq!(
        decode_image(
            b"<svg xmlns='http://www.w3.org/2000/svg'/>",
            Default::default()
        )
        .unwrap_err()
        .code,
        ErrorCode::SvgIsNotRaster
    );
    let valid = include_bytes!("fixtures/synthetic-rgba.png");
    for end in [8, 20, valid.len() / 2, valid.len() - 5] {
        assert!(
            decode_image(&valid[..end], Default::default()).is_err(),
            "truncation at {end}"
        );
    }
    let mut huge = Vec::new();
    {
        let _w = png::Encoder::new(&mut huge, 1_000_000, 1_000_000)
            .write_header()
            .unwrap();
    }
    let err = decode_image(&huge, Default::default()).unwrap_err();
    assert_eq!(err.code, ErrorCode::DimensionLimit);
    let mut o = DecodeOptions::default();
    o.limits.max_source_bytes = 1;
    assert_eq!(
        decode_image(valid, o).unwrap_err().code,
        ErrorCode::SourceLimit
    );
    let mut o = DecodeOptions::default();
    o.limits.max_decoded_pixels = 1;
    assert_eq!(
        decode_image(valid, o).unwrap_err().code,
        ErrorCode::PixelLimit
    );
    let mut o = DecodeOptions::default();
    o.limits.max_decoded_bytes = 32;
    assert_eq!(
        decode_image(valid, o).unwrap_err().code,
        ErrorCode::MemoryLimit
    );
}
#[test]
fn source_fixture_checksums_and_regeneration_are_pinned() {
    let list: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/synthetic-manifest.json")).unwrap();
    let recipes = [
        (
            "synthetic-rgba.png",
            fixtures::png_rgba(&fixtures::RGBA, 3, 2, None, true),
        ),
        (
            "synthetic-rgba.webp",
            fixtures::webp_rgba(&fixtures::RGBA, 3, 2, None, None),
        ),
        (
            "synthetic-rgb.jpg",
            fixtures::jpeg_rgb(&fixtures::jpeg_grid(), 16, 8, None, None),
        ),
        (
            "synthetic-exif6.jpg",
            fixtures::jpeg_rgb(&fixtures::jpeg_grid(), 16, 8, Some(fixtures::exif(6)), None),
        ),
    ];
    for (name, bytes) in recipes {
        let expected = list
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["path"] == name)
            .unwrap();
        assert_eq!(expected["sha256"], sha(&bytes));
        assert_eq!(expected["bytes"], bytes.len());
    }
}

#[test]
fn png_bad_ancillary_profile_trailing_data_and_unknown_chunks_are_not_silently_dropped() {
    let with_chunk = |kind: [u8; 4], data: &[u8]| {
        let mut bytes = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut bytes, 1, 1);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            let mut w = enc.write_header().unwrap();
            w.write_chunk(png::chunk::ChunkType(kind), data).unwrap();
            w.write_image_data(&[255; 4]).unwrap();
            w.finish().unwrap();
        }
        bytes
    };
    assert_eq!(
        decode_image(
            &with_chunk(*b"iCCP", b"bad-profile-no-zlib"),
            Default::default()
        )
        .unwrap_err()
        .code,
        ErrorCode::ColorManagementRequired
    );
    assert_eq!(
        decode_image(&with_chunk(*b"gAMA", b"x"), Default::default())
            .unwrap_err()
            .code,
        ErrorCode::DecodeFailed
    );
    assert_eq!(
        decode_image(
            &with_chunk(*b"raSt", b"unknown-render-semantics"),
            Default::default()
        )
        .unwrap_err()
        .code,
        ErrorCode::UnsupportedMetadata
    );
    let mut trailing = include_bytes!("fixtures/synthetic-rgba.png").to_vec();
    trailing.extend_from_slice(b"<svg/>");
    assert_eq!(
        decode_image(&trailing, Default::default())
            .unwrap_err()
            .code,
        ErrorCode::DecodeFailed
    );
    let mut damaged = include_bytes!("fixtures/synthetic-rgba.png").to_vec();
    let srgb = damaged.windows(4).position(|w| w == b"sRGB").unwrap();
    damaged[srgb + 5] ^= 1; // Ancillary CRC; png defaults would skip this without strict event checks.
    assert_eq!(
        decode_image(&damaged, Default::default()).unwrap_err().code,
        ErrorCode::DecodeFailed
    );
    let mut o = DecodeOptions::default();
    o.limits.max_metadata_bytes = 100;
    let text = with_chunk(*b"tEXt", &vec![b'a'; 101]);
    assert_eq!(
        decode_image(&text, o).unwrap_err().code,
        ErrorCode::MetadataLimit
    );
}
#[test]
fn jpeg_and_webp_huge_headers_reject_before_pixel_decode() {
    let mut jpeg = include_bytes!("fixtures/synthetic-rgb.jpg").to_vec();
    let sof = jpeg.windows(2).position(|w| w == [255, 192]).unwrap();
    jpeg[sof + 5..sof + 7].copy_from_slice(&65535u16.to_be_bytes());
    jpeg[sof + 7..sof + 9].copy_from_slice(&65535u16.to_be_bytes());
    assert_eq!(
        decode_image(&jpeg, Default::default()).unwrap_err().code,
        ErrorCode::DimensionLimit
    );
    let mut webp = include_bytes!("fixtures/synthetic-rgba.webp").to_vec();
    let chunk = webp.windows(4).position(|w| w == b"VP8L").unwrap();
    assert_eq!(webp[chunk + 8], 0x2f);
    // Mutate this synthetic VP8L header to 8192 x 8192 dimensions; do not decode payload.
    let dims = ((8191u32) << 14) | 8191 | (1 << 28);
    webp[chunk + 9..chunk + 13].copy_from_slice(&dims.to_le_bytes());
    let err = decode_image(&webp, Default::default()).unwrap_err();
    assert_eq!(err.code, ErrorCode::PixelLimit, "{}", err.message);
}
#[test]
fn malformed_codec_payloads_fail_and_repeated_decoding_is_deterministic() {
    for bytes in [
        include_bytes!("fixtures/synthetic-rgb.jpg").as_slice(),
        include_bytes!("fixtures/synthetic-rgba.webp").as_slice(),
    ] {
        assert!(decode_image(&bytes[..bytes.len() / 2], Default::default()).is_err());
        let d = decode(bytes);
        for _ in 0..3 {
            assert_eq!(decode(bytes).rgba_hash, d.rgba_hash);
        }
    }
}
