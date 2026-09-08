//! Bounded SVG import. See README.md for geometry, security and error-budget contracts.
//! Returned polygons still require fill-rule/clip/paint-order resolution in a geometry kernel.
#![doc = include_str!("../README.md")]
mod flatten;
mod preflight;
mod resolve;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SCHEMA_VERSION: u32 = 1;
pub const MM_PER_PX: f64 = 25.4 / 96.0;
pub type Point = [f64; 2];
pub type Contour = Vec<Point>;
pub type Matrix = [f64; 6];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ParseOptions {
    /// Bound on subdivision of the already-resolved Bézier, in mm.
    pub flatten_tolerance_mm: f64,
    pub limits: Limits,
}
impl Default for ParseOptions {
    fn default() -> Self {
        Self {
            flatten_tolerance_mm: 0.004,
            limits: Limits::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Limits {
    pub max_source_bytes: usize,
    pub max_xml_nodes: u32,
    pub max_depth: usize,
    pub max_source_segments: usize,
    pub max_resolved_segments: usize,
    pub max_vertices: usize,
    pub max_shapes: usize,
    pub max_clip_instances: usize,
    pub max_recursion: u32,
    /// Absolute mm domain; cannot be raised above 10,000.
    pub max_coordinate_mm: f64,
    /// Conservative bound in source user units, before dependency conversion.
    pub max_source_number: f64,
    /// Prevent expensive dependency stroke expansion before it can be counted.
    pub max_stroke_input_segments: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_source_bytes: 1_048_576,
            max_xml_nodes: 8_192,
            max_depth: 64,
            max_source_segments: 16_384,
            max_resolved_segments: 65_536,
            max_vertices: 200_000,
            max_shapes: 4_096,
            max_clip_instances: 256,
            max_recursion: 24,
            max_coordinate_mm: 10_000.0,
            max_source_number: 1_000_000.0,
            max_stroke_input_segments: 2_048,
        }
    }
}
impl ParseOptions {
    fn validate(&self) -> Result<(), VectorError> {
        let l = &self.limits;
        if !self.flatten_tolerance_mm.is_finite()
            || self.flatten_tolerance_mm <= 0.0
            || self.flatten_tolerance_mm > 100.0
            || !l.max_coordinate_mm.is_finite()
            || l.max_coordinate_mm <= 0.0
            || l.max_coordinate_mm > 10_000.0
            || !l.max_source_number.is_finite()
            || l.max_source_number <= 0.0
            || l.max_source_number > 1_000_000.0
            || l.max_recursion > 30
            || l.max_depth == 0
            || l.max_depth > 128
            || l.max_source_bytes == 0
            || l.max_source_bytes > 16_777_216
            || l.max_xml_nodes == 0
            || l.max_xml_nodes > 65_536
            || l.max_source_segments == 0
            || l.max_source_segments > 65_536
            || l.max_resolved_segments == 0
            || l.max_resolved_segments > 262_144
            || l.max_vertices == 0
            || l.max_vertices > 1_000_000
            || l.max_shapes == 0
            || l.max_shapes > 16_384
            || l.max_clip_instances == 0
            || l.max_clip_instances > 1_024
            || l.max_stroke_input_segments == 0
            || l.max_stroke_input_segments > 2_048
        {
            return Err(VectorError::new(
                ErrorCode::InvalidOptions,
                "Invalid or excessive parser limits",
            ));
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VectorDocument {
    pub schema_version: u32,
    pub source_hash: String,
    /// Exact input UTF-8 bytes, including BOM, whitespace, comments and original arcs.
    pub source: Vec<u8>,
    /// Inert lexical display/provenance graph. Never insert its source into live HTML.
    pub display_graph: Vec<SourceNode>,
    /// SVG path grammar extension version 1; retains source arcs and relative commands.
    pub source_paths: Vec<SourcePath>,
    pub width_mm: Option<f64>,
    pub height_mm: Option<f64>,
    /// Intersect all resolved paint regions with this root viewport rectangle.
    pub viewport_clip: Option<Contour>,
    pub status: ManufacturingStatus,
    pub shapes: Vec<Shape>,
    pub clips: Vec<ClipRegion>,
    pub resolved_curves: Vec<CurveRecord>,
    pub diagnostics: Vec<Diagnostic>,
    pub ledger: ErrorLedger,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ManufacturingStatus {
    /// Opaque paint operands, NOT a planar subdivision or mesh.
    Contours,
    Empty,
    RequiresConfirmedRaster,
    Unsupported,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FillRule {
    Nonzero,
    Evenodd,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaintKind {
    Fill,
    Stroke,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Shape {
    pub id: String,
    pub paint_order: usize,
    pub paint_kind: PaintKind,
    pub fill_rule: FillRule,
    /// Unpremultiplied RGBA. Supported manufacturing paints are opaque.
    pub color: [u8; 4],
    /// Each contour repeats its first vertex at the end; winding is preserved.
    pub contours: Vec<Contour>,
    /// Intersect all these clip instances AFTER resolving this shape's fill-rule.
    pub clip_stack: Vec<String>,
    pub curve_record: usize,
    pub provenance: Provenance,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClipRegion {
    pub id: String,
    pub source_id: Option<String>,
    /// Union of parts, each resolved with its OWN fill-rule and clip stack.
    pub parts: Vec<ClipPart>,
    /// Additional intersections applying to the entire union.
    pub clip_stack: Vec<String>,
    pub provenance: Provenance,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClipPart {
    pub fill_rule: FillRule,
    pub contours: Vec<Contour>,
    pub clip_stack: Vec<String>,
    pub curve_record: usize,
    pub provenance: Provenance,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Provenance {
    pub source_hash: String,
    pub source_node: Option<usize>,
    pub source_id: Option<String>,
    pub source_span: Option<SourceSpan>,
    /// Actual normalized group/clip reference ancestry. IDs may be parser-only synthetic IDs.
    pub reference_chain: Vec<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SourceSpan {
    pub byte_start: usize,
    pub byte_end: usize,
    pub line: u32,
    pub column: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SourceNode {
    pub index: usize,
    pub parent: Option<usize>,
    pub kind: String,
    pub name: Option<String>,
    pub namespace: Option<String>,
    pub attributes: Vec<SourceAttribute>,
    pub text: Option<String>,
    pub span: SourceSpan,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SourceAttribute {
    pub name: String,
    pub namespace: Option<String>,
    pub value: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SourcePath {
    pub source_node: usize,
    pub syntax_version: u32,
    /// Exact decoded d attribute. Original XML escaping remains in source.
    pub svg_d: String,
    pub has_arcs: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CurveRecord {
    /// Commands AFTER usvg conversion/transform to mm, BEFORE our flattening.
    pub commands: Vec<CurveCommand>,
    pub derivation: String,
    pub provenance: Provenance,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "command")]
pub enum CurveCommand {
    M {
        to: Point,
    },
    L {
        to: Point,
    },
    Q {
        control: Point,
        to: Point,
    },
    C {
        control1: Point,
        control2: Point,
        to: Point,
    },
    Z,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Diagnostic {
    pub code: String,
    pub message: String,
    pub severity: Severity,
    pub source_node: Option<usize>,
    pub source_span: Option<SourceSpan>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    ManufacturingBlocked,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ErrorLedger {
    pub parser: String,
    pub dpi: f64,
    pub flatten_tolerance_mm: f64,
    /// Maximum accepted control-to-chord-segment distance, not a source-SVG error bound.
    pub max_accepted_flatness_mm: f64,
    pub emitted_vertices: usize,
    pub resolved_segments: usize,
    pub entries: Vec<LedgerEntry>,
    /// Always None: dependency f32 rounding/arc/stroker error is not certified.
    pub total_error_bound_mm: Option<f64>,
    /// This crate emits f64 mm; no Clipper grid quantization is performed.
    pub quantization: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub stage: String,
    pub error_bound_mm: Option<f64>,
    pub note: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidOptions,
    SourceLimit,
    InvalidXml,
    UnsafeSource,
    InvalidValue,
    ResourceLimit,
    CoordinateLimit,
    InvalidReference,
    ParserError,
    FlattenLimit,
    UnsupportedGeometry,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VectorError {
    pub code: ErrorCode,
    pub message: String,
    pub source_hash: Option<String>,
    pub source_span: Option<SourceSpan>,
}
impl VectorError {
    pub(crate) fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            source_hash: None,
            source_span: None,
        }
    }
}
impl std::fmt::Display for VectorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}
impl std::error::Error for VectorError {}

/// Parses a conservative static SVG subset without font, file, network or image I/O.
/// Unsupported safe sources return an inert source document and zero manufacturing shapes.
/// Unsafe/malformed/over-budget sources return a typed error, never partial polygons.
pub fn parse_svg(svg: &str, options: ParseOptions) -> Result<VectorDocument, VectorError> {
    options.validate()?;
    if svg.len() > options.limits.max_source_bytes {
        return Err(VectorError::new(
            ErrorCode::SourceLimit,
            "SVG source byte limit exceeded",
        ));
    }
    let source_hash = format!("{:x}", Sha256::digest(svg.as_bytes()));
    let result = (|| {
        let checked = preflight::check(svg, &options)?;
        let mut doc = VectorDocument {
            schema_version: SCHEMA_VERSION, source_hash: source_hash.clone(),
            source: svg.as_bytes().to_vec(), display_graph: checked.graph.clone(),
            source_paths: checked.paths.clone(), width_mm: None, height_mm: None, viewport_clip: None,
            status: checked.status, shapes: vec![], clips: vec![], resolved_curves: vec![],
            diagnostics: checked.diagnostics.clone(),
            ledger: ErrorLedger {
                parser: "usvg=0.48.1; svgtypes=0.16.1; tiny-skia-path=0.12.0".into(),
                dpi: 96.0, flatten_tolerance_mm: options.flatten_tolerance_mm,
                max_accepted_flatness_mm: 0.0, emitted_vertices: 0, resolved_segments: 0,
                entries: vec![
                    LedgerEntry { stage: "svg_import".into(), error_bound_mm: None,
                        note: "usvg stores paths, units and composed transforms in f32. Casting to f64 does not recover discarded precision.".into() },
                    LedgerEntry { stage: "curve_subdivision".into(), error_bound_mm: Some(options.flatten_tolerance_mm),
                        note: "Adaptive de Casteljau in f64 mm; control distance to the finite chord segment bounds each accepted resolved Bezier. Floating arithmetic roundoff is not certified.".into() },
                ],
                total_error_bound_mm: None, quantization: "none; f64 mm; downstream must ledger grid rounding".into(),
            },
        };
        if checked.paths.iter().any(|p| p.has_arcs) || checked.has_rounded_shapes {
            doc.ledger.entries.push(LedgerEntry { stage: "source_arcs".into(), error_bound_mm: None,
                note: "Original SVG arc/ellipse/rounded-rect parameters remain in source records (SVG extension v1). usvg/svgtypes use kurbo cubic approximation with local tolerance 0.1, not our mm budget; no certified source-arc bound.".into() });
        }
        if doc.status != ManufacturingStatus::Contours {
            return Ok(doc);
        }
        resolve::convert(&checked, &options, &mut doc)?;
        Ok(doc)
    })();
    result.map_err(|mut e: VectorError| {
        e.source_hash = Some(source_hash);
        e
    })
}
