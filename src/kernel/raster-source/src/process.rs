use crate::*;

fn copy(data: &[u8], budget: &mut Budget<'_>) -> Result<Vec<u8>, RasterError> {
    budget.reserve(data.len() as u64)?;
    let mut out = buffer(data.len(), 0u8)?;
    out.copy_from_slice(data);
    Ok(out)
}
pub(crate) fn distance(a: Rgb, b: Rgb) -> u32 {
    a.into_iter()
        .zip(b)
        .map(|(x, y)| {
            let d = i32::from(x) - i32::from(y);
            (d * d) as u32
        })
        .sum()
}
fn unpack(v: u32) -> Rgb {
    [(v >> 16) as u8, (v >> 8) as u8, v as u8]
}
fn nearest(color: Rgb, palette: &[Rgb]) -> usize {
    palette
        .iter()
        .enumerate()
        .min_by_key(|(i, c)| (distance(color, **c), *i))
        .map(|v| v.0)
        .unwrap_or(0)
}

fn working_size(w: u32, h: u32, cap: u32) -> (u32, u32) {
    let edge = w.max(h);
    if edge <= cap {
        return (w, h);
    }
    (
        round_even(u64::from(w) * u64::from(cap), u64::from(edge)).max(1) as u32,
        round_even(u64::from(h) * u64::from(cap), u64::from(edge)).max(1) as u32,
    )
}

