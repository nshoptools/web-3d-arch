use crate::*;
use rstar::{RTree, RTreeObject, AABB};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

/// Exact dyadic coordinates in processing pixels. Host maps each ID once to mm.
pub const GEOMETRY_SCALE: i64 = 1 << 20;
pub const GEOMETRY_ALGORITHM: &str = "shared-chains-binomial-monotone-capsule-quadratic-v1";
const FLATNESS: i64 = GEOMETRY_SCALE / 1024;
const MAX_DEPTH: u32 = 16;
type Point = [i64; 2];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GeometryVertex {
    pub id: u32,
    pub xy: [i64; 2],
    /// Only pinned, unmodified graph vertices retain a source ID here.
    pub source_vertex: Option<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuadraticSpan {
    pub from: Point,
    pub control: Point,
    pub to: Point,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SharedChain {
    pub id: u32,
    pub component: u32,
    pub source_edges: Vec<DirectedEdge>,
    pub vertex_ids: Vec<u32>,
    pub left_label: u16,
    pub right_label: u16,
    pub left_region: Option<u32>,
    pub right_region: Option<u32>,
    /// Unflattened quadratic fillets in the same dyadic domain.
    pub curves: Vec<QuadraticSpan>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DirectedChain {
    pub chain: u32,
    pub reversed: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GeometryLoop {
    pub id: u32,
    pub source_region: u32,
    pub source_loop: u32,
    pub chains: Vec<DirectedChain>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TopologyCertificate {
    pub algorithm: String,
    pub components: u32,
    pub loops: u32,
    pub holes: u32,
    pub junctions: u32,
    pub intersection_pairs_checked: u64,
    pub nesting_ray_tests: u64,
    pub adjacency_pairs: Vec<[u16; 2]>,
    pub pinned_source_vertices: Vec<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GeometryLedger {
    pub algorithm: String,
    /// Requested values remain in document.options. All three geometric strengths
    /// are scaled by 2^-attenuation_steps when the embedding constraint rejects a trial.
    pub attenuation_steps: u8,
    pub rejected_trials: Vec<String>,
    pub constrained_identity: bool,
    pub smooth_max_displacement_units: i64,
    pub simplification_bound_units: i64,
    pub corner_rounding_bound_units: i64,
    pub flattening_bound_units: i64,
    /// Sum of stage-wise continuous-correspondence L-infinity bounds.
    pub total_linf_bound_units: i64,
    pub source_vertices: u64,
    pub simplified_vertices: u64,
    pub output_vertices: u64,
    pub quadratic_spans: u64,
    pub changed: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManufacturingGeometry {
    pub units_per_pixel: i64,
    pub vertices: Vec<GeometryVertex>,
    /// Same orientation convention as the source graph. Each seam exists once.
    pub edges: Vec<BoundaryEdge>,
    pub chains: Vec<SharedChain>,
    pub loops: Vec<GeometryLoop>,
    pub certificate: TopologyCertificate,
    pub ledger: GeometryLedger,
}
impl ManufacturingGeometry {
    pub fn loop_vertex_ids(&self, contour: &GeometryLoop) -> Result<Vec<u32>, RasterError> {
        let mut out = Vec::new();
        for reference in &contour.chains {
            let chain = self.chains.get(reference.chain as usize).ok_or_else(|| {
                error(
                    ErrorCode::InvariantViolation,
                    "Invalid derived chain reference",
                )
            })?;
            let ids: Vec<u32> = if reference.reversed {
                chain.vertex_ids.iter().rev().copied().collect()
            } else {
                chain.vertex_ids.clone()
            };
            if ids.len() < 2 || out.last().is_some_and(|v| Some(v) != ids.first()) {
                return Err(error(
                    ErrorCode::InvariantViolation,
                    "Disconnected derived contour",
                ));
            }
            if !out.is_empty() {
                out.pop();
            }
            out.extend(ids);
        }
        if out.len() < 4 || out.first() != out.last() {
            return Err(error(
                ErrorCode::InvariantViolation,
                "Derived contour is not closed",
            ));
        }
        Ok(out)
    }
}
impl RasterDocument {
    /// Manufacturing IDs belong to geometry.vertices, never graph.vertices (raw source).
    pub fn material_contour_vertex_ids(&self, label: u16) -> Result<Vec<Vec<u32>>, RasterError> {
        if self.requires_confirmation {
            return Err(error(
                ErrorCode::ConfirmationRequired,
                "Accept the exact derived-geometry proposal first",
            ));
        }
        if label == 0 || !self.palette.iter().any(|p| p.label == label) {
            return Err(error(
                ErrorCode::InvalidOptions,
                "Unknown/nonmaterial label",
            ));
        }
        self.geometry
            .loops
            .iter()
            .filter(|l| {
                self.regions
                    .get(l.source_region as usize)
                    .is_some_and(|r| r.label == label)
            })
            .map(|l| self.geometry.loop_vertex_ids(l))
            .collect()
    }
    pub fn point_mm(&self, id: u32) -> Result<[f64; 2], RasterError> {
        let v =
            self.geometry.vertices.get(id as usize).ok_or_else(|| {
                error(ErrorCode::InvalidOptions, "Unknown manufacturing vertex ID")
            })?;
        let mut out = [0.0; 2];
        for (axis, (extent, mm, step)) in [
            (
                self.width,
                self.transform.width_mm,
                self.transform.mm_per_pixel_x,
            ),
            (
                self.height,
                self.transform.height_mm,
                self.transform.mm_per_pixel_y,
            ),
        ]
        .into_iter()
        .enumerate()
        {
            let end = i64::from(extent) * GEOMETRY_SCALE;
            if v.xy[axis] < 0 || v.xy[axis] > end {
                return Err(error(
                    ErrorCode::InvariantViolation,
                    "Derived vertex outside viewport",
                ));
            }
            out[axis] = if v.xy[axis] == end {
                mm
            } else {
                (v.xy[axis] as f64 / GEOMETRY_SCALE as f64) * step
            };
        }
        if out
            .iter()
            .any(|v| !v.is_finite() || *v < 0.0 || *v > 10000.0)
        {
            return Err(error(
                ErrorCode::DimensionLimit,
                "Derived mm coordinate outside finite domain",
            ));
        }
        Ok(out)
    }
    /// Relative to the FINAL processed label-cell boundaries, not the encoded image
    /// or printer. One f64 epsilon margin covers this reporting conversion only.
    pub fn derived_geometry_error_bound_mm(&self) -> f64 {
        let x = self.transform.mm_per_pixel_x;
        let y = self.transform.mm_per_pixel_y;
        let scale = physical_diagonal(x, y);
        self.geometry.ledger.total_linf_bound_units as f64 / GEOMETRY_SCALE as f64
            * scale
            * (1.0 + 8.0 * f64::EPSILON)
    }
}
#[derive(Clone)]
struct SourceChain {
    edges: Vec<DirectedEdge>,
    vertices: Vec<u32>,
    component: u32,
}
struct Extracted {
    chains: Vec<SourceChain>,
    loops: Vec<GeometryLoop>,
    anchors: Vec<u32>,
    pinned: Vec<bool>,
}
fn ends(g: &BoundaryGraph, e: DirectedEdge) -> (u32, u32) {
    let v = &g.edges[e.edge as usize];
    if e.reversed {
        (v.to, v.from)
    } else {
        (v.from, v.to)
    }
}
fn pair(e: &BoundaryEdge) -> [Option<u32>; 2] {
    let mut p = [e.left_region, e.right_region];
    p.sort();
    p
}
fn extract(
    g: &BoundaryGraph,
    regions: &[Region],
    w: u32,
    h: u32,
    b: &mut Budget<'_>,
) -> Result<Extracted, RasterError> {
    b.reserve(g.vertices.len() as u64 * 80 + g.edges.len() as u64 * 80)?;
    b.spend(g.vertices.len() as u64 * 8 + g.edges.len() as u64 * 16)?;
    let mut incident = vec![Vec::<u32>::new(); g.vertices.len()];
    for e in &g.edges {
        incident[e.from as usize].push(e.id);
        incident[e.to as usize].push(e.id);
    }
    let mut component = buffer(g.vertices.len(), u32::MAX)?;
    let mut anchors = Vec::new();
    for start in 0..g.vertices.len() {
        if component[start] != u32::MAX {
            continue;
        }
        let cid = anchors.len() as u32;
        anchors.push(start as u32);
        component[start] = cid;
        let mut queue = VecDeque::from([start as u32]);
        while let Some(v) = queue.pop_front() {
            for &eid in &incident[v as usize] {
                let e = &g.edges[eid as usize];
                let next = if e.from == v { e.to } else { e.from };
                if component[next as usize] == u32::MAX {
                    component[next as usize] = cid;
                    queue.push_back(next);
                }
            }
        }
    }
    let mut pinned: Vec<bool> = g
        .vertices
        .iter()
        .map(|v| {
            let edges = &incident[v.id as usize];
            v.x == 0
                || v.y == 0
                || v.x == w
                || v.y == h
                || edges.len() != 2
                || pair(&g.edges[edges[0] as usize]) != pair(&g.edges[edges[1] as usize])
        })
        .collect();
    for &v in &anchors {
        pinned[v as usize] = true;
    }
    let mut seen = buffer(g.edges.len(), false)?;
    let mut mapping = buffer(
        g.edges.len(),
        DirectedChain {
            chain: u32::MAX,
            reversed: false,
        },
    )?;
    let mut chains = Vec::new();
    for start in 0..g.vertices.len() {
        if !pinned[start] {
            continue;
        }
        for &seed in &incident[start] {
            if seen[seed as usize] {
                continue;
            }
            let mut vertices = vec![start as u32];
            let mut edges = Vec::new();
            let mut v = start as u32;
            let mut eid = seed;
            loop {
                if seen[eid as usize] {
                    return Err(error(
                        ErrorCode::InvariantViolation,
                        "Source chain traced twice",
                    ));
                }
                seen[eid as usize] = true;
                let rev = g.edges[eid as usize].to == v;
                mapping[eid as usize] = DirectedChain {
                    chain: chains.len() as u32,
                    reversed: rev,
                };
                let directed = DirectedEdge {
                    edge: eid,
                    reversed: rev,
                };
                let next = ends(g, directed).1;
                edges.push(directed);
                vertices.push(next);
                if pinned[next as usize] {
                    break;
                }
                let neighbors = &incident[next as usize];
                eid = *neighbors.iter().find(|&&id| id != eid).unwrap();
                v = next;
            }
            chains.push(SourceChain {
                edges,
                vertices,
                component: component[start],
            });
        }
    }
    if seen.iter().any(|v| !v) {
        return Err(error(
            ErrorCode::InvariantViolation,
            "Unassigned source boundary",
        ));
    }
    let mut loops = Vec::new();
    for region in regions {
        for (li, contour) in region.loops.iter().enumerate() {
            let mut refs = Vec::<DirectedChain>::new();
            for e in &contour.edges {
                let m = mapping[e.edge as usize];
                let r = DirectedChain {
                    chain: m.chain,
                    reversed: m.reversed != e.reversed,
                };
                if refs.last() != Some(&r) {
                    refs.push(r);
                }
            }
            if refs.len() > 1 && refs.first() == refs.last() {
                refs.pop();
            }
            // Source traversal may start inside a chain. Rotate to a chain boundary.
            loops.push(GeometryLoop {
                id: loops.len() as u32,
                source_region: region.id,
                source_loop: li as u32,
                chains: refs,
            });
        }
    }
    Ok(Extracted {
        chains,
        loops,
        anchors,
        pinned,
    })
}
fn source_points(g: &BoundaryGraph, c: &SourceChain) -> Vec<Point> {
    c.vertices
        .iter()
        .map(|&id| {
            let v = &g.vertices[id as usize];
            [
                i64::from(v.x) * GEOMETRY_SCALE,
                i64::from(v.y) * GEOMETRY_SCALE,
            ]
        })
        .collect()
}
fn delta(a: Point, b: Point) -> Point {
    [a[0] - b[0], a[1] - b[1]]
}
fn cross(a: Point, b: Point) -> i128 {
    i128::from(a[0]) * i128::from(b[1]) - i128::from(a[1]) * i128::from(b[0])
}
fn orient(a: Point, b: Point, c: Point) -> i128 {
    cross(delta(b, a), delta(c, a))
}
fn linf(a: Point, b: Point) -> i64 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}
fn div_even(n: i128, d: i128) -> i64 {
    let sign = n.signum();
    let a = n.abs();
    let q = a / d;
    let r = a % d;
    ((q + i128::from(r > d - r || (r == d - r && q % 2 != 0))) * sign) as i64
}
fn midpoint(a: Point, b: Point) -> Point {
    [
        div_even(i128::from(a[0]) + i128::from(b[0]), 2),
        div_even(i128::from(a[1]) + i128::from(b[1]), 2),
    ]
}
fn smooth(
    points: &[Point],
    passes: u8,
    shift: u8,
    b: &mut Budget<'_>,
) -> Result<(Vec<Point>, i64), RasterError> {
    let mut p = points.to_vec();
    for _ in 0..passes {
        b.spend(p.len() as u64 * 12)?;
        let mut next = p.clone();
        for i in 1..p.len().saturating_sub(1) {
            for ax in 0..2 {
                // Gain = 2^-shift. Round once in the dyadic lattice.
                let change =
                    i128::from(p[i - 1][ax]) + i128::from(p[i + 1][ax]) - 2 * i128::from(p[i][ax]);
                next[i][ax] += div_even(change, 4i128 << shift);
            }
        }
        p = next;
    }
    let bound = points
        .iter()
        .zip(&p)
        .map(|(&a, &b)| linf(a, b))
        .max()
        .unwrap_or(0);
    Ok((p, bound))
}
/// A monotone linear retraction to a chord, in the L-infinity norm.
/// Capsule + monotonicity imply a continuous, surjective correspondence, not just
/// vertex-to-infinite-line distance. Exact i128; degenerate chords are rejected.
fn capsule(points: &[Point], radius: i64) -> bool {
    let a = points[0];
    let z = points[points.len() - 1];
    let d = delta(z, a);
    let n = i128::from(d[0].abs() + d[1].abs());
    if n == 0 {
        return false;
    }
    let ax = if d[0].abs() >= d[1].abs() { 0 } else { 1 };
    let v = [-d[1].signum(), d[0].signum()];
    let end = i128::from(d[ax].abs()) * n;
    let sign = i128::from(d[ax].signum());
    let mut last = 0i128;
    for &p in points {
        let c = cross(d, delta(p, a));
        if c.abs() > i128::from(radius) * n {
            return false;
        }
        let t = (i128::from(p[ax] - a[ax]) * n - c * i128::from(v[ax])) * sign;
        if t < last || t > end {
            return false;
        }
        last = t;
    }
    true
}
fn simplify(points: &[Point], radius: i64, b: &mut Budget<'_>) -> Result<Vec<Point>, RasterError> {
    if radius == 0 || points.len() < 3 {
        return Ok(points.to_vec());
    }
    let mut keep = buffer(points.len(), false)?;
    keep[0] = true;
    keep[points.len() - 1] = true;
    let mut stack = vec![(0, points.len() - 1)];
    while let Some((a, z)) = stack.pop() {
        if z <= a + 1 {
            continue;
        }
        b.spend((z - a + 1) as u64 * 16)?;
        if capsule(&points[a..=z], radius) {
            continue;
        }
        // Balanced splitting bounds recursion/work on adversarial zigzags.
        let m = (a + z) / 2;
        keep[m] = true;
        stack.push((m, z));
        stack.push((a, m));
    }
    Ok(points
        .iter()
        .zip(keep)
        .filter_map(|(&p, k)| k.then_some(p))
        .collect())
}
fn trim(p: Point, toward: Point, reach: i64) -> Point {
    let len = linf(p, toward);
    if len == 0 {
        return p;
    }
    // Leave at least half each segment between adjacent fillets.
    let r = reach.min(len / 4);
    [
        p[0] + div_even(
            i128::from(toward[0] - p[0]) * i128::from(r),
            i128::from(len),
        ),
        p[1] + div_even(
            i128::from(toward[1] - p[1]) * i128::from(r),
            i128::from(len),
        ),
    ]
}
fn push_point(out: &mut Vec<Point>, p: Point, b: &mut Budget<'_>) -> Result<(), RasterError> {
    if out.last() == Some(&p) {
        return Ok(());
    }
    if out.len() >= b.limits.max_vertices as usize {
        return Err(error(ErrorCode::GraphLimit, "Derived chain vertex limit"));
    }
    b.reserve(32)?;
    out.try_reserve(1)
        .map_err(|_| error(ErrorCode::MemoryLimit, "Derived chain allocation"))?;
    out.push(p);
    Ok(())
}
fn flatten(
    q: &QuadraticSpan,
    depth: u32,
    out: &mut Vec<Point>,
    b: &mut Budget<'_>,
) -> Result<(), RasterError> {
    b.spend(64)?;
    if capsule(&[q.from, q.control, q.to], FLATNESS) {
        return push_point(out, q.to, b);
    }
    if depth == MAX_DEPTH {
        return Err(error(
            ErrorCode::GraphLimit,
            "Quadratic subdivision depth exhausted",
        ));
    }
    let a = midpoint(q.from, q.control);
    let z = midpoint(q.control, q.to);
    let m = midpoint(a, z);
    flatten(
        &QuadraticSpan {
            from: q.from,
            control: a,
            to: m,
        },
        depth + 1,
        out,
        b,
    )?;
    flatten(
        &QuadraticSpan {
            from: m,
            control: z,
            to: q.to,
        },
        depth + 1,
        out,
        b,
    )
}
fn round_corners(
    p: &[Point],
    reach: i64,
    b: &mut Budget<'_>,
) -> Result<(Vec<Point>, Vec<QuadraticSpan>, i64), RasterError> {
    if reach == 0 || p.len() < 3 {
        return Ok((p.to_vec(), Vec::new(), 0));
    }
    let mut out = vec![p[0]];
    let mut curves = Vec::new();
    let mut bound = 0;
    for i in 1..p.len() - 1 {
        b.spend(16)?;
        if orient(p[i - 1], p[i], p[i + 1]) == 0 {
            push_point(&mut out, p[i], b)?;
            continue;
        }
        let a = trim(p[i], p[i - 1], reach);
        let z = trim(p[i], p[i + 1], reach);
        if a == p[i] || z == p[i] {
            push_point(&mut out, p[i], b)?;
            continue;
        }
        bound = bound.max(linf(p[i], a)).max(linf(p[i], z));
        push_point(&mut out, a, b)?;
        let q = QuadraticSpan {
            from: a,
            control: p[i],
            to: z,
        };
        flatten(&q, 0, &mut out, b)?;
        b.reserve(64)?;
        curves.push(q);
    }
    push_point(&mut out, *p.last().unwrap(), b)?;
    Ok((out, curves, bound))
}

#[derive(Clone)]
struct Segment {
    id: u32,
    a: Point,
    z: Point,
    from: u32,
    to: u32,
    chain: u32,
    component: u32,
}
impl RTreeObject for Segment {
    type Envelope = AABB<Point>;
    fn envelope(&self) -> Self::Envelope {
        AABB::from_corners(
            [self.a[0].min(self.z[0]), self.a[1].min(self.z[1])],
            [self.a[0].max(self.z[0]), self.a[1].max(self.z[1])],
        )
    }
}
fn segments(g: &ManufacturingGeometry) -> Vec<Segment> {
    let mut result = Vec::with_capacity(g.edges.len());
    for c in &g.chains {
        for v in c.vertex_ids.windows(2) {
            result.push(Segment {
                id: result.len() as u32,
                a: g.vertices[v[0] as usize].xy,
                z: g.vertices[v[1] as usize].xy,
                from: v[0],
                to: v[1],
                chain: c.id,
                component: c.component,
            });
        }
    }
    result
}
fn assemble(
    raw: &BoundaryGraph,
    src: &Extracted,
    params: &RasterParameters,
    shift: u8,
    identity: bool,
    b: &mut Budget<'_>,
) -> Result<ManufacturingGeometry, RasterError> {
    let mut vertices = Vec::new();
    let mut edges = Vec::new();
    let mut chains = Vec::new();
    let mut pins = buffer(raw.vertices.len(), u32::MAX)?;
    let mut smooth_bound = 0;
    let mut round_bound = 0;
    let mut simplified_count = 0;
    let mut curve_count = 0;
    let mut changed = false;
    let mut simplification_applied = false;
    let radius = if identity {
        0
    } else {
        (params.eps as i64 * GEOMETRY_SCALE / 200) >> shift
    };
    let reach = if identity {
        0
    } else {
        (params.tension as i64 * GEOMETRY_SCALE / 200) >> shift
    };
    b.reserve(
        raw.vertices.len() as u64 * 8
            + src
                .loops
                .iter()
                .map(|l| l.chains.len() as u64 * 16 + 64)
                .sum::<u64>(),
    )?;
    for c in &src.chains {
        let input = source_points(raw, c);
        b.reserve(input.len() as u64 * 160)?;
        let (s, sb) = smooth(&input, if identity { 0 } else { params.smooth }, shift, b)?;
        let simplified = simplify(&s, radius, b)?;
        simplification_applied |= simplified.len() < s.len();
        simplified_count += simplified.len() as u64;
        let (points, curves, rb) = round_corners(&simplified, reach, b)?;
        changed |= points != input;
        smooth_bound = smooth_bound.max(sb);
        round_bound = round_bound.max(rb);
        curve_count += curves.len() as u64;
        let mut ids = Vec::with_capacity(points.len());
        for (i, &p) in points.iter().enumerate() {
            let source = if i == 0 {
                Some(c.vertices[0])
            } else if i + 1 == points.len() {
                Some(*c.vertices.last().unwrap())
            } else {
                None
            };
            let id = if let Some(v) = source.filter(|&v| pins[v as usize] != u32::MAX) {
                pins[v as usize]
            } else {
                if vertices.len() >= b.limits.max_vertices as usize {
                    return Err(error(ErrorCode::GraphLimit, "Global derived vertex limit"));
                }
                b.reserve(64)?;
                let id = vertices.len() as u32;
                vertices.push(GeometryVertex {
                    id,
                    xy: p,
                    source_vertex: source,
                });
                if let Some(v) = source {
                    pins[v as usize] = id;
                }
                id
            };
            ids.push(id);
        }
        let first = &raw.edges[c.edges[0].edge as usize];
        let (ll, rl, lr, rr) = if c.edges[0].reversed {
            (
                first.right_label,
                first.left_label,
                first.right_region,
                first.left_region,
            )
        } else {
            (
                first.left_label,
                first.right_label,
                first.left_region,
                first.right_region,
            )
        };
        for ends in ids.windows(2) {
            if edges.len() >= b.limits.max_edges as usize {
                return Err(error(ErrorCode::GraphLimit, "Global derived edge limit"));
            }
            b.reserve(64)?;
            edges.push(BoundaryEdge {
                id: edges.len() as u32,
                from: ends[0],
                to: ends[1],
                left_label: ll,
                right_label: rl,
                left_region: lr,
                right_region: rr,
            });
        }
        chains.push(SharedChain {
            id: chains.len() as u32,
            component: c.component,
            source_edges: c.edges.clone(),
            vertex_ids: ids,
            left_label: ll,
            right_label: rl,
            left_region: lr,
            right_region: rr,
            curves,
        });
    }
    let flatten_bound = if curve_count == 0 {
        0
    } else {
        FLATNESS + 2 * i64::from(MAX_DEPTH)
    };
    let simple_bound = if simplification_applied { radius } else { 0 };
    let ledger = GeometryLedger {
        algorithm: GEOMETRY_ALGORITHM.into(),
        attenuation_steps: shift,
        rejected_trials: Vec::new(),
        constrained_identity: identity,
        smooth_max_displacement_units: smooth_bound,
        simplification_bound_units: simple_bound,
        corner_rounding_bound_units: round_bound,
        flattening_bound_units: flatten_bound,
        total_linf_bound_units: smooth_bound + simple_bound + round_bound + flatten_bound,
        source_vertices: src.chains.iter().map(|c| c.vertices.len() as u64).sum(),
        simplified_vertices: simplified_count,
        output_vertices: vertices.len() as u64,
        quadratic_spans: curve_count,
        changed,
    };
    Ok(ManufacturingGeometry {
        units_per_pixel: GEOMETRY_SCALE,
        vertices,
        edges,
        chains,
        loops: src.loops.clone(),
        certificate: TopologyCertificate {
            algorithm:
                "exact-planar-embedding-v1/i128-intersections+rotation+winding+component-nesting"
                    .into(),
            components: src.anchors.len() as u32,
            loops: src.loops.len() as u32,
            holes: 0,
            junctions: 0,
            intersection_pairs_checked: 0,
            nesting_ray_tests: 0,
            adjacency_pairs: Vec::new(),
            pinned_source_vertices: src
                .pinned
                .iter()
                .enumerate()
                .filter_map(|(i, &p)| p.then_some(i as u32))
                .collect(),
        },
        ledger,
    })
}
fn on_segment(p: Point, a: Point, z: Point) -> bool {
    orient(a, z, p) == 0
        && p[0] >= a[0].min(z[0])
        && p[0] <= a[0].max(z[0])
        && p[1] >= a[1].min(z[1])
        && p[1] <= a[1].max(z[1])
}
fn invalid_intersection(a: &Segment, b: &Segment) -> bool {
    let oa = orient(a.a, a.z, b.a);
    let oz = orient(a.a, a.z, b.z);
    let ba = orient(b.a, b.z, a.a);
    let bz = orient(b.a, b.z, a.z);
    if oa.signum() * oz.signum() < 0 && ba.signum() * bz.signum() < 0 {
        return true;
    }
    // Every touching endpoint must be the SAME graph vertex; collinear overlap
    // is caught by an endpoint in the interior or two distinct shared endpoints.
    let mut shared = 0;
    for (p, id) in [(a.a, a.from), (a.z, a.to)] {
        if on_segment(p, b.a, b.z) {
            if !((p == b.a && id == b.from) || (p == b.z && id == b.to)) {
                return true;
            }
            shared += 1;
        }
    }
    for (p, id) in [(b.a, b.from), (b.z, b.to)] {
        if on_segment(p, a.a, a.z) && !((p == a.a && id == a.from) || (p == a.z && id == a.to)) {
            return true;
        }
    }
    shared > 1
}
fn loop_areas(g: &ManufacturingGeometry, b: &mut Budget<'_>) -> Result<Vec<i128>, RasterError> {
    let mut out = Vec::new();
    b.reserve(g.loops.len() as u64 * 32)?;
    for l in &g.loops {
        let ids = g.loop_vertex_ids(l)?;
        b.reserve(ids.len() as u64 * 8)?;
        b.spend(ids.len() as u64 * 8)?;
        let mut area = 0i128;
        for pair in ids.windows(2) {
            area += cross(
                g.vertices[pair[0] as usize].xy,
                g.vertices[pair[1] as usize].xy,
            );
        }
        out.push(area);
    }
    Ok(out)
}
fn angle_cmp(a: Point, b: Point) -> std::cmp::Ordering {
    let half = |p: Point| p[1] < 0 || (p[1] == 0 && p[0] < 0);
    half(a)
        .cmp(&half(b))
        .then_with(|| cross(a, b).cmp(&0).reverse())
}
fn rotations(g: &ManufacturingGeometry) -> BTreeMap<u32, Vec<u32>> {
    let mut ports: BTreeMap<u32, Vec<(u32, Point)>> = BTreeMap::new();
    for c in &g.chains {
        for end in [false, true] {
            let n = c.vertex_ids.len();
            let (id, near) = if end {
                (c.vertex_ids[n - 1], c.vertex_ids[n - 2])
            } else {
                (c.vertex_ids[0], c.vertex_ids[1])
            };
            let v = &g.vertices[id as usize];
            if let Some(source) = v.source_vertex {
                ports.entry(source).or_default().push((
                    c.id * 2 + u32::from(end),
                    delta(g.vertices[near as usize].xy, v.xy),
                ));
            }
        }
    }
    ports
        .into_iter()
        .map(|(source, mut p)| {
            p.sort_by(|a, b| angle_cmp(a.1, b.1).then(a.0.cmp(&b.0)));
            let mut ids: Vec<_> = p.into_iter().map(|v| v.0).collect();
            let start = ids
                .iter()
                .enumerate()
                .min_by_key(|v| v.1)
                .map(|v| v.0)
                .unwrap_or(0);
            ids.rotate_left(start);
            (source, ids)
        })
        .collect()
}
type Nesting = Vec<BTreeMap<u32, i32>>;
fn nesting(
    g: &ManufacturingGeometry,
    tree: &RTree<Segment>,
    raw: &BoundaryGraph,
    src: &Extracted,
    max_x: i64,
    b: &mut Budget<'_>,
) -> Result<(Nesting, u64), RasterError> {
    let mut incidence = vec![Vec::<(u32, i32)>::new(); g.chains.len()];
    b.reserve(g.chains.len() as u64 * 80 + src.anchors.len() as u64 * 48)?;
    for l in &g.loops {
        for r in &l.chains {
            incidence[r.chain as usize].push((l.id, if r.reversed { -1 } else { 1 }));
        }
    }
    let mut out = Vec::new();
    let mut count = 0;
    for (cid, &anchor) in src.anchors.iter().enumerate() {
        let v = &raw.vertices[anchor as usize];
        let p = [
            i64::from(v.x) * GEOMETRY_SCALE,
            i64::from(v.y) * GEOMETRY_SCALE,
        ];
        let envelope = AABB::from_corners(p, [max_x, p[1]]);
        let mut winding = BTreeMap::<u32, i32>::new();
        b.spend(64)?;
        for seg in tree.locate_in_envelope_intersecting(envelope) {
            b.spend(32)?;
            count += 1;
            if seg.component == cid as u32 {
                continue;
            }
            let o = orient(seg.a, seg.z, p);
            let dir = if seg.a[1] <= p[1] && p[1] < seg.z[1] && o > 0 {
                1
            } else if seg.z[1] <= p[1] && p[1] < seg.a[1] && o < 0 {
                -1
            } else {
                0
            };
            if dir != 0 {
                for &(l, d) in &incidence[seg.chain as usize] {
                    if !winding.contains_key(&l) {
                        b.reserve(64)?;
                    }
                    *winding.entry(l).or_default() += dir * d;
                }
            }
        }
        winding.retain(|_, v| *v != 0);
        out.push(winding);
    }
    Ok((out, count))
}
struct Baseline {
    areas: Vec<i128>,
    rotations: BTreeMap<u32, Vec<u32>>,
    nesting: Nesting,
}
fn make_tree(g: &ManufacturingGeometry, b: &mut Budget<'_>) -> Result<RTree<Segment>, RasterError> {
    let n = g.edges.len() as u64;
    b.reserve(n * 256)?;
    b.spend(n * 32 * (64 - n.max(1).leading_zeros() as u64))?;
    Ok(RTree::bulk_load(segments(g)))
}
fn validate(
    g: &mut ManufacturingGeometry,
    raw: &BoundaryGraph,
    src: &Extracted,
    base: &Baseline,
    w: u32,
    h: u32,
    b: &mut Budget<'_>,
) -> Result<Option<String>, RasterError> {
    b.spend(g.vertices.len() as u64 * 8)?;
    let max = [i64::from(w) * GEOMETRY_SCALE, i64::from(h) * GEOMETRY_SCALE];
    if g.vertices
        .iter()
        .any(|v| v.xy[0] < 0 || v.xy[1] < 0 || v.xy[0] > max[0] || v.xy[1] > max[1])
    {
        return Ok(Some("viewport".into()));
    }
    for v in &g.vertices {
        if let Some(id) = v.source_vertex {
            let original = &raw.vertices[id as usize];
            if v.xy
                != [
                    i64::from(original.x) * GEOMETRY_SCALE,
                    i64::from(original.y) * GEOMETRY_SCALE,
                ]
            {
                return Ok(Some("pinned_vertex_moved".into()));
            }
        }
    }
    let tree = make_tree(g, b)?;
    for a in tree.iter() {
        if a.a == a.z {
            return Ok(Some("zero_length_edge".into()));
        }
        b.spend(64)?;
        for z in tree.locate_in_envelope_intersecting(a.envelope()) {
            if z.id <= a.id {
                continue;
            }
            b.spend(128)?;
            g.certificate.intersection_pairs_checked += 1;
            if invalid_intersection(a, z) {
                return Ok(Some("intersection_or_overlap".into()));
            }
        }
    }
    let area = match loop_areas(g, b) {
        Ok(value) => value,
        Err(e) if e.code == ErrorCode::InvariantViolation => {
            return Ok(Some("loop_collapse_or_disconnection".into()))
        }
        Err(e) => return Err(e),
    };
    if area
        .iter()
        .zip(&base.areas)
        .any(|(a, z)| a.signum() != z.signum() || *a == 0)
    {
        return Ok(Some("loop_orientation_or_collapse".into()));
    }
    let rotation = rotations(g);
    if rotation != base.rotations {
        return Ok(Some("junction_cyclic_order".into()));
    }
    let (nest, checks) = nesting(g, &tree, raw, src, max[0], b)?;
    if nest != base.nesting {
        return Ok(Some("disconnected_component_nesting".into()));
    }
    g.certificate.nesting_ray_tests = checks;
    g.certificate.holes = area.iter().filter(|&&v| v < 0).count() as u32;
    g.certificate.junctions = rotation.values().filter(|v| v.len() > 2).count() as u32;
    let mut adjacent = BTreeSet::new();
    for c in &g.chains {
        let mut labels = [c.left_label, c.right_label];
        labels.sort();
        adjacent.insert(labels);
    }
    g.certificate.adjacency_pairs = adjacent.into_iter().collect();
    Ok(None)
}
pub(crate) fn derive(
    raw: &BoundaryGraph,
    regions: &[Region],
    w: u32,
    h: u32,
    p: &RasterParameters,
    b: &mut Budget<'_>,
) -> Result<ManufacturingGeometry, RasterError> {
    let src = extract(raw, regions, w, h, b)?;
    // Identity baseline fixes abstract embedding and all disconnected nesting.
    let mut identity = assemble(raw, &src, p, 0, true, b)?;
    identity.ledger.constrained_identity = false;
    let tree = make_tree(&identity, b)?;
    let (nest, _) = nesting(
        &identity,
        &tree,
        raw,
        &src,
        i64::from(w) * GEOMETRY_SCALE,
        b,
    )?;
    let baseline = Baseline {
        areas: loop_areas(&identity, b)?,
        rotations: rotations(&identity),
        nesting: nest,
    };
    if p.smooth == 0 && p.eps == 0.0 && p.tension == 0.0 {
        if validate(&mut identity, raw, &src, &baseline, w, h, b)?.is_some() {
            return Err(error(
                ErrorCode::InvariantViolation,
                "Invalid source embedding",
            ));
        }
        return Ok(identity);
    }
    let mut rejected = Vec::new();
    for shift in 0..=12 {
        let mut trial = assemble(raw, &src, p, shift, false, b)?;
        match validate(&mut trial, raw, &src, &baseline, w, h, b)? {
            None => {
                trial.ledger.rejected_trials = rejected;
                return Ok(trial);
            }
            Some(reason) => rejected.push(format!("gain=2^-{shift}: {reason}")),
        }
    }
    // A finite constrained optimization terminates at the known source embedding.
    // This is surfaced, confirmation-gated and never claimed to have rounded it.
    identity.ledger.constrained_identity = true;
    identity.ledger.attenuation_steps = 13;
    identity.ledger.rejected_trials = rejected;
    if validate(&mut identity, raw, &src, &baseline, w, h, b)?.is_some() {
        return Err(error(
            ErrorCode::InvariantViolation,
            "Source fallback failed embedding validation",
        ));
    }
    Ok(identity)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn capsule_rejects_degenerate_chords_and_backtracking_even_on_the_line() {
        assert!(!capsule(&[[0, 0], [1, 0], [0, 0]], 100));
        assert!(!capsule(&[[0, 0], [8, 0], [3, 0], [10, 0]], 0));
        assert!(capsule(&[[0, 0], [2, 2], [4, 4]], 0));
        assert!(!capsule(&[[0, 0], [3, 8], [4, 4]], 1));
        assert!(capsule(&[[0, 0], [2, 1], [4, 4]], 1));
    }
    #[test]
    fn binomial_filter_has_exact_first_pass_golden_and_endpoint_pins() {
        let limits = Limits::default();
        let mut b = Budget::new(&limits);
        let s = GEOMETRY_SCALE;
        let (p, bound) = smooth(&[[0, 0], [s, 0], [s, s]], 1, 0, &mut b).unwrap();
        assert_eq!(p, [[0, 0], [3 * s / 4, s / 4], [s, s]]);
        assert_eq!(bound, s / 4);
        let (half, bound) = smooth(&[[0, 0], [s, 0], [s, s]], 1, 1, &mut b).unwrap();
        assert_eq!(half, [[0, 0], [7 * s / 8, s / 8], [s, s]]);
        assert_eq!(bound, s / 8);
    }
    fn segment_distance(p: [f64; 2], a: [f64; 2], z: [f64; 2]) -> f64 {
        let dx = z[0] - a[0];
        let dy = z[1] - a[1];
        let len = dx * dx + dy * dy;
        let t = if len == 0.0 {
            0.0
        } else {
            ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len
        }
        .clamp(0.0, 1.0);
        ((p[0] - a[0] - t * dx).powi(2) + (p[1] - a[1] - t * dy).powi(2)).sqrt()
    }
    #[test]
    fn adaptive_quadratic_flattening_is_checked_against_independent_dense_bernstein_samples() {
        let s = GEOMETRY_SCALE;
        let limits = Limits::default();
        let mut b = Budget::new(&limits);
        for q in [
            QuadraticSpan {
                from: [0, 0],
                control: [2 * s, 0],
                to: [2 * s, 2 * s],
            },
            QuadraticSpan {
                from: [0, 0],
                control: [2 * s, 3 * s],
                to: [0, 0],
            },
            QuadraticSpan {
                from: [s, 0],
                control: [s, 0],
                to: [2 * s, 0],
            },
        ] {
            let mut points = vec![q.from];
            flatten(&q, 0, &mut points, &mut b).unwrap();
            for i in 0..=2048 {
                let t = f64::from(i) / 2048.0;
                let p = [0, 1].map(|ax| {
                    (1.0 - t).powi(2) * q.from[ax] as f64
                        + 2.0 * t * (1.0 - t) * q.control[ax] as f64
                        + t * t * q.to[ax] as f64
                });
                let d = points
                    .windows(2)
                    .map(|v| segment_distance(p, v[0].map(|v| v as f64), v[1].map(|v| v as f64)))
                    .fold(f64::INFINITY, f64::min);
                assert!(d <= (FLATNESS + 2 * i64::from(MAX_DEPTH)) as f64 * 2.0_f64.sqrt());
            }
        }
    }
    fn seg(id: u32, a: Point, z: Point, from: u32, to: u32) -> Segment {
        Segment {
            id,
            a,
            z,
            from,
            to,
            chain: 0,
            component: 0,
        }
    }
    #[test]
    fn exact_predicates_detect_crossing_overlap_foreign_endpoint_and_allow_shared_corner() {
        let a = seg(0, [0, 0], [10, 0], 0, 1);
        assert!(invalid_intersection(&a, &seg(1, [5, -5], [5, 5], 2, 3)));
        assert!(invalid_intersection(&a, &seg(1, [5, 0], [15, 0], 2, 3)));
        assert!(invalid_intersection(&a, &seg(1, [10, 0], [10, 5], 2, 3)));
        assert!(!invalid_intersection(&a, &seg(1, [10, 0], [10, 5], 1, 3)));
        assert!(!invalid_intersection(&a, &seg(1, [10, 0], [20, 0], 1, 3)));
    }
    #[test]
    fn nesting_check_detects_changed_containment_without_relying_on_intersections() {
        let mut labels = vec![0u16; 25 * 25];
        for y in 0..25i32 {
            for x in 0..25i32 {
                let r = (x - 12).abs().max((y - 12).abs());
                labels[(y * 25 + x) as usize] = match r {
                    0..=1 => 2,
                    4..=7 => 1,
                    _ => 0,
                };
            }
        }
        let limits = Limits::default();
        let mut b = Budget::new(&limits);
        let (mut regions, map) = crate::graph::components(&labels, 25, 25, &mut b).unwrap();
        let raw = crate::graph::build(&labels, 25, 25, &map, &mut regions, &mut b).unwrap();
        let src = extract(&raw, &regions, 25, 25, &mut b).unwrap();
        let mut g = assemble(
            &raw,
            &src,
            &RasterParameters::preserve_pixels(),
            0,
            true,
            &mut b,
        )
        .unwrap();
        let tree = make_tree(&g, &mut b).unwrap();
        let before = nesting(&g, &tree, &raw, &src, 25 * GEOMETRY_SCALE, &mut b)
            .unwrap()
            .0;
        // Expand the inner island around the annulus' fixed anchor. Final component
        // positions now have a different nesting map even without a pixel witness heuristic.
        let island = g
            .chains
            .iter()
            .find(|c| c.left_label == 2 || c.right_label == 2)
            .unwrap()
            .clone();
        for id in island.vertex_ids.into_iter().collect::<BTreeSet<_>>() {
            let v = &mut g.vertices[id as usize];
            for ax in 0..2 {
                v.xy[ax] = 25 * GEOMETRY_SCALE / 2 + (v.xy[ax] - 25 * GEOMETRY_SCALE / 2) * 7;
            }
        }
        let tree = make_tree(&g, &mut b).unwrap();
        let after = nesting(&g, &tree, &raw, &src, 25 * GEOMETRY_SCALE, &mut b)
            .unwrap()
            .0;
        assert_ne!(before, after);
    }
}
