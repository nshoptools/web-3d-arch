//! Owned, pointer-free arrays for a host's native view or FlatBuffers binding.
//! These records are not an authorization and contain no mesh.
use crate::*;
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(C)]
pub struct FlatEdge {
    pub from: u32,
    pub to: u32,
    pub left_label: u32,
    pub right_label: u32,
    pub left_region: u32,
    pub right_region: u32,
    pub chain: u32,
    pub reserved: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(C)]
pub struct FlatLoop {
    pub first_index: u32,
    pub index_count: u32,
    pub region: u32,
    pub label: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[repr(C)]
pub struct FlatChain {
    pub first_edge: u32,
    pub edge_count: u32,
    pub first_source_edge: u32,
    pub source_edge_count: u32,
    pub first_curve: u32,
    pub curve_count: u32,
    pub component: u32,
    pub reserved: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FlatGeometry {
    pub units_per_pixel: i64,
    /// Interleaved x0,y0,x1,y1 and so on; IDs are indices / 2.
    pub xy: Vec<i64>,
    /// u32::MAX for derived interior vertices.
    pub source_vertex_ids: Vec<u32>,
    pub edges: Vec<FlatEdge>,
    pub loops: Vec<FlatLoop>,
    pub indices: Vec<u32>,
    pub chains: Vec<FlatChain>,
    /// raw edge_id*2 + reversed; preserves original graph provenance.
    pub source_edges: Vec<u32>,
    /// Six coordinates per quadratic: start x/y, control x/y, end x/y.
    pub curves: Vec<[i64; 6]>,
}
fn allocate<T>(n: usize) -> Result<Vec<T>, RasterError> {
    let mut v = Vec::new();
    v.try_reserve_exact(n)
        .map_err(|_| error(ErrorCode::MemoryLimit, "Flat buffer allocation refused"))?;
    Ok(v)
}
impl RasterDocument {
    /// Owned proposal arrays, available for preview BEFORE confirmation.
    /// Host must check requires_confirmation and its acceptance transaction before
    /// manufacturing. max_bytes covers these NEW flat arrays, in addition to self.
    pub fn flat_geometry(&self, max_bytes: u64) -> Result<FlatGeometry, RasterError> {
        if max_bytes == 0 || max_bytes > 512 * 1024 * 1024 {
            return Err(error(
                ErrorCode::InvalidOptions,
                "Invalid flat buffer byte cap",
            ));
        }
        let g = &self.geometry;
        if g.vertices.len() > self.options.limits.max_vertices as usize
            || g.edges.len() > self.options.limits.max_edges as usize
        {
            return Err(error(ErrorCode::GraphLimit, "Flat graph limit"));
        }
        let source_count = g
            .chains
            .iter()
            .map(|c| c.source_edges.len() as u64)
            .sum::<u64>();
        let curve_count = g.chains.iter().map(|c| c.curves.len() as u64).sum::<u64>();
        let mut index_count = 0u64;
        for l in &g.loops {
            let mut n = 1u64;
            for r in &l.chains {
                let c = g.chains.get(r.chain as usize).ok_or_else(|| {
                    error(
                        ErrorCode::InvariantViolation,
                        "Invalid flat chain reference",
                    )
                })?;
                if c.vertex_ids.len() < 2 {
                    return Err(error(ErrorCode::InvariantViolation, "Empty flat chain"));
                }
                n = n
                    .checked_add(c.vertex_ids.len() as u64 - 1)
                    .ok_or_else(|| error(ErrorCode::MemoryLimit, "Flat index overflow"))?;
            }
            index_count = index_count
                .checked_add(n)
                .ok_or_else(|| error(ErrorCode::MemoryLimit, "Flat index count overflow"))?;
        }
        if index_count > u64::from(u32::MAX)
            || source_count > u64::from(u32::MAX)
            || curve_count > u64::from(u32::MAX)
        {
            return Err(error(ErrorCode::GraphLimit, "Flat offsets exceed u32"));
        }
        let size = g.vertices.len() as u64 * 20
            + g.edges.len() as u64 * 32
            + g.loops.len() as u64 * 16
            + index_count * 4
            + g.chains.len() as u64 * 32
            + source_count * 4
            + curve_count * 48;
        if size > max_bytes {
            return Err(error(
                ErrorCode::MemoryLimit,
                "Flat buffers exceed host cap",
            ));
        }
        let mut out = FlatGeometry {
            units_per_pixel: GEOMETRY_SCALE,
            xy: allocate(g.vertices.len() * 2)?,
            source_vertex_ids: allocate(g.vertices.len())?,
            edges: allocate(g.edges.len())?,
            loops: allocate(g.loops.len())?,
            indices: allocate(index_count as usize)?,
            chains: allocate(g.chains.len())?,
            source_edges: allocate(source_count as usize)?,
            curves: allocate(curve_count as usize)?,
        };
        for (id, v) in g.vertices.iter().enumerate() {
            if v.id as usize != id {
                return Err(error(
                    ErrorCode::InvariantViolation,
                    "Non-dense flat vertex ID",
                ));
            }
            self.point_mm(v.id)?; // finite/domain validation, without changing exact dyadic storage
            out.xy.extend_from_slice(&v.xy);
            out.source_vertex_ids
                .push(v.source_vertex.unwrap_or(u32::MAX));
        }
        for c in &g.chains {
            let first_edge = out.edges.len() as u32;
            for v in c.vertex_ids.windows(2) {
                if v[0] as usize >= g.vertices.len() || v[1] as usize >= g.vertices.len() {
                    return Err(error(
                        ErrorCode::InvariantViolation,
                        "Invalid flat vertex reference",
                    ));
                }
                out.edges.push(FlatEdge {
                    from: v[0],
                    to: v[1],
                    left_label: u32::from(c.left_label),
                    right_label: u32::from(c.right_label),
                    left_region: c.left_region.unwrap_or(u32::MAX),
                    right_region: c.right_region.unwrap_or(u32::MAX),
                    chain: c.id,
                    reserved: 0,
                });
            }
            let first_source_edge = out.source_edges.len() as u32;
            for r in &c.source_edges {
                if r.edge as usize >= self.graph.edges.len() {
                    return Err(error(
                        ErrorCode::InvariantViolation,
                        "Invalid source edge provenance",
                    ));
                }
                out.source_edges.push(r.edge * 2 + u32::from(r.reversed));
            }
            let first_curve = out.curves.len() as u32;
            for q in &c.curves {
                out.curves.push([
                    q.from[0],
                    q.from[1],
                    q.control[0],
                    q.control[1],
                    q.to[0],
                    q.to[1],
                ]);
            }
            out.chains.push(FlatChain {
                first_edge,
                edge_count: out.edges.len() as u32 - first_edge,
                first_source_edge,
                source_edge_count: c.source_edges.len() as u32,
                first_curve,
                curve_count: c.curves.len() as u32,
                component: c.component,
                reserved: 0,
            });
        }
        if out.edges.len() != g.edges.len() {
            return Err(error(
                ErrorCode::InvariantViolation,
                "Flat edge count mismatch",
            ));
        }
        for l in &g.loops {
            let r = self
                .regions
                .get(l.source_region as usize)
                .ok_or_else(|| error(ErrorCode::InvariantViolation, "Invalid flat region"))?;
            let first_index = out.indices.len() as u32;
            out.indices.extend(g.loop_vertex_ids(l)?);
            out.loops.push(FlatLoop {
                first_index,
                index_count: out.indices.len() as u32 - first_index,
                region: r.id,
                label: u32::from(r.label),
            });
        }
        Ok(out)
    }
}
