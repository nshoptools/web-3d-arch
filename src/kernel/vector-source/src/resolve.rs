use crate::flatten::Budget;
use crate::preflight::Checked;
use crate::*;
use std::collections::HashSet;
use usvg::tiny_skia_path::{Path as SkPath, PathSegment as SkSegment};

fn matrix(t: usvg::Transform) -> Matrix {
    [
        t.sx as f64,
        t.ky as f64,
        t.kx as f64,
        t.sy as f64,
        t.tx as f64,
        t.ty as f64,
    ]
}
fn multiply(a: Matrix, b: Matrix) -> Matrix {
    [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5],
    ]
}
fn mm(t: Matrix) -> Matrix {
    t.map(|v| v * MM_PER_PX)
}
fn check_matrix(t: Matrix) -> Result<(), VectorError> {
    if t.iter().any(|v| !v.is_finite() || v.abs() > 1e12) || t[0] * t[3] - t[1] * t[2] == 0.0 {
        return Err(VectorError::new(
            ErrorCode::CoordinateLimit,
            "Invalid, singular or excessive composed transform",
        ));
    }
    Ok(())
}
fn rule(r: usvg::FillRule) -> FillRule {
    match r {
        usvg::FillRule::NonZero => FillRule::Nonzero,
        usvg::FillRule::EvenOdd => FillRule::Evenodd,
    }
}
fn solid(paint: &usvg::Paint, opacity: f32) -> Result<[u8; 4], VectorError> {
    if opacity != 1.0 {
        return Err(VectorError::new(
            ErrorCode::UnsupportedGeometry,
            "Unexpected resolved alpha paint",
        ));
    }
    match paint {
        usvg::Paint::Color(c) => Ok([c.red, c.green, c.blue, 255]),
        _ => Err(VectorError::new(
            ErrorCode::UnsupportedGeometry,
            "Unexpected unresolved paint server",
        )),
    }
}
struct Converter<'a> {
    checked: &'a Checked,
    doc: &'a mut VectorDocument,
    budget: Budget<'a>,
    seen: HashSet<String>,
    clip_count: usize,
}
impl Converter<'_> {
    fn provenance(&self, id: &str, chain: &[String]) -> Provenance {
        let node = self.checked.ids.get(id).copied();
        let source = node.and_then(|i| self.checked.graph.get(i));
        Provenance {
            source_hash: self.doc.source_hash.clone(),
            source_node: node,
            source_id: source
                .and_then(|s| {
                    s.attributes
                        .iter()
                        .find(|a| a.name == "id" && a.namespace.is_none())
                })
                .map(|a| a.value.clone()),
            source_span: source.map(|s| s.span.clone()),
            reference_chain: chain.to_vec(),
        }
    }
    fn derive(
        &mut self,
        path: &SkPath,
        transform: Matrix,
        provenance: Provenance,
        derivation: &str,
    ) -> Result<(usize, Vec<Contour>), VectorError> {
        check_matrix(transform)?;
        self.budget.count_segments(path.len())?;
        let map = |p: usvg::tiny_skia_path::Point| -> Result<Point, VectorError> {
            let p = [p.x as f64, p.y as f64];
            self.budget.point([
                transform[0] * p[0] + transform[2] * p[1] + transform[4],
                transform[1] * p[0] + transform[3] * p[1] + transform[5],
            ])
        };
        let mut commands = Vec::with_capacity(path.len());
        for segment in path.segments() {
            commands.push(match segment {
                SkSegment::MoveTo(p) => CurveCommand::M { to: map(p)? },
                SkSegment::LineTo(p) => CurveCommand::L { to: map(p)? },
                SkSegment::QuadTo(c, p) => CurveCommand::Q {
                    control: map(c)?,
                    to: map(p)?,
                },
                SkSegment::CubicTo(c1, c2, p) => CurveCommand::C {
                    control1: map(c1)?,
                    control2: map(c2)?,
                    to: map(p)?,
                },
                SkSegment::Close => CurveCommand::Z,
            });
        }
        let contours = flatten::contours(&commands, &mut self.budget)?;
        let id = self.doc.resolved_curves.len();
        self.doc.resolved_curves.push(CurveRecord {
            commands,
            derivation: derivation.into(),
            provenance,
        });
        Ok((id, contours))
    }
    fn group(
        &mut self,
        group: &usvg::Group,
        stack: &[String],
        chain: &[String],
        depth: usize,
    ) -> Result<(), VectorError> {
        if depth > self.budget.options.limits.max_depth {
            return Err(VectorError::new(
                ErrorCode::ResourceLimit,
                "Resolved group depth exceeded",
            ));
        }
        check_matrix(matrix(group.abs_transform()))?;
        if group.opacity().get() != 1.0
            || group.blend_mode() != usvg::BlendMode::Normal
            || group.isolate()
            || group.mask().is_some()
            || !group.filters().is_empty()
        {
            return Err(VectorError::new(
                ErrorCode::UnsupportedGeometry,
                "Unexpected resolved group appearance effect",
            ));
        }
        let mut chain = chain.to_vec();
        if !group.id().is_empty() {
            chain.push(group.id().into());
        }
        let mut stack = stack.to_vec();
        if let Some(clip) = group.clip_path() {
            let id = self.clip(clip, matrix(group.abs_transform()), &chain, depth + 1)?;
            stack.push(id);
        }
        for child in group.children() {
            match child {
                usvg::Node::Group(g) => self.group(g, &stack, &chain, depth + 1)?,
                usvg::Node::Path(p) => self.path(p, &stack, &chain)?,
                _ => {
                    return Err(VectorError::new(
                        ErrorCode::UnsupportedGeometry,
                        "Unexpected image/text in manufacturing tree",
                    ))
                }
            }
        }
        Ok(())
    }
    fn path(
        &mut self,
        path: &usvg::Path,
        clips: &[String],
        chain: &[String],
    ) -> Result<(), VectorError> {
        self.seen.insert(path.id().into());
        if !path.is_visible() {
            let prov = self.provenance(path.id(), chain);
            self.doc.diagnostics.push(Diagnostic {
                code: "hidden_geometry".into(),
                message: "Invisible geometry is retained in source; no manufacturing paint emitted"
                    .into(),
                severity: Severity::Info,
                source_node: prov.source_node,
                source_span: prov.source_span,
            });
            return Ok(());
        }
        let order = match path.paint_order() {
            usvg::PaintOrder::FillAndStroke => [PaintKind::Fill, PaintKind::Stroke],
            usvg::PaintOrder::StrokeAndFill => [PaintKind::Stroke, PaintKind::Fill],
        };
        for kind in order {
            let provenance = self.provenance(path.id(), chain);
            let transform = mm(matrix(path.abs_transform()));
            let (color, fill_rule, record, contours) = match kind {
                PaintKind::Fill => {
                    let Some(fill) = path.fill() else {
                        continue;
                    };
                    let color = solid(fill.paint(), fill.opacity().get())?;
                    let (id, contours) = self.derive(
                        path.data(),
                        transform,
                        provenance.clone(),
                        "usvg fill path in mm",
                    )?;
                    (color, rule(fill.rule()), id, contours)
                }
                PaintKind::Stroke => {
                    let Some(stroke) = path.stroke() else {
                        continue;
                    };
                    if stroke.dasharray().is_some() {
                        return Err(VectorError::new(
                            ErrorCode::UnsupportedGeometry,
                            "Dash expansion is unsupported",
                        ));
                    }
                    // Stroke in LOCAL space, then transform the outline. Nonuniform scale must
                    // scale both the centerline and the cap/join geometry.
                    let color = solid(stroke.paint(), stroke.opacity().get())?;
                    check_matrix(transform)?;
                    let scale = (transform[0] * transform[0]
                        + transform[1] * transform[1]
                        + transform[2] * transform[2]
                        + transform[3] * transform[3])
                        .sqrt();
                    let resolution = (scale / self.budget.options.flatten_tolerance_mm).max(1.0);
                    if !resolution.is_finite() || resolution > 4096.0 {
                        return Err(VectorError::new(
                            ErrorCode::ResourceLimit,
                            "Requested stroker resolution exceeds budget",
                        ));
                    }
                    if path.data().len() > self.budget.options.limits.max_stroke_input_segments {
                        return Err(VectorError::new(
                            ErrorCode::ResourceLimit,
                            "Resolved stroke input segment limit exceeded",
                        ));
                    }
                    let outlined = path
                        .data()
                        .stroke(&stroke.to_tiny_skia(), resolution as f32)
                        .ok_or_else(|| {
                            VectorError::new(
                                ErrorCode::UnsupportedGeometry,
                                "Dependency could not outline stroke",
                            )
                        })?;
                    let (id, contours) = self.derive(
                        &outlined,
                        transform,
                        provenance.clone(),
                        "tiny-skia local stroke outline transformed to mm",
                    )?;
                    if !self
                        .doc
                        .ledger
                        .entries
                        .iter()
                        .any(|e| e.stage == "stroke_outline")
                    {
                        self.doc.ledger.entries.push(LedgerEntry { stage: "stroke_outline".into(), error_bound_mm: None,
                            note: "tiny-skia-path 0.12.0 stroker (solid strokes only). Local outline then full affine transform. Resolution is bounded, but stroker approximation/f32 error is not certified.".into() });
                    }
                    (color, FillRule::Nonzero, id, contours)
                }
            };
            if self.doc.shapes.len() >= self.budget.options.limits.max_shapes {
                return Err(VectorError::new(
                    ErrorCode::ResourceLimit,
                    "Paint operand budget exceeded",
                ));
            }
            let order = self.doc.shapes.len();
            self.doc.shapes.push(Shape {
                id: format!("paint-{order}"),
                paint_order: order,
                paint_kind: kind,
                color,
                fill_rule,
                contours,
                clip_stack: clips.to_vec(),
                curve_record: record,
                provenance,
            });
        }
        Ok(())
    }
    fn clip(
        &mut self,
        clip: &usvg::ClipPath,
        base: Matrix,
        chain: &[String],
        depth: usize,
    ) -> Result<String, VectorError> {
        self.clip_count += 1;
        if self.clip_count > self.budget.options.limits.max_clip_instances
            || depth > self.budget.options.limits.max_depth
        {
            return Err(VectorError::new(
                ErrorCode::ResourceLimit,
                "Clip instance/depth budget exceeded",
            ));
        }
        let id = format!("clip-{}", self.clip_count);
        let mut chain = chain.to_vec();
        chain.push(clip.id().into());
        let provenance = self.provenance(clip.id(), &chain);
        let mut intersections = vec![];
        // As in resvg::clip::apply, a linked clip uses the ORIGINAL base;
        // clip.transform() applies only to this clip's own children.
        if let Some(linked) = clip.clip_path() {
            intersections.push(self.clip(linked, base, &chain, depth + 1)?);
        }
        let transform = multiply(base, matrix(clip.transform()));
        check_matrix(transform)?;
        let mut parts = vec![];
        self.clip_children(clip.root(), transform, &[], &chain, depth + 1, &mut parts)?;
        if parts.is_empty() {
            return Err(VectorError::new(
                ErrorCode::UnsupportedGeometry,
                "Empty resolved clip; refusing silent unclipping",
            ));
        }
        self.doc.clips.push(ClipRegion {
            id: id.clone(),
            source_id: provenance.source_id.clone(),
            parts,
            clip_stack: intersections,
            provenance,
        });
        Ok(id)
    }
    fn clip_children(
        &mut self,
        group: &usvg::Group,
        base: Matrix,
        stack: &[String],
        chain: &[String],
        depth: usize,
        parts: &mut Vec<ClipPart>,
    ) -> Result<(), VectorError> {
        if depth > self.budget.options.limits.max_depth {
            return Err(VectorError::new(
                ErrorCode::ResourceLimit,
                "Clip child depth exceeded",
            ));
        }
        for child in group.children() {
            match child {
                usvg::Node::Group(g) => {
                    let transform = multiply(base, matrix(g.transform()));
                    check_matrix(transform)?;
                    let mut stack = stack.to_vec();
                    if let Some(clip) = g.clip_path() {
                        stack.push(self.clip(clip, transform, chain, depth + 1)?);
                    }
                    self.clip_children(g, transform, &stack, chain, depth + 1, parts)?;
                }
                usvg::Node::Path(p) => {
                    self.seen.insert(p.id().into());
                    if !p.is_visible() {
                        continue;
                    }
                    let Some(fill) = p.fill() else {
                        return Err(VectorError::new(
                            ErrorCode::UnsupportedGeometry,
                            "Clip path has no resolved fill",
                        ));
                    };
                    let provenance = self.provenance(p.id(), chain);
                    let (curve_record, contours) = self.derive(
                        p.data(),
                        mm(base),
                        provenance.clone(),
                        "usvg clip outline in mm",
                    )?;
                    parts.push(ClipPart {
                        fill_rule: rule(fill.rule()),
                        contours,
                        clip_stack: stack.to_vec(),
                        curve_record,
                        provenance,
                    });
                }
                _ => {
                    return Err(VectorError::new(
                        ErrorCode::UnsupportedGeometry,
                        "Unexpected clip child",
                    ))
                }
            }
        }
        Ok(())
    }
}

