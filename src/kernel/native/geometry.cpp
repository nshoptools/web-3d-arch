#include "geometry.h"
#include "conditioning-internal.h"
#include <clipper2/clipper.h>
#include <manifold/manifold.h>
#include <hb.h>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <memory>
#include <numeric>
#include <set>
#include <stdexcept>
#include <tuple>
#include <vector>

using namespace Clipper2Lib;
namespace {
constexpr double kGrid = 1000000.;
constexpr int64_t kLimit = 10000000000LL;
constexpr uint32_t kMaxPoints = 200000;
constexpr uint32_t kMaxShapes = 4096;
using GridPoint = std::pair<int64_t, int64_t>;
GridPoint point(const Point64& p) { return {p.x, p.y}; }
// A line uses a primitive direction and a canonical lattice anchor. Check
// the anchor arithmetic before multiplying; no floating point line keys.
using Line = std::tuple<int64_t, int64_t, int64_t, int64_t>;
Line line_key(GridPoint a, GridPoint b) {
  int64_t dx=b.first-a.first, dy=b.second-a.second;
  const int64_t divisor=std::gcd(std::abs(dx),std::abs(dy));
  if(!divisor) throw std::runtime_error("REPEATED_VERTEX");
  dx/=divisor; dy/=divisor;
  if(dx<0 || (dx==0 && dy<0)){dx=-dx;dy=-dy;}
  // Reduced directions can be larger than the anchor. Euclidean quotient
  // chooses one canonical lattice representative on every infinite line.
  // Divide along the larger component. Using dx=1 for an almost vertical
  // in-domain edge can otherwise manufacture a huge, irrelevant anchor.
  const bool use_x=std::abs(dx)>=std::abs(dy);
  const int64_t component=use_x?dx:dy,coordinate=use_x?a.first:a.second;
  int64_t q=coordinate/component;
  if(coordinate%component && ((coordinate%component<0)!=(component<0)))--q;
  const auto limit=std::numeric_limits<int64_t>::max();
  if((dx && std::abs(q)>(limit-std::abs(a.first))/std::abs(dx)) ||
     (dy && std::abs(q)>(limit-std::abs(a.second))/std::abs(dy)))
    throw std::runtime_error("TOPOLOGY_LINE_RANGE");
  return {dx,dy,a.first-q*dx,a.second-q*dy};
}
void fail(char* error,uint32_t cap,const char* message) {
  if(error && cap){std::strncpy(error,message,cap-1);error[cap-1]=0;}
}
bool bounded(const Point64& p){return p.x>=-kLimit&&p.x<=kLimit&&p.y>=-kLimit&&p.y<=kLimit;}
void guard_resolution(const Path64& path){
  // This pinned Clipper2 discards triangles with an edge whose endpoints
  // differ by <2 grid units on both axes (PtsReallyClose). Reject that input
  // explicitly instead of letting an accent/material vanish without a result.
  for(size_t i=0;i<path.size();++i){
    const auto& a=path[i];const auto& b=path[(i+1)%path.size()];
    if(std::abs(a.x-b.x)<2&&std::abs(a.y-b.y)<2)
      throw std::runtime_error("REGION_BELOW_BOOLEAN_RESOLUTION");
  }
}
void clean_paths(Paths64& paths){
  StripDuplicates(paths,true);
  for(const auto& path:paths){
    if(path.size()<3)throw std::runtime_error("BOOLEAN_DEGENERATE_CONTOUR");
    for(const auto& p:path)if(!bounded(p))throw std::runtime_error("BOOLEAN_COORDINATE_RANGE");
  }
}
void checkpoint(const ArchBuildControl* control,uint32_t units){
  if(!control)return;
  if(control->cancelled&&control->cancelled(control->data))throw std::runtime_error("CANCELLED");
  if(control->progress)control->progress(control->data,units);
}
}

