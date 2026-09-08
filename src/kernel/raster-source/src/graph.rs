use crate::*;
use std::collections::BTreeMap;
const NONE: u32 = u32::MAX;

fn push<T>(items: &mut Vec<T>, item: T, budget: &mut Budget<'_>) -> Result<(), RasterError> {
    // Reserve accounting includes vector growth slack.
    budget.reserve((std::mem::size_of::<T>() as u64) * 3)?;
    items
        .try_reserve(1)
        .map_err(|_| error(ErrorCode::MemoryLimit, "Graph allocation refused"))?;
    items.push(item);
    Ok(())
}

pub(crate) fn components(
    labels: &[u16],
    w: u32,
    h: u32,
    budget: &mut Budget<'_>,
) -> Result<(Vec<Region>, Vec<u32>), RasterError> {
    let n = labels.len();
    budget.reserve(n as u64 * (4 + std::mem::size_of::<usize>() as u64))?;
    budget.spend(n as u64)?;
    let mut map = buffer(n, NONE)?;
    let mut queue: Vec<usize> = Vec::new();
    queue
        .try_reserve_exact(n)
        .map_err(|_| error(ErrorCode::MemoryLimit, "Region queue allocation refused"))?;
    let mut regions = Vec::new();
    let width = w as usize;
    for start in 0..n {
        if labels[start] == 0 || map[start] != NONE {
            continue;
        }
        if regions.len() >= budget.limits.max_regions as usize {
            return Err(error(
                ErrorCode::RegionLimit,
                "Opaque 4-connected region limit exceeded; no islands were discarded",
            ));
        }
        let id = regions.len() as u32;
        let mut region = Region {
            id,
            label: labels[start],
            pixel_count: 0,
            bounds_px: [w, h, 0, 0],
            touches_border: false,
            loops: Vec::new(),
        };
        queue.clear();
        queue.push(start);
        map[start] = id;
        let mut head = 0;
        while head < queue.len() {
            budget.spend(5)?;
            let p = queue[head];
            head += 1;
            let x = (p % width) as u32;
            let y = (p / width) as u32;
            region.pixel_count += 1;
            region.bounds_px[0] = region.bounds_px[0].min(x);
            region.bounds_px[1] = region.bounds_px[1].min(y);
            region.bounds_px[2] = region.bounds_px[2].max(x + 1);
            region.bounds_px[3] = region.bounds_px[3].max(y + 1);
            region.touches_border |= x == 0 || y == 0 || x + 1 == w || y + 1 == h;
            for next in [
                (x > 0).then(|| p - 1),
                (x + 1 < w).then(|| p + 1),
                (y > 0).then(|| p - width),
                (y + 1 < h).then(|| p + width),
            ]
            .into_iter()
            .flatten()
            {
                if map[next] == NONE && labels[next] == region.label {
                    map[next] = id;
                    queue.push(next);
                }
            }
        }
        push(&mut regions, region, budget)?;
    }
    Ok((regions, map))
}

