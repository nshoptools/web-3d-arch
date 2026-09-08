Manifold Builder::perimeter_groove(const CrossSection& shape,double radius,double z,uint32_t f){
  // Inside half of the boundary tube. At convex vertices the two incident
  // inward strips already cover the entire inside sphere sector. Adding a
  // complete sphere there is redundant and creates near-tangent CSG slivers
  // on finely flattened source curves. Reentrant vertices require a sector.
  auto disk=circle(radius,true,f,r.mating_tolerance_mm/2);
  auto half=(disk^rect(4*radius,4*radius,2*radius,0)).Translate({0,radius});
  const uint32_t n=std::max(8u,4u*(uint32_t)std::ceil(PI/std::acos(radius/(radius+r.mating_tolerance_mm/4))/4));
  need(n<=4096,"GROOVE_ANGULAR_RESOURCE_LIMIT");
  const double sec=1/std::cos(PI/n);
  std::vector<Manifold> tools;size_t edges=0;
  for(const auto& path:shape.ToPolygons()){
    double area=0;for(size_t i=0;i<path.size();i++){auto a=path[i],b=path[(i+1)%path.size()];area+=a.x*b.y-a.y*b.x;}
    if(area<=0)continue;
    edges+=path.size();need(edges<=512,"GROOVE_EDGE_RESOURCE_LIMIT");
    for(size_t i=0;i<path.size();i++){
      auto a=path[i],b=path[(i+1)%path.size()],d=b-a;const double length=std::hypot(d.x,d.y),angle=std::atan2(d.y,d.x)*180/PI;
      need(length>=2e-6,"GROOVE_EDGE_BELOW_RESOLUTION");
      tools.push_back(Manifold::Extrude(half.ToPolygons(),length).Rotate(90,0,angle+90).Translate({a.x,a.y,z-radius}));
      const auto previous=a-path[(i+path.size()-1)%path.size()];
      const double turn=std::atan2(previous.x*d.y-previous.y*d.x,previous.x*d.x+previous.y*d.y);
      if(turn<0)tools.push_back(Manifold::Revolve(half.Scale({sec,1}).ToPolygons(),n,-turn*180/PI).Rotate(0,0,angle+90).Translate({a.x,a.y,z-radius}));
    }
  }
  out.curves.push_back({f,n,2,0,radius,-2e-8,(radius+r.mating_tolerance_mm/4)*sec-radius+2e-8,r.mating_tolerance_mm});
  const double numericBudget=std::min(1e-7,r.mating_tolerance_mm/1000);
  // Explicit library topology tolerance on the single shared cutter, before
  // applying it to any material. No per-material offset or coordinate weld.
  out.curves.push_back({f,0,2,0,0,-numericBudget,numericBudget,r.mating_tolerance_mm});
  auto tube=evaluate(Manifold::BatchBoolean(tools,manifold::OpType::Add));
  return evaluate(tube.SetTolerance(numericBudget));
}
