#include "final_scene_export.h"
#include <manifold/manifold.h>
#include <clipper2/clipper.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <memory>
#include <numeric>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

using manifold::Manifold;
using manifold::MeshGL64;
namespace C2=Clipper2Lib;
namespace {
constexpr double LIMIT=10000., GRID=1000000.;
struct Failure:std::runtime_error { using std::runtime_error::runtime_error; };
void need(bool ok,const char* why){if(!ok)throw Failure(why);}
void check(const ArchBuildControl* c,uint32_t stage){
  if(c&&c->cancelled&&c->cancelled(c->data))throw Failure("CANCELLED");
  if(c&&c->progress)c->progress(c->data,stage);
}
bool bounded(double v){return std::isfinite(v)&&std::abs(v)<=LIMIT;}
int64_t grid(double x){
  need(bounded(x),"COORDINATE_RANGE");double a=x*GRID,lo=std::floor(a),f=a-lo;
  return int64_t(lo+((f>.5||(f==.5&&std::fmod(lo,2.)!=0.))?1.:0.));
}
struct Budget {
  const ArchFinalOptions& o;const ArchBuildControl* c;
  Manifold evaluated(Manifold m,uint32_t stage)const{
    check(c,stage);
    // WithContext is used only at its documented deferred-tree evaluation
    // entry point. Root cancellation is checked before/after each such op;
    // Slice, Volume and GetMeshGL64 are not advertised as interruptible.
    manifold::ExecutionContext ctx;
    if(c&&c->cancelled&&c->cancelled(c->data))ctx.Cancel();
    auto status=m.WithContext(ctx).Status();
    if(status==Manifold::Error::Cancelled)throw Failure("CANCELLED");
    need(status==Manifold::Error::NoError,"INVALID_SERIALIZATION:MANIFOLD");
    check(c,stage);
    need(m.NumVert()<=o.max_vertices&&m.NumTri()<=o.max_triangles,"EXPORT_GEOMETRY_LIMIT");
    return m;
  }
};
std::array<double,3> point(const std::vector<double>& v,uint32_t i){return {v[3*i],v[3*i+1],v[3*i+2]};}
struct DSU {
  std::vector<uint32_t> p;
  explicit DSU(size_t n):p(n){std::iota(p.begin(),p.end(),0);}
  uint32_t root(uint32_t a){while(p[a]!=a){p[a]=p[p[a]];a=p[a];}return a;}
  void join(uint32_t a,uint32_t b){p[root(a)]=root(b);}
};
/* Exact-coordinate-weld edge AND vertex-link oracle. This is validation,
 * not a triangulator/repair. It rejects point contacts that indexed topology
 * alone can miss. Independent file/spatial tests additionally inspect output. */
bool topology(const std::vector<double>& v,const std::vector<uint32_t>& t){
  if(v.empty()||t.empty())return false;
  std::map<std::array<double,3>,uint32_t> weld;std::vector<uint32_t> ids(v.size()/3);
  for(uint32_t i=0;i<ids.size();++i){auto [it,inserted]=weld.emplace(point(v,i),uint32_t(weld.size()));ids[i]=it->second;}
  struct E {uint32_t a,b,count;int direction;};
  std::map<std::pair<uint32_t,uint32_t>,E> edges;
  std::set<std::array<uint32_t,3>> faces;DSU fan(t.size());
  for(uint32_t i=0;i<t.size();i+=3){
    std::array<uint32_t,3> f={ids[t[i]],ids[t[i+1]],ids[t[i+2]]};
    if(f[0]==f[1]||f[1]==f[2]||f[2]==f[0])return false;
    auto sorted=f;std::sort(sorted.begin(),sorted.end());if(!faces.insert(sorted).second)return false;
    auto a=point(v,t[i]),b=point(v,t[i+1]),c=point(v,t[i+2]);
    std::array<double,3> u={b[0]-a[0],b[1]-a[1],b[2]-a[2]},w={c[0]-a[0],c[1]-a[1],c[2]-a[2]};
    double nx=u[1]*w[2]-u[2]*w[1],ny=u[2]*w[0]-u[0]*w[2],nz=u[0]*w[1]-u[1]*w[0];
    if(nx==0&&ny==0&&nz==0)return false;
    for(uint32_t j=0;j<3;++j){uint32_t k=(j+1)%3;bool forward=f[j]<f[k];
      auto key=std::minmax(f[j],f[k]);uint32_t ca=i+(forward?j:k),cb=i+(forward?k:j);
      auto [it,inserted]=edges.emplace(key,E{ca,cb,1,forward?1:-1});
      if(!inserted){auto& e=it->second;if(++e.count>2)return false;e.direction+=forward?1:-1;fan.join(ca,e.a);fan.join(cb,e.b);}
    }
  }
  for(auto& [key,e]:edges)if(e.count!=2||e.direction!=0)return false;
  std::vector<uint32_t> component(weld.size(),UINT32_MAX);
  for(uint32_t i=0;i<t.size();++i){uint32_t id=ids[t[i]],r=fan.root(i);if(component[id]==UINT32_MAX)component[id]=r;else if(component[id]!=r)return false;}
  return true;
}
void options(const ArchFinalOptions& o){
  need(o.abi_version==1&&o.struct_size==sizeof(o),"EXPORT_OPTIONS_ABI");
  need(o.format>=1&&o.format<=3,"UNSUPPORTED_EXPORTER");
  need(o.orientation<=2&&o.rest_on_bed<=1&&o.section_mode<=1&&o.view_side<=1&&o.color_policy<=1&&o.units<=1&&o.inspection_mode<=1,"EXPORT_OPTIONS_ENUM");
  need(o.reserved0==0&&o.reserved1==0&&o.reserved2==0,"EXPORT_OPTIONS_RESERVED");
  need(o.output_error_mm>=1e-9&&o.output_error_mm<=.004,"EXPORT_OUTPUT_ERROR_BUDGET");
  need(o.max_vertices>0&&o.max_vertices<=2000000&&o.max_triangles>0&&o.max_triangles<=4000000&&
    o.max_groups>0&&o.max_groups<=256&&o.max_sections>0&&o.max_sections<=256&&o.max_section_points>0&&o.max_section_points<=2000000&&
    o.max_output_bytes>=84&&o.max_output_bytes<=256u*1024*1024&&o.max_working_bytes>=1024&&o.max_working_bytes<=320u*1024*1024,"EXPORT_RESOURCE_OPTIONS");
  if(o.orientation!=AFE_ISOMETRY)for(double x:o.transform)need(x==0,"UNUSED_EXPORT_TRANSFORM");
  if(o.orientation==AFE_PATTERN_DOWN_X)need(o.rest_on_bed==1,"PATTERN_DOWN_REQUIRES_BED");
  if(o.format==AFE_SVG_SECTION){
    need(o.orientation==0&&o.rest_on_bed==0,"SVG_POSE_CONFLICT");
    need(bounded(o.z_start_mm)&&bounded(o.z_end_mm)&&std::isfinite(o.z_step_mm),"SECTION_Z_RANGE");
    for(double x:{o.z_start_mm,o.z_end_mm,o.z_step_mm})need(std::abs(x-double(grid(x))/GRID)<1e-12,"SECTION_Z_GRID");
    if(o.section_mode==0)need(o.z_end_mm==o.z_start_mm&&o.z_step_mm==0,"SECTION_SINGLE_FIELDS");
    else{auto start=grid(o.z_start_mm),end=grid(o.z_end_mm),step=grid(o.z_step_mm);
      need(step>0&&end>start&&(end-start)%step==0,"SECTION_RANGE_STEP");need((end-start)/step+1<=o.max_sections,"SECTION_COUNT_LIMIT");}
    need(o.output_error_mm>=std::sqrt(.5)/GRID,"SECTION_QUANTIZATION_BUDGET");
  }else need(o.section_mode==0&&o.z_start_mm==0&&o.z_end_mm==0&&o.z_step_mm==0&&o.view_side==0&&o.color_policy==0&&o.units==0,"UNUSED_SECTION_OPTIONS");
}
std::array<double,12> transform(const ArchFinalOptions& o,const ArchSceneView& s,double& determinant){
  std::array<double,12> m={1,0,0,0,0,1,0,0,0,0,1,0};
  if(o.orientation==1){m[5]=-1;m[10]=-1;}
  if(o.orientation==2){std::copy(o.transform,o.transform+12,m.begin());
    for(double x:m)need(bounded(x),"EXPORT_TRANSFORM_RANGE");
    for(int a=0;a<3;++a)for(int b=0;b<3;++b){double dot=0;for(int k=0;k<3;++k)dot+=m[4*a+k]*m[4*b+k];need(std::abs(dot-(a==b?1.:0.))<=1e-12,"EXPORT_TRANSFORM_NOT_ISOMETRY");}}
  determinant=m[0]*(m[5]*m[10]-m[6]*m[9])-m[1]*(m[4]*m[10]-m[6]*m[8])+m[2]*(m[4]*m[9]-m[5]*m[8]);
  need(std::abs(std::abs(determinant)-1.)<=2e-12,"EXPORT_TRANSFORM_DETERMINANT");
  if(o.rest_on_bed){double low=std::numeric_limits<double>::infinity();for(uint32_t i=0;i<s.vertex_count;++i){const double* v=s.vertices_xyz+3*i;low=std::min(low,m[8]*v[0]+m[9]*v[1]+m[10]*v[2]+m[11]);}m[11]-=low;}
  return m;
}
}

