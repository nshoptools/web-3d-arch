#include "mechanics.h"
#include "derived_guard.h"
#include <manifold/manifold.h>
#include <manifold/cross_section.h>
#include <clipper2/clipper.core.h>
#include <algorithm>
#include <atomic>
#include <array>
#include <cmath>
#include <cstring>
#include <limits>
#include <memory>
#include <map>
#include <tuple>
#include <sstream>
#include <iomanip>
#include <numeric>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

using manifold::CrossSection;
using manifold::Manifold;
using manifold::Polygons;
using manifold::SimplePolygon;
using manifold::vec2;
using manifold::vec3;
namespace la=manifold::la;
namespace {
constexpr double PI=3.141592653589793238462643383279502884;
constexpr double GRID=1000000.;
constexpr double LIMIT=10000.;
constexpr uint32_t MAX_POINTS=200000, MAX_PARTS=2048, MAX_TRIANGLES=2000000;
constexpr double MEASUREMENT_ZERO=1e-8; // predicate tolerance, never vertex displacement
struct Field { const char* name; int kind; double min,max; uint32_t products,source; double defaults[5]; };
const Field fields[AM_FIELD_COUNT-1]={
#include "catalog.inc"
};
const double field_quantum[AM_FIELD_COUNT-1]={
#include "catalog_quantum.inc"
};
struct Failure:std::runtime_error {
  uint32_t verdict,field;
  Failure(uint32_t v,uint32_t f,const std::string& msg):std::runtime_error(msg),verdict(v),field(f){}
};
void need(bool yes,const std::string& msg,uint32_t f=0,uint32_t v=AM_INVALID){if(!yes)throw Failure(v,f,msg);}
template<size_t N> void copystr(char(&target)[N],const std::string& source){std::strncpy(target,source.c_str(),N-1);target[N-1]=0;}
bool near(double a,double b,double e=1e-7){return std::abs(a-b)<=e;}
bool finite(double x){return std::isfinite(x)&&std::abs(x)<=LIMIT;}
std::string position(vec3 p){std::ostringstream s;s<<std::setprecision(17)<<p.x<<","<<p.y<<","<<p.z;return s.str();}
CrossSection rect(double w,double h,double x=0,double y=0){
  need(finite(w)&&finite(h)&&w>0&&h>0,"INVALID_RECTANGLE");
  return CrossSection::Square({w,h},true).Translate({x,y});
}
Manifold prism(const CrossSection& p,double z0,double z1){
  need(finite(z0)&&finite(z1)&&z1>z0,"INVALID_Z_INTERVAL");
  if(p.IsEmpty())return {};
  return Manifold::Extrude(p.ToPolygons(),z1-z0).Translate({0,0,z0});
}
bool nonempty(const Manifold& m){return !m.IsEmpty()&&m.Volume()>MEASUREMENT_ZERO;}
bool contained(const CrossSection& small,const CrossSection& large){return (small-large).Area()<=MEASUREMENT_ZERO;}
struct Piece {Manifold mesh; uint32_t feature,role,group; ArchMechMaterial material;};
struct SourcePatch {CrossSection shape; double z0,z1; uint32_t piece; bool text; uint64_t id,attachment;};
struct TunnelGuard {Manifold cutter;double middle;uint32_t field;Manifold opening;double dx,dy,cx,cy,length;};
struct CavityGuard {
  std::string id;
  Manifold wall,opening;
  CrossSection roof;
  double bottom,ceiling,nominal_wall;
  uint32_t field,group;
  bool flexure;
};
}

#include "derived_guard.cpp.inc"

struct ArchMechResult {
  std::unique_ptr<ArchMechGuard> guard;
  uint32_t verdict=AM_OK,export_blocked=0;
  uint64_t revision=0;
  std::vector<double> vertices,layers;
  std::vector<uint32_t> triangles;
  std::vector<ArchMechPart> parts;
  std::vector<ArchMechPartInfo> part_info;
  std::vector<ArchMechFeature> features;
  std::vector<ArchMechCurve> curves;
  std::vector<ArchMechInterval> intervals;
  std::vector<ArchMechDiagnostic> diagnostics;
  std::vector<ArchMechProposal> proposals;
  std::vector<ArchMechParam> parameters;
};
struct ArchMechControl {
  manifold::ExecutionContext context;
  uint32_t generation;
  std::atomic<bool> used{false};
  std::atomic<uint32_t> stage{0};
  explicit ArchMechControl(uint32_t g):generation(g){}
};
namespace {
struct Builder {
  const ArchMechRequest& r;
  ArchMechResult& out;
  ArchMechControl* control;
  manifold::ExecutionContext context;
  std::array<ArchMechParam,AM_FIELD_COUNT> params{};
  std::array<double,AM_FIELD_COUNT> values{};
  std::array<ArchMechMaterial,AM_ROLE_COUNT> palette{};
  std::array<double,AM_DATUM_COUNT> datums{};
  std::array<bool,AM_FIELD_COUNT> used{};
  std::vector<Piece> pieces;
  std::vector<SourcePatch> source_patches;
  std::vector<CavityGuard> cavities;
  std::vector<TunnelGuard> tunnels;
  CrossSection footprint;
  manifold::Rect bounds;
  double body_z=0,body_h=0,cap_under=0,post_tip=0,cap_preview_z=0,button_preview_z=0;
  double secondary_x=0,rot=0;
  bool guard_source_resolution_checked=false;
  Builder(const ArchMechRequest& request,ArchMechResult& output,ArchMechControl* c):r(request),out(output),control(c),context(c?c->context:manifold::ExecutionContext()){}
  void checkpoint(){need(!context.Cancelled(),"MECHANICS_CANCELLED",0,AM_CANCELLED);}
  void guard_source_resolution(double budget,uint32_t field){
    if(guard_source_resolution_checked)return;
    // Admission limit for the legacy Boolean-contact cleanup fallback, not a
    // whole-pipeline error proof. Never erase an unresolved finite source slit.
    // Check only referenced rings; unused preserved source records are not geometry.
    const auto& s=r.source;std::vector<bool> rings(s.ring_count,false);
    auto mark=[&](uint32_t first,uint32_t count){for(uint32_t k=0;k<count;k++)rings[first+k]=true;};
    mark(s.footprint_ring_start,s.footprint_ring_count);
    std::vector<double> levels{0,body_h};
    for(uint32_t k=0;k<s.slab_count;k++)if(s.slabs[k].kind<AM_SOURCE_TEXT){
      mark(s.slabs[k].ring_start,s.slabs[k].ring_count);levels.push_back(s.slabs[k].z0);levels.push_back(s.slabs[k].z1);
    }
    std::sort(levels.begin(),levels.end());
    for(size_t k=1;k<levels.size();k++)if(levels[k]!=levels[k-1])
      need(levels[k]-levels[k-1]>2*budget,"FINAL_GUARD_SOURCE_BELOW_RESOLUTION",field);
    uint64_t pairs=0;
    auto distance=[](vec2 p,vec2 a,vec2 b){const vec2 d=b-a,q=p-a;const double n=d.x*d.x+d.y*d.y;
      if(n==0)return 0.;const double t=std::max(0.,std::min(1.,(q.x*d.x+q.y*d.y)/n));return std::hypot(q.x-t*d.x,q.y-t*d.y);};
    const double margin=2*budget+64*std::numeric_limits<double>::epsilon()*LIMIT;
    struct Edge {Clipper2Lib::Point64 a,b;vec2 p,q;uint32_t ring,index,count;};
    std::vector<Edge> edges;
    for(uint32_t ring=0;ring<s.ring_count;ring++)if(rings[ring]){
      const auto& q=s.rings[ring];
      auto point=[&](uint32_t i){const auto at=q.point_start+i;return Clipper2Lib::Point64(s.xy[2*at],s.xy[2*at+1]);};
      for(uint32_t i=0;i<q.point_count;i++){
        const auto a=point(i),b=point((i+1)%q.point_count);
        edges.push_back({a,b,{double(a.x)/GRID,double(a.y)/GRID},{double(b.x)/GRID,double(b.y)/GRID},ring,i,q.point_count});
      }
    }
    for(size_t i=0;i<edges.size();i++)for(size_t j=i+1;j<edges.size();j++){
        const auto& e=edges[i];const auto& f=edges[j];
        if(e.ring==f.ring&&(f.index==e.index+1||(e.index==0&&f.index==e.count-1)))continue;
        checkpoint();need(++pairs<=20000000,"FINAL_GUARD_SOURCE_RESOLUTION_WORK_LIMIT",field);
        const auto a=e.p,b=e.q,c=f.p,d=f.q;
        if(std::max(a.x,b.x)+margin<std::min(c.x,d.x)||std::max(c.x,d.x)+margin<std::min(a.x,b.x)||
           std::max(a.y,b.y)+margin<std::min(c.y,d.y)||std::max(c.y,d.y)+margin<std::min(a.y,b.y))continue;
        // Exact shared source interfaces and junctions are not finite gaps.
        // Integer predicates come from the already pinned Clipper2 library.
        if(e.ring!=f.ring&&(e.a==f.a||e.a==f.b||e.b==f.a||e.b==f.b))continue;
        const int ac=Clipper2Lib::CrossProductSign(e.a,e.b,f.a),ad=Clipper2Lib::CrossProductSign(e.a,e.b,f.b);
        const int ca=Clipper2Lib::CrossProductSign(f.a,f.b,e.a),cb=Clipper2Lib::CrossProductSign(f.a,f.b,e.b);
        const bool overlaps=std::max(e.a.x,e.b.x)>=std::min(f.a.x,f.b.x)&&std::max(f.a.x,f.b.x)>=std::min(e.a.x,e.b.x)&&
                            std::max(e.a.y,e.b.y)>=std::min(f.a.y,f.b.y)&&std::max(f.a.y,f.b.y)>=std::min(e.a.y,e.b.y);
        if(e.ring!=f.ring&&ac==0&&ad==0&&overlaps)continue;
        need(!(ac*ad<=0&&ca*cb<=0&&overlaps),"FINAL_GUARD_SOURCE_BOUNDARY_UNVERIFIED",field);
        const double separation=std::min({distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b)});
        need(separation>margin,"FINAL_GUARD_SOURCE_BELOW_RESOLUTION",field);
    }
    guard_source_resolution_checked=true;
    diagnostic(113,field,"GUARD_CONDITIONAL_RESOLUTION: source boundary separation and Z levels admitted before Boolean-contact cleanup; unresolved finite features refused; not an all-input full-volume proof");
  }
  void stage(uint32_t value){checkpoint();if(control)control->stage.store(value);}
  Manifold evaluate(const Manifold& mesh){
    checkpoint();auto observed=mesh.WithContext(context);auto status=observed.Status();
    need(status!=Manifold::Error::Cancelled,"MECHANICS_CANCELLED",0,AM_CANCELLED);
    need(status==Manifold::Error::NoError,"LIBRARY_EVALUATION_FAILED",0,AM_KERNEL_ERROR);return observed;
  }
  bool nonempty(const Manifold& mesh){const auto evaluated=evaluate(mesh);return !evaluated.IsEmpty()&&evaluated.Volume()>MEASUREMENT_ZERO;}
  double v(uint32_t id){used[id]=true;return values[id];}
  bool b(uint32_t id){return (fields[id-1].products&(1u<<r.product))&&v(id)!=0;}
  int e(uint32_t id){return (int)v(id);}
  double boundary(uint32_t n)const {
    return boundary_units(n)/GRID;
  }
  int64_t boundary_units(uint32_t n)const {
    need(n<=1000000,"LAYER_INDEX_RANGE");
    const int64_t q=n?r.schedule.first_nm+(int64_t)(n-1)*r.schedule.regular_nm:0;
    need(q<=10000000000LL,"SCHEDULE_Z_RANGE");return q;
  }
  int64_t units(double value,uint32_t field=0)const {
    need(finite(value),"DECIMAL_RANGE",field);
    const double scaled=value*GRID;const auto q=(int64_t)std::llround(scaled);
    // Binary representation allowance only. The value is never changed in
    // params or geometry; decimal arithmetic for metadata uses exact nm units.
    need(std::abs(scaled-q)<=std::max(1e-7,std::abs(scaled)*std::numeric_limits<double>::epsilon()*4),"PARAMETER_STORAGE_GRID",field);
    return q;
  }
  void diagnostic(uint32_t code,uint32_t field,const std::string& msg){
    ArchMechDiagnostic d{};d.code=code;d.field_id=field;copystr(d.message,msg);out.diagnostics.push_back(d);
  }
  uint32_t feature(const std::string& id,uint32_t kind,uint32_t field,uint32_t role,uint32_t group,
                   std::array<double,6> dims={},uint64_t source=0,uint64_t provenance=0){
    need(out.features.size()<MAX_PARTS*4,"FEATURE_LIMIT");
    ArchMechFeature f{};copystr(f.id,id);f.kind=kind;f.parameter_id=field;f.role=role;f.group=group;
    f.source_id=source?source:r.source.source_id;f.provenance_id=provenance?provenance:(field?params[field].provenance_id:r.source.provenance_id);
    std::copy(dims.begin(),dims.end(),f.dimensions);out.features.push_back(f);return (uint32_t)out.features.size()-1;
  }
  void proposal(uint32_t id,double after,const std::string& reason){
    ArchMechProposal p{};p.field_id=id;p.mode=AM_MM;p.datum=params[id].datum;p.reference_layer=params[id].reference_layer;
    if(fields[id-1].kind!=1)p.mode=AM_SCALAR;
    p.before=values[id];p.after=after;p.applicable=after>=fields[id-1].min&&after<=fields[id-1].max;
    copystr(p.reason,reason);out.proposals.push_back(p);
  }
  void height(uint32_t id,uint32_t datum,double z0){
    used[id]=true;
    const auto& p=params[id];const double amount=values[id];
    const double z1=z0+amount;
    const int64_t start=units(z0,id),target=start+units(amount,id);
    need(datum<AM_DATUM_COUNT&&std::isfinite(datums[datum])&&units(datums[datum],id)==start,"INTERNAL_DATUM_REGISTRY",id,AM_KERNEL_ERROR);
    // ABI2's legacy all-zero MM binding means unspecified. Nonzero metadata
    // and every layers binding must name a real face at this exact start Z.
    const bool declared=p.mode==AM_LAYERS||p.datum!=AM_BED||p.reference_layer!=0;
    uint32_t reference=p.reference_layer;
    if(declared){
      need(p.datum<AM_DATUM_COUNT&&std::isfinite(datums[p.datum])&&units(datums[p.datum],id)==start,"HEIGHT_DATUM_MISMATCH",id);
      need(boundary_units(reference)==start,"HEIGHT_REFERENCE_LAYER_DOES_NOT_MEET_FEATURE",id);
    }else{
      reference=start==0?0:start>=r.schedule.first_nm?1+uint32_t((start-r.schedule.first_nm)/r.schedule.regular_nm):UINT32_MAX;
      if(reference==UINT32_MAX||boundary_units(reference)!=start){
        out.intervals.push_back({id,datum,p.mode,UINT32_MAX,z0,z1,0,0,0});
        diagnostic(109,id,"OFF_GRID_DATUM_CONVERSION_UNAVAILABLE: nominal geometry retained; no layer proposal from an unaligned start face");return;
      }
    }
    const uint32_t lo=target<r.schedule.first_nm?0:1+uint32_t((target-r.schedule.first_nm)/r.schedule.regular_nm);
    const uint32_t hi=boundary_units(lo)==target?lo:lo+1;
    const int64_t df=boundary_units(lo)-target,dc=boundary_units(hi)-target;
    const int64_t dn=-df<dc?df:dc<-df?dc:(((lo-reference)%2)==0?df:dc);
    out.intervals.push_back({id,datum,p.mode,reference,z0,z1,df/GRID,dc/GRID,dn/GRID});
  }
  CrossSection ring_set(uint32_t start,uint32_t count,uint32_t rule){
    checkpoint();
    need(count>0&&uint64_t(start)+count<=r.source.ring_count&&rule<=1,"SOURCE_RING_RANGE");
    Polygons ps;
    for(uint32_t i=start;i<start+count;i++){
      checkpoint();
      const auto& ring=r.source.rings[i];
      need(ring.point_count>=3&&uint64_t(ring.point_start)+ring.point_count<=r.source.point_count,"SOURCE_POINT_RANGE");
      SimplePolygon p;
      for(uint32_t j=0;j<ring.point_count;j++){
        const uint32_t q=ring.point_start+j;const int64_t x=r.source.xy[2*q],y=r.source.xy[2*q+1];
        need(x>=-10000000000LL&&x<=10000000000LL&&y>=-10000000000LL&&y<=10000000000LL,"SOURCE_COORDINATE_RANGE");
        const vec2 xy(x/GRID,y/GRID);
        need(p.empty()||xy!=p.back(),"SOURCE_REPEATED_VERTEX");p.push_back(xy);
      }
      for(uint32_t j=0;j<ring.point_count;j++){
        const uint32_t a=ring.point_start+j,b=ring.point_start+(j+1)%ring.point_count;
        need(std::abs(r.source.xy[2*a]-r.source.xy[2*b])>=2||std::abs(r.source.xy[2*a+1]-r.source.xy[2*b+1])>=2,"SOURCE_BELOW_BOOLEAN_RESOLUTION");
      }
      need(p.front()!=p.back(),"SOURCE_CLOSURE_DUPLICATE");ps.push_back(std::move(p));
    }
    CrossSection result(ps,rule?CrossSection::FillRule::EvenOdd:CrossSection::FillRule::NonZero);
    need(!result.IsEmpty(),"SOURCE_EMPTY_REGION");
    std::set<std::pair<double,double>> boundary_points;
    for(const auto& path:result.ToPolygons())for(const auto& point:path)
      need(boundary_points.emplace(point.x,point.y).second,"SOURCE_PLANAR_POINT_CONTACT");
    return result;
  }
  CrossSection circle(double radius,bool hole,uint32_t f,double tolerance=0){
    need(radius>0&&finite(radius),"INVALID_CIRCLE_RADIUS");
    if(tolerance==0)tolerance=r.mating_tolerance_mm;
    // Half the request reserved for flattening; numeric and boolean ledger is separate.
    const double budget=tolerance/2;
    const double angle=std::acos(hole?radius/(radius+budget):1-std::min(budget/radius,1.));
    const double required=std::ceil(PI/angle);
    need(std::isfinite(required)&&required<=4096,"CURVE_COMPLEXITY_LIMIT");
    const uint32_t n=std::max(8u,4u*(uint32_t)std::ceil(required/4.));
    const double c=std::cos(PI/n),rad=hole?radius/c:radius,phase=hole?PI/n:0;
    SimplePolygon pts;
    for(uint32_t i=0;i<n;i++){double a=phase+2*PI*i/n;pts.push_back({rad*std::cos(a),rad*std::sin(a)});}
    const double err=hole?rad-radius:radius*(1-c);
    // ClipperD uses precision 8 in pinned Manifold. This records its XY rounding allowance;
    // it is not an epsilon offset, clearance compensation, or proof for arbitrary CSG.
    out.curves.push_back({f,n,hole?1u:0u,0,radius,hole?-2e-8:-err-2e-8,hole?err+2e-8:2e-8,tolerance});
    return CrossSection(pts,CrossSection::FillRule::NonZero);
  }
  CrossSection offset(const CrossSection& p,double d){
    // Miter joins, limit 2, are explicit for structural walls. No radius segments are inferred.
    const auto q=p.Offset(d,CrossSection::JoinType::Miter,2.);
    if(!q.IsEmpty()){auto bb=q.Bounds();need(finite(bb.min.x)&&finite(bb.min.y)&&finite(bb.max.x)&&finite(bb.max.y),"OFFSET_RANGE");}
    return q;
  }
  ArchMechMaterial material(uint32_t role){return palette[role];}
  void add(Manifold mesh,uint32_t f,uint32_t role,uint32_t group,const ArchMechMaterial* mat=nullptr){
    mesh=evaluate(mesh);
    if(mesh.IsEmpty())return;
    need(mesh.Status()==Manifold::Error::NoError,"KERNEL_CONSTRUCTION",0,AM_KERNEL_ERROR);
    need(pieces.size()<MAX_PARTS,"PART_LIMIT");pieces.push_back({std::move(mesh),f,role,group,mat?*mat:material(role)});
  }
  Manifold group(uint32_t group_id){std::vector<Manifold> ms;for(auto& p:pieces)if(p.group==group_id)ms.push_back(p.mesh);return evaluate(Manifold::BatchBoolean(ms,manifold::OpType::Add));}
  void cut(const Manifold& tool,uint32_t group_id){
    // A failed Manifold is empty too, so IsEmpty() alone would drop an errored cutter and
    // make the whole cut a silent no-op. Subtracting used to carry that error to the part.
    const auto checked=evaluate(tool);
    if(checked.IsEmpty())return;
    const auto b=checked.BoundingBox();
    for(auto& p:pieces)if(p.group==group_id&&!p.mesh.IsEmpty()){
      const auto a=p.mesh.BoundingBox();
      // Closed-solid subtraction cannot change a part when the boxes have no
      // common interior. Preserve its boundary exactly in that case.
      // Deliberately no epsilon and no volume threshold.
      if(a.max.x<=b.min.x||b.max.x<=a.min.x||a.max.y<=b.min.y||b.max.y<=a.min.y||a.max.z<=b.min.z||b.max.z<=a.min.z)continue;
      p.mesh-=checked;
    }
  }
  void initialize();
  void source_body();
  void source_bevel();
  Manifold boundary_profile(const CrossSection&,const std::vector<vec2>&,uint32_t,double);
  Manifold perimeter_groove(const CrossSection&,double,double,uint32_t);
  Manifold bounded_ball(double,uint32_t,double);
  void eyelet(bool tray);
  void strap();
  void lego();
  void clicky();
  void charm();
  void verify_cavities(const std::vector<Piece>&);
  void verify_tunnels(const std::vector<Piece>&);
  void finish();
  void capture_guard();
};