pub(crate) fn convert(
    checked: &Checked,
    options: &ParseOptions,
    doc: &mut VectorDocument,
) -> Result<(), VectorError> {
    let parser_options = usvg::Options {
        dpi: 96.0,
        resources_dir: None,
        image_href_resolver: usvg::ImageHrefResolver {
            resolve_data: Box::new(|_, _, _| None),
            resolve_string: Box::new(|_, _| None),
        },
        ..Default::default()
    };
    let xml = roxmltree::Document::parse_with_options(
        &checked.normalized_svg,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: options.limits.max_xml_nodes,
            ..Default::default()
        },
    )
    .map_err(|e| VectorError::new(ErrorCode::InvalidXml, format!("Normalized XML: {e}")))?;
    let tree = usvg::Tree::from_xmltree(&xml, &parser_options)
        .map_err(|e| VectorError::new(ErrorCode::ParserError, format!("usvg: {e}")))?;
    let width = f64::from(tree.size().width()) * MM_PER_PX;
    let height = f64::from(tree.size().height()) * MM_PER_PX;
    if !width.is_finite()
        || !height.is_finite()
        || width <= 0.0
        || height <= 0.0
        || width > options.limits.max_coordinate_mm
        || height > options.limits.max_coordinate_mm
    {
        return Err(VectorError::new(
            ErrorCode::CoordinateLimit,
            "Resolved viewport is outside finite mm domain",
        ));
    }
    doc.width_mm = Some(width);
    doc.height_mm = Some(height);
    doc.viewport_clip = Some(vec![
        [0.0, 0.0],
        [width, 0.0],
        [width, height],
        [0.0, height],
        [0.0, 0.0],
    ]);
    let mut converter = Converter {
        checked,
        doc,
        budget: Budget::new(options),
        seen: HashSet::new(),
        clip_count: 0,
    };
    converter.group(tree.root(), &[], &[], 0)?;
    for (id, index) in &checked.active_geometry {
        if !converter.seen.contains(id) {
            converter.doc.diagnostics.push(Diagnostic { code: "source_geometry_not_emitted".into(),
                message: "usvg omitted source geometry (e.g. display:none, degenerate size or unsupported conversion); manufacturing is blocked, no partial result is returned".into(),
                severity: Severity::ManufacturingBlocked, source_node: Some(*index),
                source_span: checked.graph.get(*index).map(|n| n.span.clone()) });
            converter.doc.status = ManufacturingStatus::Unsupported;
        }
    }
    converter.doc.ledger.emitted_vertices = converter.budget.vertices;
    converter.doc.ledger.resolved_segments = converter.budget.segments;
    converter.doc.ledger.max_accepted_flatness_mm = converter.budget.max_flatness;
    if converter.doc.status == ManufacturingStatus::Unsupported {
        converter.doc.shapes.clear();
        converter.doc.clips.clear();
        converter.doc.resolved_curves.clear();
    } else if converter.doc.shapes.is_empty() {
        converter.doc.status = ManufacturingStatus::Empty;
        converter.doc.diagnostics.push(Diagnostic {
            code: "empty_document".into(),
            message: "No visible manufacturing paint operands".into(),
            severity: Severity::Info,
            source_node: None,
            source_span: None,
        });
    } else {
        converter.doc.diagnostics.push(Diagnostic { code: "regions_unresolved".into(),
            message: "Resolve fill rules, clip graph, paint overlap/material subdivision and shared seams before extrusion".into(),
            severity: Severity::Info, source_node: None, source_span: None });
    }

    Ok(())
}
