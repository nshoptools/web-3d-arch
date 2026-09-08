#![allow(dead_code)]
use image::ImageEncoder;
use std::borrow::Cow;
pub const RGBA: [u8; 24] = [
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0, 255, 255, 0, 128, 255, 0, 255, 255,
];
pub fn exif(orientation: u8) -> Vec<u8> {
    vec![
        b'I',
        b'I',
        42,
        0,
        8,
        0,
        0,
        0,
        1,
        0,
        0x12,
        1,
        3,
        0,
        1,
        0,
        0,
        0,
        orientation,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
    ]
}
pub fn png_rgba(data: &[u8], w: u32, h: u32, exif: Option<Vec<u8>>, srgb: bool) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut info = png::Info::with_size(w, h);
    info.color_type = png::ColorType::Rgba;
    info.bit_depth = png::BitDepth::Eight;
    info.exif_metadata = exif.map(Cow::Owned);

    {
        let mut encoder = png::Encoder::with_info(&mut bytes, info).unwrap();
        if srgb {
            encoder.set_source_srgb(png::SrgbRenderingIntent::Perceptual);
        }
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(data).unwrap();
        writer.finish().unwrap();
    }
    bytes
}
pub fn webp_rgba(
    data: &[u8],
    w: u32,
    h: u32,
    exif: Option<Vec<u8>>,
    icc: Option<Vec<u8>>,
) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut enc = image::codecs::webp::WebPEncoder::new_lossless(&mut bytes);
    if let Some(exif) = exif {
        enc.set_exif_metadata(exif).unwrap();
    }
    if let Some(icc) = icc {
        enc.set_icc_profile(icc).unwrap();
    }
    enc.write_image(data, w, h, image::ExtendedColorType::Rgba8)
        .unwrap();
    bytes
}
pub fn jpeg_rgb(
    data: &[u8],
    w: u32,
    h: u32,
    exif: Option<Vec<u8>>,
    icc: Option<Vec<u8>>,
) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, 100);
    if let Some(exif) = exif {
        enc.set_exif_metadata(exif).unwrap();
    }
    if let Some(icc) = icc {
        enc.set_icc_profile(icc).unwrap();
    }
    enc.write_image(data, w, h, image::ExtendedColorType::Rgb8)
        .unwrap();
    bytes
}
pub fn jpeg_grid() -> Vec<u8> {
    (0..8)
        .flat_map(|y| {
            (0..16).flat_map(move |x| {
                if x < 8 {
                    [20 + y * 10, 80, 160]
                } else {
                    [200, 50 + y * 10, 10]
                }
            })
        })
        .collect()
}