void Builder::initialize(){
  need(r.abi_version==2&&r.product<=AM_CHARM,"ABI_OR_PRODUCT");
  need(r.parameter_count<AM_FIELD_COUNT&&(!r.parameter_count||r.parameters),"PARAMETER_ARRAY");
  need(r.material_count<=AM_ROLE_COUNT&&(!r.material_count||r.materials),"MATERIAL_ARRAY");
  need(r.schedule.version==1&&r.schedule.first_nm>0&&r.schedule.first_nm<=1000000&&r.schedule.regular_nm>=80000&&r.schedule.regular_nm<=300000,"SCHEDULE_DOMAIN");
  need(r.schedule.first_source<=1&&r.schedule.regular_source<=1&&r.schedule.reserved==0,"SCHEDULE_METADATA");
  need(std::isfinite(r.mating_tolerance_mm)&&r.mating_tolerance_mm>=0.000001&&r.mating_tolerance_mm<=0.001,"MATING_TOLERANCE");
  need(std::isfinite(r.export_tolerance_mm)&&r.export_tolerance_mm>=0.000001&&r.export_tolerance_mm<=0.004,"EXPORT_TOLERANCE");
  for(uint32_t id=1;id<AM_FIELD_COUNT;id++)params[id]=arch_mech_default_parameter(r.product,id);
  params[AM_F_layerH].value=r.schedule.regular_nm/GRID;
  std::array<bool,AM_FIELD_COUNT> seen{};
  for(uint32_t i=0;i<r.parameter_count;i++){
    const auto& p=r.parameters[i];need(p.field_id>0&&p.field_id<AM_FIELD_COUNT,"UNKNOWN_PARAMETER");
    need(!seen[p.field_id],"DUPLICATE_PARAMETER",p.field_id);seen[p.field_id]=true;params[p.field_id]=p;
  }
  for(uint32_t id=1;id<AM_FIELD_COUNT;id++){
    auto& p=params[id];const auto& f=fields[id-1];
    need(p.origin<=AM_PRESET&&p.mode<=AM_AUTO_BODY_MIDPOINT&&(p.datum<AM_DATUM_COUNT||(f.source==1&&f.kind==1&&p.datum>=128&&p.datum<135)),"PARAMETER_TAG",id);
    need(std::isfinite(p.value),"NONFINITE_PARAMETER",id);
    double val=p.value;
    if(f.kind==1){
      need(p.mode!=AM_SCALAR,"HEIGHT_REQUIRES_MODE",id);
      if(p.mode==AM_LAYERS){
        need(p.layer_count<=1000000&&p.reference_layer<=1000000-p.layer_count,"LAYER_COUNT_RANGE",id);
        need(p.datum!=AM_BED||p.reference_layer==0,"BED_REFERENCE_LAYER",id);
        const bool down=id==AM_F_bandCap||(id==AM_F_artH&&params[AM_F_artMode].value==1);
        if(down){need(p.layer_count<=p.reference_layer,"DOWNWARD_LAYERS_BELOW_BED",id);val=(boundary_units(p.reference_layer)-boundary_units(p.reference_layer-p.layer_count))/GRID;}
        else val=(boundary_units(p.reference_layer+p.layer_count)-boundary_units(p.reference_layer))/GRID;
      }else if(p.mode==AM_AUTO_BODY_HEIGHT){need(id==AM_F_ringH,"AUTO_MODE_UNSUPPORTED",id);need(p.value==0,"AUTO_MODE_REQUIRES_STORED_ZERO",id);val=0;}
      else need(p.mode==AM_MM,"HEIGHT_MODE",id);
    }else need(p.mode==AM_SCALAR||(id==AM_F_legoRanhZ&&p.mode==AM_AUTO_BODY_MIDPOINT&&p.value==0),"SCALAR_REQUIRES_MODE",id);
    need(val>=f.min&&val<=f.max,"PARAMETER_DOMAIN",id);
    if(f.kind==2||f.kind==3)need(val==std::floor(val),"PARAMETER_ENUM_OR_BOOLEAN",id);
    if(field_quantum[id-1]>=1)need(val==std::floor(val),"PARAMETER_INTEGER_REQUIRED",id);
    const auto stored=units(val,id),minimum=units(f.min,id),quantum=units(field_quantum[id-1],id);
    need(quantum>0&&(stored-minimum)%quantum==0,"PARAMETER_STORAGE_GRID",id);
    need(p.reference_layer<=1000000,"LAYER_INDEX_RANGE",id);
    if(id==AM_F_layerH){need(near(val,r.schedule.regular_nm/GRID),"SCHEDULE_ALIAS_MISMATCH",id);}
    values[id]=val;
    out.parameters.push_back(p);
  }
  if(params[AM_F_ringH].mode==AM_AUTO_BODY_HEIGHT)values[AM_F_ringH]=values[AM_F_baseH];
  need(params[AM_F_strapSeg].origin!=AM_USER,"LEGACY_STRAP_SEG_REQUIRES_EXPLICIT_TOLERANCE_MIGRATION",AM_F_strapSeg,AM_UNSUPPORTED);
  need(params[AM_F_impVox].origin!=AM_USER,"LEGACY_VOXEL_FIELD_REQUIRES_PARENT_MIGRATION",AM_F_impVox,AM_UNSUPPORTED);
  need(!(r.product==AM_KEYCHAIN&&values[AM_F_ringOn]&&values[AM_F_ringH]==0),"RING_ZERO_REQUIRES_AUTO",AM_F_ringH);
  need(v(AM_F_impOn)==0,"IMPORTED_MESH_CSG_REQUIRES_PARENT_EXECUTOR",AM_F_impOn,AM_UNSUPPORTED);
  const uint32_t colors[AM_ROLE_COUNT]={0x30353bff,0xf06449ff,0xffffffff,0x30353bff,0x30353bff,0x548687ff,0x30353bff,0xffffffff,0x30353bff};
  for(uint32_t role=0;role<AM_ROLE_COUNT;role++)palette[role]={role,colors[role],role==AM_ARTWORK?2u:1u,AM_AUTO,0};
  std::array<bool,AM_ROLE_COUNT> role_seen{};
  for(uint32_t i=0;i<r.material_count;i++){
    const auto& m=r.materials[i];need(m.role<AM_ROLE_COUNT&&!role_seen[m.role],"ROLE_DUPLICATE_OR_UNKNOWN");
    need(m.slot>=1&&m.slot<=16&&m.origin<=AM_PRESET&&(m.rgba&255)==255,"MATERIAL_DOMAIN");role_seen[m.role]=true;palette[m.role]=m;
  }
  if(r.product==AM_CLICKY&&b(AM_F_linkBody))for(uint32_t role:{AM_SKIRT,AM_STEM})if(palette[role].origin!=AM_USER){auto id=palette[role].role;palette[role]=palette[AM_BODY];palette[role].role=id;palette[role].origin=AM_AUTO;}
  const auto& s=r.source;
  need(s.attachment_count<=256&&(!s.attachment_count||s.attachments)&&s.reserved2==0,"SOURCE_ATTACHMENT_ARRAY");
  need(s.bevel_override_count<=1025&&(!s.bevel_override_count||s.bevel_overrides)&&s.reserved3==0,"SOURCE_BEVEL_OVERRIDE_ARRAY");
  need(s.version==2&&s.reserved==0&&s.mode<=AM_PREPARED_SLABS&&s.point_count>=3&&s.point_count<=MAX_POINTS&&s.xy&&s.rings&&s.ring_count>0&&s.ring_count<=MAX_POINTS/3,"SOURCE_CONTEXT");
  need(s.slab_count<=1024&&(!s.slab_count||s.slabs),"SOURCE_SLAB_LIMIT");
  need(s.recipe_binding_count<AM_FIELD_COUNT&&(!s.recipe_binding_count||s.recipe_bindings),"SOURCE_BINDINGS_ARRAY");
  std::array<bool,AM_FIELD_COUNT> bound{};
  for(uint32_t i=0;i<s.recipe_binding_count;i++){
    const auto& a=s.recipe_bindings[i];need(a.field_id>0&&a.field_id<AM_FIELD_COUNT&&!bound[a.field_id],"SOURCE_BINDING_ID");
    const auto& p=params[a.field_id];
    need(a.mode==p.mode&&a.value==p.value&&a.datum==p.datum&&a.layer_count==p.layer_count&&a.reference_layer==p.reference_layer,"STALE_SOURCE_RECIPE",a.field_id);
    bound[a.field_id]=true;
  }
  for(uint32_t id=1;id<AM_FIELD_COUNT;id++)if(fields[id-1].source&&(fields[id-1].products&(1u<<r.product)))need(bound[id],"MISSING_SOURCE_RECIPE_BINDING",id);
  footprint=ring_set(s.footprint_ring_start,s.footprint_ring_count,s.fill_rule);bounds=footprint.Bounds();
  need(bounds.max.x-bounds.min.x<=1000&&bounds.max.y-bounds.min.y<=1000,"SOURCE_PHYSICAL_SIZE_LIMIT");
  need(s.source_id!=0&&s.provenance_id!=0,"SOURCE_PROVENANCE_REQUIRED");
  if(r.product==AM_CLICKY){cap_under=std::max(v(AM_F_skirtH),v(AM_F_postH));post_tip=cap_under-v(AM_F_postH);body_z=cap_under;body_h=v(AM_F_plateT);}
  else {body_h=v(AM_F_baseH);if(r.product==AM_CHARM&&e(AM_F_charmGan)==1)body_z=v(AM_F_charmVanhH)+v(AM_F_charmCoH);}
  datums.fill(std::numeric_limits<double>::quiet_NaN());datums[AM_BED]=0;datums[AM_BODY_BOTTOM]=body_z;
  if(r.product==AM_CLICKY){
    datums[AM_CAP_UNDERSIDE]=cap_under;datums[AM_POST_TIP]=post_tip;
    datums[AM_COLLAR_BOTTOM]=cap_under-v(AM_F_collarH);datums[AM_SKIRT_BOTTOM]=cap_under-v(AM_F_skirtH);
    if(b(AM_F_housing)){datums[AM_TRAY_FLOOR_TOP]=v(AM_F_hFloor);datums[AM_TRAY_PIN_TOP]=v(AM_F_hFloor)+v(AM_F_pinD);datums[AM_TRAY_BODY_TOP]=v(AM_F_hFloor)+v(AM_F_pinD)+v(AM_F_hSocketD);}
  }
  if(r.product==AM_CHARM){datums[AM_CHARM_FLANGE_TOP]=v(AM_F_charmVanhH);datums[AM_CHARM_NECK_TOP]=v(AM_F_charmVanhH)+v(AM_F_charmCoH);}
  if(s.mode==AM_RAISED_BODY)need(e(AM_F_artMode)==0&&!b(AM_F_rimOn)&&!b(AM_F_layerBand),"PREPARED_SLABS_REQUIRED_FOR_STYLE_RIM_BANDS_CORE",AM_F_artMode,AM_UNSUPPORTED);
  if(r.product==AM_CLICKY)height(AM_F_plateT,AM_CAP_UNDERSIDE,body_z);else height(AM_F_baseH,AM_BODY_BOTTOM,body_z);
  out.revision=r.revision;
  diagnostic(100,0,"PRESET_UNQUALIFIED: geometry computation does not certify hardware fit, printing or slicer compatibility");
  diagnostic(101,0,"ERROR_LEDGER: analytic circle flatten bound recorded; whole arbitrary boolean/source pipeline bound remains unverified");
}