/// Exact rational cell overlap weights, integer premultiplied encoded-sRGB box.
fn resample(
    data: &[u8],
    sw: u32,
    sh: u32,
    dw: u32,
    dh: u32,
    budget: &mut Budget<'_>,
) -> Result<Vec<u8>, RasterError> {
    if (sw, sh) == (dw, dh) {
        budget.spend(u64::from(sw) * u64::from(sh))?;
        return copy(data, budget);
    }
    let size = dw as usize * dh as usize * 4;
    budget.reserve(size as u64)?;
    let mut out = buffer(size, 0u8)?;
    let area = u64::from(sw) * u64::from(sh);
    for oy in 0..dh {
        let top = u64::from(oy) * u64::from(sh);
        let bottom = u64::from(oy + 1) * u64::from(sh);
        let iy0 = top / u64::from(dh);
        let iy1 = bottom.div_ceil(u64::from(dh));
        for ox in 0..dw {
            let left = u64::from(ox) * u64::from(sw);
            let right = u64::from(ox + 1) * u64::from(sw);
            let ix0 = left / u64::from(dw);
            let ix1 = right.div_ceil(u64::from(dw));
            let mut a = 0u64;
            let mut rgb = [0u64; 3];
            for iy in iy0..iy1 {
                let wy = bottom.min((iy + 1) * u64::from(dh)) - top.max(iy * u64::from(dh));
                for ix in ix0..ix1 {
                    budget.spend(8)?;
                    let wx = right.min((ix + 1) * u64::from(dw)) - left.max(ix * u64::from(dw));
                    let p = &data[(iy as usize * sw as usize + ix as usize) * 4..][..4];
                    let weight = wx * wy * u64::from(p[3]);
                    a += weight;
                    for c in 0..3 {
                        rgb[c] += weight * u64::from(p[c]);
                    }
                }
            }
            let p = &mut out[(oy as usize * dw as usize + ox as usize) * 4..][..4];
            p[3] = round_even(a, area) as u8;
            if a != 0 {
                for c in 0..3 {
                    p[c] = round_even(rgb[c], a) as u8;
                }
            }
        }
    }
    Ok(out)
}
fn apply_alpha(
    data: &mut [u8],
    policy: &AlphaPolicy,
    budget: &mut Budget<'_>,
) -> Result<u64, RasterError> {
    budget.spend(data.len() as u64)?;
    let mut changed = 0;
    for p in data.chunks_exact_mut(4) {
        if p[3] == 0 {
            p.fill(0);
            continue;
        }
        if p[3] == 255 {
            continue;
        }
        match *policy {
            AlphaPolicy::RejectPartial=>return Err(error(ErrorCode::AlphaPolicyRequired,
                "Partial alpha requires an explicit threshold or matte policy; no implicit white background")),
            AlphaPolicy::Threshold{cutoff}=>{
                if p[3]<cutoff {p.fill(0);}else{p[3]=255;}
            }
            AlphaPolicy::MattePartialEncodedSrgb{color}=>{
                let a=u64::from(p[3]);
                for c in 0..3 {p[c]=round_even(u64::from(p[c])*a+u64::from(color[c])*(255-a),255) as u8;}
                p[3]=255;
            }
        }
        changed += 1;
    }
    Ok(changed)
}
fn denoise(
    data: &mut Vec<u8>,
    w: u32,
    h: u32,
    passes: u8,
    budget: &mut Budget<'_>,
) -> Result<u64, RasterError> {
    if passes == 0 {
        return Ok(0);
    }
    let before = copy(data, budget)?;
    for _ in 0..passes {
        let mut next = copy(data, budget)?;
        budget.spend(u64::from(w) * u64::from(h) * 100)?;
        for y in 0..h {
            for x in 0..w {
                let i = (y as usize * w as usize + x as usize) * 4;
                if data[i + 3] == 0 {
                    continue;
                }
                let mut values = [[0u8; 9]; 3];
                let mut count = 0;
                for ny in y.saturating_sub(1)..=(y + 1).min(h - 1) {
                    for nx in x.saturating_sub(1)..=(x + 1).min(w - 1) {
                        let j = (ny as usize * w as usize + nx as usize) * 4;
                        if data[j + 3] == 255 {
                            for c in 0..3 {
                                values[c][count] = data[j + c];
                            }
                            count += 1;
                        }
                    }
                }
                for c in 0..3 {
                    values[c][..count].sort_unstable();
                    // Lower median for an even number of opaque neighbors.
                    next[i + c] = values[c][(count - 1) / 2];
                }
            }
        }
        *data = next;
    }
    Ok(before
        .chunks_exact(4)
        .zip(data.chunks_exact(4))
        .filter(|(a, b)| a != b)
        .count() as u64)
}
#[derive(Clone, Copy)]
struct Bucket {
    rgb: Rgb,
    count: u64,
}
fn palette(
    data: &[u8],
    options: &ProcessingOptions,
    budget: &mut Budget<'_>,
) -> Result<(Vec<Rgb>, u32, String), RasterError> {
    if let Some(fixed) = &options.fixed_palette {
        return Ok((
            fixed.clone(),
            0,
            "fixed-palette/nearest-squared-encoded-sRGB8-v1/ties-palette-order".into(),
        ));
    }
    let n = data.len() / 4;
    budget.reserve(n as u64 * 4)?;
    let mut colors = Vec::new();
    colors
        .try_reserve_exact(n)
        .map_err(|_| error(ErrorCode::MemoryLimit, "Color histogram allocation refused"))?;
    for p in data.chunks_exact(4) {
        if p[3] != 0 {
            colors.push((u32::from(p[0]) << 16) | (u32::from(p[1]) << 8) | u32::from(p[2]));
        }
    }
    let log = usize::BITS - colors.len().max(1).leading_zeros();
    budget.spend(colors.len() as u64 * u64::from(log) * 2 + n as u64)?;
    colors.sort_unstable();
    let mut buckets: Vec<Bucket> = Vec::new();
    let mut previous = None;
    for v in colors {
        if previous == Some(v) {
            buckets.last_mut().unwrap().count += 1;
        } else {
            if buckets.len() >= options.limits.max_unique_colors as usize {
                return Err(error(
                    ErrorCode::WorkLimit,
                    "Unique RGB histogram limit exceeded",
                ));
            }
            budget.reserve(32)?;
            buckets
                .try_reserve(1)
                .map_err(|_| error(ErrorCode::MemoryLimit, "Color bucket allocation refused"))?;
            buckets.push(Bucket {
                rgb: unpack(v),
                count: 1,
            });
            previous = Some(v);
        }
    }
    let algorithm="weighted-farthest-seeds+Lloyd12/nearest-squared-encoded-sRGB8-v1/integer-ties-even/lexicographic-IDs";
    let k = usize::from(options.parameters.k).min(buckets.len());
    if k == 0 {
        return Ok((Vec::new(), 0, algorithm.into()));
    }
    if k == buckets.len() {
        return Ok((buckets.iter().map(|b| b.rgb).collect(), 0, algorithm.into()));
    }
    let first = buckets
        .iter()
        .enumerate()
        .min_by_key(|(i, b)| (std::cmp::Reverse(b.count), *i))
        .unwrap()
        .0;
    let mut centers = vec![buckets[first].rgb];
    budget.reserve(buckets.len() as u64 * 4)?;
    let mut min_dist = buffer(buckets.len(), u32::MAX)?;
    while centers.len() < k {
        budget.spend(buckets.len() as u64 * 4)?;
        let last = *centers.last().unwrap();
        for (d, b) in min_dist.iter_mut().zip(&buckets) {
            *d = (*d).min(distance(last, b.rgb));
        }
        let seed = buckets
            .iter()
            .zip(&min_dist)
            .enumerate()
            .min_by_key(|(i, (b, d))| (std::cmp::Reverse(b.count * u64::from(**d)), *i))
            .unwrap()
            .0;
        centers.push(buckets[seed].rgb);
    }
    let mut iterations = 0;
    for _ in 0..12 {
        budget.spend(buckets.len() as u64 * centers.len() as u64 * 4)?;
        let mut sums = vec![[0u64; 3]; k];
        let mut counts = vec![0u64; k];
        for b in &buckets {
            let j = nearest(b.rgb, &centers);
            counts[j] += b.count;
            for c in 0..3 {
                sums[j][c] += u64::from(b.rgb[c]) * b.count;
            }
        }
        let mut next = centers.clone();
        for j in 0..k {
            if counts[j] != 0 {
                for c in 0..3 {
                    next[j][c] = round_even(sums[j][c], counts[j]) as u8;
                }
            }
        }
        iterations += 1;
        if next == centers {
            break;
        }
        centers = next;
    }
    centers.sort_unstable();
    centers.dedup();
    Ok((centers, iterations, algorithm.into()))
}
fn compare(
    before: &[u8],
    after: &[u8],
    budget: &mut Budget<'_>,
) -> Result<PreviewComparison, RasterError> {
    budget.spend(before.len() as u64)?;
    let mut out=PreviewComparison {comparison_domain:
        "same processing grid; premultiplied encoded-sRGB RGB and alpha, each normalized 0..1; invisible RGB ignored".into(),..Default::default()};
    let mut sum = 0.0;
    for (a, b) in before.chunks_exact(4).zip(after.chunks_exact(4)) {
        let mut changed = false;
        for c in 0..4 {
            let va = if c == 3 {
                f64::from(a[3]) / 255.0
            } else {
                f64::from(a[c]) * f64::from(a[3]) / 65025.0
            };
            let vb = if c == 3 {
                f64::from(b[3]) / 255.0
            } else {
                f64::from(b[c]) * f64::from(b[3]) / 65025.0
            };
            let d = (va - vb).abs();
            changed |= d != 0.0;
            sum += d * d;
            out.max_abs_premultiplied_rgba_error = out.max_abs_premultiplied_rgba_error.max(d);
        }
        if changed {
            out.changed_pixels += 1;
        }
        if a[3] != b[3] {
            out.alpha_changed_pixels += 1;
        }
    }
    out.mean_squared_premultiplied_rgba_error = sum / before.len() as f64;
    Ok(out)
}

