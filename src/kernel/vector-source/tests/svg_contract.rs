use arch_vector_source::*;
use sha2::{Digest, Sha256};

const HOLE: &str = include_str!("fixtures/corpus-v1/rectangle-hole.svg");
const SEAM: &str = include_str!("fixtures/corpus-v1/shared-seam.svg");
fn svg(body: &str) -> String {
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100">{body}</svg>"#
    )
}
fn parse(body: &str) -> VectorDocument {
    parse_svg(&svg(body), ParseOptions::default()).unwrap()
}
fn near(actual: f64, expected: f64, tolerance: f64) {
    assert!(
        (actual - expected).abs() <= tolerance,
        "actual={actual:.12}, expected={expected:.12}, tolerance={tolerance}"
    );
}
fn signed_area(c: &Contour) -> f64 {
    c.windows(2)
        .map(|e| e[0][0] * e[1][1] - e[1][0] * e[0][1])
        .sum::<f64>()
        / 2.0
}
fn bounds(c: &[Contour]) -> [f64; 4] {
    c.iter().flatten().fold(
        [
            f64::INFINITY,
            f64::INFINITY,
            f64::NEG_INFINITY,
            f64::NEG_INFINITY,
        ],
        |b, p| {
            [
                b[0].min(p[0]),
                b[1].min(p[1]),
                b[2].max(p[0]),
                b[3].max(p[1]),
            ]
        },
    )
}
// Independent ray crossing oracle, used only on off-boundary test probes.
fn contains(contours: &[Contour], rule: FillRule, p: Point) -> bool {
    let mut winding: i32 = 0;
    for c in contours {
        for edge in c.windows(2) {
            let [a, b] = [edge[0], edge[1]];
            let side = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
            if a[1] <= p[1] && b[1] > p[1] && side > 0.0 {
                winding += 1;
            }
            if a[1] > p[1] && b[1] <= p[1] && side < 0.0 {
                winding -= 1;
            }
        }
    }
    match rule {
        FillRule::Nonzero => winding != 0,
        FillRule::Evenodd => winding % 2 != 0,
    }
}
fn clip_contains(doc: &VectorDocument, id: &str, p: Point) -> bool {
    let clip = doc.clips.iter().find(|c| c.id == id).unwrap();
    clip.clip_stack.iter().all(|s| clip_contains(doc, s, p))
        && clip.parts.iter().any(|part| {
            contains(&part.contours, part.fill_rule, p)
                && part.clip_stack.iter().all(|s| clip_contains(doc, s, p))
        })
}
fn shape_contains(doc: &VectorDocument, i: usize, p: Point) -> bool {
    let s = &doc.shapes[i];
    contains(&s.contours, s.fill_rule, p) && s.clip_stack.iter().all(|c| clip_contains(doc, c, p))
}
fn distance_to_polygon(p: Point, contours: &[Contour]) -> f64 {
    contours
        .iter()
        .flat_map(|c| c.windows(2))
        .map(|edge| {
            let vx = edge[1][0] - edge[0][0];
            let vy = edge[1][1] - edge[0][1];
            let len = vx * vx + vy * vy;
            let t = if len == 0.0 {
                0.0
            } else {
                ((p[0] - edge[0][0]) * vx + (p[1] - edge[0][1]) * vy) / len
            }
            .clamp(0.0, 1.0);
            (p[0] - edge[0][0] - t * vx).hypot(p[1] - edge[0][1] - t * vy)
        })
        .fold(f64::INFINITY, f64::min)
}

#[test]
fn g1_rectangle_hole_has_independent_area_184_and_original_hash() {
    let d = parse_svg(HOLE, ParseOptions::default()).unwrap();
    assert_eq!(d.source, HOLE.as_bytes());
    assert_eq!(
        d.source_hash,
        "07e2d061680bffe7915f733c40a3ea6bb6ed28de119d997a38947ead4bb55187"
    );
    assert_eq!(d.status, ManufacturingStatus::Contours);
    assert_eq!(d.shapes.len(), 1);
    near(d.width_mm.unwrap(), 20.0, 2e-6);
    near(d.height_mm.unwrap(), 10.0, 2e-6);
    let shape = &d.shapes[0];
    assert_eq!(shape.fill_rule, FillRule::Evenodd);
    assert_eq!(shape.color, [0, 128, 255, 255]);
    assert_eq!(shape.contours.len(), 2);
    near(
        signed_area(&shape.contours[0]).abs() - signed_area(&shape.contours[1]).abs(),
        184.0,
        5e-5,
    );
    near(signed_area(&shape.contours[1]).abs(), 16.0, 5e-6);
    assert!(!shape_contains(&d, 0, [10.0, 5.0]));
    assert!(shape_contains(&d, 0, [1.0, 1.0]));
    for c in &shape.contours {
        assert_eq!(c.first(), c.last());
    }
}