struct ArchScene {
  std::vector<double> vertices;
  std::vector<uint32_t> triangles;
  std::vector<ArchPart> parts;
  std::vector<int64_t> points;
  std::vector<ArchContour> contours;
  std::vector<uint32_t> indices;
  std::vector<ArchEdge> edges;
};

struct ArchRegion {
  Paths64 paths;
  std::vector<int64_t> xy;
  std::vector<uint32_t> ends;
  explicit ArchRegion(Paths64 value):paths(std::move(value)){
    clean_paths(paths);
    uint64_t count=0;
    for(const auto& p:paths){count+=p.size();if(count>kMaxPoints)throw std::runtime_error("REGION_COMPLEXITY_LIMIT");}
    xy.reserve((size_t)count*2);
    for(const auto& p:paths){
      for(const auto& v:p){if(!bounded(v))throw std::runtime_error("REGION_COORDINATE_RANGE");xy.push_back(v.x);xy.push_back(v.y);}
      ends.push_back((uint32_t)(xy.size()/2));
    }
  }
};
extern "C" void arch_region_destroy(ArchRegion* region){delete region;}
extern "C" int arch_region_view(const ArchRegion* r,const int64_t** xy,uint32_t* np,const uint32_t** ends,uint32_t* nc){
  if(!r||!xy||!np||!ends||!nc)return 0;
  *xy=r->xy.data();*np=(uint32_t)(r->xy.size()/2);*ends=r->ends.data();*nc=(uint32_t)r->ends.size();return 1;
}
extern "C" ArchRegion* arch_region_create(const int64_t* xy,uint32_t np,const uint32_t* ends,uint32_t nc,uint32_t rule,char* error,uint32_t cap){
  fail(error,cap,"");
  try{
    if(np>kMaxPoints||nc>np/3||rule>1||(np&&(!xy||!ends||!nc))||(!np&&nc))throw std::runtime_error("REGION_INVALID_INPUT");
    if(nc&&ends[nc-1]!=np)throw std::runtime_error("REGION_INVALID_OFFSETS");
    Paths64 paths;uint32_t start=0;
    for(uint32_t i=0;i<nc;++i){
      if(ends[i]<=start||ends[i]>np||ends[i]-start<3)throw std::runtime_error("REGION_INVALID_CONTOUR");
      Path64 path;
      for(;start<ends[i];++start){
        Point64 p(xy[2*start],xy[2*start+1]);if(!bounded(p))throw std::runtime_error("REGION_COORDINATE_RANGE");
        if(path.empty()||path.back()!=p)path.push_back(p);
      }
      if(path.size()>1&&path.front()==path.back())path.pop_back();
      if(path.size()<3)throw std::runtime_error("REGION_DEGENERATE_CONTOUR");
      guard_resolution(path);
      paths.push_back(std::move(path));
    }
    return new ArchRegion(Union(paths,rule?FillRule::EvenOdd:FillRule::NonZero));
  }catch(const std::bad_alloc&){fail(error,cap,"RESOURCE_EXHAUSTED");}
   catch(const std::exception& e){fail(error,cap,e.what());}
   catch(...){fail(error,cap,"REGION_INTERNAL_ERROR");}
  return nullptr;
}
extern "C" ArchRegion* arch_region_boolean(const ArchRegion* a,const ArchRegion* b,uint32_t op,char* error,uint32_t cap){
  fail(error,cap,"");
  try{
    if(!a||!b||op>2)throw std::runtime_error("REGION_INVALID_OPERATION");
    if(op==0){auto paths=a->paths;paths.insert(paths.end(),b->paths.begin(),b->paths.end());return new ArchRegion(Union(paths,FillRule::NonZero));}
    if(op==1)return new ArchRegion(Intersect(a->paths,b->paths,FillRule::NonZero));
    return new ArchRegion(Difference(a->paths,b->paths,FillRule::NonZero));
  }catch(const std::bad_alloc&){fail(error,cap,"RESOURCE_EXHAUSTED");}
   catch(const std::exception& e){fail(error,cap,e.what());}
   catch(...){fail(error,cap,"REGION_INTERNAL_ERROR");}
  return nullptr;
}