void Builder::source_body(){
  const auto& s=r.source;
  std::set<uint64_t> source_ids;
  if(s.mode==AM_RAISED_BODY){
    source_ids.insert(s.source_id);
    auto f=feature("source:body",0,r.product==AM_CLICKY?AM_F_plateT:AM_F_baseH,AM_BODY,0,{body_h,body_z,0,0,0,0});
    add(prism(footprint,body_z,body_z+body_h),f,AM_BODY,0);
    source_patches.push_back({footprint,body_z,body_z+body_h,(uint32_t)pieces.size()-1,false,r.source.source_id,0});
  }else need(s.slab_count>0,"PREPARED_SLABS_EMPTY");
  for(uint32_t i=0;i<s.slab_count;i++){
    const auto& slab=s.slabs[i];need(slab.kind<=AM_SOURCE_BED_TEXT_BASE&&slab.slot>=1&&slab.slot<=16&&slab.origin<=AM_PRESET&&(slab.rgba&255)==255&&slab.semantic_id!=0&&slab.provenance_id!=0,"SOURCE_SLAB_METADATA");
    need(source_ids.insert(slab.semantic_id).second,"SOURCE_SEMANTIC_ID_DUPLICATE");
    const bool text=slab.kind>=AM_SOURCE_TEXT;const bool bed=slab.kind>=AM_SOURCE_BED_TEXT;const double source_base=bed?0:body_z;
    need((slab.kind==AM_SOURCE_BODY&&slab.role==AM_BODY)||(slab.kind==AM_SOURCE_ART&&(slab.role==AM_ARTWORK||slab.role==AM_RIM))||((slab.kind==AM_SOURCE_TEXT||slab.kind==AM_SOURCE_BED_TEXT)&&slab.role==AM_TEXT)||((slab.kind==AM_SOURCE_TEXT_BASE||slab.kind==AM_SOURCE_BED_TEXT_BASE)&&slab.role==AM_TEXT_BASE),"SOURCE_SLAB_ROLE");
    need(text==(slab.attachment_id!=0),"SOURCE_TEXT_ATTACHMENT_REQUIRED");
    need(finite(slab.z0)&&finite(slab.z1)&&slab.z1>slab.z0&&slab.z0>=0,"SOURCE_SLAB_Z");
    if(s.mode==AM_RAISED_BODY&&!text)need(slab.kind==AM_SOURCE_ART&&slab.z0>=body_h,"SOURCE_ART_MUST_BE_ABOVE_BODY");
    auto shape=ring_set(slab.ring_start,slab.ring_count,slab.fill_rule);
    const uint32_t role=slab.role;
    auto f=feature("source:slab:"+std::to_string(slab.semantic_id),2,AM_F_artMode,role,bed?2:0,{slab.z0,slab.z1,0,0,0,0},slab.semantic_id,slab.provenance_id);
    auto mesh=prism(shape,source_base+slab.z0,source_base+slab.z1);
    for(auto& p:pieces)need(!nonempty(mesh^p.mesh),"SOURCE_MATERIAL_INTERIOR_OVERLAP");
    ArchMechMaterial m{role,slab.rgba,slab.slot,slab.origin,slab.provenance_id};
    if(m.origin!=AM_USER&&palette[role].origin==AM_USER)m=palette[role];
    add(mesh,f,role,bed?2:0,&m);
    source_patches.push_back({shape,source_base+slab.z0,source_base+slab.z1,(uint32_t)pieces.size()-1,text,slab.semantic_id,slab.attachment_id});
  }
  need(nonempty(group(0)),"SOURCE_BODY_EMPTY");
  // A source contract must supply a physical lower body host. It may retain holes and islands.
  const auto physical=group(0).BoundingBox();
  need(near(physical.min.z,body_z)&&physical.max.z>=body_z+body_h-1e-7,"SOURCE_BODY_DATUM_NOT_PRESENT");
  if(s.mode==AM_PREPARED_SLABS){
    double first=body_h;
    for(uint32_t i=0;i<s.slab_count;i++){
      if(s.slabs[i].z0>0)first=std::min(first,s.slabs[i].z0);
      if(s.slabs[i].z1>0)first=std::min(first,s.slabs[i].z1);
    }
    // Validate the typed slab partition at an interior Z interval directly.
    // Manifold::Slice interpolates triangle edges, adding a second rounding path
    // to an exact supplied footprint (visible on curved circle contours).
    std::vector<CrossSection> body;for(const auto& p:source_patches)if(!p.text&&p.z0<body_z+first/2&&p.z1>body_z+first/2)body.push_back(p.shape);
    const CrossSection support=CrossSection::BatchBoolean(body,manifold::OpType::Add);
    need(contained(footprint,support)&&contained(support,footprint),"SOURCE_BOTTOM_SUPPORT_MUST_MATCH_FOOTPRINT");
  }
  std::set<uint64_t> ids;
  for(uint32_t i=0;i<s.attachment_count;i++){
    const auto& a=s.attachments[i];need(a.semantic_id&&a.provenance_id&&ids.insert(a.semantic_id).second,"SOURCE_ATTACHMENT_ID");
    need((a.role==AM_TEXT||a.role==AM_TEXT_BASE)&&finite(a.z0)&&finite(a.z1)&&a.z0>=0&&a.z1>a.z0,"SOURCE_ATTACHMENT_METADATA");
    auto shape=ring_set(a.ring_start,a.ring_count,a.fill_rule);std::vector<CrossSection> lower;
    int attachment_group=-1;for(const auto& p:source_patches)if(p.attachment==a.semantic_id){int g=(int)pieces[p.piece].group;need(attachment_group<0||attachment_group==g,"MIXED_ATTACHMENT_DATUM");attachment_group=g;}
    double attachment_base=attachment_group==2?0:body_z;
    double lo=LIMIT,hi=-LIMIT;
    for(const auto& p:source_patches)if(p.attachment==a.semantic_id){lo=std::min(lo,p.z0);hi=std::max(hi,p.z1);if(near(p.z0,attachment_base+a.z0))lower.push_back(p.shape);}
    need(near(lo,attachment_base+a.z0)&&near(hi,attachment_base+a.z1),"SOURCE_ATTACHMENT_EXTENT_MISMATCH");
    auto support=CrossSection::BatchBoolean(lower,manifold::OpType::Add);
    need(contained(shape,support)&&contained(support,shape),"SOURCE_ATTACHMENT_FOOTPRINT_MISMATCH");
  }
  for(const auto& p:source_patches)if(p.text)need(ids.count(p.attachment)>0,"SOURCE_ATTACHMENT_ORPHAN");
}

// A boundary tube with the declared radius at each Z plane. All caps,
// triangulation, intersections and corner unions are performed by the libraries.
Manifold Builder::boundary_profile(const CrossSection& shape,const std::vector<vec2>& radius_z,uint32_t f,double tolerance){
  need(radius_z.size()>=2&&radius_z.size()<=258,"PROFILE_RESOURCE_LIMIT");
  double radius=0;for(const auto& q:radius_z)radius=std::max(radius,q.x);
  need(radius>0,"PROFILE_RADIUS");
  const uint32_t n=std::max(8u,4u*(uint32_t)std::ceil(PI/std::acos(radius/(radius+tolerance/4))/4));
  need(n<=2048,"REVOLVE_RESOURCE_LIMIT");
  const double zbase=radius_z.front().y,ztop=radius_z.back().y;
  SimplePolygon radial;
  auto push=[](SimplePolygon& p,vec2 x){if(p.empty()||p.back()!=x)p.push_back(x);};
  // Flatten in the local datum: the zero-radius tip stays exactly at zero.
  // Extend above the top design plane so profile quantization cannot leave a
  // nanometre membrane at the manufactured top. The caller clips to exact Z.
  push(radial,{0,0});for(const auto& q:radius_z)push(radial,{q.x,q.y-zbase});
  push(radial,{radius_z.back().x,ztop-zbase+1});push(radial,{0,ztop-zbase+1});
  if(radial.front()==radial.back())radial.pop_back();
  auto strip_shape=CrossSection(radial,CrossSection::FillRule::NonZero);
  std::vector<Manifold> tools;size_t edges=0;
  for(const auto& path:shape.ToPolygons()){
    edges+=path.size();need(edges<=512,"BOUNDARY_SWEEP_EDGE_BUDGET");
    for(size_t i=0;i<path.size();i++){
      const auto a=path[i],b=path[(i+1)%path.size()],d=b-a;const double length=std::hypot(d.x,d.y),angle=std::atan2(d.y,d.x)*180/PI;
      need(length>=2e-6,"SWEEP_EDGE_BELOW_RESOLUTION");
      tools.push_back(Manifold::Extrude(strip_shape.ToPolygons(),length).Rotate(90,0,angle+90).Translate({a.x,a.y,zbase}));
      const auto previous=a-path[(i+path.size()-1)%path.size()];
      const double turn=std::atan2(previous.x*d.y-previous.y*d.x,previous.x*d.x+previous.y*d.y);
      if(turn<0){
        // Only a reentrant vertex needs a rolling sector. Convex corners are
        // already covered by the incident inside strips. A full ball here
        // creates redundant near-tangent intersections at the zero-radius tip.
        auto corner=Manifold::Revolve(strip_shape.ToPolygons(),n,-turn*180/PI).Rotate(0,0,angle+90).Translate({a.x,a.y,zbase});
        tools.push_back(corner);
      }
    }
  }
  out.curves.push_back({f,n,2,0,radius,-2e-8,radius*(1-std::cos(PI/n))+2e-8,tolerance});
  return Manifold::BatchBoolean(tools,manifold::OpType::Add);
}