#[test]
fn g1_shared_seam_is_10mm_and_keeps_both_materials() {
    let d = parse_svg(SEAM, ParseOptions::default()).unwrap();
    assert_eq!(
        d.source_hash,
        "6deec001cb76b5d9c998d259ef9a8c84e3dfcf6b4f353e912ece3788bcbf5648"
    );
    assert_eq!(d.shapes.len(), 2);
    assert_eq!(d.shapes[0].color, [255, 0, 0, 255]);
    assert_eq!(d.shapes[1].color, [0, 0, 255, 255]);
    assert_eq!(d.shapes[0].paint_order, 0);
    assert_eq!(d.shapes[1].paint_order, 1);
    let seam = |s: &Shape| {
        s.contours
            .iter()
            .flat_map(|c| c.windows(2))
            .find(|e| (e[0][0] - 10.0).abs() < 2e-6 && (e[1][0] - 10.0).abs() < 2e-6)
            .unwrap()
            .to_vec()
    };
    let a = seam(&d.shapes[0]);
    let b = seam(&d.shapes[1]);
    near((a[1][1] - a[0][1]).abs(), 10.0, 2e-6);
    assert_eq!(a[0], b[1]);
    assert_eq!(a[1], b[0]);
    near(signed_area(&d.shapes[0].contours[0]).abs(), 100.0, 3e-5);
}