/// Snapshot-based decisions: background first, then small regions only into an
/// adjacent surviving region already at least minA pixels. No cascading merges.
pub(crate) fn edit_regions(
    labels: &mut [u16],
    w: u32,
    h: u32,
    palette: &[Rgb],
    options: &ProcessingOptions,
    regions: &[Region],
    map: &[u32],
    decisions: &mut ProcessingDecisions,
    budget: &mut Budget<'_>,
) -> Result<bool, RasterError> {
    let mut changed = false;
    budget.reserve(regions.len() as u64)?;
    let mut removed = buffer(regions.len(), false)?;
    if let BackgroundPolicy::ExcludeBoundaryConnected { label_ids } = &options.background {
        if label_ids.iter().any(|id| *id as usize > palette.len()) {
            return Err(error(
                ErrorCode::InvalidOptions,
                "Background ID is absent from this proposal's palette",
            ));
        }
        for r in regions {
            if r.touches_border && label_ids.contains(&r.label) {
                removed[r.id as usize] = true;
                decisions.background_excluded_pixels += r.pixel_count;
                decisions.background_excluded_regions += 1;
            }
        }
        budget.spend(labels.len() as u64)?;
        for (p, id) in labels.iter_mut().zip(map) {
            if *id != NONE && removed[*id as usize] {
                *p = 0;
                changed = true;
            }
        }
    }
    let threshold = u64::from(options.parameters.min_area_pixels);
    if threshold == 0 {
        return Ok(changed);
    }
    budget.reserve(regions.len() as u64 * 32)?;
    let mut contacts: Vec<BTreeMap<u32, u64>> = buffer(regions.len(), BTreeMap::new())?;
    let eligible_source = |id: u32| {
        id != NONE && !removed[id as usize] && regions[id as usize].pixel_count < threshold
    };
    let eligible_target = |id: u32| {
        id != NONE && !removed[id as usize] && regions[id as usize].pixel_count >= threshold
    };
    let mut contact = |a: u32, b: u32, budget: &mut Budget<'_>| -> Result<(), RasterError> {
        if eligible_source(a) && eligible_target(b) {
            let map = &mut contacts[a as usize];
            if !map.contains_key(&b) {
                budget.reserve(512)?;
            }
            *map.entry(b).or_default() += 1;
        }
        Ok(())
    };
    budget.spend(labels.len() as u64 * 8)?;
    for y in 0..h as usize {
        for x in 0..w as usize {
            let p = y * w as usize + x;
            for q in [
                (x + 1 < w as usize).then(|| p + 1),
                (y + 1 < h as usize).then(|| p + w as usize),
            ]
            .into_iter()
            .flatten()
            {
                if labels[p] != labels[q] {
                    contact(map[p], map[q], budget)?;
                    contact(map[q], map[p], budget)?;
                }
            }
        }
    }
    let mut target = buffer(regions.len(), 0u16)?;
    budget.reserve(regions.len() as u64 * 2)?;
    for r in regions {
        if !eligible_source(r.id) {
            continue;
        }
        let from = palette[r.label as usize - 1];
        // Max shared contact; then nearest encoded sRGB; then stable palette/component ID.
        let best = contacts[r.id as usize].iter().min_by_key(|(id, edges)| {
            let to = &regions[**id as usize];
            (
                std::cmp::Reverse(**edges),
                crate::process::distance(from, palette[to.label as usize - 1]),
                to.label,
                to.id,
            )
        });
        if let Some((&to, &edges)) = best {
            target[r.id as usize] = regions[to as usize].label;
            push(
                &mut decisions.merges,
                MergeDecision {
                    source_region: r.id,
                    from_label: r.label,
                    to_label: target[r.id as usize],
                    pixels: r.pixel_count,
                    shared_unit_edges: edges,
                },
                budget,
            )?;
        } else {
            decisions.unmerged_small_regions += 1;
        }
    }
    budget.spend(labels.len() as u64)?;
    for (p, id) in labels.iter_mut().zip(map) {
        if *id != NONE && target[*id as usize] != 0 {
            *p = target[*id as usize];
            changed = true;
        }
    }
    Ok(changed)
}

struct Builder {
    graph: BoundaryGraph,
    corners: Vec<u32>,
    stride: usize,
}
impl Builder {
    fn vertex(&mut self, x: u32, y: u32, budget: &mut Budget<'_>) -> Result<u32, RasterError> {
        let index = y as usize * self.stride + x as usize;
        let old = self.corners[index];
        if old != NONE {
            return Ok(old);
        }
        if self.graph.vertices.len() >= budget.limits.max_vertices as usize {
            return Err(error(ErrorCode::GraphLimit, "Shared vertex limit exceeded"));
        }
        let id = self.graph.vertices.len() as u32;
        push(&mut self.graph.vertices, GridVertex { id, x, y }, budget)?;
        self.corners[index] = id;
        Ok(id)
    }
    fn edge(
        &mut self,
        a: [u32; 2],
        b: [u32; 2],
        left: (u16, Option<u32>),
        right: (u16, Option<u32>),
        budget: &mut Budget<'_>,
    ) -> Result<(), RasterError> {
        if left.0 == right.0 {
            return Ok(());
        }
        if self.graph.edges.len() >= budget.limits.max_edges as usize {
            return Err(error(ErrorCode::GraphLimit, "Shared edge limit exceeded"));
        }
        let from = self.vertex(a[0], a[1], budget)?;
        let to = self.vertex(b[0], b[1], budget)?;
        let id = self.graph.edges.len() as u32;
        push(
            &mut self.graph.edges,
            BoundaryEdge {
                id,
                from,
                to,
                left_label: left.0,
                right_label: right.0,
                left_region: left.1,
                right_region: right.1,
            },
            budget,
        )
    }
}
fn half(
    edge: &BoundaryEdge,
    reversed: bool,
    vertices: &[GridVertex],
) -> (u32, u32, usize, Option<u32>) {
    let (from, to, region) = if reversed {
        (edge.to, edge.from, edge.left_region)
    } else {
        (edge.from, edge.to, edge.right_region)
    };
    let a = &vertices[from as usize];
    let b = &vertices[to as usize];
    let dir = if b.x > a.x {
        0
    } else if b.y > a.y {
        1
    } else if b.x < a.x {
        2
    } else {
        3
    };
    (from, to, dir, region)
}