Manifold Builder::bounded_ball(double radius,uint32_t f,double tolerance){
  // Convex sphere: face-plane distances bound its insphere exactly. Scaling by
  // R/minDistance produces an enclosing cutter; all vertex radii bound overshoot.
  for(int n=16;n<=512;n*=2){
    auto ball=evaluate(Manifold::Sphere(radius,n));const auto mesh=ball.GetMeshGL64();double inner=radius;
    for(size_t i=0;i<mesh.triVerts.size();i+=3){
      vec3 a(&mesh.vertProperties[mesh.triVerts[i]*mesh.numProp]),b(&mesh.vertProperties[mesh.triVerts[i+1]*mesh.numProp]),c(&mesh.vertProperties[mesh.triVerts[i+2]*mesh.numProp]);
      auto normal=la::cross(b-a,c-a);const double length=la::length(normal);need(length>0,"SPHERE_FACE_DOMAIN");
      inner=std::min(inner,std::abs(la::dot(normal,a))/length);
    }
    const double excess=radius*(radius/inner-1);
    if(excess<=tolerance/2){out.curves.push_back({f,(uint32_t)n,3,0,radius,-excess,0,tolerance});return ball.Scale(vec3(radius/inner));}
  }
  throw Failure(AM_INVALID,AM_F_legoRanhR,"SPHERE_BOUND_RESOURCE_LIMIT");
}

Manifold Builder::perimeter_groove(const CrossSection& shape,double radius,double z,uint32_t f){
  // Distance tube around exterior boundary segments, clipped by the material
  // solids when subtracted. Full circular strips extend into empty space and
  // avoid a coincident cutter cap on the source wall. No epsilon extension,
  // radius change or source displacement is involved. Convex inside sectors
  // are already covered by their incident strips; reentrant corners need a
  // rolling sector. Holes are not selected as groove boundaries.
  auto disk=circle(radius,true,f,r.mating_tolerance_mm/2);
  auto half=(disk^rect(4*radius,4*radius,2*radius,0)).Translate({0,radius});
  auto full=disk.Translate({0,radius});
  const uint32_t n=std::max(8u,4u*(uint32_t)std::ceil(PI/std::acos(radius/(radius+r.mating_tolerance_mm/4))/4));
  need(n<=4096,"GROOVE_ANGULAR_RESOURCE_LIMIT");
  const double sec=1/std::cos(PI/n);
  // Pinned Revolve interprets an explicit count >2 over the ENTIRE supplied
  // sweep, not per revolution. Counts <=2 activate its global Quality policy.
  // Scale by the actual sweep so delta-angle <= 2*pi/n with an explicit count.
  auto arc_segments=[&](double turn){return std::max(3u,uint32_t(std::ceil(-turn*n/(2*PI))));};
  const auto paths=shape.ToPolygons();uint64_t estimated_triangles=0;
  for(const auto& path:paths){
    double area=0;for(size_t i=0;i<path.size();i++){auto a=path[i],b=path[(i+1)%path.size()];area+=a.x*b.y-a.y*b.x;}if(area<=0)continue;
    checkpoint();estimated_triangles+=uint64_t(path.size())*4*full.NumVert();
    for(size_t i=0;i<path.size();i++){
      auto d=path[(i+1)%path.size()]-path[i],previous=path[i]-path[(i+path.size()-1)%path.size()];
      double turn=std::atan2(previous.x*d.y-previous.y*d.x,previous.x*d.x+previous.y*d.y);
      if(turn<0)estimated_triangles+=uint64_t(2*half.NumVert())*(arc_segments(turn)+2);
    }
    need(estimated_triangles<=MAX_TRIANGLES,"GROOVE_PRIMITIVE_TRIANGLE_BUDGET",AM_F_legoRanhR);
  }
  // Streaming balanced union: input scanning is bounded by MAX_POINTS, while
  // generated/evaluated triangles are bounded separately. A dense, nearly
  // convex outline needs many cheap strips, not many full revolved sectors.
  std::vector<Manifold> batch,frontier;std::vector<bool> occupied;
  uint64_t primitive_triangles=0,evaluated_triangles=0;size_t edges=0;
  auto measured=[&](Manifold m){m=evaluate(m);const auto tris=m.NumTri();
    need(tris<=MAX_TRIANGLES,"GROOVE_RESULT_TRIANGLE_BUDGET",AM_F_legoRanhR,AM_INVALID);
    evaluated_triangles+=tris;need(evaluated_triangles<=uint64_t(MAX_TRIANGLES)*16,"GROOVE_EVALUATION_WORK_BUDGET",AM_F_legoRanhR,AM_INVALID);return m;};
  auto flush=[&](){if(batch.empty())return;auto m=measured(Manifold::BatchBoolean(batch,manifold::OpType::Add));batch.clear();size_t level=0;
    while(level<occupied.size()&&occupied[level]){m=measured(frontier[level]+m);frontier[level]=Manifold();occupied[level]=false;++level;}
    if(level==frontier.size()){frontier.emplace_back();occupied.push_back(false);}frontier[level]=m;occupied[level]=true;
    uint64_t resident=0;for(size_t i=0;i<frontier.size();i++)if(occupied[i])resident+=frontier[i].NumTri();
    need(resident<=MAX_TRIANGLES,"GROOVE_FRONTIER_TRIANGLE_BUDGET",AM_F_legoRanhR);};
  auto append=[&](Manifold m){checkpoint();m=evaluate(m);primitive_triangles+=m.NumTri();
    need(primitive_triangles<=MAX_TRIANGLES,"GROOVE_PRIMITIVE_TRIANGLE_BUDGET",AM_F_legoRanhR,AM_INVALID);batch.push_back(m);if(batch.size()==32)flush();};
  for(const auto& path:paths){
    double area=0;for(size_t i=0;i<path.size();i++){auto a=path[i],b=path[(i+1)%path.size()];area+=a.x*b.y-a.y*b.x;}
    if(area<=0)continue;
    edges+=path.size();need(edges<=MAX_POINTS,"GROOVE_INPUT_POINT_BUDGET",AM_F_legoRanhR,AM_INVALID);
    for(size_t i=0;i<path.size();i++){
      auto a=path[i],b=path[(i+1)%path.size()],d=b-a;const double length=std::hypot(d.x,d.y),angle=std::atan2(d.y,d.x)*180/PI;
      need(length>=2e-6,"GROOVE_EDGE_BELOW_RESOLUTION");
      append(Manifold::Extrude(full.ToPolygons(),length).Rotate(90,0,angle+90).Translate({a.x,a.y,z-radius}));
      const auto previous=a-path[(i+path.size()-1)%path.size()];
      const double turn=std::atan2(previous.x*d.y-previous.y*d.x,previous.x*d.x+previous.y*d.y);
      if(turn<0){
        // Extend a tiny angular support into its adjacent strips instead of
        // constructing a microscopic wedge. Every added point stays inside
        // the same bounded vertex ball of the segment-distance tube. This
        // changes neither the nominal radius nor the allocated radial error.
        const double sweep=std::max(-turn,3*2*PI/n),padding=(sweep+turn)/2;
        append(Manifold::Revolve(half.Scale({sec,1}).ToPolygons(),arc_segments(turn),sweep*180/PI).Rotate(0,0,angle+90-padding*180/PI).Translate({a.x,a.y,z-radius}));
      }
    }
  }
  out.curves.push_back({f,n,2,0,radius,-2e-8,(radius+r.mating_tolerance_mm/4)*sec-radius+2e-8,r.mating_tolerance_mm});
  const double numericBudget=std::min(1e-7,r.mating_tolerance_mm/1000);
  // Explicit library topology tolerance on the single shared cutter, before
  // applying it to any material. No per-material offset or coordinate weld.
  out.curves.push_back({f,0,2,0,0,-numericBudget,numericBudget,r.mating_tolerance_mm});
  flush();batch.clear();for(size_t i=0;i<frontier.size();i++)if(occupied[i])batch.push_back(frontier[i]);
  auto tube=measured(Manifold::BatchBoolean(batch,manifold::OpType::Add));
  need(primitive_triangles<=estimated_triangles,"GROOVE_PRIMITIVE_ESTIMATE_MISMATCH",AM_F_legoRanhR,AM_KERNEL_ERROR);
  diagnostic(113,AM_F_legoRanhR,"GROOVE_WORK edges="+std::to_string(edges)+" estimate="+std::to_string(estimated_triangles)+" primitive="+std::to_string(primitive_triangles)+" evaluated="+std::to_string(evaluated_triangles));
  return evaluate(tube.AsOriginal().SetTolerance(numericBudget));
}

void Builder::source_bevel(){
  std::set<uint64_t> override_ids;
  for(uint32_t i=0;i<r.source.bevel_override_count;i++){
    const auto& o=r.source.bevel_overrides[i];
    need(o.target_id&&o.provenance_id&&override_ids.insert(o.target_id).second&&o.enabled<=1&&o.shape<=2&&o.steps>=1&&o.steps<=12&&o.origin==AM_USER&&finite(o.radius)&&o.radius>=fields[AM_F_topBevelR-1].min&&o.radius<=fields[AM_F_topBevelR-1].max,"BEVEL_OVERRIDE_DOMAIN",AM_F_topBevelR);
    need(std::any_of(source_patches.begin(),source_patches.end(),[&](const SourcePatch& p){return p.id==o.target_id;}),"BEVEL_OVERRIDE_ORPHAN");
    feature("source:bevel-override:"+std::to_string(o.target_id),2,AM_F_topBevel,AM_BODY,0,{(double)o.enabled,o.radius,(double)o.shape,(double)o.steps,(double)o.origin,0},o.target_id,o.provenance_id);
  }
  if(!b(AM_F_topBevel)&&!b(AM_F_bevelChu)&&!r.source.bevel_override_count)return;
  struct Top {CrossSection shape;double z;bool text;uint64_t id;const ArchMechBevelOverride* override;};std::vector<Top> tops;
  for(const auto& p:source_patches){
    const ArchMechBevelOverride* override=nullptr;
    for(uint32_t i=0;i<r.source.bevel_override_count;i++)if(r.source.bevel_overrides[i].target_id==p.id)override=&r.source.bevel_overrides[i];
    if(!(override?override->enabled:(p.text?b(AM_F_bevelChu):b(AM_F_topBevel))))continue;
    CrossSection exposed=p.shape;
    for(const auto& above:source_patches)if(above.z0<=p.z1+1e-9&&above.z1>p.z1+1e-9)exposed-=above.shape;
    if(exposed.IsEmpty())continue;
    auto it=tops.end();if(b(AM_F_bevelGop)&&!override)it=std::find_if(tops.begin(),tops.end(),[&](const Top& t){return !t.override&&t.text==p.text&&near(t.z,p.z1);});
    if(it==tops.end())tops.push_back({exposed,p.z1,p.text,p.id,override});else {it->shape+=exposed;it->id=std::min(it->id,p.id);}
  }
  std::vector<Manifold> cuts;
  for(const auto& t:tops){
    const double radius=t.override?t.override->radius:v(AM_F_topBevelR),tol=r.export_tolerance_mm;const int kind=t.override?(int)t.override->shape:e(AM_F_topBevelShape);
    const auto f=feature(std::string("source:bevel:")+(t.text?"text:":"top:")+std::to_string(t.id),1,t.text?AM_F_bevelChu:AM_F_topBevelR,t.text?AM_TEXT:AM_BODY,0,{radius,(double)kind,t.z,0,0,0},t.id,t.override?t.override->provenance_id:0);
    const int envelope_segments=std::max(8,4*(int)std::ceil(PI/std::acos(1-tol/(4*radius))/4));
    for(const auto& component:t.shape.Decompose())need(!component.Offset(-radius,CrossSection::JoinType::Round,2,envelope_segments).IsEmpty(),"BEVEL_RADIUS_ERASES_COMPONENT",AM_F_topBevelR);
    std::vector<vec2> profile;
    if(kind==2){
      uint32_t end=0;while(boundary(end)<t.z-1e-10)++end;
      const uint32_t count=t.override?t.override->steps:(uint32_t)v(AM_F_topBevelSeg);need(end>=count,"BEVEL_STEPS_BELOW_BED",AM_F_topBevelSeg);
      const uint32_t start=end-count;
      for(uint32_t i=0;i<count;i++){
        const double z0=boundary(start+i),z1=i+1==count?t.z:boundary(start+i+1),d=radius*(i+1)/count;
        profile.push_back({d,z0});profile.push_back({d,z1});
        feature("source:bevel:step:"+std::to_string(t.id)+":"+std::to_string(i),2,AM_F_topBevelSeg,t.text?AM_TEXT:AM_BODY,0,{z0,z1,d,(double)(start+i),0,0},t.id);
      }
    }else if(kind==1)profile={{0,t.z-radius},{radius,t.z}};
    else {
      const int n=std::max(1,(int)std::ceil((PI/2)/(2*std::acos(1-tol/(4*radius)))));
      need(n<=256,"BEVEL_ARC_RESOURCE_LIMIT");
      for(int i=0;i<=n;i++){const double a=PI/2*i/n;profile.push_back({radius*(1-std::cos(a)),t.z-radius+radius*std::sin(a)});}
      out.curves.push_back({f,(uint32_t)(4*n),2,0,radius,-radius*(1-std::cos(PI/(4*n)))-2e-8,2e-8,tol});
    }
    std::vector<CrossSection> support;
    for(const auto& p:source_patches)if(p.z0<profile.front().y-1e-7&&p.z1>=profile.front().y-1e-9)support.push_back(p.shape);
    need(contained(t.shape,CrossSection::BatchBoolean(support,manifold::OpType::Add)),"BEVEL_REQUIRES_POSITIVE_FLOOR",AM_F_topBevelR);
    if(kind==2){
      const int n=std::max(8,4*(int)std::ceil(PI/std::acos(1-tol/(4*radius))/4));
      need(n<=2048,"STEP_OFFSET_RESOURCE_LIMIT");
      for(size_t i=0;i<profile.size();i+=2){
        auto inset=t.shape.Offset(-profile[i].x,CrossSection::JoinType::Round,2,n);
        cuts.push_back(prism(t.shape-inset,profile[i].y,profile[i+1].y));
      }
      out.curves.push_back({f,(uint32_t)n,2,0,radius,-2e-8,radius*(1-std::cos(PI/n))+2e-8,tol});
    }else{
      auto swept=boundary_profile(t.shape,profile,f,tol);
      cuts.push_back(swept^prism(t.shape,profile.front().y,t.z));
    }
  }
  if(cuts.empty())return;
  const auto common=Manifold::BatchBoolean(cuts,manifold::OpType::Add);
  for(auto& p:pieces){p.mesh-=common;need(nonempty(p.mesh),"BEVEL_ERASES_SOURCE_MATERIAL",AM_F_topBevelR);}
}