#[test]
fn default_nonzero_preserves_same_winding_and_opposite_winding_holes() {
    let same = parse(r#"<path d="M0 0H20V20H0Z M5 5H15V15H5Z"/>"#);
    let opposite = parse(r#"<path d="M0 0H20V20H0Z M5 5V15H15V5Z"/>"#);
    assert_eq!(same.shapes[0].fill_rule, FillRule::Nonzero);
    assert!(shape_contains(&same, 0, [10.0, 10.0]));
    assert!(!shape_contains(&opposite, 0, [10.0, 10.0]));
    near(
        signed_area(&opposite.shapes[0].contours[0]) + signed_area(&opposite.shapes[0].contours[1]),
        300.0,
        0.0001,
    );
}

#[test]
fn physical_units_are_96dpi() {
    for size in ["96px", "96", "1in", "25.4mm", "2.54cm", "72pt", "6pc"] {
        let input = format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>"#
        );
        let d = parse_svg(&input, ParseOptions::default()).unwrap();
        near(d.width_mm.unwrap(), 25.4, 1e-5);
        near(signed_area(&d.shapes[0].contours[0]), 645.16, 0.0005);
    }
}
#[test]
fn physical_shape_lengths_and_viewbox_only_viewport() {
    let d = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="10mm" height="5mm"/></svg>"#,ParseOptions::default()).unwrap();
    near(signed_area(&d.shapes[0].contours[0]), 50.0, 0.0001);
    let d = parse_svg(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 48"><rect width="96" height="48"/></svg>"#,ParseOptions::default()).unwrap();
    near(d.width_mm.unwrap(), 25.4, 1e-5);
    near(d.height_mm.unwrap(), 12.7, 1e-5);
}

#[test]
fn preserve_aspect_ratio_and_viewbox_translation() {
    let input = r#"<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="10 20 10 10"><rect x="10" y="20" width="10" height="10"/></svg>"#;
    let d = parse_svg(input, ParseOptions::default()).unwrap();
    let b = bounds(&d.shapes[0].contours);
    for (got, want) in b.into_iter().zip([5.0, 0.0, 15.0, 10.0]) {
        near(got, want, 5e-6);
    }
    let d = parse_svg(
        &input.replace("viewBox=", "preserveAspectRatio=\"none\" viewBox="),
        ParseOptions::default(),
    )
    .unwrap();
    near(signed_area(&d.shapes[0].contours[0]), 200.0, 1e-4);
}

#[test]
fn group_inline_style_and_nonuniform_transform_keep_orientation_and_area() {
    let d = parse(
        r##"<g transform="translate(30 20)" style="fill:#1256ab;fill-rule:evenodd"><g transform="scale(-2 3)"><rect width="4" height="2"/></g></g>"##,
    );
    let s = &d.shapes[0];
    assert_eq!(s.color, [0x12, 0x56, 0xab, 255]);
    assert_eq!(s.fill_rule, FillRule::Evenodd);
    near(signed_area(&s.contours[0]), -48.0, 2e-5);
    for (a, b) in bounds(&s.contours)
        .into_iter()
        .zip([22.0, 20.0, 30.0, 26.0])
    {
        near(a, b, 5e-6);
    }
}
#[test]
fn open_fill_subpaths_close_without_joining_disconnected_accents() {
    let d = parse(r#"<path d="M0 0L10 0L10 10L0 10 M20 0L22 0L22 2L20 2"/>"#);
    assert_eq!(d.shapes[0].contours.len(), 2);
    near(
        d.shapes[0].contours.iter().map(signed_area).sum(),
        104.0,
        4e-5,
    );
    for c in &d.shapes[0].contours {
        assert_eq!(c.first(), c.last());
    }
}
#[test]
fn solid_stroke_outlining_preserves_open_caps_and_nonuniform_transform() {
    let d = parse(
        r#"<path d="M0 0L10 0" transform="translate(10 10) scale(2 3)" fill="none" stroke="red" stroke-width="2" stroke-linecap="square"/>"#,
    );
    let s = &d.shapes[0];
    assert_eq!(s.paint_kind, PaintKind::Stroke);
    assert_eq!(s.fill_rule, FillRule::Nonzero);
    near(
        s.contours.iter().map(signed_area).sum::<f64>().abs(),
        144.0,
        1e-4,
    );
    for (a, b) in bounds(&s.contours).into_iter().zip([8.0, 7.0, 32.0, 13.0]) {
        near(a, b, 5e-6);
    }
    assert!(d
        .ledger
        .entries
        .iter()
        .any(|e| e.stage == "stroke_outline" && e.error_bound_mm.is_none()));
}
#[test]
fn stroke_before_fill_and_round_cap_are_real_outlines() {
    let d = parse(
        r#"<path d="M10 10L20 10L20 20Z" fill="blue" stroke="red" stroke-width="2" paint-order="stroke fill"/>"#,
    );
    assert_eq!(
        d.shapes.iter().map(|s| s.paint_kind).collect::<Vec<_>>(),
        [PaintKind::Stroke, PaintKind::Fill]
    );
    let d = parse(
        r#"<path d="M10 10L20 10" fill="none" stroke="red" stroke-width="2" stroke-linecap="round"/>"#,
    );
    let a = d.shapes[0]
        .contours
        .iter()
        .map(signed_area)
        .sum::<f64>()
        .abs();
    near(a, 20.0 + std::f64::consts::PI, 0.04);
}
#[test]
fn clip_rule_transform_sibling_union_and_nested_intersection() {
    let d = parse(
        r#"<defs>
      <clipPath id="left"><rect width="10" height="20"/></clipPath>
      <clipPath id="hole" transform="translate(2 1)"><path clip-rule="evenodd" d="M0 0H20V20H0Z M4 4H8V8H4Z"/></clipPath>
      </defs><g transform="translate(10 10)" clip-path="url(#left)">
      <g clip-path="url(#hole)"><rect width="20" height="20"/></g></g>"#,
    );
    assert_eq!(d.status, ManufacturingStatus::Contours);
    assert_eq!(d.shapes[0].clip_stack.len(), 2);
    assert!(shape_contains(&d, 0, [13.0, 12.0]));
    assert!(!shape_contains(&d, 0, [17.0, 16.0])); // translated evenodd hole
    assert!(!shape_contains(&d, 0, [21.0, 12.0])); // outer left clip
    let d = parse(
        r#"<defs><clipPath id="two"><rect width="2" height="2"/><rect x="10" width="2" height="2"/></clipPath></defs><rect width="20" height="20" clip-path="url(#two)"/>"#,
    );
    assert!(shape_contains(&d, 0, [1.0, 1.0]));
    assert!(shape_contains(&d, 0, [11.0, 1.0]));
    assert!(!shape_contains(&d, 0, [5.0, 1.0]));
}
#[test]
fn object_bounding_box_and_linked_clips_keep_reference_basis() {
    let d = parse(
        r#"<defs>
      <clipPath id="outer"><rect x="12" y="10" width="4" height="10"/></clipPath>
      <clipPath id="rel" clipPathUnits="objectBoundingBox" clip-path="url(#outer)"><rect width=".5" height="1"/></clipPath>
      </defs><rect x="10" y="10" width="20" height="10" clip-path="url(#rel)"/>"#,
    );
    // Linked clip uses original referencing basis, not the bbox transform of "rel".
    assert!(shape_contains(&d, 0, [13.0, 15.0]));
    assert!(!shape_contains(&d, 0, [18.0, 15.0]));
}
#[test]
fn nested_clip_on_clip_child_is_an_intersection_of_that_part() {
    let d = parse(
        r#"<defs><clipPath id="small"><rect width="5" height="5"/></clipPath>
      <clipPath id="union"><rect width="10" height="10" clip-path="url(#small)"/><rect x="15" width="5" height="5"/></clipPath></defs>
      <rect width="30" height="30" clip-path="url(#union)"/>"#,
    );
    assert!(shape_contains(&d, 0, [2.0, 2.0]));
    assert!(!shape_contains(&d, 0, [8.0, 2.0]));
    assert!(shape_contains(&d, 0, [17.0, 2.0]));
}
#[test]
fn adaptive_quadratic_and_cubic_distance_respect_requested_mm_budget() {
    let input = svg(
        r#"<path transform="translate(5 5) scale(3 .5)" d="M0 0Q5 20 10 0L0 0Z M15 0C15 30 25 -20 25 0Z"/>"#,
    );
    let tolerance = 0.001;
    let options = ParseOptions {
        flatten_tolerance_mm: tolerance,
        ..Default::default()
    };
    let d = parse_svg(&input, options).unwrap();
    for i in 0..=2000 {
        let t = i as f64 / 2000.0;
        let u = 1.0 - t;
        let q = [
            5.0 + 3.0 * (2.0 * u * t * 5.0 + t * t * 10.0),
            5.0 + 0.5 * (2.0 * u * t * 20.0),
        ];
        let c = [
            5.0 + 3.0
                * (u * u * u * 15.0
                    + 3.0 * u * u * t * 15.0
                    + 3.0 * u * t * t * 25.0
                    + t * t * t * 25.0),
            5.0 + 0.5 * (3.0 * u * u * t * 30.0 - 3.0 * u * t * t * 20.0),
        ];
        assert!(distance_to_polygon(q, &d.shapes[0].contours) < tolerance + 1e-5);
        assert!(distance_to_polygon(c, &d.shapes[0].contours) < tolerance + 1e-5);
    }
    assert!(d.ledger.max_accepted_flatness_mm <= tolerance);
    assert_eq!(d.ledger.total_error_bound_mm, None);
}
#[test]
fn degenerate_chord_and_collinear_backtracking_do_not_collapse() {
    let d = parse(r#"<path d="M10 10C30 10 30 30 10 10Z M40 10Q60 10 41 10L41 12L40 12Z"/>"#);
    assert_eq!(d.shapes[0].contours.len(), 2);
    assert!(d.shapes[0].contours[0].len() > 10);
    assert!(bounds(&[d.shapes[0].contours[1].clone()])[2] > 49.0);
}
#[test]
fn source_arcs_survive_and_resolved_arc_is_not_a_chord() {
    let d = parse(r#"<path d="M10 10A10 10 0 0 1 30 10L10 10Z"/>"#);
    assert!(d.source_paths[0].has_arcs);
    assert!(d.source_paths[0].svg_d.contains("A10 10"));
    assert_eq!(d.source_paths[0].syntax_version, 1);
    assert!(d.shapes[0].contours[0].len() > 20);
    near(
        signed_area(&d.shapes[0].contours[0]).abs(),
        50.0 * std::f64::consts::PI,
        0.2,
    );
    assert!(d
        .ledger
        .entries
        .iter()
        .any(|e| e.stage == "source_arcs" && e.error_bound_mm.is_none()));
}
#[test]
fn original_bytes_graph_spans_and_serialization_roundtrip_are_preserved() {
    let input = svg("<!-- Tiếng Việt -->\r\n<path d=\"M1 1L2 1L2 2Z\"/>");
    let d = parse_svg(&input, ParseOptions::default()).unwrap();
    assert_eq!(d.source, input.as_bytes());
    assert_eq!(
        d.source_hash,
        format!("{:x}", Sha256::digest(input.as_bytes()))
    );
    let prov = &d.shapes[0].provenance;
    assert!(prov.source_id.is_none());
    assert!(prov.source_node.is_some());
    let span = prov.source_span.as_ref().unwrap();
    assert!(input[span.byte_start..span.byte_end].starts_with("<path"));
    assert_eq!(span.line, 2);
    let serialized = serde_json::to_vec(&d).unwrap();
    let round: VectorDocument = serde_json::from_slice(&serialized).unwrap();
    assert_eq!(round.source, d.source);
    assert_eq!(round.shapes[0].contours, d.shapes[0].contours);
    assert_eq!(round.source_hash, d.source_hash);
}
#[test]
fn blank_document_is_explicitly_empty() {
    let d = parse("");
    assert_eq!(d.status, ManufacturingStatus::Empty);
    assert!(d.shapes.is_empty());
    assert!(d.diagnostics.iter().any(|d| d.code == "empty_document"));
}
#[test]
fn safe_unsupported_features_never_return_partial_manufacturing() {
    let features = [
        r#"<linearGradient id="g"/><rect width="2" height="2" fill="url(#g)"/>"#,
        r#"<pattern id="p"/>"#,
        r#"<mask id="m"/>"#,
        r#"<filter id="f"/>"#,
        r#"<foreignObject/>"#,
        r#"<text>Hello</text>"#,
        r##"<use href="#p"/>"##,
        r#"<rect width="2" height="2" opacity=".5"/>"#,
        r#"<rect width="2" height="2" fill="rgba(255,0,0,.5)"/>"#,
        r#"<rect width="2" height="2" vector-effect="non-scaling-stroke"/>"#,
        r#"<rect width="2" height="2" style="unknown-property:yes"/>"#,
        r#"<mystery><rect width="2" height="2"/></mystery>"#,
        r#"<path d="M0 0L1 1" stroke="red" stroke-dasharray="1 2"/>"#,
    ];
    for body in features {
        let input = svg(&format!(r#"<rect width="5" height="5"/>{body}"#));
        let d =
            parse_svg(&input, ParseOptions::default()).unwrap_or_else(|e| panic!("{body}: {e}"));
        assert!(
            matches!(
                d.status,
                ManufacturingStatus::Unsupported | ManufacturingStatus::RequiresConfirmedRaster
            ),
            "{body}"
        );
        assert!(d.shapes.is_empty(), "{body}");
        assert_eq!(d.source, input.as_bytes());
        assert!(!d.diagnostics.is_empty());
    }
}
#[test]
fn unsafe_source_external_resources_css_and_dtd_are_rejected() {
    let bodies = [
        r#"<script>alert(1)</script>"#,
        r#"<rect width="1" height="1" onclick="x()"/>"#,
        r#"<image href="file:///C:/secret.png"/>"#,
        r#"<image href="C:\secret.png"/>"#,
        r#"<image href="https://example.invalid/asset"/>"#,
        r#"<image href="data:image/png;base64,AAAA"/>"#,
        r#"<use href="&#104;ttps://example.invalid/a"/>"#,
        r#"<rect width="1" height="1" style="fill:url(https://example.invalid/a)"/>"#,
        r#"<rect width="1" height="1" style="fill:u\72l(#x)"/>"#,
        r#"<rect width="1" height="1" style="fill:red;@import 'x'"/>"#,
        r#"<style>@import url(https://example.invalid/a)</style>"#,
        r#"<rect width="1" height="1" xml:base="file:///C:/"/>"#,
    ];
    for body in bodies {
        let e = parse_svg(&svg(body), ParseOptions::default()).unwrap_err();
        assert_eq!(e.code, ErrorCode::UnsafeSource, "{body}: {e}");
        assert!(e.source_hash.is_some());
    }
    let dtd = format!(r#"<!DOCTYPE svg [<!ENTITY x "abc">]>{}"#, svg(""));
    assert_eq!(
        parse_svg(&dtd, ParseOptions::default()).unwrap_err().code,
        ErrorCode::UnsafeSource
    );
    let pi = format!(r#"<?xml-stylesheet href="file:///C:/x"?>{}"#, svg(""));
    assert_eq!(
        parse_svg(&pi, ParseOptions::default()).unwrap_err().code,
        ErrorCode::UnsafeSource
    );
}
#[test]
fn malformed_xml_path_style_transform_and_geometry_do_not_fall_back() {
    let cases = [
        r#"<path d="M0 0L10 0Lbad"/>"#,
        r#"<path d="M0 0A2 2 0 3 0 1 1"/>"#,
        r#"<rect width="1banana" height="1"/>"#,
        r#"<rect width="-1" height="1"/>"#,
        r#"<rect width="1" height="1" style="fill"/>"#,
        r#"<rect width="1" height="1" fill="not-a-color"/>"#,
        r#"<rect width="1" height="1" transform="translate(1) nonsense(2)"/>"#,
        r#"<polygon points="0,0 1,1 2"/>"#,
        r#"<rect width="1" height="1" fill-rule="winding"/>"#,
        r#"<path/>"#,
    ];
    for body in cases {
        assert!(
            parse_svg(&svg(body), ParseOptions::default()).is_err(),
            "{body}"
        );
    }
    assert_eq!(
        parse_svg("<svg", ParseOptions::default()).unwrap_err().code,
        ErrorCode::InvalidXml
    );
    assert!(parse_svg(
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1 trailing"/>"#,
        ParseOptions::default()
    )
    .is_err());
}
#[test]
fn references_cycles_missing_targets_duplicates_and_silent_omission_block() {
    let cases = [
        r#"<defs><clipPath id="a" clip-path="url(#a)"><rect width="2" height="2"/></clipPath></defs><rect width="2" height="2" clip-path="url(#a)"/>"#,
        r#"<rect width="2" height="2" clip-path="url(#missing)"/>"#,
        r#"<rect id="a" width="2" height="2"/><rect width="2" height="2" clip-path="url(#a)"/>"#,
        r#"<rect id="a" width="2" height="2"/><rect id="a" width="2" height="2"/>"#,
    ];
    for body in cases {
        assert_eq!(
            parse_svg(&svg(body), ParseOptions::default())
                .unwrap_err()
                .code,
            ErrorCode::InvalidReference
        );
    }
    let d = parse(r#"<rect width="2" height="2"/><rect width="0" height="2"/>"#);
    assert_eq!(d.status, ManufacturingStatus::Unsupported);
    assert!(d.shapes.is_empty());
    assert!(d
        .diagnostics
        .iter()
        .any(|d| d.code == "source_geometry_not_emitted"));
}
#[test]
fn coordinate_limits_apply_after_transform_and_to_control_points() {
    for body in [
        r#"<path d="M0 0L10001 0L0 1Z"/>"#,
        r#"<path d="M0 0Q20000 0 1 1Z"/>"#,
        r#"<rect width="20" height="1" transform="scale(1000)"/>"#,
        r#"<path d="M0 0L1e99 0Z"/>"#,
        r#"<rect width="1" height="1" transform="matrix(1 1 1 1 0 0)"/>"#,
    ] {
        let e = parse_svg(&svg(body), ParseOptions::default()).unwrap_err();
        assert!(
            matches!(
                e.code,
                ErrorCode::CoordinateLimit | ErrorCode::UnsupportedGeometry
            ),
            "{body}: {e}"
        );
    }
}
#[test]
fn budgets_fail_atomically_instead_of_coarsening_or_clamping() {
    let curved = svg(r#"<path d="M0 0Q10 20 20 0Z"/>"#);
    let mut o = ParseOptions::default();
    o.limits.max_recursion = 0;
    assert_eq!(
        parse_svg(&curved, o).unwrap_err().code,
        ErrorCode::FlattenLimit
    );
    let mut o = ParseOptions::default();
    o.limits.max_vertices = 4;
    assert_eq!(
        parse_svg(&curved, o).unwrap_err().code,
        ErrorCode::ResourceLimit
    );
    let mut o = ParseOptions::default();
    o.limits.max_source_bytes = 3;
    assert_eq!(
        parse_svg(&curved, o).unwrap_err().code,
        ErrorCode::SourceLimit
    );
    let mut o = ParseOptions::default();
    o.limits.max_source_segments = 2;
    assert_eq!(
        parse_svg(&curved, o).unwrap_err().code,
        ErrorCode::ResourceLimit
    );
    let mut o = ParseOptions::default();
    o.limits.max_resolved_segments = 2;
    assert_eq!(
        parse_svg(&curved, o).unwrap_err().code,
        ErrorCode::ResourceLimit
    );
    let mut o = ParseOptions::default();
    o.limits.max_xml_nodes = 2;
    assert_eq!(
        parse_svg(&curved, o).unwrap_err().code,
        ErrorCode::ResourceLimit
    );
    let mut o = ParseOptions::default();
    o.limits.max_depth = 4;
    assert_eq!(
        parse_svg(
            &svg("<g><g><g><rect width=\"1\" height=\"1\"/></g></g></g>"),
            o
        )
        .unwrap_err()
        .code,
        ErrorCode::ResourceLimit
    );
    for tolerance in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert_eq!(
            parse_svg(
                &curved,
                ParseOptions {
                    flatten_tolerance_mm: tolerance,
                    ..Default::default()
                }
            )
            .unwrap_err()
            .code,
            ErrorCode::InvalidOptions
        );
    }
}

#[test]
fn partially_omitted_clip_geometry_blocks_the_entire_document() {
    let d = parse(
        r#"<defs><clipPath id="c"><rect width="10" height="10"/><rect width="0" height="5"/></clipPath></defs><rect width="20" height="20" clip-path="url(#c)"/>"#,
    );
    assert_eq!(d.status, ManufacturingStatus::Unsupported);
    assert!(d.shapes.is_empty());
    assert!(d.clips.is_empty());
    assert!(d
        .diagnostics
        .iter()
        .any(|d| d.code == "source_geometry_not_emitted"));
}
#[test]
fn root_viewport_is_an_explicit_manufacturing_intersection() {
    let d = parse(r#"<rect x="90" y="90" width="20" height="20"/>"#);
    let viewport = d.viewport_clip.as_ref().unwrap();
    near(signed_area(viewport), 10_000.0, 0.01);
    assert!(contains(
        std::slice::from_ref(viewport),
        FillRule::Nonzero,
        [95.0, 95.0]
    ));
    assert!(!contains(
        std::slice::from_ref(viewport),
        FillRule::Nonzero,
        [105.0, 95.0]
    ));
    assert!(contains(
        &d.shapes[0].contours,
        FillRule::Nonzero,
        [105.0, 95.0]
    ));
}
#[test]
fn closed_stroke_retains_its_interior_hole() {
    let d = parse(
        r#"<rect x="10" y="10" width="10" height="10" fill="none" stroke="black" stroke-width="2"/>"#,
    );
    assert_eq!(d.shapes[0].contours.len(), 2);

    near(
        orthogonal_region_area(&d.shapes[0].contours, FillRule::Nonzero),
        80.0,
        0.0001,
    );
    assert!(shape_contains(&d, 0, [10.0, 15.0]));
    assert!(!shape_contains(&d, 0, [15.0, 15.0]));
}
#[test]
fn rounded_shapes_and_nonuniform_arc_keep_analytic_geometry() {
    let ellipse = parse(r#"<ellipse cx="20" cy="20" rx="10" ry="5"/>"#);
    near(
        signed_area(&ellipse.shapes[0].contours[0]).abs(),
        50.0 * std::f64::consts::PI,
        0.2,
    );
    let rounded = parse(r#"<rect x="10" y="10" width="10" height="10" rx="2" ry="2"/>"#);
    near(
        signed_area(&rounded.shapes[0].contours[0]).abs(),
        100.0 - 4.0 * (4.0 - std::f64::consts::PI),
        0.08,
    );
    let arc =
        parse(r#"<path transform="translate(5 20) scale(3 .5)" d="M0 0A10 10 0 0 1 20 0L0 0Z"/>"#);
    near(
        signed_area(&arc.shapes[0].contours[0]).abs(),
        75.0 * std::f64::consts::PI,
        0.3,
    );
    let b = bounds(&arc.shapes[0].contours);
    near(b[2] - b[0], 60.0, 1e-5);
    near(b[3] - b[1], 5.0, 0.02);
}
#[test]
fn unsupported_and_errors_are_stable_serializable_records() {
    let d = parse(r#"<rect width="5" height="5" opacity=".3"/>"#);
    assert_eq!(d.status, ManufacturingStatus::RequiresConfirmedRaster);
    assert!(d.shapes.is_empty());
    assert!(!d.display_graph.is_empty());
    let round: VectorDocument = serde_json::from_str(&serde_json::to_string(&d).unwrap()).unwrap();
    assert_eq!(round.status, d.status);
    let e = parse_svg(&svg("<script/>"), ParseOptions::default()).unwrap_err();
    let error: VectorError = serde_json::from_str(&serde_json::to_string(&e).unwrap()).unwrap();
    assert_eq!(error.code, ErrorCode::UnsafeSource);
}
#[test]
fn bom_crlf_and_unicode_are_hashed_before_parser_normalization() {
    let input = format!(
        "\u{feff}{}",
        svg("<!-- chữ -->\r\n<rect width=\"2\" height=\"3\"/>")
    );
    let d = parse_svg(&input, ParseOptions::default()).unwrap();
    assert_eq!(d.source, input.as_bytes());
    assert_eq!(
        d.source_hash,
        format!("{:x}", Sha256::digest(input.as_bytes()))
    );
    assert_eq!(d.source[0..3], [0xef, 0xbb, 0xbf]);
}
#[test]
fn malformed_aspect_ratio_is_not_partially_accepted() {
    for value in ["xMidYMid meet garbage", "none 123", "xMidYMid meet meet"] {
        let input = svg("<rect width=\"1\" height=\"1\"/>").replace(
            "viewBox=",
            &format!("preserveAspectRatio=\"{value}\" viewBox="),
        );
        assert_eq!(
            parse_svg(&input, ParseOptions::default()).unwrap_err().code,
            ErrorCode::InvalidValue
        );
    }
}
#[test]
fn clip_instance_budget_stops_expansion() {
    let input = svg(
        r#"<defs><clipPath id="c"><rect width="2" height="2"/></clipPath></defs>
      <rect width="3" height="3" clip-path="url(#c)"/><rect x="4" width="3" height="3" clip-path="url(#c)"/>"#,
    );
    let mut options = ParseOptions::default();
    options.limits.max_clip_instances = 1;
    assert_eq!(
        parse_svg(&input, options).unwrap_err().code,
        ErrorCode::ResourceLimit
    );
}

fn orthogonal_region_area(contours: &[Contour], rule: FillRule) -> f64 {
    // Independent exact cell integration for axis-aligned test inputs. Shoelace sums
    // winding multiplicity and is not a region-area oracle on self-overlapping strokes.
    let mut xs: Vec<f64> = contours.iter().flatten().map(|p| p[0]).collect();
    let mut ys: Vec<f64> = contours.iter().flatten().map(|p| p[1]).collect();
    for c in contours {
        for e in c.windows(2) {
            assert!(e[0][0] == e[1][0] || e[0][1] == e[1][1]);
        }
    }
    xs.sort_by(f64::total_cmp);
    xs.dedup();
    ys.sort_by(f64::total_cmp);
    ys.dedup();
    let mut area = 0.0;
    for x in xs.windows(2) {
        for y in ys.windows(2) {
            if contains(contours, rule, [(x[0] + x[1]) / 2.0, (y[0] + y[1]) / 2.0]) {
                area += (x[1] - x[0]) * (y[1] - y[0]);
            }
        }
    }
    area
}

#[test]
fn clip_dependency_depth_and_dag_expansion_are_bounded_before_usvg() {
    let mut chain = String::from("<defs>");
    for i in 0..80 {
        chain.push_str(&format!(
            r#"<clipPath id="c{i}" {}><rect width="1" height="1"/></clipPath>"#,
            if i == 79 {
                String::new()
            } else {
                format!(r#"clip-path="url(#c{})""#, i + 1)
            }
        ));
    }
    chain.push_str(r#"</defs><rect width="2" height="2" clip-path="url(#c0)"/>"#);
    assert_eq!(
        parse_svg(&svg(&chain), ParseOptions::default())
            .unwrap_err()
            .code,
        ErrorCode::ResourceLimit
    );
    let mut dag = String::from("<defs>");
    for i in 0..12 {
        let reference = if i == 11 {
            String::new()
        } else {
            format!(r#"clip-path="url(#c{})""#, i + 1)
        };
        dag.push_str(&format!(r#"<clipPath id="c{i}"><rect width="1" height="1" {reference}/><rect width="2" height="2" {reference}/></clipPath>"#));
    }
    dag.push_str(r#"</defs><rect width="3" height="3" clip-path="url(#c0)"/>"#);
    assert_eq!(
        parse_svg(&svg(&dag), ParseOptions::default())
            .unwrap_err()
            .code,
        ErrorCode::ResourceLimit
    );
}
