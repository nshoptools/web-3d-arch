// Same translation unit; no duplicated constructor, Boolean or triangulator.
void Builder::capture_guard(){
 auto g=std::make_unique<ArchMechGuard>();
 g->scalars.abi_version=2;g->scalars.product=r.product;g->scalars.revision=r.revision;
 g->scalars.schedule=r.schedule;g->scalars.mating_tolerance_mm=r.mating_tolerance_mm;
 g->scalars.export_tolerance_mm=r.export_tolerance_mm;
 g->scalars.source.source_id=r.source.source_id;g->scalars.source.provenance_id=r.source.provenance_id;
 g->cavities=cavities;g->tunnels=tunnels;g->footprint=footprint;
 g->body_z=body_z;g->body_h=body_h;g->rot=rot;g->secondary_x=secondary_x;
 g->info=out.part_info;g->export_blocked=out.export_blocked;g->exact_part_faces.resize(out.parts.size());
 g->source_face_datums.assign(out.triangles.size()/3,UINT32_MAX);
 std::map<std::tuple<uint32_t,double,int>,uint32_t> datum_ids;
 for(uint32_t pi=0;pi<out.parts.size();pi++){
  checkpoint();
  const auto& p=out.parts[pi];const auto& f=out.features[out.part_info[pi].feature_index];
  const auto group=out.part_info[pi].assembly_group;
  const bool source=std::strncmp(f.id,"source:",7)==0;
  for(uint32_t ti=p.triangle_start;ti<p.triangle_start+p.triangle_count;ti++){
   const auto*ix=&out.triangles[3*size_t(ti)];
   const auto face=oriented_face(out.vertices.data(),ix);
   g->exact_group_faces[group].push_back({p.color_rgba,face});
   g->exact_part_faces[pi].push_back({p.color_rgba,face});
   // Mechanical features keep every original facet. A source datum instead
   // identifies the owner's oriented manufacturing plane, not its tessellation.
   if(!source)g->protected_faces.push_back({pi,ti,group,p.color_rgba,face});
   else if(face[2]==face[5]&&face[5]==face[8]){
    const int orientation=datum_orientation(face);
    if(!orientation){g->source_datums_verified=false;continue;}
    const auto key=std::make_tuple(pi,face[2],orientation);
    auto inserted=datum_ids.emplace(key,uint32_t(g->source_datums.size()));
    if(inserted.second)g->source_datums.push_back(
     {pi,group,p.color_rgba,out.part_info[pi].feature_index,face[2],orientation,f.source_id,f.provenance_id});
    g->source_face_datums[ti]=inserted.first->second;
   }
  }
 }
 for(auto& faces:g->exact_group_faces)std::sort(faces.begin(),faces.end());
 for(auto& faces:g->exact_part_faces)std::sort(faces.begin(),faces.end());
 uint64_t guard_bytes=0;
 auto count=[&](const Manifold&m){auto mesh=m.GetMeshGL64();guard_bytes+=mesh.vertProperties.size()*8+mesh.triVerts.size()*8;};
 for(const auto&v:g->cavities){count(v.wall);count(v.opening);}
 for(const auto&v:g->tunnels){count(v.cutter);count(v.opening);}
 uint64_t exact_bytes=0;for(const auto&v:g->exact_group_faces)exact_bytes+=v.size()*sizeof(ArchMechGuard::ExactFace);
 for(const auto&v:g->exact_part_faces)exact_bytes+=v.size()*sizeof(ArchMechGuard::ExactFace);
 // Admission reservation for retained lazy-library graphs, not an assertion
 // that every internal allocation is intercepted or a numeric error bound.
 g->charge=4*1024*1024+32*guard_bytes+g->info.size()*sizeof(ArchMechPartInfo)+g->protected_faces.size()*sizeof(ArchMechGuard::Face)+exact_bytes+g->source_datums.size()*sizeof(ArchMechGuard::SourceDatum)+g->source_face_datums.size()*sizeof(uint32_t);
 need(g->charge<=128ull*1024*1024,"DERIVED_GUARD_RETAINED_RESOURCE_LIMIT",0,AM_UNSUPPORTED);
 out.guard=std::move(g);
}
extern "C" uint32_t arch_mech_derived_guard_version(){return 1;}
extern "C" ArchMechGuard* arch_mech_guard_take(ArchMechResult*r){
 return r&&r->verdict==AM_OK?r->guard.release():nullptr;
}
extern "C" uint64_t arch_mech_guard_charge(const ArchMechGuard*g){return g?g->charge:0;}
extern "C" void arch_mech_guard_destroy(ArchMechGuard*g){delete g;}
static ArchMechResult* check_derived(const ArchMechGuard*g,const ArchMechDerivedView*v,ArchMechControl*c,uint32_t generation,bool append){
 std::unique_ptr<ArchMechResult> out;
 bool acquired=false;
 try{
  out=std::make_unique<ArchMechResult>();
  need(g&&v&&v->abi_version==1,"DERIVED_GUARD_ABI");
  need(!g->export_blocked,"ASSEMBLY_VIEW");
  need(c&&generation&&c->generation==generation&&!c->used.exchange(true),"DERIVED_CONTROL_GENERATION");acquired=true;
  need(v->vertex_count>=4&&v->vertex_count<=1000000&&v->triangle_count>=4&&v->triangle_count<=400000&&v->part_count&&v->part_count<=128,"DERIVED_GUARD_RESOURCE_LIMIT");
  need(v->vertices&&v->triangles&&v->parts&&v->owners&&v->groups&&v->face_origins,"DERIVED_GUARD_POINTER");
  Builder b(g->scalars,*out,c);b.footprint=g->footprint;b.body_z=g->body_z;b.body_h=g->body_h;
  b.cavities=g->cavities;b.tunnels=g->tunnels;out->revision=g->scalars.revision;
  for(size_t i=0;i<size_t(v->vertex_count)*3;i++)need(std::isfinite(v->vertices[i])&&std::abs(v->vertices[i])<=LIMIT,"DERIVED_COORDINATE");
  std::vector<Piece> local;std::vector<Manifold> world,preview;
  std::vector<uint32_t> groups;
  uint32_t next_vertex=0,next_triangle=0;
  for(uint32_t pi=0;pi<v->part_count;pi++){
   b.checkpoint();const auto&p=v->parts[pi];const auto owner=v->owners[pi],group=v->groups[pi];
   need(p.vertex_start==next_vertex&&p.triangle_start==next_triangle&&p.vertex_count>=4&&p.triangle_count>=4&&uint64_t(p.vertex_start)+p.vertex_count<=v->vertex_count&&uint64_t(p.triangle_start)+p.triangle_count<=v->triangle_count,"DERIVED_PART_RANGE");
   next_vertex+=p.vertex_count;next_triangle+=p.triangle_count;
   need(group<3,"DERIVED_ASSEMBLY_GROUP");
   if(owner!=UINT32_MAX)need(owner<g->info.size()&&g->info[owner].assembly_group==group,"DERIVED_OWNER_GROUP_MISMATCH");
   manifold::MeshGL64 mesh;mesh.numProp=3;
   mesh.vertProperties.assign(v->vertices+3*size_t(p.vertex_start),v->vertices+3*size_t(p.vertex_start+p.vertex_count));
   for(size_t t=3*size_t(p.triangle_start);t<3*size_t(p.triangle_start+p.triangle_count);t++){
    const auto ix=v->triangles[t];need(ix>=p.vertex_start&&ix<p.vertex_start+p.vertex_count,"DERIVED_PART_INDEX");mesh.triVerts.push_back(ix-p.vertex_start);
   }
   auto solid=b.evaluate(Manifold(mesh));need(!solid.IsEmpty()&&solid.Volume()>0,"DERIVED_FINAL_TOPOLOGY");
   need(solid.BoundingBox().min.z>=0,"DERIVED_BELOW_MANUFACTURING_BED");
   world.push_back(solid);groups.push_back(group);
   auto assembled=solid;
   if(owner!=UINT32_MAX){
    const auto*t=g->info[owner].preview_transform;
    assembled=b.evaluate(solid.Transform(manifold::mat3x4({{t[0],t[1],t[2]},{t[4],t[5],t[6]},{t[8],t[9],t[10]}},{t[12],t[13],t[14]})));
   }else{
    // New separate parts belong to bed group2. Welding to a moving assembly
    // obtains that target's original owner and transform through the CSG result.
    need(group==2,"DERIVED_IMPORTED_ASSEMBLY_TRANSFORM_REQUIRED");
   }
   preview.push_back(assembled);
   if(g->rot&&group!=2)solid=solid.Rotate(0,0,-g->rot);
   if(group==1)solid=solid.Translate({-g->secondary_x,0,0});
   local.push_back({b.evaluate(solid),0,AM_BODY,group,{AM_BODY,p.color_rgba,1,AM_USER,1}});
  }
  need(next_vertex==v->vertex_count&&next_triangle==v->triangle_count,"DERIVED_PART_COVERAGE");
  if(append){
   need(g->exact_part_faces.size()==g->info.size()&&v->part_count>g->info.size(),"APPEND_GUARD_ORIGINAL_PART_COUNT");
   for(uint32_t pi=0;pi<v->part_count;pi++){
    b.checkpoint();
    if(pi>=g->info.size()){need(v->owners[pi]==UINT32_MAX&&v->groups[pi]==2,"APPEND_GUARD_NEW_PART_IDENTITY");continue;}
    need(v->owners[pi]==pi,"APPEND_GUARD_ORIGINAL_PART_IDENTITY");
    const auto&p=v->parts[pi];std::vector<ArchMechGuard::ExactFace> faces;faces.reserve(p.triangle_count);
    for(uint32_t t=p.triangle_start;t<p.triangle_start+p.triangle_count;t++){
     if(t%1024==0)b.checkpoint();faces.push_back({p.color_rgba,oriented_face(v->vertices,v->triangles+3*size_t(t))});
    }
    std::sort(faces.begin(),faces.end());need(faces==g->exact_part_faces[pi],"APPEND_GUARD_ORIGINAL_PART_CHANGED");
   }
   b.diagnostic(122,0,"EXACT_APPEND: every generated part retains the complete oriented-facet/material multiset from the owned successful product; new parts remain fully checked");
  }
  std::array<std::vector<ArchMechGuard::ExactFace>,3> represented;
  for(uint32_t pi=0;pi<v->part_count;pi++){
   const auto&p=v->parts[pi];auto& faces=represented[v->groups[pi]];
   for(uint32_t t=p.triangle_start;t<p.triangle_start+p.triangle_count;t++){
    if(t%1024==0)b.checkpoint();
    faces.push_back({p.color_rgba,oriented_face(v->vertices,v->triangles+3*size_t(t))});
   }
  }
  std::array<bool,3> unchanged{};
  for(uint32_t i=0;i<3;i++){std::sort(represented[i].begin(),represented[i].end());b.checkpoint();unchanged[i]=represented[i]==g->exact_group_faces[i];}
  const double budget=std::min({1e-7,g->scalars.mating_tolerance_mm/1000,g->scalars.export_tolerance_mm/1000});
  auto raw_query=[&](const Manifold&m){
   auto raw=b.evaluate(m);need(raw.GetTolerance()<=budget,"DERIVED_GUARD_QUERY_UNVERIFIED",0,AM_UNSUPPORTED);
   need(raw.NumTri()<=400000,"DERIVED_GUARD_QUERY_RESOURCE_LIMIT",0,AM_UNSUPPORTED);return raw;
  };
  auto empty=[&](const Manifold&m,const char*error){
   // No Simplify, tolerance increase, volume epsilon, or scalar-zero shortcut.
   // A nonempty contact fragment is unresolved, not proof of missing volume0.
   need(raw_query(m).IsEmpty(),error,0,AM_UNSUPPORTED);
  };
  // Exact AABB separation of OPEN interiors. If max == min on any axis,
  // the intersection is confined to a plane (or less), not positive 3D volume.
  // No tolerance, epsilon, rounded expansion or scalar-volume inference.
  auto disjoint_bounds=[](const Manifold&a,const Manifold&b){
   const auto x=a.BoundingBox(),y=b.BoundingBox();
   return x.max.x<=y.min.x||y.max.x<=x.min.x||x.max.y<=y.min.y||y.max.y<=x.min.y||x.max.z<=y.min.z||y.max.z<=x.min.z;
  };
  uint64_t face_work=0;
  auto unchanged_domain=[&](const Manifold&domain,uint32_t group){
   auto world_domain=domain;if(group==1)world_domain=world_domain.Translate({g->secondary_x,0,0});
   if(g->rot&&group!=2)world_domain=world_domain.Rotate(0,0,g->rot);
   const auto bb=b.evaluate(world_domain).BoundingBox();
   const double margin=budget+64*std::numeric_limits<double>::epsilon()*LIMIT;
   auto select=[&](const std::vector<ArchMechGuard::ExactFace>&all){
    std::vector<ArchMechGuard::ExactFace> selected;
    for(const auto& f:all){
     b.checkpoint();need(++face_work<=20000000,"DERIVED_GUARD_FACE_WORK_LIMIT",0,AM_UNSUPPORTED);
     bool apart=false;for(int axis=0;axis<3;axis++){
      const double lo=std::min({f.second[axis],f.second[axis+3],f.second[axis+6]}),hi=std::max({f.second[axis],f.second[axis+3],f.second[axis+6]});
      if(hi+margin<bb.min[axis]||lo-margin>bb.max[axis]){apart=true;break;}
     }
     if(!apart)selected.push_back(f);
    }return selected;
   };
   // Both lists are sorted multisets. Exact equality preserves every original
   // boundary and admits NO new represented face in this conservative box.
   // Caller provenance or approximate plane/area equality is not used.
   const auto old_faces=select(g->exact_group_faces[group]);
   return !old_faces.empty()&&old_faces==select(represented[group]);
  };
  for(size_t i=0;i<world.size();i++)for(size_t j=0;j<i;j++){
   b.checkpoint();if(append&&i<g->info.size()&&j<g->info.size())continue;
   if(!disjoint_bounds(world[i],world[j]))empty(world[i]^world[j],"DERIVED_MANUFACTURING_COLLISION_UNVERIFIED");
   if(groups[i]!=groups[j]&&!disjoint_bounds(preview[i],preview[j]))empty(preview[i]^preview[j],"DERIVED_ASSEMBLY_COLLISION_UNVERIFIED");
  }
  // Exact complete oriented-facet MULTISET equality preserves an already
  // validated original group. A subset, same area, or caller ancestry is not
  // this certificate. Changed groups can never use raw-source cleanup.
  std::array<Manifold,3> final_solids;
  for(uint32_t group=0;group<3;group++){
   std::vector<Manifold> parts;for(const auto&p:local)if(p.group==group)parts.push_back(p.mesh);
   final_solids[group]=b.evaluate(Manifold::BatchBoolean(parts,manifold::OpType::Add));
  }
  need(b.cavities.size()<=4096,"DERIVED_CAVITY_RESOURCE_LIMIT",0,AM_UNSUPPORTED);
  for(const auto& guard:b.cavities)if(!unchanged[guard.group]){
   b.checkpoint();const auto& solid=final_solids[guard.group];
   auto missing=raw_query(prism(guard.roof,guard.bottom,guard.ceiling)-solid);
   const double roof=(missing.IsEmpty()?guard.ceiling:missing.BoundingBox().min.z-budget)-guard.bottom;
   need(roof>0,"DERIVED_CAVITY_ROOF_UNVERIFIED "+guard.id,guard.field,AM_UNSUPPORTED);
   if(!unchanged_domain(guard.wall,guard.group))empty(guard.wall-solid,"DERIVED_CAVITY_WALL_UNVERIFIED");
   if(!unchanged_domain(guard.opening,guard.group))empty(guard.opening^solid,"DERIVED_CAVITY_OPENING_UNVERIFIED");
   b.feature("guard:wall-roof:"+guard.id,2,guard.field,guard.group?AM_FASTENER:AM_BODY,guard.group,
    {guard.bottom,guard.ceiling,roof,guard.nominal_wall,guard.flexure?1.:0.,budget});
  }
  if(!b.tunnels.empty()&&!unchanged[0]){
   std::vector<Manifold> host;for(const auto&p:local)if(p.group==0)host.push_back(p.mesh);
   auto final_host=b.evaluate(Manifold::BatchBoolean(host,manifold::OpType::Add));
   need(!final_host.IsEmpty(),"DERIVED_HOST_MISSING");
   const auto bounds=final_host.BoundingBox();
   b.footprint=final_host.Project();b.body_z=bounds.min.z;b.body_h=bounds.max.z-bounds.min.z;
   for(auto&t:b.tunnels){
    for(double x:{bounds.min.x,bounds.max.x})for(double y:{bounds.min.y,bounds.max.y}){
     const double along=(x-t.cx)*t.dx+(y-t.cy)*t.dy;
     need(std::abs(along)<t.length/2,"DERIVED_TUNNEL_MOUTH_DOMAIN_UNVERIFIED");
    }
    // Later CSG may add material, so the old constructive subtraction proof
    // does not apply. Check the ENTIRE preserved opening volume explicitly.
    // Preserve all represented boundary facets intersecting the complete
    // opening's conservative box, including source lateral/tunnel surfaces.
    // A near-opening cut, parallel-wall breakout or added plug changes this
    // multiset and cannot borrow the original constructive opening guarantee.
    need(unchanged_domain(t.opening,0),"DERIVED_TUNNEL_BOUNDARY_UNVERIFIED",t.field,AM_UNSUPPORTED);
    t.cutter=b.evaluate(t.opening^prism(b.footprint,b.body_z,b.body_z+b.body_h));
    const auto cb=t.cutter.BoundingBox();
    need(cb.min.z>b.body_z&&cb.max.z<b.body_z+b.body_h,"DERIVED_TUNNEL_ENVELOPE_UNVERIFIED",t.field,AM_UNSUPPORTED);
    const auto above=raw_query(prism(b.footprint,cb.max.z,b.body_z+b.body_h)-final_host);
    const auto below=raw_query(prism(b.footprint,b.body_z,cb.min.z)-final_host);
    const double roof=(above.IsEmpty()?b.body_z+b.body_h:above.BoundingBox().min.z)-cb.max.z-budget;
    const double floor=cb.min.z-(below.IsEmpty()?b.body_z:below.BoundingBox().max.z)-budget;
    need(roof>0&&floor>0,"DERIVED_TUNNEL_ROOF_FLOOR_UNVERIFIED",t.field,AM_UNSUPPORTED);
    b.feature("guard:strap:roof-floor",2,t.field,AM_BODY,0,{floor,roof,budget,0,0,0});
   }
  }
  // Keep all constructed mechanical facets exactly, including original owner.
  // Source caps may be retriangulated/cut: each original oriented datum plane
  // must retain a positive represented facet with original generated ancestry,
  // exact owner/material/plane and orientation. Not an inferred label/ray.
  need(g->source_datums_verified,"DERIVED_SOURCE_DATUM_AREA_UNVERIFIED",0,AM_UNSUPPORTED);
  std::set<std::tuple<uint32_t,uint32_t,uint32_t,std::array<double,9>>> faces;
  std::vector<bool> witnessed(g->source_datums.size(),false);
  for(uint32_t pi=0;pi<v->part_count;pi++){
   const auto&p=v->parts[pi];const auto owner=v->owners[pi],group=v->groups[pi];
   for(uint32_t t=p.triangle_start;t<p.triangle_start+p.triangle_count;t++){
    if(t%1024==0)b.checkpoint();
    const auto face=oriented_face(v->vertices,v->triangles+3*size_t(t));
    faces.emplace(owner,group,p.color_rgba,face);
    const auto* origin=v->face_origins+4*size_t(t);
    if(origin[0]!=0||origin[1]!=owner||origin[3]!=0||origin[2]>=g->source_face_datums.size())continue;
    const auto id=g->source_face_datums[origin[2]];
    if(id==UINT32_MAX)continue;
    const auto& datum=g->source_datums[id];
    if(datum.owner!=owner||datum.group!=group||datum.rgba!=p.color_rgba||
       face[2]!=datum.z||face[5]!=datum.z||face[8]!=datum.z)continue;
    if(datum_orientation(face)==datum.orientation)witnessed[id]=true;
   }
  }
  for(const auto&f:g->protected_faces){
   b.checkpoint();
   need(faces.count({f.part,f.group,f.rgba,f.xyz})!=0,
    "DERIVED_MECHANICAL_FEATURE_CHANGED",0,AM_UNSUPPORTED);
  }
  for(bool witness:witnessed){
   b.checkpoint();need(witness,"DERIVED_SOURCE_DATUM_FACE_UNPROVED",0,AM_UNSUPPORTED);
  }
  b.diagnostic(120,0,"POST_CSG_GUARDS: exact unchanged group/query-domain facet multisets or unsimplified final-volume queries; changed tunnel boundary refused; backend numeric limits apply");
  b.diagnostic(121,0,"SOURCE_DATUM_SCOPE: original owner/material/oriented plane retains positive represented generated-ancestry facet; MM/layer records unchanged; no global numeric/fit qualification");
  out->export_blocked=0;b.checkpoint();
 }catch(const Failure&f){
  if(!out)return nullptr;out->verdict=f.verdict;ArchMechDiagnostic d{};d.code=f.verdict;d.field_id=f.field;copystr(d.message,f.what());out->diagnostics.push_back(d);
 }catch(const std::exception&e){
  if(!out)return nullptr;out->verdict=AM_KERNEL_ERROR;ArchMechDiagnostic d{};d.code=AM_KERNEL_ERROR;copystr(d.message,e.what());out->diagnostics.push_back(d);
 }catch(...){if(!out)return nullptr;out->verdict=AM_KERNEL_ERROR;}
 if(out->verdict!=AM_OK)out->export_blocked=1;
 if(acquired)c->stage.store(out->verdict==AM_OK?6:out->verdict==AM_CANCELLED?8:7);
 return out.release();
}
extern "C" ArchMechResult* arch_mech_guard_check(const ArchMechGuard*g,const ArchMechDerivedView*v,ArchMechControl*c,uint32_t generation){return check_derived(g,v,c,generation,false);}
extern "C" ArchMechResult* arch_mech_guard_check_append(const ArchMechGuard*g,const ArchMechDerivedView*v,ArchMechControl*c,uint32_t generation){return check_derived(g,v,c,generation,true);}