void Builder::eyelet(bool tray){
  uint32_t g=tray?1:0;uint32_t role=tray?AM_TRAY:AM_BODY;
  const uint32_t outer=tray?AM_F_hRingOuterD:AM_F_ringOuterD,inner=tray?AM_F_hRingInnerD:AM_F_ringInnerD;
  const uint32_t angle=tray?AM_F_hRingAngle:AM_F_ringAngle,overlap=tray?AM_F_hRingOverlap:AM_F_ringOverlap,hid=tray?AM_F_hRingH:AM_F_ringH;
  const double ro=v(outer)/2,ri=v(inner)/2,h=v(hid),ol=v(overlap),a=v(angle)*PI/180;
  need(ro>ri&&ol>0&&ol<2*ro&&h>0,"EYELET_POSITIVE_WALL_AND_OVERLAP",outer);
  auto host=group(g);double z=tray?0:body_z;uint64_t host_id=r.source.source_id;
  if(!tray&&e(AM_F_ringTren)==1){
    const ArchMechAttachment* attachment=nullptr;
    for(uint32_t i=0;i<r.source.attachment_count;i++)if(r.source.attachments[i].semantic_id==r.source.eyelet_attachment_id)attachment=&r.source.attachments[i];
    need(attachment,"TEXT_ATTACHMENT_REQUIRED",AM_F_ringTren);
    std::vector<Manifold> selected;for(const auto& p:source_patches)if(p.attachment==attachment->semantic_id){selected.push_back(pieces[p.piece].mesh);g=pieces[p.piece].group;}
    host=Manifold::BatchBoolean(selected,manifold::OpType::Add);z=(g==2?0:body_z)+attachment->z0;role=attachment->role;host_id=attachment->semantic_id;
  }
  auto bb=host.BoundingBox(),anchor=bb;
  if(!tray&&e(AM_F_ringTren)==1)for(uint32_t i=0;i<r.source.attachment_count;i++)if(r.source.attachments[i].semantic_id==host_id){
    const auto& at=r.source.attachments[i];const auto boundary=ring_set(at.ring_start,at.ring_count,at.fill_rule).Bounds();anchor.min.x=boundary.min.x;anchor.min.y=boundary.min.y;anchor.max.x=boundary.max.x;anchor.max.y=boundary.max.y;
  }
  const double cx=(anchor.min.x+anchor.max.x)/2,cy=(anchor.min.y+anchor.max.y)/2;
  const double dx=std::cos(a),dy=std::sin(a);
  const double t=std::min(std::abs(dx)<1e-14?1e9:(anchor.max.x-anchor.min.x)/2/std::abs(dx),std::abs(dy)<1e-14?1e9:(anchor.max.y-anchor.min.y)/2/std::abs(dy));
  const double x=cx+dx*(t+ro-ol),y=cy+dy*(t+ro-ol);
  const std::string prefix=tray?"mech:tray:eyelet":"mech:keyring";
  auto f=feature(prefix,0,outer,role,g,{x,y,z,h,2*ro,2*ri},host_id);
  auto outside=prism(circle(ro,false,f,r.export_tolerance_mm).Translate({x,y}),z,z+h);
  need(nonempty(outside^host),"EYELET_DOES_NOT_ATTACH_TO_SELECTED_HOST",overlap);
  add(outside,f,role,g);
  auto bf=feature(prefix+":bore",1,inner,role,g,{x,y,z,h,2*ri,0});
  auto hole=circle(ri,true,bf).Translate({x,y});
  need(nonempty((outside-prism(hole,z,z+h))^host),"EYELET_BORE_ERASES_ATTACHMENT",overlap);
  cut(prism(hole,std::min(z,bb.min.z)-1,std::max(z+h,bb.max.z)+1),g);
  if(!tray&&e(AM_F_ringTren)==1)datums[AM_ATTACHMENT_BOTTOM]=z;
  height(hid,tray?AM_BED:(!tray&&e(AM_F_ringTren)==1?AM_ATTACHMENT_BOTTOM:AM_BODY_BOTTOM),z);
}

void Builder::strap(){
  const double radius=v(AM_F_strapD)/2,angle=v(AM_F_strapAngle),z=v(AM_F_strapZ),off=v(AM_F_strapOff),slot=v(AM_F_strapSlot),cham=v(AM_F_strapCham);
  const bool vertical=e(AM_F_strapSlotDir)==1;
  need(z-radius-(vertical?slot/2:0)>0&&z+radius+(vertical?slot/2:0)<body_h,"STRAP_POSITIVE_FLOOR_AND_ROOF",AM_F_strapZ);
  const double a=angle*PI/180,dx=std::cos(a),dy=std::sin(a),nx=-dy,ny=dx;
  const double cx=(bounds.min.x+bounds.max.x)/2+nx*off,cy=(bounds.min.y+bounds.max.y)/2+ny*off;
  auto f=feature("mech:strap:bore",1,AM_F_strapD,AM_BODY,0,{radius*2,z,off,angle,slot,vertical?1.:0.});
  double tol=r.mating_tolerance_mm;
  if(params[AM_F_strapTolerance].origin==AM_USER)tol=std::min(tol,v(AM_F_strapTolerance));
  auto profile=circle(radius,true,f,tol);
  if(slot>0){
    const vec2 shift=vertical?vec2(0,slot/2):vec2(slot/2,0);
    profile=CrossSection::Hull(std::vector<CrossSection>{profile.Translate(shift),profile.Translate(-shift)});
  }
  // local profile X=horizontal transverse, Y=Z, extrusion axis=XY angle.
  const double len=2*std::hypot(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y)+2*std::abs(off)+2;
  auto orient=[&](Manifold m,double along){return m.Rotate(90,0,angle+90).Translate({cx+dx*along,cy+dy*along,z});};
  auto cutter=orient(prism(profile,0,len),-len/2);
  need(nonempty(cutter^group(0)),"STRAP_BORE_MISSES_BODY",AM_F_strapOff);
  // A finite wall parallel to the bore inside its transverse band is a
  // lateral breakout, not an intentional axial mouth. Near-parallel spans
  // below the mouth construction threshold cannot certify containment either.
  // Check them locally before either mouth scan can skip them; global extrema
  // elsewhere in a concave footprint are not evidence for this wall.
  const double lateral_radius=radius+cham+(vertical?0:slot/2);
  uint32_t lateral_scanned=0;
  for(const auto& path:footprint.ToPolygons())for(size_t i=0;i<path.size();i++){
    checkpoint();need(++lateral_scanned<=MAX_POINTS,"STRAP_LATERAL_POINT_BUDGET",AM_F_strapCham);
    const auto pa=path[i],pb=path[(i+1)%path.size()];
    const double ua=(pa.x-cx)*nx+(pa.y-cy)*ny,ub=(pb.x-cx)*nx+(pb.y-cy)*ny;
    if(std::max(ua,ub)<-lateral_radius||std::min(ua,ub)>lateral_radius)continue;
    need(std::abs(ub-ua)>=2e-6,"STRAP_CHAMFER_LATERAL_BREAKOUT",AM_F_strapCham);
  }
  if(cham>0){
    const double umax=radius+cham+(vertical?0:slot/2),vmax=radius+cham+(vertical?slot/2:0);
    need(z-vmax>0&&z+vmax<body_h,"STRAP_CHAMFER_BREAKS_FLOOR_OR_ROOF",AM_F_strapCham);
    double shear_factor=1;
    for(const auto& path:footprint.ToPolygons())for(size_t i=0;i<path.size();i++){
      const auto a=path[i],b=path[(i+1)%path.size()];
      const double ua=(a.x-cx)*nx+(a.y-cy)*ny,ub=(b.x-cx)*nx+(b.y-cy)*ny;
      if(std::min(umax,std::max(ua,ub))-std::max(-umax,std::min(ua,ub))<2e-6)continue;
      const double slope=((b.x-a.x)*dx+(b.y-a.y)*dy)/(ub-ua);shear_factor=std::max(shear_factor,std::hypot(1.,slope));
    }
    auto cf=feature("mech:strap:entry-chamfers",1,AM_F_strapCham,AM_BODY,0,{cham,radius,slot,angle,umax,shear_factor});
    auto outer=circle(radius+cham,true,cf,tol/shear_factor);
    const int segments=(int)out.curves.back().segments;
    const auto local=out.curves.back();out.curves.back().frame=AM_CURVE_BEFORE_MOUTH_SHEAR;
    out.curves.push_back({cf,(uint32_t)segments,4,0,radius+cham,-shear_factor*local.signed_max,-shear_factor*local.signed_min,tol});
    const double ro=(radius+cham)/std::cos(PI/segments),ri=radius/std::cos(PI/segments);
    // One revolved solid includes a 1 mm exterior cutter domain. Its cap never
    // coincides with the host wall; inside the host the lead remains exactly c.
    auto entry=Manifold::Revolve({{{0,-1},{ro,-1},{ro,0},{ri,cham},{0,cham}}},segments).Rotate(0,0,180./segments);
    auto exit=Manifold::Revolve({{{0,-cham},{ri,-cham},{ro,0},{ro,1},{0,1}}},segments).Rotate(0,0,180./segments);
    auto exterior=Manifold::Extrude(outer.ToPolygons(),1);
    if(slot>0){const vec3 shift=vertical?vec3(0,slot/2,0):vec3(slot/2,0,0);entry=Manifold::Hull(std::vector<Manifold>{entry.Translate(shift),entry.Translate(-shift)});exit=Manifold::Hull(std::vector<Manifold>{exit.Translate(shift),exit.Translate(-shift)});exterior=Manifold::Hull(std::vector<Manifold>{exterior.Translate(shift),exterior.Translate(-shift)});}
    std::vector<Manifold> mouths;uint32_t edges=0,scanned=0;
    double min_u=LIMIT,max_u=-LIMIT;
    for(const auto& path:footprint.ToPolygons())for(size_t i=0;i<path.size();i++){
      checkpoint();need(++scanned<=MAX_POINTS,"CHAMFER_INPUT_POINT_BUDGET",AM_F_strapCham,AM_INVALID);
      const auto pa=path[i],pb=path[(i+1)%path.size()],edge=pb-pa;
      const double ua=(pa.x-cx)*nx+(pa.y-cy)*ny,ub=(pb.x-cx)*nx+(pb.y-cy)*ny;
      min_u=std::min(min_u,ua);max_u=std::max(max_u,ua);
      const double lo=std::max(-umax,std::min(ua,ub)),hi=std::min(umax,std::max(ua,ub));
      if(hi-lo<2e-6)continue;
      need(++edges<=512,"CHAMFER_MOUTH_EDGE_BUDGET",AM_F_strapCham,AM_INVALID);
      const double sa=(pa.x-cx)*dx+(pa.y-cy)*dy,sb=(pb.x-cx)*dx+(pb.y-cy)*dy;
      const double slope=(sb-sa)/(ub-ua),s0=sa-slope*ua;
      need(std::abs(slope)<=1000&&finite(s0),"CHAMFER_MOUTH_SHEAR_LIMIT",AM_F_strapAngle);
      // Outward face normal is (edge.y,-edge.x), including reversed hole rings.
      const bool exiting=edge.y*dx-edge.x*dy>0;
      const manifold::mat3x4 shear({{1,0,slope},{0,1,0},{0,0,1}},{0,0,s0});
      auto mouth=(exiting?exit:entry).Transform(shear);
      auto beyond=exterior.Translate({0,0,exiting?0.:-1.}).Transform(shear);
      const double cliplo=std::min(ua,ub)>-umax?std::min(ua,ub):-umax-1;
      const double cliphi=std::max(ua,ub)<umax?std::max(ua,ub):umax+1;
      if(cliplo>-umax||cliphi<umax){auto mask=prism(rect(cliphi-cliplo,2*vmax+2,(cliphi+cliplo)/2,0),-len,len);mouth=mouth^mask;beyond=beyond^mask;}
      need(!nonempty(orient(beyond,0)^group(0)),"CHAMFER_EXTERIOR_DOMAIN_MEETS_ANOTHER_SOURCE_WALL",AM_F_strapCham);
      mouths.push_back(orient(mouth,0));
    }
    need(min_u<-umax&&max_u>umax&&!mouths.empty(),"STRAP_CHAMFER_LATERAL_BREAKOUT",AM_F_strapCham);
    diagnostic(114,AM_F_strapCham,"CHAMFER_WORK scanned="+std::to_string(scanned)+" active="+std::to_string(edges)+" activeLimit=512");
    cutter+=Manifold::BatchBoolean(mouths,manifold::OpType::Add);
  }
  // Restrict the query to the nominal host footprint, including its holes.
  // Exterior lead-ins and vertical mouth faces are intentional side openings.
  tunnels.push_back({evaluate(cutter^prism(footprint,body_z,body_z+body_h)),z,AM_F_strapZ,evaluate(cutter),dx,dy,cx,cy,len});
  cut(cutter,0);rot=v(AM_F_rotObj);
}

