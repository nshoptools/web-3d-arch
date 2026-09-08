// Raw residual bounds, conditional contact fallback, then final-facet intervals.
// No rays, new triangulation, custom solid Boolean, or material offsets.
void Builder::verify_tunnels(const std::vector<Piece>& final_parts){
  struct I {double lo,hi;};
  auto exact=[](double x){return I{x,x};};
  auto widen=[](double lo,double hi){return I{std::nextafter(lo,-INFINITY),std::nextafter(hi,INFINITY)};};
  auto plus=[&](I a,I b){return widen(a.lo+b.lo,a.hi+b.hi);};
  auto minus=[&](I a,I b){return widen(a.lo-b.hi,a.hi-b.lo);};
  auto times=[&](I a,I b){double v[]={a.lo*b.lo,a.lo*b.hi,a.hi*b.lo,a.hi*b.hi};return widen(*std::min_element(v,v+4),*std::max_element(v,v+4));};
  auto divide=[&](I a,I b){need(b.lo>0||b.hi<0,"STRAP_GUARD_UNRESOLVED_PROJECTION",AM_F_strapZ);return times(a,widen(1/b.hi,1/b.lo));};
  auto sign=[&](I a,int s){return s>0?a:I{-a.hi,-a.lo};};
  for(const auto& guard:tunnels){
    checkpoint();
    std::vector<Manifold> ms;for(const auto& p:final_parts)if(p.group==0)ms.push_back(p.mesh);
    const auto solid=evaluate(Manifold::BatchBoolean(ms,manifold::OpType::Add));
    // Filling only the bounded requested tunnel turns any breakout into a
    // zero-clearance outer face. A disconnected higher solid cannot hide it.
    const auto cutter=evaluate(guard.cutter),filled=evaluate(solid+cutter);
    const double library_bound=std::max({solid.GetTolerance(),filled.GetTolerance(),cutter.GetTolerance()});
    const double csg_budget=std::min({1e-7,r.mating_tolerance_mm/1000,r.export_tolerance_mm/1000});
    // Opening integrity is constructive: strap() subtracts the identical
    // full cutter from EVERY host material. The only subsequent material
    // operation is partition subtraction; no later add can plug it.
    // Re-intersecting rounded coincident surfaces is not an independent proof.
    auto uniform_proof=[&](){
      // A stronger sufficient condition when a near-vertical projection cannot
      // be resolved: a continuous uniform roof/floor over the ENTIRE cutter
      // shadow. Heights are measured from existing FINAL material, never an
      // arbitrarily selected test skin. Detached higher/lower pieces cannot
      // fill a gap at the envelope's start face.
      // The cutter was clipped to this very prism. Using its complete
      // footprint is a conservative superset of the cutter shadow and avoids
      // introducing a separately rounded/possibly smaller projection polygon.
      const auto& shadow=footprint;
      need(!shadow.IsEmpty(),"STRAP_GUARD_EMPTY_SHADOW",guard.field);
      const auto cb=cutter.BoundingBox();
      auto residual=[&](const Manifold& m){
        auto raw=evaluate(m);need(raw.GetTolerance()<=csg_budget,"STRAP_GUARD_NUMERIC_BUDGET",guard.field);
        return raw;
      };
      need(cb.min.z>body_z&&cb.max.z<body_z+body_h,"FINAL_STRAP_ENVELOPE_NOT_INTERNAL",guard.field);
      const auto above=residual(prism(shadow,cb.max.z,body_z+body_h)-solid);
      const auto below=residual(prism(shadow,body_z,cb.min.z)-solid);
      double roof=(above.IsEmpty()?body_z+body_h:above.BoundingBox().min.z)-cb.max.z-csg_budget;
      double floor=cb.min.z-(below.IsEmpty()?body_z:below.BoundingBox().max.z)-csg_budget;
      bool faceted_envelope=false;
      if(!(roof>0&&floor>0)){
        guard_source_resolution(csg_budget,guard.field);
        // A positive recessed void can retain zero-thickness contact faces in
        // the SAME component, so its bbox is not a useful nearest missing Z.
        // Choose actual horizontal levels from the FINAL union and test the
        // complete intervening volumes instead. No sampled ray can accept.
        const double half_budget=csg_budget/2;
        if(solid.GetTolerance()>half_budget)return false;
        const auto mesh=solid.GetMeshGL64();
        need(mesh.NumTri()<=50000,"STRAP_GUARD_FACE_BUDGET",guard.field);
        double top=body_z+body_h,bottom=body_z;
        for(size_t t=0;t<mesh.triVerts.size();t+=3){
          checkpoint();const double z=mesh.vertProperties[mesh.triVerts[t]*mesh.numProp+2];
          if(z!=mesh.vertProperties[mesh.triVerts[t+1]*mesh.numProp+2]||z!=mesh.vertProperties[mesh.triVerts[t+2]*mesh.numProp+2])continue;
          if(z>cb.max.z&&z<top)top=z;
          if(z<cb.min.z&&z>bottom)bottom=z;
        }
        roof=top-cb.max.z-csg_budget;floor=cb.min.z-bottom-csg_budget;
        if(!(roof>0&&floor>0))return false;
        // This fallback has an explicit finite-source admission limit. Raw
        // positive roof/floor bounds above never need query simplification.
        const auto query_solid=evaluate(solid.AsOriginal().SetTolerance(half_budget));
        auto missing=[&](double lo,double hi){
          auto raw=evaluate(prism(shadow,lo,hi)-query_solid);
          need(raw.GetTolerance()<=half_budget,"STRAP_GUARD_NUMERIC_BUDGET",guard.field);
          need(raw.NumTri()<=50000,"STRAP_GUARD_FACE_BUDGET",guard.field);
          return evaluate(raw.AsOriginal().Simplify(half_budget));
        };
        roof=floor=0;
        // At most four interior planes derived from each measured face avoid
        // coplanar end-face artifacts. EVERY query starts at the same tunnel
        // envelope and proves its entire volume; it cannot skip a detached
        // roof/floor gap. Independent queries reuse the original query_solid,
        // never a previously simplified residual, so their budgets do not add.
        for(unsigned refinement=0;refinement<=4&&!(roof>0&&floor>0);refinement++){
          if(!(roof>0)&&top-cb.max.z>csg_budget){
            const auto upper=missing(cb.max.z,top);
            roof=(upper.IsEmpty()||upper.Volume()==0?top:upper.BoundingBox().min.z)-cb.max.z-csg_budget;
            if(!(roof>0))top=cb.max.z+(top-cb.max.z)/2;
          }
          if(!(floor>0)&&cb.min.z-bottom>csg_budget){
            const auto lower=missing(bottom,cb.min.z);
            floor=cb.min.z-(lower.IsEmpty()||lower.Volume()==0?bottom:lower.BoundingBox().max.z)-csg_budget;
            if(!(floor>0))bottom=cb.min.z-(cb.min.z-bottom)/2;
          }
        }
        if(!(roof>0&&floor>0))return false;
        faceted_envelope=true;
      }
      feature("guard:strap:roof-floor",2,guard.field,AM_BODY,0,{floor,roof,csg_budget,0,0,0});
      diagnostic(112,guard.field,faceted_envelope?
        "FINAL_STRAP_GUARD CONDITIONAL_FACE_ENVELOPE: source-resolution admission before Boolean-contact cleanup; measured/interior levels; no all-input full-volume proof; manufacturing untouched":
        "FINAL_STRAP_GUARD RAW_ENVELOPE: unsimplified complete-footprint residual Z bounds; manufacturing untouched; backend numeric resolution still applies");
      return true;
    };
    if(uniform_proof())continue;

    struct Face {std::array<vec3,3> p;double x0,x1,y0,y1;I nx,ny,nz;int sign;};
    auto faces=[&](const Manifold& m){
      const auto mesh=m.GetMeshGL64();need(mesh.NumTri()<=50000,"STRAP_GUARD_FACE_BUDGET",guard.field);
      std::vector<Face> result;
      for(size_t t=0;t<mesh.triVerts.size();t+=3){
        Face f{};for(int k=0;k<3;k++)f.p[k]=vec3(&mesh.vertProperties[mesh.triVerts[t+k]*mesh.numProp]);
        const auto a=f.p[0],b=f.p[1],c=f.p[2];
        // Equal projected endpoints prove zero XY area exactly. These are the
        // vertical footprint side faces, including intentional tunnel mouths.
        if((a.x==b.x&&b.x==c.x)||(a.y==b.y&&b.y==c.y))continue;
        if((a.x==b.x&&a.y==b.y)||(b.x==c.x&&b.y==c.y)||(a.x==c.x&&a.y==c.y))continue;
        I u[3],v[3];for(int k=0;k<3;k++){u[k]=minus(exact(b[k]),exact(a[k]));v[k]=minus(exact(c[k]),exact(a[k]));}
        f.nx=minus(times(u[1],v[2]),times(u[2],v[1]));
        f.ny=minus(times(u[2],v[0]),times(u[0],v[2]));
        f.nz=minus(times(u[0],v[1]),times(u[1],v[0]));
        need(f.nz.lo>0||f.nz.hi<0,"STRAP_GUARD_UNRESOLVED_PROJECTION",guard.field);
        f.sign=f.nz.lo>0?1:-1;
        f.x0=std::min({a.x,b.x,c.x});f.x1=std::max({a.x,b.x,c.x});
        f.y0=std::min({a.y,b.y,c.y});f.y1=std::max({a.y,b.y,c.y});result.push_back(f);
      }
      return result;
    };
    std::vector<Face> reference,exterior;
    try{reference=faces(cutter);exterior=faces(filled);}
    catch(const Failure& f){
      if(std::string(f.what())!="STRAP_GUARD_UNRESOLVED_PROJECTION")throw;
      throw Failure(AM_INVALID,guard.field,"FINAL_STRAP_ROOF_FLOOR_UNRESOLVED: uniform envelope not present and projected facet sign unavailable");
    }
    struct Box {double x0,x1,y0,y1;uint32_t depth;};
    auto z=[&](const Face& f,const Box& b){
      auto dx=minus(I{b.x0,b.x1},exact(f.p[0].x)),dy=minus(I{b.y0,b.y1},exact(f.p[0].y));
      return minus(exact(f.p[0].z),divide(plus(times(f.nx,dx),times(f.ny,dy)),f.nz));
    };
    auto edge=[&](const Face& f,int k,const Box& b){
      const auto a=f.p[k],c=f.p[(k+1)%3];
      return sign(minus(times(minus(exact(c.x),exact(a.x)),minus(I{b.y0,b.y1},exact(a.y))),
                        times(minus(exact(c.y),exact(a.y)),minus(I{b.x0,b.x1},exact(a.x)))),f.sign);
    };
    auto outside=[&](const Face& f,const Box& b){for(int k=0;k<3;k++)if(edge(f,k,b).hi<0)return true;return false;};
    auto inside=[&](const Face& f,const Box& b){for(int k=0;k<3;k++)if(edge(f,k,b).lo<=0)return false;return true;};
    double floor=INFINITY,roof=INFINITY,rounding=0;uint64_t boxes=0,pairs=0;uint32_t checked[2]={0,0};
    for(const auto& a:reference){
      bool covered=false;
      for(const auto& b:exterior){
        if(a.sign!=b.sign)continue;
        Box first{std::max(a.x0,b.x0),std::min(a.x1,b.x1),std::max(a.y0,b.y0),std::min(a.y1,b.y1),0};
        if(first.x0>=first.x1||first.y0>=first.y1)continue;
        need(++pairs<=4000000,"STRAP_GUARD_PAIR_BUDGET",guard.field);
        std::vector<Box> pending{first};
        while(!pending.empty()){
          const auto cell=pending.back();pending.pop_back();
          need(++boxes<=4000000,"STRAP_GUARD_CELL_BUDGET",guard.field);checkpoint();
          if(outside(a,cell)||outside(b,cell))continue;
          const auto bz=z(b,cell);
          const auto side=sign(minus(bz,exact(guard.middle)),a.sign);
          if(side.hi<0)continue; // unrelated surface beyond the opposite side
          const auto gap=minus(sign(minus(bz,z(a,cell)),a.sign),exact(2*library_bound));
          if(side.lo>=0&&gap.lo>0){
            auto& minimum=a.sign>0?roof:floor;minimum=std::min(minimum,gap.lo);covered=true;continue;
          }
          const double x=cell.x0+(cell.x1-cell.x0)/2,y=cell.y0+(cell.y1-cell.y0)/2;
          const Box point{x,x,y,y,cell.depth};
          // A strict interior witness may reject; acceptance always requires
          // the interval proof above over every remaining box, never witnesses.
          if(inside(a,point)&&inside(b,point)){
            const auto pz=z(b,point),pside=sign(minus(pz,exact(guard.middle)),a.sign);
            const auto pgap=minus(sign(minus(pz,z(a,point)),a.sign),exact(2*library_bound));
            rounding=std::max(rounding,pgap.hi-pgap.lo);
            if(pside.lo>0)need(pgap.lo>0,a.sign>0?"FINAL_STRAP_ROOF_NOT_POSITIVE_OR_UNRESOLVED":"FINAL_STRAP_FLOOR_NOT_POSITIVE_OR_UNRESOLVED",guard.field);
          }
          need(cell.depth<60&&(x>cell.x0&&x<cell.x1||y>cell.y0&&y<cell.y1),
               a.sign>0?"FINAL_STRAP_ROOF_NOT_POSITIVE_OR_UNRESOLVED":"FINAL_STRAP_FLOOR_NOT_POSITIVE_OR_UNRESOLVED",guard.field);
          if(cell.x1-cell.x0>=cell.y1-cell.y0&&x>cell.x0&&x<cell.x1){
            pending.push_back({cell.x0,x,cell.y0,cell.y1,cell.depth+1});pending.push_back({x,cell.x1,cell.y0,cell.y1,cell.depth+1});
          }else{
            pending.push_back({cell.x0,cell.x1,cell.y0,y,cell.depth+1});pending.push_back({cell.x0,cell.x1,y,cell.y1,cell.depth+1});
          }
        }
      }
      need(covered,"STRAP_GUARD_SURFACE_COVERAGE_UNAVAILABLE",guard.field);checked[a.sign>0?1:0]++;
    }
    need(checked[0]&&checked[1]&&std::isfinite(floor)&&std::isfinite(roof),"STRAP_GUARD_SURFACES_MISSING",guard.field);
    feature("guard:strap:roof-floor",2,guard.field,AM_BODY,0,{floor,roof,2*library_bound+rounding,double(boxes),double(pairs),double(reference.size())});
    diagnostic(112,guard.field,"FINAL_STRAP_GUARD: outward-rounded interval proof over full final faceted roof/floor domain; side mouths excluded; no material skin or geometry adjustment");
  }
}
