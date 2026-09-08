use arch_raster_source::*;
fn run(data: &[u8], w: u32, h: u32) -> RasterDocument {
    process_rgba(data, w, h, ProcessingOptions::preserve_pixels()).unwrap()
}
fn approve(data: &[u8], w: u32, h: u32, mut options: ProcessingOptions) -> RasterDocument {
    let d = process_rgba(data, w, h, options.clone()).unwrap();
    options.accepted_proposal_hash = Some(d.proposal_hash);
    process_rgba(data, w, h, options).unwrap()
}
#[test]
fn mono_and_transparent_are_not_forced_into_k_materials() {
    let d = run(&[10, 20, 30, 255, 10, 20, 30, 255], 2, 1);
    assert_eq!(d.material_count, 1);
    assert_eq!(d.palette[0].color, [10, 20, 30]);
    assert_eq!(d.labels, [1, 1]);
    assert_eq!(d.status, ProcessingStatus::Ready);
    let e = run(&[200, 100, 50, 0, 2, 3, 4, 0], 2, 1);
    assert_eq!(e.material_count, 0);
    assert!(e.palette.is_empty());
    assert!(e.regions.is_empty());
    assert!(e.graph.edges.is_empty());
    assert_eq!(e.status, ProcessingStatus::Empty);
    assert_eq!(e.comparison.changed_pixels, 0);
    assert_eq!(e.original_rgba, [200, 100, 50, 0, 2, 3, 4, 0]);
    assert_eq!(e.processed_rgba, [0; 8]);
}
#[test]
fn partial_alpha_requires_policy_and_exact_confirmation() {
    let data = [200, 0, 20, 127, 100, 0, 50, 128, 9, 8, 7, 0];
    assert_eq!(
        process_rgba(&data, 3, 1, ProcessingOptions::preserve_pixels())
            .unwrap_err()
            .code,
        ErrorCode::AlphaPolicyRequired
    );
    let mut o = ProcessingOptions {
        alpha_policy: AlphaPolicy::Threshold { cutoff: 128 },
        ..ProcessingOptions::preserve_pixels()
    };
    let d = process_rgba(&data, 3, 1, o.clone()).unwrap();
    assert!(d.requires_confirmation);
    assert_eq!(d.labels, [0, 1, 0]);
    assert_eq!(d.decisions.alpha_changed_pixels, 2);
    assert_eq!(
        d.source_material_contour_vertex_ids(1).unwrap_err().code,
        ErrorCode::ConfirmationRequired
    );
    o.accepted_proposal_hash = Some(d.proposal_hash.clone());
    let confirmed = process_rgba(&data, 3, 1, o.clone()).unwrap();
    assert!(!confirmed.requires_confirmation);
    assert_eq!(confirmed.status, ProcessingStatus::Ready);
    assert_eq!(confirmed.proposal_hash, d.proposal_hash);
    assert_eq!(
        confirmed
            .source_material_contour_vertex_ids(1)
            .unwrap()
            .len(),
        1
    );
    o.design_long_edge_mm = 46.0;
    assert_eq!(
        process_rgba(&data, 3, 1, o).unwrap_err().code,
        ErrorCode::ConfirmationMismatch
    );
}
#[test]
fn matte_is_explicit_encoded_space_and_never_fills_alpha_zero() {
    let data = [255, 0, 0, 128, 200, 100, 50, 0];
    let d = approve(
        &data,
        2,
        1,
        ProcessingOptions {
            alpha_policy: AlphaPolicy::MattePartialEncodedSrgb { color: [0, 0, 255] },
            ..ProcessingOptions::preserve_pixels()
        },
    );
    assert_eq!(d.processed_rgba, [128, 0, 127, 255, 0, 0, 0, 0]);
    assert_eq!(d.material_count, 1);
    assert_eq!(d.labels, [1, 0]);
    assert!(d
        .confirmation_reasons
        .iter()
        .any(|s| s == "partial_alpha_conversion"));
    assert!(d.ledger.total_source_geometry_error_bound_mm.is_none());
}
#[test]
fn palette_is_deterministic_and_metric_is_recorded_without_perceptual_claim() {
    let colors = [
        [0, 0, 0, 255],
        [10, 10, 10, 255],
        [250, 250, 250, 255],
        [255, 255, 255, 255],
    ];
    let data: Vec<_> = colors.into_iter().flatten().collect();
    let mut o = ProcessingOptions::preserve_pixels();
    o.parameters.k = 2;
    let d = process_rgba(&data, 4, 1, o.clone()).unwrap();
    assert_eq!(
        d.palette.iter().map(|p| p.color).collect::<Vec<_>>(),
        [[5, 5, 5], [252, 252, 252]]
    );
    assert_eq!(d.labels, [1, 1, 2, 2]);
    assert_eq!(d.decisions.palette_recolored_pixels, 4);
    assert!(d.requires_confirmation);
    assert!(d.decisions.palette_algorithm.contains("encoded-sRGB8"));
    for _ in 0..4 {
        let r = process_rgba(&data, 4, 1, o.clone()).unwrap();
        assert_eq!(
            serde_json::to_value(&r).unwrap(),
            serde_json::to_value(&d).unwrap()
        );
    }
}
#[test]
fn fixed_palette_distance_ties_use_supplied_order() {
    let d = process_rgba(
        &[1, 0, 0, 255],
        1,
        1,
        ProcessingOptions {
            fixed_palette: Some(vec![[2, 0, 0], [0, 0, 0]]),
            ..ProcessingOptions::preserve_pixels()
        },
    )
    .unwrap();
    assert_eq!(d.labels, [1]);
    assert_eq!(d.palette[0].color, [2, 0, 0]);
    assert_eq!(d.material_count, 1);
    assert_eq!(d.palette[1].final_pixels, 0);
}
#[test]
fn denoise_changes_rgb_only_on_simultaneous_opaque_neighborhoods() {
    let mut data = vec![0u8; 3 * 3 * 4];
    for p in data.chunks_exact_mut(4) {
        p.copy_from_slice(&[0, 0, 0, 255]);
    }
    data[16..20].copy_from_slice(&[255, 0, 0, 255]);
    data[0..4].copy_from_slice(&[255, 255, 255, 0]);
    let mut o = ProcessingOptions::preserve_pixels();
    o.parameters.denoise = 1;
    let d = process_rgba(&data, 3, 3, o).unwrap();
    assert_eq!(d.labels[0], 0);
    assert_eq!(d.material_count, 1);
    assert_eq!(d.decisions.denoise_changed_pixels, 1);
    assert_eq!(d.labels.iter().filter(|&&l| l == 0).count(), 1);
    assert_eq!(d.decisions.alpha_processed.opaque, 8);
    assert!(d.requires_confirmation);
}
#[test]
fn small_region_merge_never_discards_an_isolated_accent_or_a_hole() {
    let data = [
        255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255,
    ];
    let mut o = ProcessingOptions {
        fixed_palette: Some(vec![[255, 0, 0], [0, 255, 0]]),
        ..ProcessingOptions::preserve_pixels()
    };
    o.parameters.min_area_pixels = 2;
    let d = process_rgba(&data, 5, 1, o).unwrap();
    assert_eq!(d.labels, [2, 2, 2, 0, 1]);
    assert_eq!(d.decisions.merges.len(), 1);
    assert_eq!(d.decisions.merges[0].shared_unit_edges, 1);
    assert_eq!(d.decisions.unmerged_small_regions, 1);
    assert_eq!(d.decisions.merges[0].pixels, 1);
    assert!(d.requires_confirmation);
}
#[test]
fn min_area_is_strict_less_than_and_does_not_cascade_or_swap() {
    let data = [255, 0, 0, 255, 0, 255, 0, 255];
    let mut o = ProcessingOptions::preserve_pixels();
    o.parameters.min_area_pixels = 2;
    let d = process_rgba(&data, 2, 1, o.clone()).unwrap();
    assert_eq!(d.material_count, 2);
    assert!(d.decisions.merges.is_empty());
    assert_eq!(d.decisions.unmerged_small_regions, 2);
    o.parameters.min_area_pixels = 1;
    let d = process_rgba(&data, 2, 1, o).unwrap();
    assert_eq!(d.decisions.unmerged_small_regions, 0);
}
#[test]
fn boundary_background_exclusion_preserves_same_color_inner_island() {
    // White border, black closed ring, white center. No flood crosses the ring.
    let labels = [
        1, 1, 1, 1, 1, 1, 2, 2, 2, 1, 1, 2, 1, 2, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1,
    ];
    let data: Vec<u8> = labels
        .into_iter()
        .flat_map(|l| {
            if l == 1 {
                [255, 255, 255, 255]
            } else {
                [0, 0, 0, 255]
            }
        })
        .collect();
    let d = process_rgba(
        &data,
        5,
        5,
        ProcessingOptions {
            fixed_palette: Some(vec![[255, 255, 255], [0, 0, 0]]),
            background: BackgroundPolicy::ExcludeBoundaryConnected { label_ids: vec![1] },
            ..ProcessingOptions::preserve_pixels()
        },
    )
    .unwrap();
    assert_eq!(d.decisions.background_excluded_pixels, 16);
    assert_eq!(d.decisions.background_excluded_regions, 1);
    assert_eq!(d.labels[12], 1);
    assert_eq!(d.palette[0].final_pixels, 1);
    assert_eq!(d.palette[1].final_pixels, 8);
    assert_eq!(d.regions.len(), 2);
    assert!(d.requires_confirmation);
}
#[test]
fn background_removal_to_empty_still_needs_confirmation() {
    let o = ProcessingOptions {
        fixed_palette: Some(vec![[255, 255, 255]]),
        background: BackgroundPolicy::ExcludeBoundaryConnected { label_ids: vec![1] },
        ..ProcessingOptions::preserve_pixels()
    };
    let d = process_rgba(&[255; 4], 1, 1, o.clone()).unwrap();
    assert_eq!(d.status, ProcessingStatus::RequiresConfirmation);
    assert_eq!(d.material_count, 0);
    assert_eq!(approve(&[255; 4], 1, 1, o).status, ProcessingStatus::Empty);
}
#[test]
fn downsample_records_physical_footprint_and_real_premultiplied_average() {
    let mut data = Vec::new();
    for _ in 0..2 {
        for _ in 0..360 {
            data.extend_from_slice(&[255, 0, 0, 255, 0, 255, 0, 0]);
        }
    }
    let mut o = ProcessingOptions {
        alpha_policy: AlphaPolicy::Threshold { cutoff: 128 },
        design_long_edge_mm: 72.0,
        ..ProcessingOptions::preserve_pixels()
    };
    o.parameters.res = 360;
    let d = process_rgba(&data, 720, 2, o).unwrap();
    assert_eq!((d.width, d.height), (360, 1));
    assert!(d.decisions.downsampled);
    assert!(d
        .resampled_rgba
        .chunks_exact(4)
        .all(|p| p == [255, 0, 0, 128]));
    assert!(d
        .processed_rgba
        .chunks_exact(4)
        .all(|p| p == [255, 0, 0, 255]));
    assert_eq!(d.transform.width_mm, 72.0);
    assert_eq!(d.transform.height_mm, 0.2);
    assert!((d.ledger.processing_pixel_diagonal_mm - 0.2f64.hypot(0.2)).abs() < 1e-12);
    assert_eq!(d.ledger.boundary_approximation_error_px, 0.0);
    assert!(d.ledger.total_source_geometry_error_bound_mm.is_none());
    assert_eq!(d.comparison.changed_pixels, 360);
}
#[test]
fn no_upsampling_and_aspect_survives_rounded_processing_dimensions() {
    let tiny = run(&[1, 2, 3, 255], 1, 1);
    assert_eq!((tiny.width, tiny.height), (1, 1));
    let data = [20, 30, 40, 255].repeat(721 * 3);
    let mut o = ProcessingOptions {
        design_long_edge_mm: 72.1,
        ..ProcessingOptions::preserve_pixels()
    };
    o.parameters.res = 360;
    let d = process_rgba(&data, 721, 3, o).unwrap();
    assert_eq!((d.width, d.height), (360, 1));
    assert!((d.transform.height_mm - 0.3).abs() < 1e-12);
    assert_ne!(d.transform.mm_per_pixel_x, d.transform.mm_per_pixel_y);
}
#[test]
fn nonfinite_invalid_ranges_and_catalog_sliders() {
    for v in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY, -1.0, 10001.0] {
        let o = ProcessingOptions {
            design_long_edge_mm: v,
            ..ProcessingOptions::preserve_pixels()
        };
        assert_eq!(
            process_rgba(&[255; 4], 1, 1, o).unwrap_err().code,
            ErrorCode::InvalidOptions
        );
    }
    for v in [f64::NAN, f64::INFINITY, 0.5, -1.0, 101.0] {
        let mut o = ProcessingOptions::preserve_pixels();
        o.parameters.eps = v;
        assert_eq!(
            process_rgba(&[255; 4], 1, 1, o).unwrap_err().code,
            ErrorCode::InvalidOptions
        );
        let mut o = ProcessingOptions::preserve_pixels();
        o.parameters.tension = v;
        assert_eq!(
            process_rgba(&[255; 4], 1, 1, o).unwrap_err().code,
            ErrorCode::InvalidOptions
        );
    }
    let o = ProcessingOptions {
        parameters: RasterParameters::catalog_candidates(),
        ..ProcessingOptions::preserve_pixels()
    };
    assert!(process_rgba(&[255; 4], 1, 1, o).is_ok());
    for selector in 0..3 {
        let mut o = ProcessingOptions::preserve_pixels();
        match selector {
            0 => o.parameters.smooth = 1,
            1 => o.parameters.eps = 1.0,
            _ => o.parameters.tension = 1.0,
        }
        assert!(process_rgba(&[255; 4], 1, 1, o).is_ok());
    }
    let mut o = ProcessingOptions::preserve_pixels();
    o.parameters.res = 2;
    assert_eq!(
        process_rgba(&[255; 4], 1, 1, o).unwrap_err().code,
        ErrorCode::InvalidOptions
    );
}
#[test]
fn resource_limits_precede_allocation_or_incomplete_topology() {
    assert_eq!(
        process_rgba(
            &[],
            u32::MAX,
            u32::MAX,
            ProcessingOptions::preserve_pixels()
        )
        .unwrap_err()
        .code,
        ErrorCode::DimensionLimit
    );
    assert_eq!(
        process_rgba(&[], 0, 1, ProcessingOptions::preserve_pixels())
            .unwrap_err()
            .code,
        ErrorCode::DimensionLimit
    );
    assert_eq!(
        process_rgba(&[0; 3], 1, 1, ProcessingOptions::preserve_pixels())
            .unwrap_err()
            .code,
        ErrorCode::InvalidBuffer
    );
    let data = [255, 0, 0, 255, 0, 255, 0, 255];
    for (selector, expected) in [
        (0, ErrorCode::WorkLimit),
        (1, ErrorCode::MemoryLimit),
        (2, ErrorCode::RegionLimit),
        (3, ErrorCode::GraphLimit),
        (4, ErrorCode::GraphLimit),
        (5, ErrorCode::PixelLimit),
        (6, ErrorCode::WorkLimit),
    ] {
        let mut o = ProcessingOptions::preserve_pixels();
        match selector {
            0 => o.limits.max_work_units = 1,
            1 => o.limits.max_working_bytes = 64,
            2 => o.limits.max_regions = 1,
            3 => o.limits.max_vertices = 3,
            4 => o.limits.max_edges = 3,
            5 => o.limits.max_processing_pixels = 1,
            _ => o.limits.max_unique_colors = 1,
        }
        assert_eq!(
            process_rgba(&data, 2, 1, o).unwrap_err().code,
            expected,
            "selector {selector}"
        );
    }
}
#[test]
fn render_origin_must_carry_explicit_confirmation_provenance() {
    let mut o = ProcessingOptions {
        origin: RgbaOrigin::ConfirmedRender {
            source_hash: "a".repeat(64),
            renderer: "host-renderer@pinned".into(),
            settings_hash: "b".repeat(64),
            confirmation_id: "transaction-42".into(),
        },
        ..ProcessingOptions::preserve_pixels()
    };
    let d = process_rgba(&[255; 4], 1, 1, o.clone()).unwrap();
    assert_eq!(d.status, ProcessingStatus::Ready);
    assert!(matches!(
        d.options.origin,
        RgbaOrigin::ConfirmedRender { .. }
    ));
    if let RgbaOrigin::ConfirmedRender {
        confirmation_id, ..
    } = &mut o.origin
    {
        *confirmation_id = String::new();
    }
    assert_eq!(
        process_rgba(&[255; 4], 1, 1, o).unwrap_err().code,
        ErrorCode::RenderConfirmationRequired
    );
}
#[test]
fn hash_covers_original_invisible_rgb_and_confirmation_rejects_stale_input() {
    let mut o = ProcessingOptions::preserve_pixels();
    let first = process_rgba(&[1, 2, 3, 0], 1, 1, o.clone()).unwrap();
    o.accepted_proposal_hash = Some(first.proposal_hash);
    assert_eq!(
        process_rgba(&[4, 5, 6, 0], 1, 1, o).unwrap_err().code,
        ErrorCode::ConfirmationMismatch
    );
}
#[test]
fn serde_metadata_roundtrip_and_contour_ids_are_host_transferable() {
    let d = run(&[10, 20, 30, 255], 1, 1);
    let decoded: RasterDocument = serde_json::from_slice(&serde_json::to_vec(&d).unwrap()).unwrap();
    assert_eq!(d.graph, decoded.graph);
    assert_eq!(
        decoded.source_material_contour_vertex_ids(1).unwrap().len(),
        1
    );
    assert_eq!(
        decoded.source_point_mm(u32::MAX).unwrap_err().code,
        ErrorCode::InvalidOptions
    );
    assert_eq!(
        decoded
            .source_material_contour_vertex_ids(0)
            .unwrap_err()
            .code,
        ErrorCode::InvalidOptions
    );
}

#[test]
fn corrupted_deserialized_reference_is_a_typed_error_not_a_panic() {
    let mut d = run(&[1, 2, 3, 255], 1, 1);
    d.regions[0].loops[0].edges[0].edge = u32::MAX;
    assert_eq!(
        d.source_material_contour_vertex_ids(1).unwrap_err().code,
        ErrorCode::InvariantViolation
    );
}
#[test]
fn f64_physical_underflow_is_rejected_and_10000_mm_domain_includes_endpoints() {
    let data = [10, 20, 30, 255].repeat(3);
    let o = ProcessingOptions {
        design_long_edge_mm: f64::MIN_POSITIVE,
        ..ProcessingOptions::preserve_pixels()
    };
    assert_eq!(
        process_rgba(&data, 3, 1, o).unwrap_err().code,
        ErrorCode::InvalidOptions
    );
    let d = process_rgba(
        &data,
        3,
        1,
        ProcessingOptions {
            design_long_edge_mm: 10000.0,
            ..ProcessingOptions::preserve_pixels()
        },
    )
    .unwrap();
    for v in &d.graph.vertices {
        assert!(d
            .source_point_mm(v.id)
            .unwrap()
            .iter()
            .all(|&p| (0.0..=10000.0).contains(&p)));
    }
}
