use super::*;
fn work()->FloatWork{FloatWork{left:1000000,used:0,generation:1}}
#[test]
fn float_exact_coplanar_matches_independent_separating_axes_grid(){
 // Integer right triangles, closed-set SAT oracle (contacts count). Vertex IDs
 // are disjoint here, so even a single geometric contact must be reported.
 let a=[[0i128,0,0],[2,0,0],[0,2,0]];
 for dx in -4..=4i128{for dy in -4..=4i128{let b=a.map(|p|[p[0]+dx,p[1]+dy,0]);let mut separated=false;
  for t in [a,b]{for i in 0..3{let u=t[i];let v=t[(i+1)%3];let axis=[u[1]-v[1],v[0]-u[0]];let proj=|p:[i128;3]|p[0]*axis[0]+p[1]*axis[1];let x=a.map(proj);let y=b.map(proj);if x.iter().max()<y.iter().min()||y.iter().max()<x.iter().min(){separated=true}}}
  for reversed in [false,true]{let mut vertices=a.to_vec();vertices.extend(b);let tri=if reversed{[5,4,3]}else{[3,4,5]};assert_eq!(fi_triangles_intersect(&vertices,[0,1,2],tri).unwrap(),!separated,"{dx},{dy}");assert_eq!(fi_triangles_intersect(&vertices,tri,[0,1,2]).unwrap(),!separated);}
 }}
}
#[test]
fn float_exact_non_coplanar_crossings_and_contacts(){
 let p=vec![[0,0,0],[4,0,0],[0,4,0],[1,1,-1],[1,1,1],[3,1,0],[10,1,-1],[10,1,1],[12,1,0],[0,1,-1],[1,0,-1],[2,0,0]];
 assert!(fi_triangles_intersect(&p,[0,1,2],[3,4,5]).unwrap());assert!(!fi_triangles_intersect(&p,[0,1,2],[6,7,8]).unwrap());
 assert!(!fi_triangles_intersect(&p,[0,1,2],[0,9,10]).unwrap());assert!(fi_triangles_intersect(&p,[0,1,2],[11,9,10]).unwrap());
}
#[test]
fn float_exact_shared_edge_and_coplanar_overlap(){
 let p=vec![[0,0,0],[4,0,0],[0,4,0],[0,-4,0],[1,2,0],[0,0,4]];
 assert!(!fi_triangles_intersect(&p,[0,1,2],[1,0,3]).unwrap());assert!(fi_triangles_intersect(&p,[0,1,2],[1,0,4]).unwrap());assert!(!fi_triangles_intersect(&p,[0,1,2],[1,0,5]).unwrap());
}
#[test]
fn float_full_link_rejects_tetrahedron_edge_contraction(){
 let mut triangles=vec![0,2,1,0,1,3,0,3,2,1,2,3];let mut faces=vec![0,1,2,3];
 assert_eq!(float_link_collapse(&mut triangles,&mut faces,0,1,&mut Vec::new(),&mut work()).unwrap_err(),"FLOAT_CONDITIONING_LINK_CONDITION");
}
#[test]
fn float_subdivided_tetrahedron_edge_has_exact_face_correspondence(){
 // Subdivide edge0->1 by vertex4. Inverse subdivision is topologically valid;
 // both collapsed triangle images are existing edges of the recovered surface.
 let mut t=vec![0,2,4,4,2,1,0,4,3,4,1,3,0,3,2,1,2,3];let mut ids=(0..6).collect();let mut removed=Vec::new();let before=float_topology(5,&t,&mut work()).unwrap();
 float_link_collapse(&mut t,&mut ids,0,4,&mut removed,&mut work()).unwrap();assert_eq!(removed,vec![0,2]);assert_eq!(ids,vec![1,3,4,5]);assert_eq!(before.1[0].euler,2);
 let after=float_topology(4,&t,&mut work()).unwrap();assert_eq!(after.1[0].euler,2);assert_eq!(t,vec![0,2,1,0,1,3,0,3,2,1,2,3]);
}
#[test]
fn float_topology_rejects_duplicate_face_and_pinched_links(){
 let mut tetra=vec![0,2,1,0,1,3,0,3,2,1,2,3];tetra.extend([0,2,1]);assert_eq!(float_topology(4,&tetra,&mut work()).unwrap_err(),"FLOAT_CONDITIONING_DUPLICATE_FACE");
 let pinched=vec![0,2,1,0,1,3,0,3,2,1,2,3,0,5,4,0,4,6,0,6,5,4,5,6];assert_eq!(float_topology(7,&pinched,&mut work()).unwrap_err(),"FLOAT_CONDITIONING_VERTEX_LINK");
}
#[test]
fn float_exact_range_is_fail_closed(){
 assert_eq!(float_exact(&[f32::from_bits(1)as f64,0.,0.,10000.,0.,0.]).unwrap_err(),"FLOAT_CONDITIONING_EXACT_RANGE");
 assert_eq!(fi_mul(i128::MAX,2).unwrap_err(),"FLOAT_CONDITIONING_EXACT_RANGE");
 let v=vec![[0,0,0],[2,0,0],[4,0,0]];assert_eq!(float_embedding(&v,&[0,1,2],&mut work()).unwrap_err(),"FLOAT_CONDITIONING_DEGENERATE_FACE");
}
#[test]
fn float_outward_vertex_bound_covers_affine_triangle_domain(){
 // Exhaust dyadic barycentric coefficients on a moved triangle. The actual
 // bound used in the proof comes from vertices, by convexity of the norm.
 let p=[[1.000000001,2.000000001,3.000000001],[2.000000004,2.000000003,3.000000002],[1.000000002,3.000000004,3.000000005]];
 let q=p.map(|p|p.map(|x|x as f32 as f64));let mut bound=0f64;
 for i in 0..3{let mut upper=0f64;for k in 0..3{let delta=FloatInterval::point(p[i][k]).sub(FloatInterval::point(q[i][k]));let d=delta.lo.abs().max(delta.hi.abs());upper=(upper+(d*d).next_up()).next_up()}bound=bound.max(upper.sqrt().next_up())}
 for i in 0..=16{for j in 0..=16-i{let weights=[i as f64/16.,j as f64/16.,(16-i-j)as f64/16.];let d:[f64;3]=std::array::from_fn(|k|(0..3).map(|a|weights[a]*(p[a][k]-q[a][k])).sum());assert!(d.iter().map(|x|x*x).sum::<f64>().sqrt()<=bound);}}
}