struct ArchFinalExport {
  ArchFinalView v{};std::vector<double> vertices,points;
  std::vector<uint32_t> triangles,members;
  std::vector<ArchFinalGroup> groups;std::vector<ArchFinalSection> sections;std::vector<ArchFinalContour> contours;
};
extern "C" uint32_t arch_final_native_abi_version(){return 1;}
extern "C" uint32_t arch_final_native_layout(uint32_t k){
  const uint32_t a[]={sizeof(ArchFinalOptions),sizeof(ArchFinalMaterial),sizeof(ArchFinalGroup),sizeof(ArchFinalSection),sizeof(ArchFinalContour),sizeof(ArchFinalView),offsetof(ArchFinalView,vertices_xyz)};
  return k<7?a[k]:0;
}
extern "C" uint32_t arch_final_scene_view(const ArchFinalExport* r,ArchFinalView* out){
  if(!r||!out)return 0;*out=r->v;out->vertices_xyz=r->vertices.data();out->triangles=r->triangles.data();out->groups=r->groups.data();out->members=r->members.data();out->sections=r->sections.data();out->contours=r->contours.data();out->points_xy=r->points.data();return 1;
}
extern "C" void arch_final_scene_destroy(ArchFinalExport* p){delete p;}
extern "C" ArchFinalExport* arch_final_scene_prepare(const ArchSceneView* source,const ArchFinalMaterial* mapping,uint32_t count,
 const ArchFinalOptions* opt,const ArchBuildControl* control,char* error,uint32_t capacity){
  if(error&&capacity)error[0]=0;
  try{
    check(control,10);need(source&&opt,"EXPORT_NULL_INPUT");options(*opt);const auto& s=*source;const auto& o=*opt;Budget budget{o,control};
    need(s.abi_version==1&&s.part_count>0&&s.vertex_count>0&&s.triangle_count>0,"NO_SNAPSHOT");
    need(s.part_count<=4096&&s.vertex_count<=o.max_vertices&&s.triangle_count<=o.max_triangles,"EXPORT_INPUT_LIMIT");
    need(s.vertices_xyz&&s.triangles&&s.parts&&mapping&&count==s.part_count,"MATERIAL_MAPPING_REQUIRED");
    uint64_t estimate=(uint64_t(s.vertex_count)*24+uint64_t(s.triangle_count)*12)*12+uint64_t(s.part_count)*8192;
    need(estimate<=o.max_working_bytes,"EXPORT_WORKING_LIMIT");
    auto result=std::make_unique<ArchFinalExport>();auto& v=result->v;
    v.abi_version=1;v.struct_size=sizeof(v);v.format=o.format;
    std::fill(v.manufacturing_bounds,v.manufacturing_bounds+3,std::numeric_limits<double>::infinity());
    std::fill(v.manufacturing_bounds+3,v.manufacturing_bounds+6,-std::numeric_limits<double>::infinity());
    for(uint32_t i=0;i<s.vertex_count;++i){if(i%2048==0)check(control,20);for(int a=0;a<3;++a){double x=s.vertices_xyz[3*i+a];need(bounded(x),"COORDINATE_RANGE");v.manufacturing_bounds[a]=std::min(v.manufacturing_bounds[a],x);v.manufacturing_bounds[a+3]=std::max(v.manufacturing_bounds[a+3],x);}}
    std::vector<uint32_t> mapped(s.part_count,UINT32_MAX);
    std::map<std::pair<uint32_t,uint32_t>,std::vector<uint32_t>> keys;
    for(uint32_t i=0;i<count;++i){const auto& m=mapping[i];need(m.part_index<s.part_count&&mapped[m.part_index]==UINT32_MAX&&m.slot>=1&&m.slot<=65535&&m.reserved==0&&(m.color_rgba&255)==255,"MATERIAL_MAPPING_INVALID");
      need(m.source_index==s.parts[m.part_index].source_index,"MATERIAL_MAPPING_STALE_SOURCE");mapped[m.part_index]=i;keys[{m.slot,m.color_rgba}].push_back(i);}
    bool mono=o.format==AFE_STL_UNION||(o.format==AFE_SVG_SECTION&&o.color_policy==0);
    need(mono||keys.size()<=o.max_groups,"EXPORT_GROUP_LIMIT");
    uint32_t prevv=0,prevt=0;std::vector<Manifold> solids;solids.reserve(s.part_count);
    for(uint32_t i=0;i<s.part_count;++i){check(control,30+uint32_t(uint64_t(i)*170/s.part_count));const auto& p=s.parts[i];
      need(p.vertex_count>0&&p.triangle_count>0&&p.vertex_start==prevv&&p.triangle_start==prevt&&uint64_t(p.vertex_start)+p.vertex_count<=s.vertex_count&&uint64_t(p.triangle_start)+p.triangle_count<=s.triangle_count,"EXPORT_PART_RANGE");
      prevv+=p.vertex_count;prevt+=p.triangle_count;
      MeshGL64 mesh;mesh.numProp=3;mesh.vertProperties.assign(s.vertices_xyz+3*p.vertex_start,s.vertices_xyz+3*prevv);
      std::vector<uint32_t> local;local.reserve(3*p.triangle_count);
      for(uint64_t t=uint64_t(p.triangle_start)*3;t<uint64_t(prevt)*3;++t){uint32_t index=s.triangles[t];need(index>=p.vertex_start&&index<prevv,"EXPORT_TRIANGLE_INDEX");mesh.triVerts.push_back(index-p.vertex_start);local.push_back(index-p.vertex_start);}
      bool valid=topology(mesh.vertProperties,local);
      if(!valid){need(o.inspection_mode==1,"INVALID_SERIALIZATION:INPUT_TOPOLOGY");v.warning_flags|=AFE_W_TOPOLOGY;}
      auto solid=budget.evaluated(Manifold(mesh),200);
      need(!solid.IsEmpty()&&std::isfinite(solid.Volume())&&solid.Volume()>0,"INVALID_SERIALIZATION:NONPOSITIVE_SOLID");
      v.input_volume_sum_mm3+=solid.Volume();v.library_tolerance_mm=std::max(v.library_tolerance_mm,solid.GetTolerance());solids.push_back(std::move(solid));
    }
    need(prevv==s.vertex_count&&prevt==s.triangle_count,"EXPORT_UNOWNED_GEOMETRY");
    auto united=budget.evaluated(Manifold::BatchBoolean(solids,manifold::OpType::Add),250);
    need(!united.IsEmpty()&&united.Volume()>0,"INVALID_SERIALIZATION:EMPTY_UNION");v.union_volume_mm3=united.Volume();
    std::vector<Manifold> grouped;
    if(mono){ArchFinalGroup g{};g.slot=0;g.color_rgba=0x000000ff;g.member_count=count;g.volume_mm3=v.union_volume_mm3;result->groups.push_back(g);
      for(uint32_t i=0;i<count;++i)result->members.push_back(i);grouped.push_back(united);
    }else for(auto& [key,member]:keys){std::vector<Manifold> selected;for(auto mi:member)selected.push_back(solids[mapping[mi].part_index]);
      auto solid=budget.evaluated(Manifold::BatchBoolean(selected,manifold::OpType::Add),350);
      ArchFinalGroup g{};g.slot=key.first;g.color_rgba=key.second;g.member_start=uint32_t(result->members.size());g.member_count=uint32_t(member.size());g.volume_mm3=solid.Volume();
      result->members.insert(result->members.end(),member.begin(),member.end());result->groups.push_back(g);grouped.push_back(std::move(solid));}
    if(!mono){
      // No epsilon subtraction between material solids. An actual positive
      // intersection is either rejected or explicitly retained for inspection.
      for(uint32_t i=0;i<grouped.size();++i)for(uint32_t j=0;j<i;++j){
        check(control,400);auto a=grouped[i].BoundingBox(),b=grouped[j].BoundingBox();
        if(a.max.x<=b.min.x||b.max.x<=a.min.x||a.max.y<=b.min.y||b.max.y<=a.min.y||a.max.z<=b.min.z||b.max.z<=a.min.z)continue;
        auto overlap=budget.evaluated(grouped[i]^grouped[j],400);
        if(!overlap.IsEmpty()&&overlap.Volume()>0){need(o.inspection_mode==1,"MATERIAL_INTERIOR_OVERLAP");v.warning_flags|=AFE_W_MATERIAL_OVERLAP;}}
    }
    double det=1;auto matrix=transform(o,s,det);std::copy(matrix.begin(),matrix.end(),v.applied_transform);if(det<0)v.warning_flags|=AFE_W_REFLECTION;
    if(o.format!=AFE_SVG_SECTION){
      for(uint32_t i=0;i<grouped.size();++i){check(control,450+uint32_t(uint64_t(i)*300/grouped.size()));auto& g=result->groups[i];auto mesh=grouped[i].GetMeshGL64();
        need(uint64_t(result->vertices.size()/3)+mesh.NumVert()<=o.max_vertices&&uint64_t(result->triangles.size()/3)+mesh.NumTri()<=o.max_triangles,"EXPORT_RESULT_LIMIT");
        g.vertex_start=uint32_t(result->vertices.size()/3);g.triangle_start=uint32_t(result->triangles.size()/3);g.vertex_count=uint32_t(mesh.NumVert());g.triangle_count=uint32_t(mesh.NumTri());
        std::vector<double> vv;std::vector<uint32_t> tt;vv.reserve(mesh.NumVert()*3);tt.reserve(mesh.NumTri()*3);
        for(size_t vi=0;vi<mesh.NumVert();++vi){if(vi%2048==0)check(control,750);const double* p=mesh.vertProperties.data()+vi*mesh.numProp;
          for(int a=0;a<3;++a){double q=matrix[4*a]*p[0]+matrix[4*a+1]*p[1]+matrix[4*a+2]*p[2]+matrix[4*a+3];need(bounded(q),"EXPORT_TRANSFORM_RANGE");vv.push_back(q==0?0:q);}}
        for(size_t ti=0;ti<mesh.triVerts.size();ti+=3){tt.push_back(uint32_t(mesh.triVerts[ti]));tt.push_back(uint32_t(mesh.triVerts[ti+(det<0?2:1)]));tt.push_back(uint32_t(mesh.triVerts[ti+(det<0?1:2)]));}
        if(!topology(vv,tt)){need(o.inspection_mode==1,"INVALID_SERIALIZATION:UNION_TOPOLOGY");v.warning_flags|=AFE_W_TOPOLOGY;}
        result->vertices.insert(result->vertices.end(),vv.begin(),vv.end());for(auto t:tt)result->triangles.push_back(t+g.vertex_start);
      }
    }else{
      int64_t start=grid(o.z_start_mm),end=grid(o.z_end_mm),step=o.section_mode?grid(o.z_step_mm):1;
      uint32_t samples=o.section_mode?uint32_t((end-start)/step+1):1;
      // One integer coordinate ledger across all groups/slices. A shared seam
      // endpoint is quantized once and reused, never offset per material.
      std::map<std::array<double,2>,C2::Point64> ledger;
      for(uint32_t si=0;si<samples;++si){double z=double(start+int64_t(si)*step)/GRID;
        for(uint32_t gi=0;gi<grouped.size();++gi){check(control,450+uint32_t((uint64_t(si)*grouped.size()+gi)*300/(uint64_t(samples)*grouped.size())));
          auto polygons=grouped[gi].Slice(z);C2::Paths64 paths;
          for(const auto& raw:polygons){C2::Path64 path;manifold::SimplePolygon poly;
            // At an exact mesh vertex Z, Slice can visit the same intersection
            // from both adjacent triangles (face_op.cpp). Remove only identical
            // consecutive samples, never short edges or approximate vertices.
            for(auto p:raw)if(poly.empty()||p.x!=poly.back().x||p.y!=poly.back().y)poly.push_back(p);
            if(poly.size()>1&&poly.front().x==poly.back().x&&poly.front().y==poly.back().y)poly.pop_back();
            if(poly.size()<3)continue; // exact point/line section has no filled area
            for(size_t pi=0;pi<poly.size();++pi){auto p=poly[pi],q=poly[(pi+1)%poly.size()];
              need(std::max(std::abs(p.x-q.x),std::abs(p.y-q.y))*GRID>=2.,"SECTION_SUBGRID_RAW_EDGE");
              auto key=std::array<double,2>{p.x,p.y};auto it=ledger.find(key);if(it==ledger.end()){need(ledger.size()<o.max_section_points,"SECTION_LEDGER_LIMIT");it=ledger.emplace(key,C2::Point64(grid(p.x),grid(p.y))).first;}path.push_back(it->second);}
            for(size_t pi=0;pi<path.size();++pi){auto a=path[pi],b=path[(pi+1)%path.size()];need(std::max(std::abs(a.x-b.x),std::abs(a.y-b.y))>=2,"SECTION_SUBGRID_EDGE");}
            if(!path.empty())paths.push_back(std::move(path));}
          C2::Clipper64 clip;clip.PreserveCollinear(true);clip.AddSubject(paths);C2::Paths64 normalized;
          need(clip.Execute(C2::ClipType::Union,C2::FillRule::NonZero,normalized),"SECTION_CLIPPER_FAILURE");
          // Do not silently discard a sub-grid component/edge during Clipper.
          if(!paths.empty())need(!normalized.empty(),"SECTION_BELOW_GRID");
          ArchFinalSection section{si,gi,uint32_t(result->contours.size()),uint32_t(normalized.size()),z,0};
          for(auto& poly:normalized){need(poly.size()>=3,"SECTION_INVALID_CONTOUR");
            need(result->points.size()/2+poly.size()<=o.max_section_points,"SECTION_POINT_LIMIT");
            for(size_t p=0;p<poly.size();++p){auto a=poly[p],b=poly[(p+1)%poly.size()];need(std::max(std::abs(a.x-b.x),std::abs(a.y-b.y))>=2,"SECTION_SUBGRID_EDGE");}
            section.area_mm2+=C2::Area(poly)/(GRID*GRID);
            ArchFinalContour c{uint32_t(result->points.size()/2),uint32_t(poly.size()),uint32_t(result->sections.size()),0};result->contours.push_back(c);
            for(auto p:poly){result->points.push_back(double(p.x)/GRID);result->points.push_back(double(p.y)/GRID);}}
          result->sections.push_back(section);
        }
      }
    }
    v.vertex_count=uint32_t(result->vertices.size()/3);v.triangle_count=uint32_t(result->triangles.size()/3);v.group_count=uint32_t(result->groups.size());v.member_count=uint32_t(result->members.size());
    v.section_count=uint32_t(result->sections.size());v.contour_count=uint32_t(result->contours.size());v.point_count=uint32_t(result->points.size()/2);
    uint64_t bytes=uint64_t(result->vertices.size()+result->points.size())*8+uint64_t(result->triangles.size()+result->members.size())*4+uint64_t(v.group_count)*40+uint64_t(v.section_count)*32+uint64_t(v.contour_count)*16;
    need(bytes<=o.max_working_bytes,"EXPORT_RESULT_BYTES");check(control,800);return result.release();
  }catch(const std::bad_alloc&){if(error&&capacity){std::strncpy(error,"EXPORT_ALLOCATION",capacity-1);error[capacity-1]=0;}}
  catch(const std::exception& e){if(error&&capacity){std::strncpy(error,e.what(),capacity-1);error[capacity-1]=0;}}
  catch(...){if(error&&capacity){std::strncpy(error,"EXPORT_NATIVE_FAILURE",capacity-1);error[capacity-1]=0;}}
  return nullptr;
}
