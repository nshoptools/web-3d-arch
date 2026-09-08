#![doc = include_str!("../README.md")]
//! Source-preserving raster import and deterministic shared boundary graphs.
mod decode;
mod flat;
pub use flat::*;
mod geometry;
mod graph;
pub use geometry::*;
mod process;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub use decode::decode_image;
pub use process::{process_image, process_rgba};
pub const SCHEMA_VERSION: u32 = 2;
pub const SEMANTICS_VERSION: &str = "raster-parameters-proposal-v2";
pub const TRANSPARENT_LABEL: u16 = 0;
pub type Rgb = [u8; 3];
pub type Rgba = [u8; 4];

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Limits {
    pub max_source_bytes: u64,
    pub max_dimension: u32,
    pub max_decoded_pixels: u64,
    pub max_decoded_bytes: u64,
    pub max_metadata_bytes: u64,
    pub max_working_bytes: u64,
    pub max_processing_pixels: u64,
    pub max_unique_colors: u32,
    pub max_vertices: u32,
    pub max_edges: u32,
    pub max_regions: u32,
    /// Deterministic work units; not wall-clock milliseconds.
    pub max_work_units: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_source_bytes: 32 * 1024 * 1024,
            max_dimension: 32768,
            max_decoded_pixels: 16_777_216,
            max_decoded_bytes: 256 * 1024 * 1024,
            max_metadata_bytes: 2 * 1024 * 1024,
            max_working_bytes: 512 * 1024 * 1024,
            max_processing_pixels: 1280 * 1280,
            max_unique_colors: 262144,
            max_vertices: 1_000_000,
            max_edges: 2_000_000,
            max_regions: 100_000,
            max_work_units: 250_000_000,
        }
    }
}
impl Limits {
    pub(crate) fn validate(&self) -> Result<(), RasterError> {
        if self.max_source_bytes == 0
            || self.max_source_bytes > 128 * 1024 * 1024
            || self.max_dimension == 0
            || self.max_dimension > 65535
            || self.max_decoded_pixels == 0
            || self.max_decoded_pixels > 67_108_864
            || self.max_decoded_bytes == 0
            || self.max_decoded_bytes > 1024 * 1024 * 1024
            || self.max_metadata_bytes == 0
            || self.max_metadata_bytes > 16 * 1024 * 1024
            || self.max_working_bytes == 0
            || self.max_working_bytes > 2 * 1024 * 1024 * 1024
            || self.max_processing_pixels == 0
            || self.max_processing_pixels > 1280 * 1280
            || self.max_unique_colors == 0
            || self.max_unique_colors > 1280 * 1280
            || self.max_vertices == 0
            || self.max_vertices > 2_000_000
            || self.max_edges == 0
            || self.max_edges > 4_000_000
            || self.max_regions == 0
            || self.max_regions > 1_000_000
            || self.max_work_units == 0
            || self.max_work_units > 2_000_000_000
        {
            return Err(error(
                ErrorCode::InvalidOptions,
                "Invalid or excessive resource limits",
            ));
        }
        Ok(())
    }
    pub(crate) fn pixels(&self, width: u32, height: u32) -> Result<usize, RasterError> {
        if width == 0 || height == 0 || width > self.max_dimension || height > self.max_dimension {
            return Err(error(
                ErrorCode::DimensionLimit,
                "Zero or excessive header/input dimensions",
            ));
        }
        let pixels = u64::from(width) * u64::from(height);
        if pixels > self.max_decoded_pixels {
            return Err(error(
                ErrorCode::PixelLimit,
                "Decoded/input pixel limit exceeded",
            ));
        }
        let bytes = pixels
            .checked_mul(4)
            .ok_or_else(|| error(ErrorCode::MemoryLimit, "RGBA size overflow"))?;
        if bytes > self.max_decoded_bytes {
            return Err(error(
                ErrorCode::MemoryLimit,
                "Decoded RGBA byte limit exceeded",
            ));
        }
        usize::try_from(pixels)
            .map_err(|_| error(ErrorCode::MemoryLimit, "Pixel count exceeds address space"))
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct DecodeOptions {
    pub limits: Limits,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceFormat {
    Png,
    Jpeg,
    Webp,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SourceImage {
    pub schema_version: u32,
    pub original_bytes: Vec<u8>,
    pub source_hash: String,
    pub format: SourceFormat,
    pub decoder: String,
    pub encoded_width: u32,
    pub encoded_height: u32,
    pub width: u32,
    pub height: u32,
    /// Orientation-applied, straight (not premultiplied) RGBA8.
    pub rgba: Vec<u8>,
    pub rgba_hash: String,
    pub orientation: OrientationRecord,
    pub alpha: AlphaSummary,
    pub color: ColorRecord,
    pub diagnostics: Vec<Diagnostic>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrientationRecord {
    /// None means no EXIF chunk. An unrecognized primary EXIF orientation is a typed error.
    pub exif_value: Option<u8>,
    pub applied: bool,
    pub original_exif: Option<Vec<u8>>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct AlphaSummary {
    pub transparent: u64,
    pub partial: u64,
    pub opaque: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ColorRecord {
    pub interpretation: String,
    pub declared_srgb: bool,
    pub requires_confirmation: bool,
    /// Original ICC/CICP/other source color metadata remain in original_bytes.
    pub note: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RasterParameters {
    pub semantics_version: String,
    pub k: u8,
    /// Actual long-edge pixel cap, never a slider index or mechanical tolerance.
    pub res: u32,
    pub smooth: u8,
    #[serde(rename = "minA")]
    pub min_area_pixels: u32,
    /// Number of simultaneous 3x3 opaque-neighbor RGB median passes.
    pub denoise: u8,
    pub eps: f64,
    pub tension: f64,
}
impl Default for RasterParameters {
    fn default() -> Self {
        Self {
            semantics_version: SEMANTICS_VERSION.into(),
            k: 4,
            res: 520,
            smooth: 3,
            min_area_pixels: 5,
            denoise: 1,
            eps: 35.0,
            tension: 65.0,
        }
    }
}
impl RasterParameters {
    /// Catalog defaults, now operational under the explicit v2 semantics.
    pub fn catalog_candidates() -> Self {
        Self::default()
    }
    /// Exact final pixel boundaries; useful for source inspection and v1 migration.
    pub fn preserve_pixels() -> Self {
        Self {
            smooth: 0,
            min_area_pixels: 0,
            denoise: 0,
            eps: 0.0,
            tension: 0.0,
            ..Self::default()
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AlphaPolicy {
    RejectPartial,
    /// Original alpha==0 always stays transparent. Nonzero alpha below cutoff is removed.
    Threshold {
        cutoff: u8,
    },
    /// Composite partial alpha against the explicit matte in encoded sRGB8; alpha==0 stays void.
    MattePartialEncodedSrgb {
        color: Rgb,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BackgroundPolicy {
    Keep,
    /// IDs refer to the palette produced by these exact options.
    ExcludeBoundaryConnected {
        label_ids: Vec<u16>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RgbaOrigin {
    /// Caller explicitly declares the input buffer to be straight-alpha sRGB8.
    ExplicitSrgb,
    /// This crate performs no SVG/COLR/browser rendering. Host preserves referenced source.
    ConfirmedRender {
        source_hash: String,
        renderer: String,
        settings_hash: String,
        confirmation_id: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProcessingOptions {
    pub parameters: RasterParameters,
    pub alpha_policy: AlphaPolicy,
    pub background: BackgroundPolicy,
    /// User-provided palette order defines stable IDs and nearest-color tie breaks.
    pub fixed_palette: Option<Vec<Rgb>>,
    pub origin: RgbaOrigin,
    pub design_long_edge_mm: f64,
    pub limits: Limits,
    /// A previous returned proposal hash, approved by the host transaction.
    pub accepted_proposal_hash: Option<String>,
}
impl Default for ProcessingOptions {
    fn default() -> Self {
        Self {
            parameters: RasterParameters::default(),
            alpha_policy: AlphaPolicy::RejectPartial,
            background: BackgroundPolicy::Keep,
            fixed_palette: None,
            origin: RgbaOrigin::ExplicitSrgb,
            design_long_edge_mm: 45.0,
            limits: Limits::default(),
            accepted_proposal_hash: None,
        }
    }
}
impl ProcessingOptions {
    pub fn preserve_pixels() -> Self {
        Self {
            parameters: RasterParameters::preserve_pixels(),
            ..Self::default()
        }
    }
    pub(crate) fn validate(&self) -> Result<(), RasterError> {
        self.limits.validate()?;
        let p = &self.parameters;
        if p.semantics_version != SEMANTICS_VERSION
            || !(2..=16).contains(&p.k)
            || ![360, 520, 720, 960, 1280].contains(&p.res)
            || p.smooth > 6
            || p.min_area_pixels > 100
            || p.denoise > 3
            || !p.eps.is_finite()
            || !(0.0..=100.0).contains(&p.eps)
            || p.eps.fract() != 0.0
            || !p.tension.is_finite()
            || !(0.0..=100.0).contains(&p.tension)
            || p.tension.fract() != 0.0
            || !self.design_long_edge_mm.is_finite()
            || self.design_long_edge_mm <= 0.0
            || self.design_long_edge_mm > 10_000.0
        {
            return Err(error(
                ErrorCode::InvalidOptions,
                "Parameter value/version/domain is invalid",
            ));
        }
        if let AlphaPolicy::Threshold { cutoff: 0 } = self.alpha_policy {
            return Err(error(
                ErrorCode::InvalidOptions,
                "Alpha cutoff must be in 1..=255",
            ));
        }
        if let Some(palette) = &self.fixed_palette {
            if palette.is_empty()
                || palette.len() > usize::from(p.k)
                || palette
                    .iter()
                    .collect::<std::collections::BTreeSet<_>>()
                    .len()
                    != palette.len()
            {
                return Err(error(
                    ErrorCode::InvalidOptions,
                    "Fixed palette must be unique, nonempty and at most k colors",
                ));
            }
        }
        if let RgbaOrigin::ConfirmedRender {
            source_hash,
            renderer,
            settings_hash,
            confirmation_id,
        } = &self.origin
        {
            if !is_hash(source_hash)
                || !is_hash(settings_hash)
                || renderer.is_empty()
                || renderer.len() > 256
                || confirmation_id.is_empty()
                || confirmation_id.len() > 256
            {
                return Err(error(ErrorCode::RenderConfirmationRequired,"A rendered RGBA origin needs source/settings hashes, renderer and confirmation ID"));
            }
        }
        if let Some(hash) = &self.accepted_proposal_hash {
            if !is_hash(hash) {
                return Err(error(
                    ErrorCode::InvalidOptions,
                    "Invalid accepted proposal hash",
                ));
            }
        }
        if let BackgroundPolicy::ExcludeBoundaryConnected { label_ids } = &self.background {
            if label_ids.is_empty()
                || label_ids.len() > 16
                || label_ids.iter().any(|v| *v == 0 || *v > 16)
                || label_ids
                    .iter()
                    .collect::<std::collections::BTreeSet<_>>()
                    .len()
                    != label_ids.len()
            {
                return Err(error(
                    ErrorCode::InvalidOptions,
                    "Background labels must be unique opaque palette IDs",
                ));
            }
        }
        Ok(())
    }
}
fn is_hash(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RasterDocument {
    pub schema_version: u32,
    pub status: ProcessingStatus,
    pub requires_confirmation: bool,
    pub confirmation_reasons: Vec<String>,
    pub proposal_hash: String,
    pub input_width: u32,
    pub input_height: u32,
    pub original_rgba: Vec<u8>,
    pub original_rgba_hash: String,
    /// Full original encoded input when created by process_image.
    pub encoded_source: Option<EncodedSource>,
    pub options: ProcessingOptions,
    pub width: u32,
    pub height: u32,
    /// Resampled straight-alpha preview before denoise/alpha/palette decisions.
    pub resampled_rgba: Vec<u8>,
    /// Final palette/alpha/background/merge preview, RGBA8.
    pub processed_rgba: Vec<u8>,
    /// One authoritative row-major grid, 0 transparent/removed, 1..N palette.
    pub labels: Vec<u16>,
    pub palette: Vec<PaletteEntry>,
    pub material_count: u16,
    pub regions: Vec<Region>,
    /// Immutable exact boundaries of the final labeled cells.
    pub graph: BoundaryGraph,
    /// Authoritative shared manufacturing geometry and its embedding certificate.
    pub geometry: ManufacturingGeometry,
    pub transform: GridTransform,
    pub decisions: ProcessingDecisions,
    pub comparison: PreviewComparison,
    pub diagnostics: Vec<Diagnostic>,
    pub ledger: RasterLedger,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EncodedSource {
    pub bytes: Vec<u8>,
    pub hash: String,
    pub format: SourceFormat,
    pub orientation: OrientationRecord,
    pub color: ColorRecord,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessingStatus {
    Ready,
    Empty,
    RequiresConfirmation,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaletteEntry {
    pub label: u16,
    pub color: Rgb,
    pub initial_pixels: u64,
    pub final_pixels: u64,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoundaryGraph {
    pub vertices: Vec<GridVertex>,
    pub edges: Vec<BoundaryEdge>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GridVertex {
    pub id: u32,
    pub x: u32,
    pub y: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoundaryEdge {
    pub id: u32,
    pub from: u32,
    pub to: u32,
    /// Screen-coordinate left/right of from->to; Y points down.
    pub left_label: u16,
    pub right_label: u16,
    pub left_region: Option<u32>,
    pub right_region: Option<u32>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DirectedEdge {
    pub edge: u32,
    pub reversed: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoundaryLoop {
    pub edges: Vec<DirectedEdge>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Region {
    pub id: u32,
    pub label: u16,
    pub pixel_count: u64,
    pub bounds_px: [u32; 4],
    pub touches_border: bool,
    pub loops: Vec<BoundaryLoop>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GridTransform {
    pub width_mm: f64,
    pub height_mm: f64,
    pub mm_per_pixel_x: f64,
    pub mm_per_pixel_y: f64,
    pub coordinates: String,
    pub quantization: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MergeDecision {
    pub source_region: u32,
    pub from_label: u16,
    pub to_label: u16,
    pub pixels: u64,
    pub shared_unit_edges: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ProcessingDecisions {
    pub palette_algorithm: String,
    pub palette_iterations: u32,
    pub palette_recolored_pixels: u64,
    pub downsampled: bool,
    pub alpha_input: AlphaSummary,
    pub alpha_processed: AlphaSummary,
    pub alpha_changed_pixels: u64,
    pub denoise_changed_pixels: u64,
    pub background_excluded_pixels: u64,
    pub background_excluded_regions: u32,
    pub merges: Vec<MergeDecision>,
    pub unmerged_small_regions: u32,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PreviewComparison {
    pub comparison_domain: String,
    pub changed_pixels: u64,
    pub alpha_changed_pixels: u64,
    pub max_abs_premultiplied_rgba_error: f64,
    pub mean_squared_premultiplied_rgba_error: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RasterLedger {
    pub work_units: u64,
    pub estimated_working_bytes: u64,
    pub boundary_construction: String,
    pub boundary_approximation_error_px: f64,
    pub resampling_algorithm: String,
    pub processing_pixel_diagonal_mm: f64,
    /// No certified source-continuous contour exists for arbitrary pixels/segmentation.
    pub total_source_geometry_error_bound_mm: Option<f64>,
    pub entries: Vec<LedgerEntry>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LedgerEntry {
    pub stage: String,
    pub bound_mm: Option<f64>,
    pub note: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Diagnostic {
    pub code: String,
    pub message: String,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidOptions,
    UnsupportedFormat,
    UnsupportedMetadata,
    SvgIsNotRaster,
    SourceLimit,
    DimensionLimit,
    PixelLimit,
    MemoryLimit,
    MetadataLimit,
    DecodeFailed,
    AnimationUnsupported,
    UnsupportedBitDepth,
    ColorManagementRequired,
    OrientationUnknown,
    AlphaPolicyRequired,
    RenderConfirmationRequired,
    CapabilityUnavailable,
    WorkLimit,
    GraphLimit,
    RegionLimit,
    ConfirmationMismatch,
    ConfirmationRequired,
    InvalidBuffer,
    InvariantViolation,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RasterError {
    pub code: ErrorCode,
    pub message: String,
    pub source_hash: Option<String>,
}
impl std::fmt::Display for RasterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}
impl std::error::Error for RasterError {}
pub(crate) fn error(code: ErrorCode, message: impl Into<String>) -> RasterError {
    RasterError {
        code,
        message: message.into(),
        source_hash: None,
    }
}
// Scaled norm avoids squaring a tiny valid physical extent to zero.
pub(crate) fn physical_diagonal(x: f64, y: f64) -> f64 {
    let hi = x.max(y);
    let ratio = x.min(y) / hi;
    hi * (1.0 + ratio * ratio).sqrt()
}
pub(crate) fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn alpha_summary(data: &[u8]) -> AlphaSummary {
    let mut a = AlphaSummary::default();
    for p in data.chunks_exact(4) {
        match p[3] {
            0 => a.transparent += 1,
            255 => a.opaque += 1,
            _ => a.partial += 1,
        }
    }
    a
}
pub(crate) fn round_even(n: u64, d: u64) -> u64 {
    let q = n / d;
    let r = n % d;
    q + u64::from(r > d - r || (r == d - r && q % 2 != 0))
}
pub(crate) fn buffer<T: Clone>(n: usize, value: T) -> Result<Vec<T>, RasterError> {
    let mut v = Vec::new();
    v.try_reserve_exact(n)
        .map_err(|_| error(ErrorCode::MemoryLimit, "Allocation refused"))?;
    v.resize(n, value);
    Ok(v)
}
pub(crate) struct Budget<'a> {
    pub limits: &'a Limits,
    pub work: u64,
    pub bytes: u64,
}
impl<'a> Budget<'a> {
    pub fn new(limits: &'a Limits) -> Self {
        Self {
            limits,
            work: 0,
            bytes: 0,
        }
    }
    pub fn spend(&mut self, n: u64) -> Result<(), RasterError> {
        self.work = self
            .work
            .checked_add(n)
            .ok_or_else(|| error(ErrorCode::WorkLimit, "Work counter overflow"))?;
        if self.work > self.limits.max_work_units {
            return Err(error(
                ErrorCode::WorkLimit,
                "Deterministic work budget exhausted",
            ));
        }
        Ok(())
    }
    /// Conservative cumulative reservations, even when a temporary buffer is freed.
    pub fn reserve(&mut self, n: u64) -> Result<(), RasterError> {
        self.bytes = self
            .bytes
            .checked_add(n)
            .ok_or_else(|| error(ErrorCode::MemoryLimit, "Memory counter overflow"))?;
        if self.bytes > self.limits.max_working_bytes {
            return Err(error(
                ErrorCode::MemoryLimit,
                "Conservative processing memory budget exhausted",
            ));
        }
        Ok(())
    }
}
impl RasterDocument {
    /// IDs remain shared even when material contours are requested separately.
    pub fn source_material_contour_vertex_ids(
        &self,
        label: u16,
    ) -> Result<Vec<Vec<u32>>, RasterError> {
        if self.requires_confirmation {
            return Err(error(
                ErrorCode::ConfirmationRequired,
                "Accept this exact proposal in the host before manufacturing",
            ));
        }
        if label == 0 || !self.palette.iter().any(|p| p.label == label) {
            return Err(error(
                ErrorCode::InvalidOptions,
                "Unknown/nonmaterial label",
            ));
        }
        let mut result = Vec::new();
        for region in self.regions.iter().filter(|r| r.label == label) {
            for contour in &region.loops {
                let mut points = Vec::with_capacity(contour.edges.len() + 1);
                for e in &contour.edges {
                    let edge = self.graph.edges.get(e.edge as usize).ok_or_else(|| {
                        error(
                            ErrorCode::InvariantViolation,
                            "Invalid serialized edge reference",
                        )
                    })?;
                    points.push(if e.reversed { edge.to } else { edge.from });
                }
                if let Some(&first) = points.first() {
                    points.push(first);
                }
                result.push(points);
            }
        }
        Ok(result)
    }
    pub fn source_point_mm(&self, id: u32) -> Result<[f64; 2], RasterError> {
        let v = self
            .graph
            .vertices
            .get(id as usize)
            .ok_or_else(|| error(ErrorCode::InvalidOptions, "Unknown vertex ID"))?;
        if v.x > self.width || v.y > self.height {
            return Err(error(
                ErrorCode::InvariantViolation,
                "Vertex outside processing grid",
            ));
        }
        let p = [
            if v.x == self.width {
                self.transform.width_mm
            } else {
                f64::from(v.x) * self.transform.mm_per_pixel_x
            },
            if v.y == self.height {
                self.transform.height_mm
            } else {
                f64::from(v.y) * self.transform.mm_per_pixel_y
            },
        ];
        if p.iter().any(|x| !x.is_finite() || x.abs() > 10_000.0) {
            return Err(error(
                ErrorCode::DimensionLimit,
                "Point exceeds finite mm domain",
            ));
        }
        Ok(p)
    }
}