fn process(
    data: &[u8],
    width: u32,
    height: u32,
    options: ProcessingOptions,
    encoded: Option<&SourceImage>,
) -> Result<RasterDocument, RasterError> {
    options.validate()?;
    let input_pixels = options.limits.pixels(width, height)?;
    if data.len() != input_pixels * 4 {
        return Err(error(
            ErrorCode::InvalidBuffer,
            "RGBA length must equal width*height*4 exactly",
        ));
    }
    let (w, h) = working_size(width, height, options.parameters.res);
    let n = w as usize * h as usize;
    if n as u64 > options.limits.max_processing_pixels {
        return Err(error(
            ErrorCode::PixelLimit,
            "Processing pixel limit exceeded",
        ));
    }
    let mut budget = Budget::new(&options.limits);
    budget.spend(data.len() as u64)?;
    budget.reserve(16384)?; // Bounded options/metadata/diagnostics/palette overhead.
    let original_rgba_hash = hash(data);
    let original_rgba = copy(data, &mut budget)?;
    let encoded_source = if let Some(src) = encoded {
        budget.spend(src.original_bytes.len() as u64)?;
        budget.reserve(
            src.original_bytes.len() as u64
                + src
                    .orientation
                    .original_exif
                    .as_ref()
                    .map_or(0, |x| x.len()) as u64,
        )?;
        Some(EncodedSource {
            bytes: src.original_bytes.clone(),
            hash: src.source_hash.clone(),
            format: src.format,
            orientation: src.orientation.clone(),
            color: src.color.clone(),
        })
    } else {
        None
    };
    let resampled_rgba = resample(data, width, height, w, h, &mut budget)?;
    let mut working = copy(&resampled_rgba, &mut budget)?;
    let mut decisions = ProcessingDecisions {
        downsampled: (w, h) != (width, height),
        alpha_input: alpha_summary(data),
        ..Default::default()
    };
    decisions.alpha_changed_pixels = apply_alpha(&mut working, &options.alpha_policy, &mut budget)?;
    decisions.denoise_changed_pixels =
        denoise(&mut working, w, h, options.parameters.denoise, &mut budget)?;
    let (colors, iterations, algorithm) = palette(&working, &options, &mut budget)?;
    decisions.palette_algorithm = algorithm;
    decisions.palette_iterations = iterations;
    budget.reserve(n as u64 * 2)?;
    budget.spend(n as u64 * colors.len().max(1) as u64 * 4)?;
    let mut labels = buffer(n, 0u16)?;
    let mut entries: Vec<PaletteEntry> = colors
        .iter()
        .enumerate()
        .map(|(i, &color)| PaletteEntry {
            label: i as u16 + 1,
            color,
            initial_pixels: 0,
            final_pixels: 0,
        })
        .collect();
    for (label, p) in labels.iter_mut().zip(working.chunks_exact(4)) {
        if p[3] != 0 {
            let color = [p[0], p[1], p[2]];
            let j = nearest(color, &colors);
            *label = j as u16 + 1;
            entries[j].initial_pixels += 1;
            if color != colors[j] {
                decisions.palette_recolored_pixels += 1;
            }
        }
    }
    let (mut regions, mut map) = crate::graph::components(&labels, w, h, &mut budget)?;
    let edited = crate::graph::edit_regions(
        &mut labels,
        w,
        h,
        &colors,
        &options,
        &regions,
        &map,
        &mut decisions,
        &mut budget,
    )?;
    if edited {
        (regions, map) = crate::graph::components(&labels, w, h, &mut budget)?;
    }
    let graph = crate::graph::build(&labels, w, h, &map, &mut regions, &mut budget)?;
    let geometry =
        crate::geometry::derive(&graph, &regions, w, h, &options.parameters, &mut budget)?;
    budget.reserve(n as u64 * 4)?;
    budget.spend(n as u64)?;
    let mut processed_rgba = buffer(n * 4, 0u8)?;
    for (&label, p) in labels.iter().zip(processed_rgba.chunks_exact_mut(4)) {
        if label != 0 {
            let entry = &mut entries[label as usize - 1];
            entry.final_pixels += 1;
            p[..3].copy_from_slice(&entry.color);
            p[3] = 255;
        }
    }
    decisions.alpha_processed = alpha_summary(&processed_rgba);
    let material_count = entries.iter().filter(|e| e.final_pixels > 0).count() as u16;
    let comparison = compare(&resampled_rgba, &processed_rgba, &mut budget)?;
    let mut reasons: Vec<String> = Vec::new();
    if geometry.ledger.changed {
        reasons.push("shared_boundary_geometry_approximation".into());
    }
    if !geometry.ledger.rejected_trials.is_empty() {
        reasons.push("topology_constrained_geometry_strength".into());
    }
    if decisions.downsampled {
        reasons.push("area_box_downsample".into());
    }
    if decisions.alpha_changed_pixels > 0 {
        reasons.push("partial_alpha_conversion".into());
    }
    if decisions.denoise_changed_pixels > 0 {
        reasons.push("opaque_rgb_median_denoise".into());
    }
    if decisions.palette_recolored_pixels > 0 {
        reasons.push("palette_color_approximation".into());
    }
    if decisions.background_excluded_pixels > 0 {
        reasons.push("border_connected_background_exclusion".into());
    }
    if !decisions.merges.is_empty() {
        reasons.push("small_region_merge".into());
    }
    if encoded.is_some_and(|s| s.color.requires_confirmation) && material_count > 0 {
        reasons.push("untagged_source_color_assumed_srgb".into());
    }
    let mut proposal_options = options.clone();
    proposal_options.accepted_proposal_hash = None;
    let metadata = serde_json::to_vec(&proposal_options)
        .map_err(|_| error(ErrorCode::InvalidOptions, "Options cannot be serialized"))?;
    let mut digest = Sha256::new();
    digest.update(b"arch-raster-source/proposal/schema2\0");
    digest.update(width.to_le_bytes());
    digest.update(height.to_le_bytes());
    digest.update(original_rgba_hash.as_bytes());
    digest.update(metadata);
    // Bind the actual preview and topology as well as inputs, so a later
    // algorithm change cannot accidentally reuse an older acceptance token.
    budget.spend(
        processed_rgba.len() as u64
            + labels.len() as u64 * 2
            + graph.vertices.len() as u64 * 12
            + graph.edges.len() as u64 * 40,
    )?;
    digest.update(w.to_le_bytes());
    digest.update(h.to_le_bytes());
    digest.update(&processed_rgba);
    for label in &labels {
        digest.update(label.to_le_bytes());
    }
    for color in &colors {
        digest.update(color);
    }
    for vertex in &graph.vertices {
        digest.update(vertex.id.to_le_bytes());
        digest.update(vertex.x.to_le_bytes());
        digest.update(vertex.y.to_le_bytes());
    }
    for edge in &graph.edges {
        for id in [
            edge.id,
            edge.from,
            edge.to,
            edge.left_region.unwrap_or(u32::MAX),
            edge.right_region.unwrap_or(u32::MAX),
        ] {
            digest.update(id.to_le_bytes());
        }
        digest.update(edge.left_label.to_le_bytes());
        digest.update(edge.right_label.to_le_bytes());
    }
    for region in &regions {
        digest.update(region.id.to_le_bytes());
        digest.update(region.label.to_le_bytes());
        digest.update(region.pixel_count.to_le_bytes());
        digest.update((region.loops.len() as u64).to_le_bytes());
        for contour in &region.loops {
            digest.update((contour.edges.len() as u64).to_le_bytes());
            for reference in &contour.edges {
                digest.update(reference.edge.to_le_bytes());
                digest.update([u8::from(reference.reversed)]);
            }
        }
    }
    // Stream metadata into SHA-256: no duplicate JSON geometry buffer or mesh transport.
    struct HashWriter<'a>(&'a mut Sha256);
    impl std::io::Write for HashWriter<'_> {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.update(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    budget.spend(geometry.vertices.len() as u64 * 96 + geometry.edges.len() as u64 * 160)?;
    serde_json::to_writer(HashWriter(&mut digest), &geometry).map_err(|_| {
        error(
            ErrorCode::InvariantViolation,
            "Cannot hash derived geometry",
        )
    })?;
    if let Some(src) = encoded {
        digest.update(src.source_hash.as_bytes());
    }
    let proposal_hash = format!("{digest:x}", digest = digest.finalize());
    if options
        .accepted_proposal_hash
        .as_ref()
        .is_some_and(|h| h != &proposal_hash)
    {
        return Err(error(
            ErrorCode::ConfirmationMismatch,
            "Approval does not match this source and exact processing options",
        ));
    }
    let requires_confirmation = !reasons.is_empty() && options.accepted_proposal_hash.is_none();
    let status = if requires_confirmation {
        ProcessingStatus::RequiresConfirmation
    } else if material_count == 0 {
        ProcessingStatus::Empty
    } else {
        ProcessingStatus::Ready
    };
    let source_edge = f64::from(width.max(height));
    let width_mm = options.design_long_edge_mm * (f64::from(width) / source_edge);
    let height_mm = options.design_long_edge_mm * (f64::from(height) / source_edge);
    let sx = width_mm / f64::from(w);
    let sy = height_mm / f64::from(h);
    if !(sx / GEOMETRY_SCALE as f64).is_normal() || !(sy / GEOMETRY_SCALE as f64).is_normal() {
        return Err(error(
            ErrorCode::InvalidOptions,
            "Physical transform underflows a normal f64 dyadic-coordinate unit",
        ));
    }
    let mut diagnostics = encoded.map_or_else(Vec::new, |s| s.diagnostics.clone());
    diagnostics.push(Diagnostic {code:"proposed_parameter_semantics".into(),
        message:"Versioned v2 proposal; catalog values retained. Shared smooth/eps/tension execute with exact embedding checks and recorded constraints.".into()});
    diagnostics.push(Diagnostic {code:"pixel_grid_is_not_mechanical_precision".into(),
        message:"Exact labeled-cell boundaries do not bound source geometry, printer fit or material shrinkage.".into()});
    if material_count == 0 {
        diagnostics.push(Diagnostic {
            code: "empty_material_document".into(),
            message: "No opaque material remains; transparent label 0 is not a material.".into(),
        });
    }
    if decisions.unmerged_small_regions > 0 {
        diagnostics.push(Diagnostic {
            code: "small_regions_preserved".into(),
            message: format!(
                "{} small regions have no eligible opaque neighbor and remain intact",
                decisions.unmerged_small_regions
            ),
        });
    }
    let mut entries_ledger=vec![
        LedgerEntry {stage:"source".into(),bound_mm:None,note:"Original RGBA is byte-exact; encoded originals are retained by process_image. Rendered source stays referenced by confirmed source/settings hashes.".into()},
        LedgerEntry {stage:"resampling".into(),bound_mm:None,note:format!(
            "{}x{} -> {}x{}; area-box premultiplied encoded-sRGB8, integer overlap weights and ties-even rounding. Pixel footprints are not a certified continuous-source contour bound.",width,height,w,h)},
        LedgerEntry {stage:"alpha".into(),bound_mm:None,note:format!(
            "{:?}; {} partial pixels converted; original alpha zero remains void before all later stages",options.alpha_policy,decisions.alpha_changed_pixels)},
        LedgerEntry {stage:"denoise".into(),bound_mm:None,note:format!(
            "{} simultaneous 3x3 opaque-neighbor lower-median RGB passes; {} final RGB pixels changed; alpha occupancy unchanged",options.parameters.denoise,decisions.denoise_changed_pixels)},
        LedgerEntry {stage:"palette".into(),bound_mm:None,note:format!(
            "{}; {} pixels recolored; metric is encoded RGB squared distance, NOT a perceptual DeltaE guarantee",decisions.palette_algorithm,decisions.palette_recolored_pixels)},
        LedgerEntry {stage:"region_edits".into(),bound_mm:None,note:format!(
            "{} background pixels removed; {} one-pass minA merges; transparent holes and isolated accents are never implicit merge targets",
            decisions.background_excluded_pixels,decisions.merges.len())},
        LedgerEntry {stage:"boundary_graph".into(),bound_mm:Some(0.0),
            note:"Exact unit edges of final label grid. One shared edge, opposite material incidences. No smoothing/simplification/quantization. Zero bound is ONLY relative to this processed grid.".into()},
        LedgerEntry {stage:"physical_transform".into(),bound_mm:None,note:format!(
            "Original aspect ratio preserved over declared extent. One processing cell is {sx} by {sy} mm; host maps each shared ID once and records its own integer quantization error.")},
    ];
    let bound_px = geometry.ledger.total_linf_bound_units as f64 / GEOMETRY_SCALE as f64;
    let bound_mm = bound_px * physical_diagonal(sx, sy) * (1.0 + 8.0 * f64::EPSILON);
    entries_ledger.push(LedgerEntry {stage:"shared_derived_geometry".into(),bound_mm:Some(bound_mm),
        note:format!("L-infinity {} processing pixels relative to final label cells; exact dyadic geometry; {} rejected topology trials; source-continuous and printer-fit errors remain unknown",
            bound_px,geometry.ledger.rejected_trials.len())});
    let ledger = RasterLedger {
        work_units: budget.work,
        estimated_working_bytes: budget.bytes,
        boundary_construction:
            "global-label-grid/unit-edge-graph-v1/4-connected-regions/right-hand-loops".into(),
        boundary_approximation_error_px: bound_px,
        resampling_algorithm: if decisions.downsampled {
            "rational-area-box-premultiplied-encoded-sRGB8-ties-even-v1"
        } else {
            "identity-byte-copy"
        }
        .into(),
        processing_pixel_diagonal_mm: physical_diagonal(sx, sy),
        total_source_geometry_error_bound_mm: None,
        entries: entries_ledger,
    };
    Ok(RasterDocument {schema_version:SCHEMA_VERSION,status,requires_confirmation,confirmation_reasons:reasons,
        proposal_hash,input_width:width,input_height:height,original_rgba,original_rgba_hash,encoded_source,options,
        width:w,height:h,resampled_rgba,processed_rgba,labels,palette:entries,material_count,regions,graph,geometry,
        transform:GridTransform {width_mm,height_mm,mm_per_pixel_x:sx,mm_per_pixel_y:sy,
            coordinates:"source graph: integer pixels; derived geometry: dyadic pixels / GEOMETRY_SCALE; X right, Y down; outer positive, hole negative".into(),
            quantization:"none; host transforms/quantizes each shared vertex ID once (e.g. global 1 nm ties-even)".into()},
        decisions,comparison,diagnostics,ledger})
}