#[test]
fn float_torus_hole_survives_inverse_edge_subdivision(){
 let mut source=Vec::new();let id=|i:usize,j:usize|((i%4)*4+j%4)as u32;
 for i in 0..4{for j in 0..4{let(a,b,c,d)=(id(i,j),id(i+1,j),id(i+1,j+1),id(i,j+1));source.extend([a,b,c,a,c,d]);}}
 let before=float_topology(16,&source,&mut work()).unwrap();assert_eq!(before.1.len(),1);assert_eq!(before.1[0].euler,0);
 let mut subdivided=Vec::new();for t in source.chunks_exact(3){if t.contains(&0)&&t.contains(&4){let j=(0..3).find(|&j|sorted_edge(t[j],t[(j+1)%3])==[0,4]).unwrap();subdivided.extend([t[j],16,t[(j+2)%3],16,t[(j+1)%3],t[(j+2)%3]]);}else{subdivided.extend(t)}}
 let mut ids=(0..subdivided.len()as u32/3).collect();float_link_collapse(&mut subdivided,&mut ids,0,16,&mut Vec::new(),&mut work()).unwrap();let after=float_topology(16,&subdivided,&mut work()).unwrap();assert_eq!(after.1[0].euler,0);assert_eq!(after.1[0].faces,32);
}