pub(crate) fn build(
    labels: &[u16],
    w: u32,
    h: u32,
    map: &[u32],
    regions: &mut [Region],
    budget: &mut Budget<'_>,
) -> Result<BoundaryGraph, RasterError> {
    let corner_count = (w as usize + 1) * (h as usize + 1);
    budget.reserve(corner_count as u64 * 4)?;
    budget.spend((u64::from(w) * (u64::from(h) + 1) + u64::from(h) * (u64::from(w) + 1)) * 2)?;
    let mut builder = Builder {
        graph: BoundaryGraph::default(),
        corners: buffer(corner_count, NONE)?,
        stride: w as usize + 1,
    };
    let cell = |x: u32, y: u32| {
        let i = y as usize * w as usize + x as usize;
        (labels[i], if map[i] == NONE { None } else { Some(map[i]) })
    };
    // Exactly one global scan per edge family. Canonical E/S direction, material
    // is on the right for forward halfedges. Y is down; positive outer area.
    for y in 0..=h {
        for x in 0..w {
            let above = if y == 0 { (0, None) } else { cell(x, y - 1) };
            let below = if y == h { (0, None) } else { cell(x, y) };
            builder.edge([x, y], [x + 1, y], above, below, budget)?;
        }
    }
    for x in 0..=w {
        for y in 0..h {
            let west = if x == 0 { (0, None) } else { cell(x - 1, y) };
            let east = if x == w { (0, None) } else { cell(x, y) };
            builder.edge([x, y], [x, y + 1], east, west, budget)?;
        }
    }
    let graph = builder.graph;
    budget.reserve(graph.vertices.len() as u64 * 16 + graph.edges.len() as u64 * 2)?;
    let mut outgoing = buffer(graph.vertices.len(), [NONE; 4])?;
    let mut visited = buffer(graph.edges.len() * 2, false)?;
    for edge in &graph.edges {
        budget.spend(2)?;
        for reversed in [false, true] {
            let (from, _, dir, region) = half(edge, reversed, &graph.vertices);
            if region.is_none() {
                continue;
            }
            let slot = &mut outgoing[from as usize][dir];
            if *slot != NONE {
                return Err(error(
                    ErrorCode::InvariantViolation,
                    "Duplicate directed grid edge",
                ));
            }
            *slot = edge.id * 2 + u32::from(reversed);
        }
    }
    for edge in &graph.edges {
        for reversed in [false, true] {
            let start = edge.id * 2 + u32::from(reversed);
            let (_, _, _, region) = half(edge, reversed, &graph.vertices);
            let Some(region) = region else { continue };
            if visited[start as usize] {
                continue;
            }
            let mut contour = BoundaryLoop { edges: Vec::new() };
            let mut current = start;
            loop {
                budget.spend(5)?;
                if visited[current as usize] {
                    if current == start {
                        break;
                    }
                    return Err(error(
                        ErrorCode::InvariantViolation,
                        "Boundary walk reached another visited halfedge",
                    ));
                }
                visited[current as usize] = true;
                let e = &graph.edges[(current / 2) as usize];
                let rev = current % 2 != 0;
                let (_, to, dir, incident) = half(e, rev, &graph.vertices);
                if incident != Some(region) {
                    return Err(error(
                        ErrorCode::InvariantViolation,
                        "Boundary region changed",
                    ));
                }
                push(
                    &mut contour.edges,
                    DirectedEdge {
                        edge: e.id,
                        reversed: rev,
                    },
                    budget,
                )?;
                let mut next = None;
                // Rightmost continuation separates diagonal contacts and preserves
                // 4-connected islands; choose by topology, never by visited state.
                for turn in [1, 0, 3, 2] {
                    let candidate = outgoing[to as usize][(dir + turn) % 4];
                    if candidate != NONE {
                        let ce = &graph.edges[(candidate / 2) as usize];
                        let (_, _, _, cr) = half(ce, candidate % 2 != 0, &graph.vertices);
                        if cr == Some(region) {
                            next = Some(candidate);
                            break;
                        }
                    }
                }
                current = next.ok_or_else(|| {
                    error(ErrorCode::InvariantViolation, "Unclosed material boundary")
                })?;
            }
            if contour.edges.len() < 4 {
                return Err(error(
                    ErrorCode::InvariantViolation,
                    "Degenerate grid contour",
                ));
            }
            push(&mut regions[region as usize].loops, contour, budget)?;
        }
    }
    Ok(graph)
}