/// Explicit straight-alpha sRGB8 pixels or pixels from an already confirmed renderer.
/// No file, font, network, filesystem, renderer or external callback is consulted.
pub fn process_rgba(
    data: &[u8],
    width: u32,
    height: u32,
    options: ProcessingOptions,
) -> Result<RasterDocument, RasterError> {
    process(data, width, height, options, None)
}

/// Revalidates the encoded source with the pinned decoder, rejecting mutated buffers.
/// Decode and processing budgets are separate; a host deadline remains necessary.
pub fn process_image(
    source: &SourceImage,
    options: ProcessingOptions,
) -> Result<RasterDocument, RasterError> {
    options.validate()?;
    let verified = decode_image(
        &source.original_bytes,
        DecodeOptions {
            limits: options.limits.clone(),
        },
    )?;
    if source.schema_version != SCHEMA_VERSION
        || source.source_hash != verified.source_hash
        || source.rgba_hash != verified.rgba_hash
        || source.rgba != verified.rgba
        || source.width != verified.width
        || source.height != verified.height
        || source.format != verified.format
    {
        return Err(error(
            ErrorCode::InvalidBuffer,
            "SourceImage has changed since decode; raw source must be reimported",
        ));
    }
    process(
        &verified.rgba,
        verified.width,
        verified.height,
        options,
        Some(&verified),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn area_weights_and_premultiplication_are_analytic() {
        let limits = Limits::default();
        let mut b = Budget::new(&limits);
        assert_eq!(
            resample(&[255, 0, 0, 255, 0, 255, 0, 0], 2, 1, 1, 1, &mut b).unwrap(),
            [255, 0, 0, 128]
        );
        assert_eq!(
            resample(&[0, 0, 0, 255, 1, 1, 1, 255], 2, 1, 1, 1, &mut b).unwrap(),
            [0, 0, 0, 255]
        );
        assert_eq!(
            resample(&[1, 1, 1, 255, 2, 2, 2, 255], 2, 1, 1, 1, &mut b).unwrap(),
            [2, 2, 2, 255]
        );
        let src = [0, 0, 0, 255, 120, 120, 120, 255, 240, 240, 240, 255];
        assert_eq!(
            resample(&src, 3, 1, 2, 1, &mut b).unwrap(),
            [40, 40, 40, 255, 200, 200, 200, 255]
        );
    }
}
