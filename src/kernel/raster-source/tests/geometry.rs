use arch_raster_source::*;
use std::collections::BTreeMap;
fn pixels(w: u32, h: u32, f: impl Fn(u32, u32) -> u8) -> Vec<u8> {
    let colors = [
        [0, 0, 0, 0],
        [240, 20, 30, 255],
        [20, 50, 230, 255],
        [20, 220, 30, 255],
    ];
    let mut out = Vec::new();
    for y in 0..h {
        for x in 0..w {
            out.extend_from_slice(&colors[f(x, y) as usize]);
        }
    }
    out
}
fn geo_options() -> ProcessingOptions {
    let mut o = ProcessingOptions::default();
    o.parameters.denoise = 0;
    o.parameters.min_area_pixels = 0;
    o.fixed_palette = Some(vec![[240, 20, 30], [20, 50, 230], [20, 220, 30]]);
    o
}
fn curved() -> Vec<u8> {
    pixels(48, 40, |x, y| {
        if (x as i32) < 18 + (y as i32 - 20).pow(2) / 50 {
            1
        } else {
            2
        }
    })
}
fn twice_area(d: &RasterDocument, l: &GeometryLoop) -> i128 {
    d.geometry
        .loop_vertex_ids(l)
        .unwrap()
        .windows(2)
        .map(|v| {
            let a = d.geometry.vertices[v[0] as usize].xy;
            let b = d.geometry.vertices[v[1] as usize].xy;
            i128::from(a[0]) * i128::from(b[1]) - i128::from(a[1]) * i128::from(b[0])
        })
        .sum()
}
fn incidence(d: &RasterDocument) {
    let mut used: BTreeMap<(u32, u32), Vec<(u32, u32, u16)>> = BTreeMap::new();
    for l in &d.geometry.loops {
        let label = d.regions[l.source_region as usize].label;
        for v in d.geometry.loop_vertex_ids(l).unwrap().windows(2) {
            let key = (v[0].min(v[1]), v[0].max(v[1]));
            used.entry(key).or_default().push((v[0], v[1], label));
        }
    }
    for e in &d.geometry.edges {
        let list = &used[&(e.from.min(e.to), e.from.max(e.to))];
        assert_eq!(
            list.len(),
            usize::from(e.left_label != 0) + usize::from(e.right_label != 0)
        );
        if list.len() == 2 {
            assert_eq!(list[0].0, list[1].1);
            assert_eq!(list[0].1, list[1].0);
            assert_ne!(list[0].2, list[1].2);
        }
    }
    for &id in &d.geometry.certificate.pinned_source_vertices {
        let source = &d.graph.vertices[id as usize];
        let v = d
            .geometry
            .vertices
            .iter()
            .find(|v| v.source_vertex == Some(id))
            .unwrap();
        assert_eq!(
            v.xy,
            [
                i64::from(source.x) * GEOMETRY_SCALE,
                i64::from(source.y) * GEOMETRY_SCALE
            ]
        );
    }
}
#[test]
fn catalog_default_executes_all_three_stages_and_binds_confirmation_to_geometry() {
    let p = RasterParameters::default();
    assert_eq!(
        (
            p.k,
            p.res,
            p.smooth,
            p.min_area_pixels,
            p.denoise,
            p.eps,
            p.tension
        ),
        (4, 520, 3, 5, 1, 35.0, 65.0)
    );
    let data = curved();
    let o = ProcessingOptions::default();
    let a = process_rgba(&data, 48, 40, o.clone()).unwrap();
    assert!(a.geometry.ledger.changed);
    assert!(a.geometry.ledger.smooth_max_displacement_units > 0);
    assert!(a.geometry.ledger.simplified_vertices < a.geometry.ledger.source_vertices);
    assert!(a.geometry.ledger.quadratic_spans > 0);
    assert!(!a.geometry.ledger.constrained_identity);
    assert!(a.requires_confirmation);
    assert_eq!(
        a.material_contour_vertex_ids(1).unwrap_err().code,
        ErrorCode::ConfirmationRequired
    );
    let mut approve = o.clone();
    approve.accepted_proposal_hash = Some(a.proposal_hash.clone());
    let accepted = process_rgba(&data, 48, 40, approve.clone()).unwrap();
    assert_eq!(accepted.geometry, a.geometry);
    assert!(!accepted
        .material_contour_vertex_ids(accepted.regions[0].label)
        .unwrap()
        .is_empty());
    approve.parameters.tension = 64.0;
    assert_eq!(
        process_rgba(&data, 48, 40, approve).unwrap_err().code,
        ErrorCode::ConfirmationMismatch
    );
    assert_eq!(a.original_rgba, data);
    incidence(&a);
}
#[test]
fn each_manual_slider_changes_geometry_with_other_stages_disabled() {
    let data = curved();
    for selector in 0..3 {
        let mut previous = None;
        for value in [0, 1, 3] {
            let mut o = geo_options();
            o.parameters.smooth = 0;
            o.parameters.eps = 0.0;
            o.parameters.tension = 0.0;
            match selector {
                0 => o.parameters.smooth = value,
                1 => o.parameters.eps = f64::from(value) * 30.0,
                _ => o.parameters.tension = f64::from(value) * 30.0,
            }
            let d = process_rgba(&data, 48, 40, o.clone()).unwrap();
            assert_eq!(d.options.parameters.smooth, o.parameters.smooth);
            assert_eq!(d.options.parameters.eps, o.parameters.eps);
            assert_eq!(d.options.parameters.tension, o.parameters.tension);
            let coords: Vec<_> = d.geometry.vertices.iter().map(|v| v.xy).collect();
            if let Some(before) = previous {
                assert_ne!(before, coords, "slider {selector} value {value}");
            }
            previous = Some(coords);
            incidence(&d);
        }
    }
}
#[test]
fn curved_shared_seam_partitions_full_extent_without_gaps_or_double_area() {
    let d = process_rgba(&curved(), 48, 40, geo_options()).unwrap();
    incidence(&d);
    let area: i128 = d.geometry.loops.iter().map(|l| twice_area(&d, l)).sum();
    assert_eq!(area, 2 * 48 * 40 * i128::from(GEOMETRY_SCALE).pow(2));
    assert!(d
        .geometry
        .chains
        .iter()
        .any(|c| c.left_label != 0 && c.right_label != 0 && !c.curves.is_empty()));
}
#[test]
fn junction_holes_and_disconnected_accents_remain_in_the_same_embedding() {
    let data = pixels(25, 25, |x, y| {
        if x == 23 && y == 23 {
            3
        } else if (2..=20).contains(&x) && (2..=20).contains(&y) {
            if (8..=14).contains(&x) && (8..=14).contains(&y) {
                0
            } else if x < 11 {
                1
            } else if y < 11 {
                2
            } else {
                3
            }
        } else {
            0
        }
    });
    let d = process_rgba(&data, 25, 25, geo_options()).unwrap();
    incidence(&d);
    assert!(d.regions.iter().any(|r| r.pixel_count == 1));
    assert!(d.geometry.certificate.junctions >= 2);
    assert_eq!(
        d.geometry.loops.len(),
        d.regions.iter().map(|r| r.loops.len()).sum::<usize>()
    );
    assert_eq!(d.geometry.certificate.components, 2);
    for l in &d.geometry.loops {
        assert_ne!(twice_area(&d, l), 0);
    }
}
#[test]
fn nested_islands_keep_hole_signs_and_component_nesting() {
    let data = pixels(25, 25, |x, y| {
        let r = (x as i32 - 12).abs().max((y as i32 - 12).abs());
        match r {
            0..=2 => 2,
            3..=5 => 0,
            6..=8 => 1,
            _ => 0,
        }
    });
    let d = process_rgba(&data, 25, 25, geo_options()).unwrap();
    assert_eq!(d.geometry.certificate.components, 3);
    assert_eq!(d.geometry.certificate.holes, 1);
    assert_eq!(d.geometry.loops.len(), 3);
    incidence(&d);
}
fn distance_segment(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let v = [b[0] - a[0], b[1] - a[1]];
    let len = v[0] * v[0] + v[1] * v[1];
    let t = if len == 0.0 {
        0.0
    } else {
        (((p[0] - a[0]) * v[0] + (p[1] - a[1]) * v[1]) / len).clamp(0.0, 1.0)
    };
    ((p[0] - a[0] - t * v[0]).powi(2) + (p[1] - a[1] - t * v[1]).powi(2)).sqrt()
}
#[test]
fn independent_bidirectional_distance_samples_are_below_reported_chain_bound() {
    let mut o = geo_options();
    o.design_long_edge_mm = 73.0;
    let d = process_rgba(&curved(), 48, 40, o).unwrap();
    let bound =
        d.geometry.ledger.total_linf_bound_units as f64 / GEOMETRY_SCALE as f64 * 2.0_f64.sqrt();
    for c in &d.geometry.chains {
        let derived: Vec<_> = c
            .vertex_ids
            .iter()
            .map(|&v| {
                let p = d.geometry.vertices[v as usize].xy;
                [
                    p[0] as f64 / GEOMETRY_SCALE as f64,
                    p[1] as f64 / GEOMETRY_SCALE as f64,
                ]
            })
            .collect();
        let mut source: Vec<_> = c
            .source_edges
            .iter()
            .map(|r| {
                let e = &d.graph.edges[r.edge as usize];
                let v = &d.graph.vertices[if r.reversed { e.to } else { e.from } as usize];
                [f64::from(v.x), f64::from(v.y)]
            })
            .collect();
        let last = *c.source_edges.last().unwrap();
        let e = &d.graph.edges[last.edge as usize];
        let v = &d.graph.vertices[if last.reversed { e.from } else { e.to } as usize];
        source.push([f64::from(v.x), f64::from(v.y)]);
        for (a, b) in [(&source, &derived), (&derived, &source)] {
            for edge in a.windows(2) {
                for n in 0..=16 {
                    let p = [
                        edge[0][0] + (edge[1][0] - edge[0][0]) * f64::from(n) / 16.0,
                        edge[0][1] + (edge[1][1] - edge[0][1]) * f64::from(n) / 16.0,
                    ];
                    let dist = b
                        .windows(2)
                        .map(|v| distance_segment(p, v[0], v[1]))
                        .fold(f64::INFINITY, f64::min);
                    assert!(dist <= bound + 1e-10, "{dist} > {bound}");
                }
            }
        }
    }
    assert!(d.derived_geometry_error_bound_mm() > 0.0);
    assert_eq!(d.ledger.total_source_geometry_error_bound_mm, None);
}
#[test]
fn exhaustive_small_default_geometry_preserves_incidence_and_nonzero_regions() {
    for bits in 0..512 {
        let data = pixels(
            3,
            3,
            |x, y| if bits & (1 << (y * 3 + x)) == 0 { 1 } else { 2 },
        );
        let d = process_rgba(&data, 3, 3, geo_options()).unwrap();
        incidence(&d);
        let sum: i128 = d.geometry.loops.iter().map(|l| twice_area(&d, l)).sum();
        assert_eq!(sum, 18 * i128::from(GEOMETRY_SCALE).pow(2));
        assert_eq!(
            d.geometry.loops.len(),
            d.regions.iter().map(|r| r.loops.len()).sum::<usize>()
        );
    }
}
#[test]
fn repeated_geometry_and_serde_are_exact() {
    let a = process_rgba(&curved(), 48, 40, geo_options()).unwrap();
    for _ in 0..3 {
        let b = process_rgba(&curved(), 48, 40, geo_options()).unwrap();
        assert_eq!(a.geometry, b.geometry);
        assert_eq!(a.proposal_hash, b.proposal_hash);
    }
    let b: RasterDocument = serde_json::from_slice(&serde_json::to_vec(&a).unwrap()).unwrap();
    assert_eq!(a.geometry, b.geometry);
}
#[test]
fn full_extent_and_nonuniform_mm_mapping_are_bounded_and_finite() {
    let data = pixels(721, 3, |x, _| if x < 350 { 1 } else { 2 });
    let mut o = geo_options();
    o.parameters.res = 360;
    o.design_long_edge_mm = 10000.0;
    let d = process_rgba(&data, 721, 3, o).unwrap();
    assert_ne!(d.transform.mm_per_pixel_x, d.transform.mm_per_pixel_y);
    for v in &d.geometry.vertices {
        let p = d.point_mm(v.id).unwrap();
        assert!(p[0] >= 0.0 && p[0] <= 10000.0 && p[1] >= 0.0 && p[1] <= 10000.0);
    }
    incidence(&d);
}
#[test]
fn geometry_work_and_memory_limits_are_typed_without_partial_document() {
    let data = curved();
    for code in [
        ErrorCode::WorkLimit,
        ErrorCode::MemoryLimit,
        ErrorCode::GraphLimit,
    ] {
        let mut o = geo_options();
        match code {
            ErrorCode::WorkLimit => o.limits.max_work_units = 150000,
            ErrorCode::MemoryLimit => o.limits.max_working_bytes = 80000,
            _ => o.limits.max_vertices = 200,
        }
        assert_eq!(process_rgba(&data, 48, 40, o).unwrap_err().code, code);
    }
}
#[test]
fn lossy_vp8_is_actually_decoded_and_original_encoded_source_survives() {
    let bytes = include_bytes!("fixtures/synthetic-lossy-vp8.webp");
    assert_eq!(&bytes[12..16], b"VP8 ");
    let image = decode_image(bytes, DecodeOptions::default()).unwrap();
    assert_eq!((image.width, image.height), (32, 24));
    assert_eq!(image.alpha.opaque, 768);
    let original = decode_image(
        include_bytes!("fixtures/synthetic-vp8-input.png"),
        DecodeOptions::default(),
    )
    .unwrap();
    assert_ne!(original.rgba, image.rgba);
    let mae: f64 = image
        .rgba
        .iter()
        .zip(&original.rgba)
        .map(|(&a, &b)| f64::from(a.abs_diff(b)))
        .sum::<f64>()
        / 3072.0;
    assert!(mae > 0.1 && mae < 30.0, "unexpected decode error {mae}");
    let d = process_image(&image, ProcessingOptions::default()).unwrap();
    assert_eq!(d.original_rgba, image.rgba);
    assert_eq!(d.encoded_source.unwrap().bytes, bytes);
}