void Builder::lego(){
  if(!b(AM_F_legoOn))return;
  const double depth=v(AM_F_legoHoleH),wall=v(AM_F_legoWall),pitch=v(AM_F_legoPitch);
  if(body_h<=depth){proposal(AM_F_baseH,depth+0.4,"Leave a declared 0.4 mm test roof; accept an atomic parameter change then regenerate the source context");throw Failure(AM_NEEDS_ACCEPTANCE,AM_F_baseH,"LEGO_ROOF_REQUIRES_PROPOSAL_ACCEPTANCE");}
  height(AM_F_legoHoleH,AM_BODY_BOTTOM,body_z);
  const int pattern=e(AM_F_legoThua);
  const double radius=(v(AM_F_legoHoleD)+(pattern?2*v(AM_F_legoHoDu):0))/2;
  need(2*(radius+wall)<pitch,"LEGO_PITCH_LEAVES_NO_WEB",AM_F_legoPitch);
  const double ox=v(AM_F_legoOffX),oy=v(AM_F_legoOffY);
  const int imin=(int)std::ceil((bounds.min.x-ox)/pitch),imax=(int)std::floor((bounds.max.x-ox)/pitch);
  const int jmin=(int)std::ceil((bounds.min.y-oy)/pitch),jmax=(int)std::floor((bounds.max.y-oy)/pitch);
  need((int64_t)(imax-imin+1)*(jmax-jmin+1)<=4096,"LEGO_GRID_LIMIT");
  std::vector<Manifold> holes,bosses;
  for(int i=imin;i<=imax;i++)for(int j=jmin;j<=jmax;j++){
    if(pattern==1&&((i+j)%2)!=0)continue;
    if(pattern==2&&(i%2!=0||j%2!=0))continue;
    auto id="mech:lego:bore:"+std::to_string(i)+":"+std::to_string(j);
    auto f=feature(id,1,AM_F_legoHoleD,AM_BODY,0,{i*pitch+ox,j*pitch+oy,2*radius,depth,pitch,(double)pattern});
    auto envelope=circle(radius+wall,true,f,r.export_tolerance_mm).Translate({i*pitch+ox,j*pitch+oy});
    if(!contained(envelope,footprint)){
      out.features.pop_back();while(!out.curves.empty()&&out.curves.back().feature_index==f)out.curves.pop_back();continue;
    }
    auto bore=circle(radius,true,f).Translate({i*pitch+ox,j*pitch+oy});
    // The protected wall is an exact offset of the actual circumscribed bore,
    // so nominal wall thickness is measured from the faceted mating surface.
    // Miter corners conservatively enclose the distance-wall disk envelope.
    auto protected_outer=offset(bore,wall);
    CrossSection opening=bore;
    auto local_cutter=prism(bore,body_z-1,body_z+depth);
    auto boss=prism(protected_outer,body_z,body_z+depth);bosses.push_back(boss);
    if(b(AM_F_legoXeOn)){
      const double width=v(AM_F_legoXeW);need(width<2*radius,"LEGO_CROSS_CUT_WIDTH",AM_F_legoXeW);
      auto xf=feature(id+":cross-cut",1,AM_F_legoXeW,AM_BODY,0,{width,2*(radius+wall),depth,0,0,0});(void)xf;
      auto x=rect(2*(radius+wall),width,i*pitch+ox,j*pitch+oy)+rect(width,2*(radius+wall),i*pitch+ox,j*pitch+oy);
      local_cutter+=prism(x,body_z-1,body_z+depth);opening+=x;
      diagnostic(110,AM_F_legoXeOn,"INTENTIONAL_FLEXURE_VOID "+id+":cross-cut; only the declared cross footprint is exempt from the wall guard; roof is still required");
    }
    local_cutter=evaluate(local_cutter);holes.push_back(local_cutter);
    cavities.push_back({id,boss-local_cutter,local_cutter,opening,body_z+depth,body_z+body_h,wall,AM_F_legoWall,0,b(AM_F_legoXeOn)});
  }
  need(!holes.empty(),"LEGO_NO_BORE_WITH_REQUESTED_WALL",AM_F_legoOffX);
  if(b(AM_F_legoRong)){
    auto inner=offset(footprint,-wall);auto boss=Manifold::BatchBoolean(bosses,manifold::OpType::Add);
    auto f=feature("mech:lego:hollow",1,AM_F_legoRong,AM_BODY,0,{depth,wall,body_h-depth,0,0,0});(void)f;
    // Share the actual protected boss solids with the guard and hollow cut.
    // A second independent 2D subtraction would re-round their curved seam.
    holes.push_back(prism(inner,body_z,body_z+depth)-boss);
  }
  const auto tooling=evaluate(Manifold::BatchBoolean(holes,manifold::OpType::Add));
  cut(tooling,0);
  if(b(AM_F_legoTaiOn)){
    const double w=v(AM_F_legoTaiW),l=v(AM_F_legoTaiL),neck=v(AM_F_legoTaiCo);
    need(neck<=w,"LEGO_TAB_NECK_TOO_WIDE",AM_F_legoTaiCo);
    const double cy=(bounds.min.y+bounds.max.y)/2;
    for(int side:{-1,1}){
      const double edge=side<0?bounds.min.x:bounds.max.x;
      const double neck_len=std::min(l/3,wall),x=edge+side*(l/2);
      auto shape=rect(l-neck_len,w,x+side*neck_len/2,cy)+rect(2*neck_len,neck,edge,cy);
      // The declared cavity/flexure/hollow openings also constrain sacrificial
      // tabs added later. Their neck must not plug an already requested cut.
      auto tab=evaluate(prism(shape,body_z,body_z+depth)-tooling);
      need(nonempty(tab^group(0)),"LEGO_TAB_DOES_NOT_ATTACH",AM_F_legoTaiOn);
      auto f=feature("mech:lego:tab:"+std::to_string(side),0,AM_F_legoTaiL,AM_BODY,0,{l,w,neck,neck_len,depth,0});add(tab,f,AM_BODY,0);
    }
  }
  if(b(AM_F_legoRanhOn)){
    const double radius=v(AM_F_legoRanhR),center=params[AM_F_legoRanhZ].mode==AM_AUTO_BODY_MIDPOINT?body_h/2:v(AM_F_legoRanhZ);
    need(center<body_h&&center+radius<body_h,"LEGO_GROOVE_REQUIRES_POSITIVE_ROOF",AM_F_legoRanhZ);
    for(const auto& component:footprint.Decompose())need(!offset(component,-radius).IsEmpty(),"LEGO_GROOVE_ERASES_BODY",AM_F_legoRanhR);
    auto f=feature("mech:lego:perimeter-groove",1,AM_F_legoRanhR,AM_BODY,0,{radius,body_z+center,body_h-center-radius,0,0,0});
    auto groove=perimeter_groove(footprint,radius,body_z+center,f);
    const double numericBudget=std::min({1e-7,r.mating_tolerance_mm/1000,v(AM_F_meshJoinTolerance)/1000});
    for(auto& piece:pieces)if(piece.group==0){
      auto result=evaluate(piece.mesh-groove);
      piece.mesh=evaluate(result.AsOriginal().Simplify(numericBudget));
    }
    out.curves.push_back({f,0,2,0,0,-numericBudget,numericBudget,r.mating_tolerance_mm});
  }
}

