use arch_raster_source::*;
use std::collections::{BTreeMap, BTreeSet};
const COLORS: [Rgb; 3] = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
fn document(labels: &[u16], w: u32, h: u32) -> RasterDocument {
    let rgba: Vec<u8> = labels
        .iter()
        .flat_map(|&l| {
            if l == 0 {
                [0, 0, 0, 0]
            } else {
                let c = COLORS[l as usize - 1];
                [c[0], c[1], c[2], 255]
            }
        })
        .collect();
    let options = ProcessingOptions {
        fixed_palette: Some(COLORS.to_vec()),
        design_long_edge_mm: 20.0,
        ..ProcessingOptions::preserve_pixels()
    };
    process_rgba(&rgba, w, h, options).unwrap()
}
fn loop_area(d: &RasterDocument, c: &BoundaryLoop) -> i64 {
    c.edges
        .iter()
        .map(|r| {
            let e = &d.graph.edges[r.edge as usize];
            let a = &d.graph.vertices[if r.reversed { e.to } else { e.from } as usize];
            let b = &d.graph.vertices[if r.reversed { e.from } else { e.to } as usize];
            i64::from(a.x) * i64::from(b.y) - i64::from(b.x) * i64::from(a.y)
        })
        .sum()
}
fn audit(d: &RasterDocument) {
    let mut incidence: Vec<Vec<(u32, bool)>> = vec![Vec::new(); d.graph.edges.len()];
    let mut vertex_points = BTreeSet::new();
    let mut edge_points = BTreeSet::new();
    for (i, v) in d.graph.vertices.iter().enumerate() {
        assert_eq!(v.id, i as u32);
        assert!(vertex_points.insert((v.x, v.y)));
        assert!(v.x <= d.width && v.y <= d.height);
    }
    for (i, e) in d.graph.edges.iter().enumerate() {
        assert_eq!(e.id, i as u32);
        assert_ne!(e.left_label, e.right_label);
        let a = &d.graph.vertices[e.from as usize];
        let b = &d.graph.vertices[e.to as usize];
        assert!(edge_points.insert((a.x, a.y, b.x, b.y)));
        assert_eq!(a.x.abs_diff(b.x) + a.y.abs_diff(b.y), 1);
        assert_eq!(e.left_label == 0, e.left_region.is_none());
        assert_eq!(e.right_label == 0, e.right_region.is_none());
    }
    for (i, r) in d.regions.iter().enumerate() {
        assert_eq!(r.id, i as u32);
        assert_eq!(
            r.loops.iter().map(|c| loop_area(d, c)).sum::<i64>(),
            r.pixel_count as i64 * 2
        );
        assert!(!r.loops.is_empty());
        for c in &r.loops {
            assert!(c.edges.len() >= 4);
            let mut endpoint = None;
            let mut start = None;
            for de in &c.edges {
                let e = &d.graph.edges[de.edge as usize];
                let (from, to, region, label) = if de.reversed {
                    (e.to, e.from, e.left_region, e.left_label)
                } else {
                    (e.from, e.to, e.right_region, e.right_label)
                };
                assert_eq!(region, Some(r.id));
                assert_eq!(label, r.label);
                if let Some(last) = endpoint {
                    assert_eq!(last, from);
                } else {
                    start = Some(from);
                }
                endpoint = Some(to);
                incidence[de.edge as usize].push((r.id, de.reversed));
            }
            assert_eq!(endpoint, start);
        }
    }
    for (e, uses) in d.graph.edges.iter().zip(&incidence) {
        assert_eq!(
            uses.len(),
            usize::from(e.left_label != 0) + usize::from(e.right_label != 0)
        );
        if uses.len() == 2 {
            assert_ne!(uses[0].1, uses[1].1);
            assert_ne!(uses[0].0, uses[1].0);
        }
    }
    assert_eq!(
        d.regions.iter().map(|r| r.pixel_count).sum::<u64>(),
        d.labels.iter().filter(|&&l| l != 0).count() as u64
    );
    for p in &d.palette {
        assert_eq!(
            p.final_pixels,
            d.labels.iter().filter(|&&l| l == p.label).count() as u64
        );
        let ids = d.source_material_contour_vertex_ids(p.label).unwrap();
        for c in ids {
            assert_eq!(c.first(), c.last());
        }
    }
}
#[test]
fn two_rectangles_have_one_ten_mm_seam_and_exact_golden() {
    let d = document(&[1, 2], 2, 1);
    audit(&d);
    assert_eq!(d.graph.vertices.len(), 6);
    assert_eq!(d.graph.edges.len(), 7);
    let seam: Vec<_> = d
        .graph
        .edges
        .iter()
        .filter(|e| e.left_label != 0 && e.right_label != 0)
        .collect();
    assert_eq!(seam.len(), 1);
    let a = d.source_point_mm(seam[0].from).unwrap();
    let b = d.source_point_mm(seam[0].to).unwrap();
    assert_eq!(a, [10.0, 0.0]);
    assert_eq!(b, [10.0, 10.0]);
    let expected: serde_json::Value =
        serde_json::from_str(include_str!("fixtures/grid-2x1-golden.json")).unwrap();
    assert_eq!(
        serde_json::json!({"labels":d.labels,"graph":d.graph,"regions":d.regions}),
        expected
    );
}
#[test]
fn t_junction_has_three_incident_shared_edges() {
    let d = document(&[1, 1, 2, 3], 2, 2);
    audit(&d);
    let center = d
        .graph
        .vertices
        .iter()
        .find(|v| (v.x, v.y) == (1, 1))
        .unwrap();
    let mut labels = BTreeSet::new();
    let edges: Vec<_> = d
        .graph
        .edges
        .iter()
        .filter(|e| e.from == center.id || e.to == center.id)
        .collect();
    assert_eq!(edges.len(), 3);
    for e in edges {
        labels.insert(e.left_label);
        labels.insert(e.right_label);
    }
    assert_eq!(labels, BTreeSet::from([1, 2, 3]));
}
#[test]
fn hole_winding_and_disconnected_accent_are_preserved() {
    let d = document(&[1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 1, 0, 0], 5, 3);
    audit(&d);
    let mut regions = d.regions.iter().filter(|r| r.label == 1);
    let ring = regions.next().unwrap();
    let accent = regions.next().unwrap();
    assert_eq!((ring.pixel_count, accent.pixel_count), (8, 1));
    assert_eq!(ring.loops.len(), 2);
    assert_eq!(accent.loops.len(), 1);
    let mut areas: Vec<_> = ring.loops.iter().map(|c| loop_area(&d, c)).collect();
    areas.sort();
    assert_eq!(areas, [-2, 18]);
    assert_eq!(d.labels[6], 0);
}
#[test]
fn crop_border_is_exact_and_not_background_by_default() {
    let d = document(&[1, 1, 2, 2, 1, 1, 2, 2], 4, 2);
    audit(&d);
    assert_eq!(d.regions.len(), 2);
    assert!(d.regions.iter().all(|r| r.touches_border));
    assert_eq!(d.labels.iter().filter(|&&l| l == 1).count(), 4);
    assert_eq!(d.transform.width_mm, 20.0);
    assert_eq!(d.transform.height_mm, 10.0);
}
#[test]
fn diagonal_contacts_do_not_join_four_connected_islands() {
    let d = document(&[1, 2, 2, 1], 2, 2);
    audit(&d);
    assert_eq!(d.regions.len(), 4);
    assert!(d
        .regions
        .iter()
        .all(|r| r.pixel_count == 1 && r.loops.len() == 1));
}
#[test]
fn exhaustive_binary_three_by_three_area_incidence_and_closure() {
    for bits in 0..512 {
        let labels: Vec<u16> = (0..9).map(|i| ((bits >> i) & 1) as u16).collect();
        audit(&document(&labels, 3, 3));
    }
}
#[test]
fn exhaustive_three_label_two_by_three_with_void() {
    for mut code in 0..729 {
        let mut labels = Vec::new();
        for _ in 0..6 {
            labels.push((code % 3) as u16);
            code /= 3;
        }
        audit(&document(&labels, 3, 2));
    }
}
#[test]
fn repeat_has_identical_labels_graph_regions_and_proposal() {
    let a = document(&[1, 1, 2, 0, 3, 2, 1, 3, 3], 3, 3);
    for _ in 0..5 {
        let b = document(&[1, 1, 2, 0, 3, 2, 1, 3, 3], 3, 3);
        assert_eq!(a.graph, b.graph);
        assert_eq!(a.regions, b.regions);
        assert_eq!(a.labels, b.labels);
        assert_eq!(a.proposal_hash, b.proposal_hash);
    }
}
#[test]
fn each_internal_seam_is_shared_even_with_multiple_disconnected_regions() {
    let d = document(&[1, 2, 1, 2, 1, 2, 1, 2, 1], 3, 3);
    audit(&d);
    let mut lengths = BTreeMap::new();
    for e in &d.graph.edges {
        if e.left_label != 0 && e.right_label != 0 {
            *lengths
                .entry((
                    e.left_label.min(e.right_label),
                    e.left_label.max(e.right_label),
                ))
                .or_insert(0) += 1;
        }
    }
    assert_eq!(lengths.get(&(1, 2)), Some(&12));
}
