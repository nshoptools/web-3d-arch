use arch_raster_source::*;
use sha2::{Digest, Sha256};

pub fn grid(w: u32, h: u32, f: impl Fn(u32, u32) -> u8) -> Vec<u8> {
    let colors = [
        [0, 0, 0, 0],
        [220, 30, 50, 255],
        [10, 60, 210, 255],
        [20, 190, 60, 255],
    ];
    let mut data = Vec::new();
    for y in 0..h {
        for x in 0..w {
            data.extend_from_slice(&colors[f(x, y) as usize]);
        }
    }
    data
}
fn fingerprint(doc: &RasterDocument) -> [u8; 32] {
    // Binary, LE, length-delimited protocol. No JSON geometry across the host boundary.
    let mut h = Sha256::new();
    h.update(b"raster-flat-parity-v2\0");
    h.update(doc.width.to_le_bytes());
    h.update(doc.height.to_le_bytes());
    h.update(doc.proposal_hash.as_bytes());
    h.update(doc.original_rgba_hash.as_bytes());
    for bytes in [&doc.original_rgba, &doc.resampled_rgba, &doc.processed_rgba] {
        h.update((bytes.len() as u64).to_le_bytes());
        h.update(bytes);
    }
    for l in &doc.labels {
        h.update(l.to_le_bytes());
    }
    h.update((doc.geometry.vertices.len() as u64).to_le_bytes());
    for v in &doc.geometry.vertices {
        h.update(v.id.to_le_bytes());
        h.update(v.xy[0].to_le_bytes());
        h.update(v.xy[1].to_le_bytes());
        for value in doc.point_mm(v.id).unwrap() {
            h.update(value.to_bits().to_le_bytes());
        }
    }
    h.update((doc.geometry.edges.len() as u64).to_le_bytes());
    for e in &doc.geometry.edges {
        for v in [
            e.id,
            e.from,
            e.to,
            e.left_region.unwrap_or(u32::MAX),
            e.right_region.unwrap_or(u32::MAX),
        ] {
            h.update(v.to_le_bytes());
        }
        h.update(e.left_label.to_le_bytes());
        h.update(e.right_label.to_le_bytes());
    }
    for l in &doc.geometry.loops {
        let ids = doc.geometry.loop_vertex_ids(l).unwrap();
        h.update((ids.len() as u64).to_le_bytes());
        for id in ids {
            h.update(id.to_le_bytes());
        }
    }
    let flat = doc.flat_geometry(64 * 1024 * 1024).unwrap();
    for v in &flat.xy {
        h.update(v.to_le_bytes());
    }
    for e in &flat.edges {
        for v in [
            e.from,
            e.to,
            e.left_label,
            e.right_label,
            e.left_region,
            e.right_region,
            e.chain,
        ] {
            h.update(v.to_le_bytes());
        }
    }
    for l in &flat.loops {
        for v in [l.first_index, l.index_count, l.region, l.label] {
            h.update(v.to_le_bytes());
        }
    }
    for v in &flat.indices {
        h.update(v.to_le_bytes());
    }
    h.update(doc.geometry.ledger.total_linf_bound_units.to_le_bytes());
    h.update(
        doc.derived_geometry_error_bound_mm()
            .to_bits()
            .to_le_bytes(),
    );
    h.finalize().into()
}
pub fn report() -> Vec<u8> {
    let mut records = Vec::<(String, [u8; 32])>::new();
    for (name, w, h, data) in [
        (
            "default-curve",
            48,
            40,
            grid(48, 40, |x, y| {
                if (x as i32) < 18 + (y as i32 - 20).pow(2) / 50 {
                    1
                } else {
                    2
                }
            }),
        ),
        (
            "nested-hole-island",
            25,
            25,
            grid(25, 25, |x, y| {
                match (x as i32 - 12).abs().max((y as i32 - 12).abs()) {
                    0..=2 => 2,
                    3..=5 => 0,
                    6..=8 => 1,
                    _ => 0,
                }
            }),
        ),
        (
            "T-junction",
            12,
            12,
            grid(12, 12, |x, y| {
                if x < 6 {
                    1
                } else if y < 6 {
                    2
                } else {
                    3
                }
            }),
        ),
        (
            "rounded-downsample",
            721,
            7,
            grid(721, 7, |x, y| if x < 350 + y * 3 { 1 } else { 2 }),
        ),
        ("all-transparent", 7, 5, grid(7, 5, |_, _| 0)),
    ] {
        let mut o = ProcessingOptions::default();
        o.parameters.res = 360;
        let d = process_rgba(&data, w, h, o).unwrap();
        records.push((name.into(), fingerprint(&d)));
    }
    let data = grid(23, 19, |x, y| if x < 4 + y / 2 { 1 } else { 2 });
    for (name, s, e, t) in [
        ("preserve", 0, 0.0, 0.0),
        ("smooth-only", 6, 0.0, 0.0),
        ("eps-only", 0, 100.0, 0.0),
        ("tension-only", 0, 0.0, 100.0),
        ("all-max", 6, 100.0, 100.0),
    ] {
        let mut o = ProcessingOptions::preserve_pixels();
        o.parameters.smooth = s;
        o.parameters.eps = e;
        o.parameters.tension = t;
        records.push((
            name.into(),
            fingerprint(&process_rgba(&data, 23, 19, o).unwrap()),
        ));
    }
    for (name, bytes) in [
        (
            "PNG",
            include_bytes!("../fixtures/synthetic-rgba.png").as_slice(),
        ),
        (
            "JPEG-EXIF6",
            include_bytes!("../fixtures/synthetic-exif6.jpg").as_slice(),
        ),
        (
            "WebP-VP8L",
            include_bytes!("../fixtures/synthetic-rgba.webp").as_slice(),
        ),
        (
            "WebP-VP8-lossy",
            include_bytes!("../fixtures/synthetic-lossy-vp8.webp").as_slice(),
        ),
    ] {
        let image = decode_image(bytes, DecodeOptions::default()).unwrap();
        let mut o = ProcessingOptions::default();
        o.alpha_policy = AlphaPolicy::Threshold { cutoff: 128 };
        records.push((name.into(), fingerprint(&process_image(&image, o).unwrap())));
    }
    for (name, data, w, h, o) in [
        ("bad-size", vec![0; 3], 1, 1, ProcessingOptions::default()),
        (
            "overflow-count",
            vec![],
            u32::MAX,
            u32::MAX,
            ProcessingOptions::default(),
        ),
        ("nonfinite", vec![255; 4], 1, 1, {
            let mut o = ProcessingOptions::default();
            o.parameters.eps = f64::NAN;
            o
        }),
        (
            "alpha-required",
            vec![20, 30, 40, 120],
            1,
            1,
            ProcessingOptions::default(),
        ),
    ] {
        let err = process_rgba(&data, w, h, o).unwrap_err();
        records.push((
            name.into(),
            Sha256::digest(format!("{:?}", err.code).as_bytes()).into(),
        ));
    }
    for (name, bytes) in [
        ("bad-codec", b"garbage".as_slice()),
        ("SVG", b"<svg/>".as_slice()),
    ] {
        let err = decode_image(bytes, DecodeOptions::default()).unwrap_err();
        records.push((
            name.into(),
            Sha256::digest(format!("{:?}", err.code).as_bytes()).into(),
        ));
    }
    let mut out = b"RSP2".to_vec();
    out.extend_from_slice(&(records.len() as u32).to_le_bytes());
    for (name, digest) in records {
        out.extend_from_slice(&(name.len() as u32).to_le_bytes());
        out.extend_from_slice(name.as_bytes());
        out.extend_from_slice(&digest);
    }
    out
}