void Builder::clicky(){
  const double skirt=v(AM_F_skirtH),wall=v(AM_F_wallT),post=v(AM_F_postH),collar=v(AM_F_collarH);
  const double r1=v(AM_F_postD1)/2,r2=v(AM_F_postD2)/2;
  const double length=v(AM_F_crossL)+2*v(AM_F_clr),width=v(AM_F_crossW)+2*v(AM_F_clr),socket=v(AM_F_socketD);
  need(socket<post&&collar<=post,"MX_SOCKET_NEEDS_POSITIVE_ROOF_OR_COLLAR_TOO_HIGH",AM_F_socketD);
  const double corner=std::hypot(length,width)/2,main_length=post-collar;
  need(length>width&&(main_length<=0||corner<r1)&&(socket<=main_length||corner<r2),"MX_SOCKET_BREAKS_POST_WALL",AM_F_crossW);
  const double cx=(bounds.min.x+bounds.max.x)/2,cy=(bounds.min.y+bounds.max.y)/2;
  auto sf=feature("mech:mx:post",0,AM_F_postH,AM_STEM,0,{cx,cy,post_tip,post,2*r1,2*r2});
  CrossSection main_post,collar_post;
  if(post>collar)main_post=circle(r1,false,sf);
  if(collar>0)collar_post=circle(r2,false,sf);
  const auto& top_post=collar>0?collar_post:main_post;
  need(contained(top_post.Translate({cx,cy}),footprint),"MX_POST_NOT_SUPPORTED_BY_SOURCE",collar>0?AM_F_postD2:AM_F_postD1);
  std::vector<Manifold> stem_envelope;
  if(post>collar){auto solid=prism(main_post.Translate({cx,cy}),post_tip,cap_under-collar);add(solid,sf,AM_STEM,0);stem_envelope.push_back(solid);}
  if(collar>0){
    auto cf=feature("mech:mx:collar",0,AM_F_collarH,AM_STEM,0,{collar,2*r2,cap_under-collar,0,0,0});
    auto solid=prism(collar_post.Translate({cx,cy}),cap_under-collar,cap_under);add(solid,cf,AM_STEM,0);stem_envelope.push_back(solid);
  }
  height(AM_F_postH,AM_POST_TIP,post_tip);height(AM_F_socketD,AM_POST_TIP,post_tip);
  height(AM_F_collarH,AM_COLLAR_BOTTOM,cap_under-collar);
  CrossSection inner;
  if(skirt>0){
    inner=offset(footprint,-wall);need(!inner.IsEmpty(),"CAP_WALL_ERASES_HOLLOW",AM_F_wallT);
    auto f=feature("mech:cap:skirt",0,AM_F_skirtH,AM_SKIRT,0,{skirt,wall,cap_under-skirt,0,0,0});
    add(prism(footprint-inner,cap_under-skirt,cap_under),f,AM_SKIRT,0);
    height(AM_F_skirtH,AM_SKIRT_BOTTOM,cap_under-skirt);
  }else diagnostic(102,AM_F_skirtH,"SKIRT_ZERO_IS_DISABLED: nominal mm=0 does not infer an automatic skirt height");
  double ribdepth=collar;
  if(b(AM_F_housing))ribdepth=std::min(ribdepth,post-v(AM_F_travel)-v(AM_F_hRecess));
  if(v(AM_F_rib)>0&&skirt>0){
    need(ribdepth>0,"CAP_RIB_HAS_NO_COLLISION_FREE_DEPTH",AM_F_rib);
    auto shape=(rect(bounds.max.x-bounds.min.x,v(AM_F_rib),cx,cy)+rect(v(AM_F_rib),bounds.max.y-bounds.min.y,cx,cy))^inner;
    auto f=feature("mech:cap:ribs",0,AM_F_rib,AM_STEM,0,{v(AM_F_rib),ribdepth,cap_under-ribdepth,0,0,0});
    add(prism(shape,cap_under-ribdepth,cap_under),f,AM_STEM,0);
  }
  auto xf=feature("mech:mx:socket",1,AM_F_socketD,AM_STEM,0,{length,width,socket,cx,cy,post_tip});(void)xf;
  auto cross=rect(length,width,cx,cy)+rect(width,length,cx,cy);
  auto opening=prism(cross,post_tip-1,post_tip+socket);cut(opening,0);
  cavities.push_back({"mech:mx:socket",Manifold::BatchBoolean(stem_envelope,manifold::OpType::Add)-opening,opening,cross,post_tip+socket,cap_under,0,AM_F_socketD,0,false});
  if(!b(AM_F_housing))return;
  const double floor=v(AM_F_hFloor),pin=v(AM_F_pinD),socket_h=v(AM_F_hSocketD),recess=v(AM_F_hRecess);
  const double mouth=v(AM_F_hMouth),cavity=v(AM_F_plateHole),bosswall=v(AM_F_hBossW),gap=v(AM_F_gap),traywall=v(AM_F_hWall),travel=v(AM_F_travel);
  need(mouth>=cavity&&v(AM_F_pinW)<=cavity,"TRAY_NESTED_CAVITY_WIDTH",AM_F_hMouth);
  const double bodytop=floor+pin+socket_h,mouthtop=bodytop+recess;
  const double insertion=std::min(socket,v(AM_F_stemH));
  cap_preview_z=bodytop+v(AM_F_stemH)-insertion-post_tip;
  const double capbottom=cap_under-skirt+cap_preview_z-travel;
  const double walltop=cap_under+body_h+cap_preview_z+v(AM_F_rimOver);
  need(capbottom>=floor&&walltop>floor,"TRAY_TRAVEL_BREAKS_FLOOR_OR_WALL_HEIGHT",AM_F_travel);
  const auto boss=rect(mouth+2*bosswall,mouth+2*bosswall,cx,cy);
  auto capfree=offset(footprint,-wall-gap);
  if(!contained(boss,capfree)){
    if(b(AM_F_autoSize)){
      const double minside=std::min(bounds.max.x-bounds.min.x,bounds.max.y-bounds.min.y);
      proposal(AM_F_size,std::ceil(v(AM_F_size)*(mouth+2*bosswall+2*(wall+gap))/minside*1e6)/1e6,
        "Scale and regenerate the source; this bbox lower bound may need another proposal for concave/disconnected hosts");
      throw Failure(AM_NEEDS_ACCEPTANCE,AM_F_size,"TRAY_BOSS_NEEDS_SOURCE_SIZE_PROPOSAL_ACCEPTANCE");
    }
    throw Failure(AM_INVALID,AM_F_size,"TRAY_BOSS_DOES_NOT_CLEAR_CAP_INTERIOR");
  }
  auto inside=offset(footprint,gap),outside=offset(footprint,gap+traywall);
  const auto tf=feature("mech:tray:floor",0,AM_F_hFloor,AM_TRAY,1,{floor,pin,socket_h,recess,bodytop,mouthtop});
  add(prism(outside,0,floor),tf,AM_TRAY,1);
  const auto wf=feature("mech:tray:wall",0,AM_F_hWall,AM_TRAY,1,{traywall,gap,walltop,cap_preview_z,travel,0});
  add(prism(outside-inside,floor,walltop),wf,AM_TRAY,1);
  const auto bf=feature("mech:tray:boss",0,AM_F_hBossW,AM_TRAY,1,{mouth+2*bosswall,mouthtop,bosswall,0,0,0});
  add(prism(boss,floor,mouthtop),bf,AM_TRAY,1);
  const auto pf=feature("mech:tray:pin-pocket",1,AM_F_pinD,AM_TRAY,1,{v(AM_F_pinW),floor,floor+pin,0,0,0});(void)pf;
  const auto cf=feature("mech:tray:body-pocket",1,AM_F_plateHole,AM_TRAY,1,{cavity,floor+pin,bodytop,0,0,0});(void)cf;
  const auto mf=feature("mech:tray:mouth",1,AM_F_hMouth,AM_TRAY,1,{mouth,bodytop,mouthtop,0,0,0});(void)mf;
  // Each cavity is extended through the overlying open cavity, with exact design
  // planes. The extension is a cutter domain, never an offset between materials.
  cut(prism(rect(v(AM_F_pinW),v(AM_F_pinW),cx,cy),floor,mouthtop+1),1);
  cut(prism(rect(cavity,cavity,cx,cy),floor+pin,mouthtop+1),1);
  cut(prism(rect(mouth,mouth,cx,cy),bodytop,mouthtop+1),1);
  if(b(AM_F_hStopOn)){
    const double stopw=v(AM_F_hStopW);
    auto stopinner=offset(footprint,-stopw);
    need(!stopinner.IsEmpty(),"TRAY_STOP_ERASES_OPENING",AM_F_hStopW);
    if(capbottom>floor){
      const auto f=feature("mech:tray:travel-stop",0,AM_F_hStopW,AM_TRAY,1,{stopw,capbottom,travel,0,0,0});
      add(prism(inside-stopinner,floor,capbottom),f,AM_TRAY,1);
    }
  }
  height(AM_F_hFloor,AM_BED,0);height(AM_F_pinD,AM_TRAY_FLOOR_TOP,floor);
  height(AM_F_hSocketD,AM_TRAY_PIN_TOP,floor+pin);height(AM_F_hRecess,AM_TRAY_BODY_TOP,bodytop);
  // stemH describes the separate reference hardware, not a layer-snapped solid.
  height(AM_F_stemH,AM_TRAY_BODY_TOP,bodytop);
  if(b(AM_F_hRingOn))eyelet(true);
  // Prismatic caps use exact interval sweeps; beveled caps use directional
  // extrusion of the faceted boundary. All hulls/sections/booleans are library ops.
  std::vector<Manifold> swept;
  for(const auto& p:pieces)if(p.group==0){
    if(b(AM_F_topBevel)||b(AM_F_bevelChu)||r.source.bevel_override_count){
      // Exact directional extrusion of a faceted solid. Starting solid plus
      // swept outward-facing boundary triangles equals its Minkowski sum with
      // the downward segment. Hull/union are library operations, not repair.
      auto cap=evaluate(p.mesh);auto mesh=cap.GetMeshGL64();
      need(mesh.NumTri()<=50000,"TRAVEL_FACE_SWEEP_RESOURCE_LIMIT",AM_F_travel);
      swept.push_back(cap.Translate({0,0,cap_preview_z}));
      for(size_t i=0;i<mesh.triVerts.size();i+=3){
        vec3 a(&mesh.vertProperties[mesh.triVerts[i]*mesh.numProp]),b(&mesh.vertProperties[mesh.triVerts[i+1]*mesh.numProp]),c(&mesh.vertProperties[mesh.triVerts[i+2]*mesh.numProp]);
        if(la::cross(b-a,c-a).z>=0)continue;
        const vec3 delta(0,0,-travel);
        auto hull=Manifold::Hull(std::vector<vec3>{a,b,c,a+delta,b+delta,c+delta});
        swept.push_back(hull.Translate({0,0,cap_preview_z}));
      }
      continue;
    }
    const auto evaluated=evaluate(p.mesh);const auto mesh=evaluated.GetMeshGL64();std::vector<double> zs;
    for(size_t i=2;i<mesh.vertProperties.size();i+=mesh.numProp)zs.push_back(mesh.vertProperties[i]);
    std::sort(zs.begin(),zs.end());zs.erase(std::unique(zs.begin(),zs.end()),zs.end());
    need(zs.size()<=4096,"TRAVEL_SWEEP_INTERVAL_LIMIT");
    for(size_t i=1;i<zs.size();i++)if(zs[i]>zs[i-1]+1e-10){
      auto section=CrossSection(p.mesh.Slice((zs[i]+zs[i-1])/2),CrossSection::FillRule::NonZero);
      if(!section.IsEmpty())swept.push_back(prism(section,zs[i-1]+cap_preview_z-travel,zs[i]+cap_preview_z));
    }
  }
  const auto collision=Manifold::BatchBoolean(swept,manifold::OpType::Add)^group(1);
  need(!nonempty(collision),"CAP_TRAY_CONTINUOUS_TRAVEL_COLLISION",AM_F_travel);
  diagnostic(103,AM_F_travel,"CONTINUOUS_TRAVEL: exact prism/faceted-boundary sweep checked against the generated static tray; reference switch hardware is not included");
}

void Builder::charm(){
  const double neckr=v(AM_F_charmCoD)/2,flanger=v(AM_F_charmVanhD)/2,neckh=v(AM_F_charmCoH),flangeh=v(AM_F_charmVanhH),cham=v(AM_F_charmVat);
  const double cx=(bounds.min.x+bounds.max.x)/2+v(AM_F_charmOffX),cy=(bounds.min.y+bounds.max.y)/2+v(AM_F_charmOffY);
  const bool separate=e(AM_F_charmGan)==0;const uint32_t group_id=separate?1:0;
  need(flanger>neckr&&cham<flangeh&&cham<flanger,"CHARM_FLANGE_OR_LEADIN_DOMAIN",AM_F_charmVat);
  auto f=feature("mech:charm:flange",0,AM_F_charmVanhD,AM_FASTENER,group_id,{cx,cy,2*flanger,flangeh,cham,0});
  auto flange=circle(flanger,false,f);
  Manifold flange_mesh;
  if(cham>0){
    const double scale=(flanger-cham)/flanger;
    flange_mesh=Manifold::Extrude(flange.Scale(vec2(scale)).ToPolygons(),cham,0,0,vec2(1/scale)).Translate({cx,cy,0});
  }
  if(flangeh>cham)flange_mesh+=prism(flange.Translate({cx,cy}),cham,flangeh);
  add(flange_mesh,f,AM_FASTENER,group_id);
  auto nf=feature("mech:charm:neck",0,AM_F_charmCoD,AM_FASTENER,group_id,{cx,cy,2*neckr,flangeh,neckh,0});
  auto neck=circle(neckr,false,nf).Translate({cx,cy});
  need(contained(neck,footprint),"CHARM_FASTENER_NOT_SUPPORTED_BY_SOURCE",AM_F_charmOffX);
  add(prism(neck,flangeh,flangeh+neckh),nf,AM_FASTENER,group_id);
  height(AM_F_charmVanhH,AM_BED,0);height(AM_F_charmCoH,AM_CHARM_FLANGE_TOP,flangeh);
  if(separate){
    const double pinr=v(AM_F_charmChotD)/2,pinh=v(AM_F_charmChotH),socketr=pinr+v(AM_F_charmClr)/2;
    need(socketr<neckr&&pinh<body_h,"CHARM_SOCKET_REQUIRES_POSITIVE_WALL_AND_ROOF",AM_F_charmChotH);
    auto pf=feature("mech:charm:pin",0,AM_F_charmChotD,AM_FASTENER,1,{cx,cy,2*pinr,flangeh+neckh,pinh,0});
    add(prism(circle(pinr,false,pf).Translate({cx,cy}),flangeh+neckh,flangeh+neckh+pinh),pf,AM_FASTENER,1);
    auto hf=feature("mech:charm:socket",1,AM_F_charmClr,AM_BODY,0,{cx,cy,2*socketr,0,pinh,body_h-pinh});
    auto hole=circle(socketr,true,hf).Translate({cx,cy});
    need(contained(hole,footprint),"CHARM_SOCKET_OUTSIDE_BODY",AM_F_charmOffX);
    auto cutter=prism(hole,-1,pinh);cut(cutter,0);
    // The neck footprint is the explicit load-bearing host around this socket.
    // Preserve its actual ring through the cavity, then measure the final roof.
    cavities.push_back({"mech:charm:socket",prism(neck,0,pinh)-cutter,cutter,hole,pinh,body_h,neckr-socketr,AM_F_charmChotH,0,false});
    height(AM_F_charmChotH,AM_CHARM_NECK_TOP,flangeh+neckh);
    button_preview_z=-(flangeh+neckh);
    need(!nonempty(group(0)^(group(1).Translate({0,0,button_preview_z}))),"CHARM_ASSEMBLY_COLLISION",AM_F_charmClr);
  }
}

void Builder::verify_cavities(const std::vector<Piece>& final_parts){
  if(cavities.empty())return;
  need(cavities.size()<=4096,"CAVITY_GUARD_RESOURCE_LIMIT");
  std::array<Manifold,3> solids;
  for(uint32_t g=0;g<3;g++){
    std::vector<Manifold> material_parts;for(const auto& p:final_parts)if(p.group==g)material_parts.push_back(p.mesh);
    solids[g]=evaluate(Manifold::BatchBoolean(material_parts,manifold::OpType::Add));
  }
  for(const auto& guard:cavities){
    checkpoint();const auto& solid=solids[guard.group];
    // Keep raw missing material. A laterally narrow residual can extend through
    // the entire roof; simplifying it cannot bound the missing Z extent.
    const double predicate_budget=std::min({1e-7,r.mating_tolerance_mm/1000,r.export_tolerance_mm/1000});
    auto residual=[&](const Manifold& input){
      auto raw=evaluate(input);need(raw.GetTolerance()<=predicate_budget,"FINAL_GUARD_NUMERIC_BUDGET",guard.field);
      return raw;
    };
    need(guard.ceiling>guard.bottom,"FINAL_CAVITY_ROOF_NOT_POSITIVE "+guard.id,guard.field);
    const auto roof_column=prism(guard.roof,guard.bottom,guard.ceiling);
    auto missing_roof=residual(roof_column-solid);
    if(!missing_roof.IsEmpty()&&missing_roof.BoundingBox().min.z-predicate_budget<=guard.bottom){
      guard_source_resolution(predicate_budget,guard.field);
      missing_roof=evaluate(missing_roof.AsOriginal().Simplify(predicate_budget));
    }
    const double roof=(missing_roof.IsEmpty()?guard.ceiling:missing_roof.BoundingBox().min.z-predicate_budget)-guard.bottom;
    need(roof>0,"FINAL_CAVITY_ROOF_NOT_POSITIVE "+guard.id,guard.field);
    // Coincident walls/openings can leave backend contact fragments. This
    // legacy cleanup is not used to discard an unresolved source roof slit.
    auto contact=[&](const Manifold& input){return evaluate(residual(input).AsOriginal().Simplify(predicate_budget));};
    const auto missing_wall=contact(guard.wall-solid);
    need(missing_wall.IsEmpty()||missing_wall.Volume()==0,"FINAL_CAVITY_WALL_MISSING "+guard.id,guard.field);
    const auto plugged=contact(guard.opening^solid);
    need(plugged.IsEmpty()||plugged.Volume()==0,"FINAL_CAVITY_OPENING_OBSTRUCTED "+guard.id,guard.field);
    feature("guard:wall-roof:"+guard.id,2,guard.field,guard.group?AM_FASTENER:AM_BODY,guard.group,
      {guard.bottom,guard.ceiling,roof,guard.nominal_wall,guard.flexure?1.:0.,predicate_budget});
  }
  if(!cavities.empty())diagnostic(111,0,"FINAL_CAVITY_GUARDS: raw roof bounds first; contact-cleanup fallback has conditional source-resolution admission; walls/openings retain backend query policy; no all-input full-volume proof");
}

#include "tunnel_guard.cpp.inc"