#[test]
fn maximum_sliders_are_topology_constrained_on_small_regions() {
    let mut constrained = 0;
    for bits in 0..512 {
        let data = pixels(5, 5, |x, y| {
            if (1..=3).contains(&x) && (1..=3).contains(&y) {
                if bits & (1 << ((y - 1) * 3 + x - 1)) == 0 {
                    1
                } else {
                    2
                }
            } else {
                0
            }
        });
        let mut o = geo_options();
        o.parameters.smooth = 6;
        o.parameters.eps = 100.0;
        o.parameters.tension = 100.0;
        let d = process_rgba(&data, 5, 5, o).unwrap();
        incidence(&d);
        constrained += usize::from(d.geometry.ledger.attenuation_steps > 0);
        for l in &d.geometry.loops {
            assert_ne!(twice_area(&d, l), 0);
        }
    }
    assert!(
        constrained > 0,
        "exercise the recorded topology constraint path"
    );
}

#[test]
fn flat_buffers_keep_shared_ids_winding_and_exact_dyadic_coordinates() {
    assert_eq!(std::mem::size_of::<FlatEdge>(), 32);
    assert_eq!(std::mem::size_of::<FlatLoop>(), 16);
    assert_eq!(std::mem::size_of::<FlatChain>(), 32);
    let d = process_rgba(&curved(), 48, 40, geo_options()).unwrap();
    assert!(d.requires_confirmation);
    let f = d.flat_geometry(8 * 1024 * 1024).unwrap();
    assert_eq!(f.xy.len(), 2 * d.geometry.vertices.len());
    assert_eq!(f.edges.len(), d.geometry.edges.len());
    for (v, p) in f.xy.chunks_exact(2).zip(&d.geometry.vertices) {
        assert_eq!(v, p.xy);
    }
    for (e, z) in f.edges.iter().zip(&d.geometry.edges) {
        assert_eq!(
            (e.from, e.to, e.left_label, e.right_label),
            (
                z.from,
                z.to,
                u32::from(z.left_label),
                u32::from(z.right_label)
            )
        );
    }
    for (l, r) in f.loops.iter().zip(&d.geometry.loops) {
        assert_eq!(
            &f.indices[l.first_index as usize..][..l.index_count as usize],
            d.geometry.loop_vertex_ids(r).unwrap()
        );
    }
    assert_eq!(d.flat_geometry(1).unwrap_err().code, ErrorCode::MemoryLimit);
    let mut bad = d.clone();
    bad.geometry.chains[0].vertex_ids[0] = u32::MAX;
    assert_eq!(
        bad.flat_geometry(8 * 1024 * 1024).unwrap_err().code,
        ErrorCode::InvariantViolation
    );
}

#[test]
fn tiny_physical_extents_do_not_underflow_the_reported_deviation_to_zero() {
    let mut o = geo_options();
    o.design_long_edge_mm = 1e-200;
    let d = process_rgba(&curved(), 48, 40, o).unwrap();
    let bound = d.derived_geometry_error_bound_mm();
    assert!(bound.is_normal() && bound > 0.0);
    assert_eq!(
        bound,
        d.ledger
            .entries
            .iter()
            .find(|e| e.stage == "shared_derived_geometry")
            .unwrap()
            .bound_mm
            .unwrap()
    );
    let mut o = geo_options();
    o.design_long_edge_mm = 1e-307;
    assert_eq!(
        process_rgba(&curved(), 48, 40, o).unwrap_err().code,
        ErrorCode::InvalidOptions
    );
}