extern "C" uint32_t arch_geometry_abi_version(){return 1;}
extern "C" const char* arch_font_library_version(){return hb_version_string();}
extern "C" void arch_scene_destroy(ArchScene* scene){delete scene;}
extern "C" int arch_scene_view(const ArchScene* s,ArchSceneView* v){
  if(!s||!v)return 0;
  *v={1,(uint32_t)(s->vertices.size()/3),(uint32_t)(s->triangles.size()/3),
      (uint32_t)s->parts.size(),(uint32_t)(s->points.size()/2),
      (uint32_t)s->contours.size(),(uint32_t)s->indices.size(),(uint32_t)s->edges.size(),
      s->vertices.data(),s->triangles.data(),s->parts.data(),s->points.data(),
      s->contours.data(),s->indices.data(),s->edges.data()};
  return 1;
}

extern "C" ArchScene* arch_scene_build(const int64_t* xy,uint32_t np,
    const uint32_t* ends,uint32_t nc,const uint32_t* shape_ends,uint32_t ns,
    const uint32_t* rules,const uint32_t* colors,const double* z0,const double* z1,
    char* error,uint32_t cap){
  return arch_scene_build_controlled(xy,np,ends,nc,shape_ends,ns,rules,colors,z0,z1,nullptr,error,cap);
}
extern "C" ArchScene* arch_scene_build_controlled(const int64_t* xy,uint32_t np,
    const uint32_t* ends,uint32_t nc,const uint32_t* shape_ends,uint32_t ns,
    const uint32_t* rules,const uint32_t* colors,const double* z0,const double* z1,
    const ArchBuildControl* control,char* error,uint32_t cap){
  return arch_scene_build_condition_impl(xy,np,ends,nc,shape_ends,ns,rules,colors,z0,z1,control,nullptr,error,cap);
}
static ArchScene* scene_build_impl(const int64_t* xy,uint32_t np,
    const uint32_t* ends,uint32_t nc,const uint32_t* shape_ends,uint32_t ns,
    const uint32_t* rules,const uint32_t* colors,const double* z0,const double* z1,
    const ArchBuildControl* control,arch_condition::Context* conditioning,char* error,uint32_t cap,
    std::vector<Paths64>* prepared_regions){
  fail(error,cap,"");
  try {
    checkpoint(control,250);
    std::vector<Paths64> regions;
    if(prepared_regions){
      // Only owned ArchRegion objects reach this internal path. Their fill and
      // clips are already resolved. Preserve that boundary, including short
      // intersection edges, instead of treating it as another raw source.
      regions=std::move(*prepared_regions);
    }else{
    if(!xy||!ends||!shape_ends||!rules||!colors||!z0||!z1||!np||!nc||!ns||
       np>kMaxPoints||nc>np/3||ns>kMaxShapes||ns>nc)
      throw std::runtime_error("INVALID_COUNTS");
    if(ends[nc-1]!=np||shape_ends[ns-1]!=nc)
      throw std::runtime_error("INVALID_OFFSETS");
    regions.resize(ns);
    uint32_t ci=0,pi=0;
    for(uint32_t si=0;si<ns;++si){
      checkpoint(control,250+100*si/ns);
      if(shape_ends[si]<=ci||shape_ends[si]>nc||rules[si]>1||
          (colors[si]&255)!=255||!std::isfinite(z0[si])||!std::isfinite(z1[si])||
          z0[si]<0||z1[si]<=z0[si]||z1[si]>10000)
        throw std::runtime_error("INVALID_SHAPE");
      Paths64 raw;
      for(;ci<shape_ends[si];++ci){
        if(ends[ci]<=pi||ends[ci]>np||ends[ci]-pi<3)
          throw std::runtime_error("INVALID_CONTOUR");
        Path64 p;
        for(;pi<ends[ci];++pi){
          Point64 pt(xy[2*pi],xy[2*pi+1]);
          if(!bounded(pt))throw std::runtime_error("COORDINATE_RANGE");
          if(p.empty()||p.back()!=pt)p.push_back(pt);
        }
        if(p.size()>1&&p.front()==p.back())p.pop_back();
        if(p.size()<3)throw std::runtime_error("DEGENERATE_CONTOUR");
        guard_resolution(p);
        raw.push_back(std::move(p));
      }
      regions[si]=Union(raw,rules[si]?FillRule::EvenOdd:FillRule::NonZero);
      clean_paths(regions[si]);
    }
    }
    // Topmost opaque appearance determines the material. Resolve in one
    // integer coordinate system before any extrusion; never vectorize masks
    // per material independently. Height is an attribute of the visible region.
    // A growing union of every later paint made disjoint tiled inputs
    // quadratic in expensive polygon operations. A bounding-box rejection
    // may only skip clips with no interior overlap. NonZero union semantics
    // for the remaining, already normalized regions stay inside Clipper2.
    std::vector<Rect64> region_bounds;region_bounds.reserve(ns);
    for(const auto& region:regions)region_bounds.push_back(GetBounds(region));
    for(uint32_t si=ns;si-->0;){
      checkpoint(control,350+100*(ns-1-si)/ns);
      auto original=regions[si];
      Paths64 covered;
      const auto& a=region_bounds[si];
      for(uint32_t later=si+1;later<ns;++later){
        const auto& b=region_bounds[later];
        if(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)continue;
        // Later visible regions together cover exactly the union of later
        // original paints, so no hidden original contour has to be retained.
        covered.insert(covered.end(),regions[later].begin(),regions[later].end());
      }
      if(!covered.empty())regions[si]=Difference(original,covered,FillRule::NonZero);
      clean_paths(regions[si]);
    }
    // Split every collinear interval at shared endpoints. A T junction must
    // reference the same point and edge IDs on both sides of a material seam.
    std::map<Line,std::vector<GridPoint>> lines;
    checkpoint(control,450);
    uint64_t generated=0;
    for(const auto& region:regions)for(const auto& path:region){
      generated+=path.size();
      if(generated>kMaxPoints)throw std::runtime_error("REGION_COMPLEXITY_LIMIT");
      for(size_t i=0;i<path.size();++i){
        auto a=point(path[i]),b=point(path[(i+1)%path.size()]);
        auto& pts=lines[line_key(a,b)]; pts.push_back(a);pts.push_back(b);
      }
    }
    checkpoint(control,500);
    for(auto& entry:lines){auto& pts=entry.second;std::sort(pts.begin(),pts.end());pts.erase(std::unique(pts.begin(),pts.end()),pts.end());}
    for(auto& region:regions)for(auto& path:region){
      Path64 split;
      for(size_t i=0;i<path.size();++i){
        auto a=point(path[i]),b=point(path[(i+1)%path.size()]);
        const auto& pts=lines.at(line_key(a,b));
        const auto lo=std::lower_bound(pts.begin(),pts.end(),std::min(a,b));
        const auto hi=std::upper_bound(pts.begin(),pts.end(),std::max(a,b));
        if(a<b){for(auto it=lo;it!=hi;++it)if(*it!=b)split.emplace_back(it->first,it->second);}
        else {for(auto it=std::make_reverse_iterator(hi);it!=std::make_reverse_iterator(lo);++it)if(*it!=b)split.emplace_back(it->first,it->second);}
        if(split.size()>kMaxPoints)throw std::runtime_error("TOPOLOGY_COMPLEXITY_LIMIT");
      }
      path=std::move(split);
    }
    if(conditioning)arch_condition::graph(regions,*conditioning);
    auto scene=std::make_unique<ArchScene>();
    checkpoint(control,600);
    std::map<GridPoint,uint32_t> point_ids;
    std::map<std::pair<uint32_t,uint32_t>,uint32_t> edge_ids;
    for(uint32_t si=0;si<ns;++si){
      checkpoint(control,600+350*si/ns);
      if(regions[si].empty())continue;
      // A boundary vertex shared by two lobes makes the extruded STL have
      // four incident faces at the same geometric edge after coordinate weld.
      // Manifold's index-based validity alone does not reject that contact.
      std::set<GridPoint> boundary_points;
      for(const auto& path:regions[si])for(const auto& p:path)
        if(!boundary_points.insert(point(p)).second)
          throw std::runtime_error("PLANAR_POINT_CONTACT");
      manifold::Polygons polys;
      ArchPart part{};
      part.vertex_start=(uint32_t)(scene->vertices.size()/3);
      part.triangle_start=(uint32_t)(scene->triangles.size()/3);
      part.color_rgba=colors[si];part.source_index=si;
      part.contour_start=(uint32_t)scene->contours.size();
      const auto part_id=(uint32_t)scene->parts.size();
      for(const auto& path:regions[si]){
        manifold::SimplePolygon polygon;
        std::vector<uint32_t> ids;
        for(const auto& p:path){
          if(!bounded(p))throw std::runtime_error("BOOLEAN_COORDINATE_RANGE");
          polygon.emplace_back((double)p.x/kGrid,(double)p.y/kGrid);
          auto result=point_ids.emplace(point(p),(uint32_t)(scene->points.size()/2));
          if(result.second){scene->points.push_back(p.x);scene->points.push_back(p.y);}
          ids.push_back(result.first->second);
        }
        scene->contours.push_back({(uint32_t)scene->indices.size(),(uint32_t)ids.size(),part_id,0});
        scene->indices.insert(scene->indices.end(),ids.begin(),ids.end());
        for(size_t j=0;j<ids.size();++j){
          auto a=ids[j],b=ids[(j+1)%ids.size()];auto key=std::minmax(a,b);
          auto found=edge_ids.find(key);
          if(found==edge_ids.end()){
            edge_ids.emplace(key,(uint32_t)scene->edges.size());
            scene->edges.push_back({a,b,part_id,UINT32_MAX});
          }else{
            auto& edge=scene->edges[found->second];
            if(edge.part_b!=UINT32_MAX||edge.point_a!=b||edge.point_b!=a||edge.part_a==part_id)
              throw std::runtime_error("NON_MANIFOLD_PLANAR_EDGE");
            edge.part_b=part_id;
          }
        }
        polys.push_back(std::move(polygon));
      }
      part.contour_count=(uint32_t)scene->contours.size()-part.contour_start;
      auto solid=manifold::Manifold::Extrude(polys,z1[si]-z0[si]).Translate({0,0,z0[si]});
      checkpoint(control,600+350*si/ns);
      if(solid.Status()!=manifold::Manifold::Error::NoError||solid.IsEmpty())
        throw std::runtime_error("MESH_CONSTRUCTION_FAILED");
      part.volume_mm3=solid.Volume();
      if(!std::isfinite(part.volume_mm3)||part.volume_mm3<=0)
        throw std::runtime_error("NON_POSITIVE_VOLUME");
      auto mesh=solid.GetMeshGL64();
      checkpoint(control,600+350*si/ns);
      part.vertex_count=(uint32_t)(mesh.vertProperties.size()/mesh.numProp);
      part.triangle_count=(uint32_t)(mesh.triVerts.size()/3);
      if((uint64_t)scene->vertices.size()/3+part.vertex_count>2000000||
          (uint64_t)scene->triangles.size()/3+part.triangle_count>4000000)
        throw std::runtime_error("MESH_COMPLEXITY_LIMIT");
      for(size_t v=0;v<mesh.vertProperties.size();v+=mesh.numProp)
        for(int axis=0;axis<3;++axis){
          const double value=mesh.vertProperties[v+axis];
          if(!std::isfinite(value)||std::abs(value)>10000)throw std::runtime_error("MESH_COORDINATE_RANGE");
          if(conditioning&&axis==2&&std::min(std::abs(value-z0[si]),std::abs(value-z1[si]))>1e-10)
            throw std::runtime_error("CONDITIONING_MESH_RELOCATED");
          scene->vertices.push_back(value);
        }
      for(auto index:mesh.triVerts){
        if(index>=part.vertex_count)throw std::runtime_error("MESH_INDEX_RANGE");
        scene->triangles.push_back((uint32_t)index+part.vertex_start);
      }
      scene->parts.push_back(part);
    }
    if(scene->parts.empty())throw std::runtime_error("EMPTY_GEOMETRY");
    if(conditioning){ArchSceneView view{};arch_scene_view(scene.get(),&view);arch_condition::mesh(view,*conditioning);}
    checkpoint(control,980);
    return scene.release();
  }catch(const std::bad_alloc&){fail(error,cap,"RESOURCE_EXHAUSTED");}
   catch(const std::exception& e){fail(error,cap,e.what());}
   catch(...){fail(error,cap,"GEOMETRY_INTERNAL_ERROR");}
  return nullptr;
}