void Builder::finish(){
  const auto main=group(0);need(nonempty(main),"NO_MAIN_BODY_AFTER_FEATURES");
  auto second=group(1);
  if(nonempty(second)){auto a=main.BoundingBox(),bb=second.BoundingBox();secondary_x=a.max.x+5-bb.min.x;}
  std::array<std::vector<Manifold>,3> claimed;
  std::vector<Piece> disjoint;
  for(auto& p:pieces){
    auto original=p.mesh;
    for(const auto& previous:claimed[p.group]){
      const auto a=p.mesh.BoundingBox(),b=previous.BoundingBox();
      // Shared planar interfaces are already disjoint. Avoid re-booleaning an
      // exact touching plane: repeated 3D intersections created near-zero slivers
      // on the pinned backend (seed 0x6d656368, case 1).
      if(a.max.x<=b.min.x||b.max.x<=a.min.x||a.max.y<=b.min.y||b.max.y<=a.min.y||a.max.z<=b.min.z||b.max.z<=a.min.z)continue;
      if(nonempty(p.mesh^previous))p.mesh-=previous;
    }
    claimed[p.group].push_back(original);
    need(p.mesh.Status()==Manifold::Error::NoError,"KERNEL_PARTITION",0,AM_KERNEL_ERROR);
    if(!p.mesh.IsEmpty())disjoint.push_back(std::move(p));
  }
  verify_cavities(disjoint);
  verify_tunnels(disjoint);
  // Detached text must not collide after the secondary part is laid out.
  std::vector<Manifold> manufacturing;for(auto& p:disjoint){auto mesh=p.mesh;if(p.group==1)mesh=mesh.Translate({secondary_x,0,0});if(rot&&p.group!=2)mesh=mesh.Rotate(0,0,rot);manufacturing.push_back(evaluate(mesh));}
  for(size_t i=0;i<disjoint.size();i++)for(size_t j=0;j<i;j++)if(disjoint[i].group!=disjoint[j].group&&(disjoint[i].group==2||disjoint[j].group==2))
    need(!nonempty(manufacturing[i]^manufacturing[j]),"DETACHED_TEXT_PLACEMENT_COLLISION");
  double highest=0;
  for(auto& p:disjoint){
    auto mesh=evaluate(p.mesh);
    if(p.group==1)mesh=mesh.Translate({secondary_x,0,0});
    if(rot&&p.group!=2)mesh=mesh.Rotate(0,0,rot);
    const auto bb=mesh.BoundingBox();
    need(finite(bb.min.x)&&finite(bb.min.y)&&finite(bb.min.z)&&finite(bb.max.x)&&finite(bb.max.y)&&finite(bb.max.z)&&bb.min.z>=-1e-7,"MANUFACTURING_COORDINATE_RANGE");
    highest=std::max(highest,bb.max.z);
    auto m=mesh.GetMeshGL64();need(m.numProp>=3&&m.NumTri()>0,"EMPTY_OUTPUT_MESH",0,AM_KERNEL_ERROR);
    need(uint64_t(out.triangles.size()/3)+m.NumTri()<=MAX_TRIANGLES,"OUTPUT_TRIANGLE_LIMIT");
    const uint32_t nv=(uint32_t)m.NumVert();std::vector<uint32_t> root(nv);std::iota(root.begin(),root.end(),0);
    auto find=[&](uint32_t a){while(root[a]!=a){root[a]=root[root[a]];a=root[a];}return a;};
    // Apply only the exact topology merge relation exported by Manifold.
    // This does not guess shared positions, weld geometry or repair a mesh.
    for(size_t i=0;i<m.mergeFromVert.size();i++)root[find((uint32_t)m.mergeFromVert[i])]=find((uint32_t)m.mergeToVert[i]);
    std::vector<uint32_t> remap(nv,UINT32_MAX);
    ArchMechPart part{};part.vertex_start=(uint32_t)(out.vertices.size()/3);part.triangle_start=(uint32_t)(out.triangles.size()/3);
    part.color_rgba=p.material.rgba;part.source_index=p.feature;part.volume_mm3=mesh.Volume();
    for(uint32_t i=0;i<nv;i++){
      auto j=find(i);
      if(remap[j]==UINT32_MAX){
        remap[j]=(uint32_t)(out.vertices.size()/3);
        for(uint32_t axis=0;axis<3;axis++){double x=m.vertProperties[size_t(j)*m.numProp+axis];need(finite(x),"NONFINITE_OUTPUT_VERTEX",0,AM_KERNEL_ERROR);out.vertices.push_back(x);}
      }
      remap[i]=remap[j];
    }
    std::set<std::array<double,3>> geometric_vertices;
    for(uint32_t i=part.vertex_start;i<out.vertices.size()/3;i++){
      std::array<double,3> xyz{out.vertices[3*i],out.vertices[3*i+1],out.vertices[3*i+2]};
      need(geometric_vertices.insert(xyz).second,"MESH_GEOMETRIC_POINT_CONTACT "+std::string(out.features[p.feature].id)+" "+position(vec3(xyz[0],xyz[1],xyz[2])),0,AM_KERNEL_ERROR);
    }
    for(size_t t=0;t<m.triVerts.size();t+=3){
      uint32_t ix[3];for(int k=0;k<3;k++)ix[k]=remap[find((uint32_t)m.triVerts[t+k])];
      vec3 a(&out.vertices[3*ix[0]]),bb(&out.vertices[3*ix[1]]),c(&out.vertices[3*ix[2]]);
      auto u=bb-a,vv=c-a;
      const double twice_area=std::hypot(std::hypot(u.y*vv.z-u.z*vv.y,u.z*vv.x-u.x*vv.z),u.x*vv.y-u.y*vv.x);
      if(twice_area<=1e-14){diagnostic(106,0,"DEGENERATE_A "+position(a));diagnostic(106,0,"DEGENERATE_B "+position(bb));diagnostic(106,0,"DEGENERATE_C "+position(c));}
      need(twice_area>1e-14,"MESH_DEGENERATE_TRIANGLE "+std::string(out.features[p.feature].id),0,AM_KERNEL_ERROR);
      for(auto j:ix)out.triangles.push_back(j);
    }
    part.vertex_count=(uint32_t)(out.vertices.size()/3)-part.vertex_start;part.triangle_count=(uint32_t)m.NumTri();
    out.parts.push_back(part);
    ArchMechPartInfo info{};info.feature_index=p.feature;info.role=p.role;info.slot=p.material.slot;info.origin=p.material.origin;info.provenance_id=p.material.provenance_id;info.assembly_group=p.group;
    info.preview_transform[0]=info.preview_transform[5]=info.preview_transform[10]=info.preview_transform[15]=1;
    if(p.group!=2&&r.product==AM_CLICKY){info.preview_transform[12]=p.group?-secondary_x:0;info.preview_transform[14]=p.group?0:cap_preview_z;}
    if(p.group!=2&&r.product==AM_CHARM&&e(AM_F_charmGan)==0){info.preview_transform[12]=p.group?-secondary_x:0;info.preview_transform[14]=p.group?button_preview_z:0;}
    out.part_info.push_back(info);
  }
  uint32_t n=0;out.layers.push_back(0);while(boundary(n)<highest-1e-10){++n;out.layers.push_back(boundary(n));}
  out.export_blocked=(r.product==AM_CLICKY&&b(AM_F_housing)&&b(AM_F_assemble))||(r.product==AM_CHARM&&e(AM_F_charmGan)==0&&b(AM_F_charmRap));
  // The manufacturing buffers above are identical with assembly view on/off.
  if(out.export_blocked)diagnostic(104,0,"ASSEMBLY_VIEW: host must block manufacturing export while this preview mode is active");
  for(size_t i=0;i<out.part_info.size();i++)for(size_t j=0;j<i;j++)if(out.part_info[i].slot==out.part_info[j].slot&&out.parts[i].color_rgba!=out.parts[j].color_rgba){
    diagnostic(105,0,"MATERIAL_SLOT_MISMATCH: same slot has different colors; retain overrides and require adapter remap before machine-project export");i=out.part_info.size();break;
  }
}
} // namespace

#include "derived_check.cpp.inc"

extern "C" uint32_t arch_mech_abi_version(){return 2;}
extern "C" uint32_t arch_mech_field_id(const char* name){if(!name)return 0;for(uint32_t i=0;i<AM_FIELD_COUNT-1;i++)if(std::strcmp(name,fields[i].name)==0)return i+1;return 0;}
extern "C" const char* arch_mech_field_name(uint32_t id){return id>0&&id<AM_FIELD_COUNT?fields[id-1].name:nullptr;}
extern "C" uint32_t arch_mech_source_field(uint32_t id){return id>0&&id<AM_FIELD_COUNT?fields[id-1].source:0;}
extern "C" ArchMechParam arch_mech_default_parameter(uint32_t product,uint32_t id){
  ArchMechParam p{};if(product>AM_CHARM||id==0||id>=AM_FIELD_COUNT)return p;
  const auto& f=fields[id-1];p.field_id=id;p.origin=AM_PRESET;p.provenance_id=1;p.value=f.defaults[product];
  p.mode=f.kind==1?AM_MM:AM_SCALAR;
  if(id==AM_F_ringH&&p.value==0)p.mode=AM_AUTO_BODY_HEIGHT;
  if(id==AM_F_legoRanhZ&&p.value==0)p.mode=AM_AUTO_BODY_MIDPOINT;
  return p;
}
static ArchMechResult* build_impl(const ArchMechRequest* request,ArchMechControl* control,uint32_t generation){
  std::unique_ptr<ArchMechResult> output;
  bool acquired_control=false;
  try{
    output=std::make_unique<ArchMechResult>();need(request,"NULL_REQUEST");
    need(control||generation==0,"NULL_CONTROL");
    if(control){need(control->generation==generation&&!control->used.exchange(true),"CONTROL_GENERATION_OR_REUSE");acquired_control=true;}
    Builder b(*request,*output,control);b.stage(1);b.initialize();b.stage(2);b.source_body();b.stage(3);b.source_bevel();b.stage(4);
    switch(request->product){
      case AM_KEYCHAIN:if(b.b(AM_F_ringOn))b.eyelet(false);break;
      case AM_CLICKY:b.clicky();break;
      case AM_STRAP:b.strap();break;
      case AM_LEGO:b.lego();break;
      case AM_CHARM:b.charm();break;
    }
    b.stage(5);b.finish();b.capture_guard();b.checkpoint();
  }catch(const Failure& f){
    if(!output)return nullptr;output->verdict=f.verdict;ArchMechDiagnostic d{};d.code=f.verdict;d.field_id=f.field;copystr(d.message,f.what());try{output->diagnostics.push_back(d);}catch(...){output->verdict=AM_KERNEL_ERROR;}
  }catch(const std::exception& f){
    if(!output)return nullptr;output->verdict=AM_KERNEL_ERROR;ArchMechDiagnostic d{};d.code=AM_KERNEL_ERROR;copystr(d.message,f.what());try{output->diagnostics.push_back(d);}catch(...){}
  }catch(...){if(!output)return nullptr;output->verdict=AM_KERNEL_ERROR;}
  if(output->verdict!=AM_OK){output->vertices.clear();output->triangles.clear();output->parts.clear();output->part_info.clear();output->layers.clear();output->export_blocked=1;}
  if(acquired_control)control->stage.store(output->verdict==AM_OK?6:output->verdict==AM_CANCELLED?8:7);
  return output.release();
}
extern "C" ArchMechResult* arch_mech_build(const ArchMechRequest* r){return build_impl(r,nullptr,0);}
extern "C" ArchMechResult* arch_mech_build_controlled(const ArchMechRequest* r,ArchMechControl* c,uint32_t generation){return build_impl(r,c,generation?generation:UINT32_MAX);}
extern "C" ArchMechControl* arch_mech_control_create(uint32_t generation){if(!generation||generation==UINT32_MAX)return nullptr;try{return new ArchMechControl(generation);}catch(...){return nullptr;}}
extern "C" int arch_mech_control_cancel(ArchMechControl* c,uint32_t generation){if(!c||c->generation!=generation)return 0;c->context.Cancel();return 1;}
extern "C" double arch_mech_control_progress(const ArchMechControl* c){return c?c->context.Progress():0;}
extern "C" uint32_t arch_mech_control_stage(const ArchMechControl* c){return c?c->stage.load():0;}
extern "C" void arch_mech_control_destroy(ArchMechControl* c){delete c;}
extern "C" int arch_mech_view(const ArchMechResult* result,ArchMechView* v){
  if(!result||!v)return 0;const auto& r=*result;*v={};
  v->abi_version=2;v->verdict=r.verdict;v->revision=r.revision;v->export_blocked=r.export_blocked;v->fit_qualification=0;
  v->vertex_count=(uint32_t)(r.vertices.size()/3);v->triangle_count=(uint32_t)(r.triangles.size()/3);v->part_count=(uint32_t)r.parts.size();
  v->feature_count=(uint32_t)r.features.size();v->curve_count=(uint32_t)r.curves.size();v->interval_count=(uint32_t)r.intervals.size();v->diagnostic_count=(uint32_t)r.diagnostics.size();v->proposal_count=(uint32_t)r.proposals.size();v->layer_boundary_count=(uint32_t)r.layers.size();v->parameter_count=(uint32_t)r.parameters.size();
  v->vertices_xyz=r.vertices.data();v->triangles=r.triangles.data();v->parts=r.parts.data();v->part_info=r.part_info.data();v->features=r.features.data();v->curves=r.curves.data();v->intervals=r.intervals.data();v->diagnostics=r.diagnostics.data();v->proposals=r.proposals.data();v->layer_boundaries=r.layers.data();v->parameters=r.parameters.data();return 1;
}
extern "C" void arch_mech_destroy(ArchMechResult* result){delete result;}
static_assert(sizeof(ArchMechPart)==40&&offsetof(ArchMechPart,volume_mm3)==32,"Main material-part ABI prefix");
static_assert(sizeof(ArchMechParam)==40&&offsetof(ArchMechParam,value)==24,"Parameter ABI");

extern "C" uint32_t arch_mech_source_datum_extension_version(){return 1;}
extern "C" uint32_t arch_mech_semantics_version(){return 3;}