// Existing raw-input/conditioning entry point preserves its validation path.
ArchScene* arch_scene_build_condition_impl(const int64_t* xy,uint32_t np,
    const uint32_t* ends,uint32_t nc,const uint32_t* shape_ends,uint32_t ns,
    const uint32_t* rules,const uint32_t* colors,const double* z0,const double* z1,
    const ArchBuildControl* control,arch_condition::Context* conditioning,char* error,uint32_t cap){
  return scene_build_impl(xy,np,ends,nc,shape_ends,ns,rules,colors,z0,z1,control,conditioning,error,cap,nullptr);
}
extern "C" uint32_t arch_region_scene_abi_version(){return 1;}
extern "C" ArchScene* arch_scene_build_regions_controlled(
    const ArchRegion* const* input,uint32_t ns,const uint32_t* colors,
    const double* z0,const double* z1,const ArchBuildControl* control,char* error,uint32_t cap){
  fail(error,cap,"");
  try{
    if(!input||!colors||!z0||!z1||!ns||ns>kMaxShapes)
      throw std::runtime_error("REGION_SCENE_INVALID_INPUT");
    std::vector<Paths64> regions;regions.reserve(ns);uint64_t points=0;
    for(uint32_t i=0;i<ns;++i){
      checkpoint(control,250);
      if(!input[i]||input[i]->paths.empty()||(colors[i]&255)!=255||
          !std::isfinite(z0[i])||!std::isfinite(z1[i])||z0[i]<0||z1[i]<=z0[i]||z1[i]>10000)
        throw std::runtime_error("REGION_SCENE_INVALID_INPUT");
      for(const auto& path:input[i]->paths){
        points+=path.size();if(path.size()<3||points>kMaxPoints)
          throw std::runtime_error("REGION_COMPLEXITY_LIMIT");
        for(const auto& p:path)if(!bounded(p))throw std::runtime_error("REGION_COORDINATE_RANGE");
      }
      regions.push_back(input[i]->paths);
    }
    return scene_build_impl(nullptr,0,nullptr,0,nullptr,ns,nullptr,colors,z0,z1,control,nullptr,error,cap,&regions);
  }catch(const std::bad_alloc&){fail(error,cap,"RESOURCE_EXHAUSTED");}
   catch(const std::exception& e){fail(error,cap,e.what());}
   catch(...){fail(error,cap,"REGION_INTERNAL_ERROR");}
  return nullptr;
}
