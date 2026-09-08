#include "source_assembly.h"
#include <manifold/cross_section.h>
#include <clipper2/clipper.h>
#include "support_regularization.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <map>
#include <memory>
#include <limits>
#include <numeric>
#include <set>
#include <stdexcept>
#include <tuple>
#include <vector>
using manifold::CrossSection;
using manifold::Polygons;
using manifold::SimplePolygon;
namespace {
constexpr double G=1e6, PI=3.14159265358979323846, ZERO=1e-9;
using P=std::pair<int64_t,int64_t>;
using Line=std::tuple<int64_t,int64_t,int64_t,int64_t>;
struct Failure:std::runtime_error {uint32_t code,field;uint64_t id;Failure(uint32_t c,const char*m,uint32_t f=0,uint64_t i=0):runtime_error(m),code(c),field(f),id(i){}};
void need(bool b,const char*m,uint32_t f=0,uint64_t id=0,uint32_t c=AS_INVALID){if(!b)throw Failure(c,m,f,id);}
bool finite(double v){return std::isfinite(v)&&std::abs(v)<=10000;}
uint64_t sid(uint64_t source,uint64_t object,uint32_t stage,uint32_t band=0){
  uint64_t h=14695981039346656037ull;
  for(auto x:{source,object,uint64_t(stage),uint64_t(band)})for(unsigned i=0;i<8;i++){h^=(x>>(i*8))&255;h*=1099511628211ull;}return h?h:1;
}
int64_t grid(double v){need(finite(v),"XY_RANGE");double d=v*G,f=std::floor(d),r=d-f;return int64_t(r<.5?f:r>.5?f+1:std::fmod(f,2)==0?f:f+1);}
Line line(P a,P b){ // dominant-coordinate line key, same construction as root geometry ABI1
  int64_t dx=b.first-a.first,dy=b.second-a.second,g=std::gcd(std::abs(dx),std::abs(dy));need(g!=0,"ZERO_EDGE");dx/=g;dy/=g;
  if(dx<0||(dx==0&&dy<0)){dx=-dx;dy=-dy;}bool x=std::abs(dx)>=std::abs(dy);
  auto c=x?dx:dy,v=x?a.first:a.second,q=v/c,r=v%c;if(r&&((r<0)!=(c<0)))--q;
  need(std::abs(q)<=INT64_MAX/std::max<int64_t>(1,std::max(std::abs(dx),std::abs(dy)))-20000000001LL,"LINE_KEY_OVERFLOW");
  return {dx,dy,a.first-q*dx,a.second-q*dy};
}
struct Field {const char*name;int kind;double lo,hi;uint32_t products,source;double defaults[5];};
const Field fields[AM_FIELD_COUNT-1]={
#include "catalog.inc"
};
struct Cell {CrossSection shape;double lo,hi;ArchMechMaterial mat;uint32_t kind,stage,band;uint64_t id,prov,object,attachment;};
struct Region {CrossSection shape;const ArchSourceRegion* in;ArchMechMaterial mat;};
bool exact(const ArchMechParam&a,const ArchMechParam&b){return a.field_id==b.field_id&&a.mode==b.mode&&a.origin==b.origin&&a.datum==b.datum&&a.reference_layer==b.reference_layer&&a.layer_count==b.layer_count&&a.value==b.value&&a.provenance_id==b.provenance_id;}
}
struct ArchSourceResult {
  ArchMechSource prepared{};
  bool datum_probe=false;
  double body_datum_z=0;
  uint32_t verdict=AS_OK,ops=0;uint64_t revision=0,source_id=0,prov=0,eyelet=0;
  double transform[6]={1,0,0,1,0,0};uint32_t footprint_start=0,footprint_count=0;
  std::vector<int64_t>xy;std::vector<ArchMechRing>rings;std::vector<ArchMechSlab>slabs;
  std::vector<ArchMechAttachment>attachments;std::vector<ArchMechParam>params,bindings;
  std::vector<ArchSourceContact>contacts;std::vector<ArchSourceLineage>lineage;
  std::vector<ArchSourceInterval>intervals;std::vector<ArchSourceDiagnostic>diagnostics;
  std::vector<ArchSourceProposal>proposals;std::vector<ArchSourceError>errors;
  std::vector<ArchSourceRegion>input_regions;std::vector<ArchSourceText>input_texts;
};
namespace {
struct Builder {
  const ArchSourceRequest&r;const ArchSourceControl*control;ArchSourceResult&o;
  std::array<ArchMechParam,AM_FIELD_COUNT>p{};std::array<double,AM_FIELD_COUNT>v{};
  std::array<ArchMechMaterial,AM_ROLE_COUNT>palette{};std::vector<Region>main,text;
  std::vector<Cell>cells;CrossSection A,Pbody;double H=0,R=0,top=0;
  Builder(const ArchSourceRequest&a,const ArchSourceControl*b,ArchSourceResult&c):r(a),control(b),o(c){}
  void tick(){need(++o.ops<=r.max_operations,"OPERATION_BUDGET",0,0,AS_RESOURCE);if(control){if(control->cancelled&&control->cancelled(control->data))throw Failure(AS_CANCELLED,"CANCELLED_AT_SOURCE_CHECKPOINT");if(control->progress)control->progress(control->data,o.ops,r.max_operations);}}
  void warn(const char*m,uint32_t field=0,uint64_t id=0){ArchSourceDiagnostic d{0,field,id,{}};std::strncpy(d.message,m,159);o.diagnostics.push_back(d);}
  int64_t boundary_units(uint32_t n)const {
    need(n<=1000000,"LAYER_RANGE");
    const int64_t z=n?r.schedule.first_nm+int64_t(n-1)*r.schedule.regular_nm:0;
    need(z<=10000000000LL,"SCHEDULE_Z_RANGE");return z;
  }
  int64_t units(double x,uint32_t field,uint64_t id)const {
    need(finite(x),"HEIGHT_COORDINATE_RANGE",field,id);
    const double scaled=x*G;const auto q=int64_t(std::llround(scaled));
    // Only admit binary representation error in an exact stored decimal.
    // This rounds metadata arithmetic, never a user value or a geometry plane.
    need(std::abs(scaled-q)<=std::max(1e-7,std::abs(scaled)*std::numeric_limits<double>::epsilon()*4),
         "HEIGHT_STORAGE_GRID",field,id);return q;
  }
  bool downward(const ArchMechParam&a)const {
    return a.field_id==AM_F_bandCap||(a.field_id==AM_F_artH&&p[AM_F_artMode].value==1);
  }
  double value(const ArchMechParam&a,bool down=false)const {
    if(a.mode!=AM_LAYERS)return a.value;
    need(a.reference_layer<=1000000&&a.layer_count<=1000000,"LAYER_RANGE",a.field_id);
    if(down){
      need(a.layer_count<=a.reference_layer,"DOWNWARD_LAYERS_BELOW_BED",a.field_id);
      return (boundary_units(a.reference_layer)-boundary_units(a.reference_layer-a.layer_count))/G;
    }
    need(a.layer_count<=1000000-a.reference_layer,"LAYER_RANGE",a.field_id);
    return (boundary_units(a.reference_layer+a.layer_count)-boundary_units(a.reference_layer))/G;
  }
  bool query(const ArchMechParam&a)const{return o.datum_probe&&a.mode==AS_PROBE_LAYERS;}
  double height(const ArchMechParam&a,uint32_t datum,double base,uint64_t id,bool down=false,uint32_t mult=1,bool bed=false){
    need(a.mode==AM_MM||a.mode==AM_LAYERS||query(a),"SOURCE_HEIGHT_MODE",a.field_id,id);
    need(a.origin<=AM_PRESET&&finite(a.value),"SOURCE_HEIGHT_TAG",a.field_id,id);
    need((query(a)?a.reference_layer==UINT32_MAX:a.reference_layer<=1000000)&&a.layer_count<=1000000,"LAYER_RANGE",a.field_id,id);
    need(mult>=1&&mult<=1024,"BAND_RANGE");
    need(a.layer_count<=1000000/mult,"BAND_LAYER_RANGE",a.field_id,id);
    const double manufacturing=base+(bed?0:o.body_datum_z);
    const int64_t face=units(manufacturing,a.field_id,id);
    // The enum names the face; a coincident but different feature is not an
    // alias. Bed is an alias only when the feature itself is at bed Z0.
    const bool declared=a.mode==AM_LAYERS||a.datum!=AM_BED||a.reference_layer!=0;
    uint32_t reference=a.reference_layer,reported_datum=declared?a.datum:datum;
    if(query(a)){
      need(a.datum==datum,"DATUM_PROBE_TARGET_MISMATCH",a.field_id,id);
      need(a.value==0,"DATUM_PROBE_REQUIRES_ZERO_VALUE",a.field_id,id);
      reference=face==0?0:face>=r.schedule.first_nm?1+uint32_t((face-r.schedule.first_nm)/r.schedule.regular_nm):UINT32_MAX;
      if(reference==UINT32_MAX||reference>1000000||boundary_units(reference)!=face){
        o.intervals.push_back({a.field_id,datum,AS_PROBE_LAYERS,UINT32_MAX,id,manufacturing,manufacturing});
        throw Failure(AS_INVALID,"DATUM_PROBE_OFF_GRID_EXPLICIT_PLANE_DECISION_REQUIRED",a.field_id,id);
      }
    }else if(declared){
      need(a.datum==datum||(a.datum==AM_BED&&face==0),"SOURCE_DATUM_MISMATCH",a.field_id,id);
      need(boundary_units(reference)==face,"SOURCE_REFERENCE_LAYER_DOES_NOT_MEET_FACE",a.field_id,id);
    }else{
      reference=face==0?0:face>=r.schedule.first_nm?1+uint32_t((face-r.schedule.first_nm)/r.schedule.regular_nm):UINT32_MAX;
      if(reference==UINT32_MAX||boundary_units(reference)!=face){
        reference=UINT32_MAX;
        ArchSourceDiagnostic d{109,a.field_id,id,{}};
        std::strncpy(d.message,"OFF_GRID_DATUM_CONVERSION_UNAVAILABLE: nominal MM retained; no layer conversion proposal",159);
        o.diagnostics.push_back(d);
      }
    }
    const uint32_t count=a.layer_count*mult;
    double h=a.value*mult;
    if(a.mode==AM_LAYERS||query(a)){
      need(down?count<=reference:count<=1000000-reference,
           down?"DOWNWARD_LAYERS_BELOW_BED":"BAND_LAYER_RANGE",a.field_id,id);
      h=(down?face-boundary_units(reference-count):boundary_units(reference+count)-face)/G;
    }
    need(finite(h)&&h>0&&finite(base+h)&&base-(down?h:0)>=0,"SOURCE_POSITIVE_HEIGHT",a.field_id,id);
    units(h,a.field_id,id);
    if(query(a))need(h>0&&h<=(a.field_id==AM_F_artH?6:24)&&(a.field_id!=AM_F_artH||h>=.2),"DATUM_PROBE_HEIGHT_DOMAIN",a.field_id,id);
    o.intervals.push_back({a.field_id,reported_datum,a.mode,reference,id,down?manufacturing-h:manufacturing,down?manufacturing:manufacturing+h});return h;
  }
  CrossSection boolean(const CrossSection&a,const CrossSection&b,manifold::OpType op){tick();auto c=a.Boolean(b,op);tick();return c;}
  CrossSection add(const CrossSection&a,const CrossSection&b){return boolean(a,b,manifold::OpType::Add);}
  CrossSection sub(const CrossSection&a,const CrossSection&b){return boolean(a,b,manifold::OpType::Subtract);}
  CrossSection intersect(const CrossSection&a,const CrossSection&b){return boolean(a,b,manifold::OpType::Intersect);}
  bool contains(const CrossSection&a,const CrossSection&b){return sub(a,b).Area()<=ZERO;}
  int segments(double radius,uint32_t stage){double e=std::min(r.tolerance_mm/8,radius/16);int n=std::max(8,int(std::ceil(PI/std::acos(1-e/radius))));n=(n+3)/4*4;need(n<=4096,"CURVE_SEGMENT_BUDGET",0,0,AS_RESOURCE);double sag=radius*(1-std::cos(PI/n));o.errors.push_back({stage,uint32_t(n),radius,-sag-0.00000002,sag+0.00000002});return n;}
  CrossSection offset(const CrossSection&s,double d,uint32_t stage){if(d==0)return s;tick();int n=segments(std::abs(d),stage);auto c=s.Offset(d,CrossSection::JoinType::Round,2,n);tick();return c;}
  CrossSection regularize_support(const CrossSection&s){
    // Only derived support enters this operation. Keep Clipper's proposed
    // chords that satisfy the entire-chain bound; refine the others at original vertices.
    Polygons polys;double bound=0;size_t points=0;uint64_t work=0;tick();
    auto checkpoint=[&](){if(control&&control->cancelled&&control->cancelled(control->data))throw Failure(AS_CANCELLED,"CANCELLED_AT_SUPPORT_CHECKPOINT");};
    for(const auto&poly:s.ToPolygons()){
      need(poly.size()<=r.max_points-points,"SUPPORT_POINT_BUDGET",0,0,AS_RESOURCE);points+=poly.size();
      Clipper2Lib::Path64 original;for(auto pt:poly){Clipper2Lib::Point64 q{grid(pt.x),grid(pt.y)};if(original.empty()||original.back()!=q)original.push_back(q);}if(original.size()>1&&original.front()==original.back())original.pop_back();
      need(original.size()>=3,"SUPPORT_REGULARIZATION_COLLAPSE");
      std::set<P>positions;for(size_t i=0;i<original.size();i++){if((i&511)==0)checkpoint();need(positions.emplace(original[i].x,original[i].y).second,"SUPPORT_REGULARIZATION_POINT_CONTACT");}
      auto step=[&](){need(++work<=uint64_t(r.max_operations)*64,"SUPPORT_REGULARIZATION_WORK_BUDGET",0,0,AS_RESOURCE);if((work&511)==0)checkpoint();};
      const auto result=arch_source_detail::regularize_support_path(original,step);
      bound=std::max(bound,result.bound_grid/G);SimplePolygon normalized;
      for(auto a:result.path)normalized.push_back({a.x/G,a.y/G});polys.push_back(normalized);
    }
    need(bound<=2.0/G,"SUPPORT_REGULARIZATION_BOUND",0,0,AS_RESOURCE);o.errors.push_back({7,0,0,-bound-std::sqrt(2.)/2/G,bound+std::sqrt(2.)/2/G});
    CrossSection result(polys,CrossSection::FillRule::NonZero);need(result.NumContour()==s.NumContour(),"SUPPORT_TOPOLOGY_CHANGED");tick();return result;
  }
  CrossSection roundbox(double w,double h,double cx,double cy,double radius,uint32_t stage){
    need(finite(w)&&finite(h)&&w>0&&h>0&&finite(radius)&&radius>=0&&radius<=std::min(w,h)/2,"ROUNDING_RADIUS_DOES_NOT_FIT");
    if(radius==std::min(w,h)/2){
      auto disk=CrossSection::Circle(radius,segments(radius,stage));
      auto a=disk.Translate({cx-(w-2*radius)/2,cy-(h-2*radius)/2}),b=disk.Translate({cx+(w-2*radius)/2,cy+(h-2*radius)/2});
      tick();return CrossSection::Hull(std::vector<CrossSection>{a,b});
    }
    auto c=CrossSection::Square({w-2*radius,h-2*radius},true).Translate({cx,cy});return offset(c,radius,stage);
  }
  void emit(const CrossSection&s,double lo,double hi,ArchMechMaterial m,uint32_t kind,uint32_t stage,uint64_t object=0,uint64_t prov=0,uint32_t band=0,uint64_t attachment=0){
    if(s.IsEmpty())return;need(finite(lo)&&finite(hi)&&lo>=0&&hi>lo,"EMPTY_OR_INVERTED_SLAB",0,object);
    need(cells.size()<r.max_slabs,"SLAB_BUDGET",0,object,AS_RESOURCE);
    cells.push_back({s,lo,hi,m,kind,stage,band,sid(r.source_id,object,stage,band),prov?prov:r.provenance_id,object,attachment});
  }
  void initialize();void geometry();void compose();void texts();void finish();
};
void Builder::initialize(){
  need(r.abi_version==1&&r.product<=AM_CHARM,"ABI_PRODUCT");
  need(r.max_slabs>0&&r.max_slabs<=1024&&r.max_points>=3&&r.max_points<=200000&&r.max_operations>=1&&r.max_operations<=2000000,"RESOURCE_CONTRACT");
  need(r.schedule.version==1&&r.schedule.reserved==0&&r.schedule.first_source<=1&&r.schedule.regular_source<=1&&r.schedule.first_nm>0&&r.schedule.first_nm<=1000000&&r.schedule.regular_nm>=80000&&r.schedule.regular_nm<=300000,"SCHEDULE");
  need(std::isfinite(r.tolerance_mm)&&r.tolerance_mm>=.00001&&r.tolerance_mm<=.002,"TOLERANCE");
  need(r.parameter_count<AM_FIELD_COUNT&&(!r.parameter_count||r.parameters)&&r.material_count<=AM_ROLE_COUNT&&(!r.material_count||r.materials),"PARAMETER_ARRAY");
  std::set<uint32_t>seen;for(uint32_t id=1;id<AM_FIELD_COUNT;id++)p[id]=arch_mech_default_parameter(r.product,id);p[AM_F_layerH].value=r.schedule.regular_nm/G;
  for(uint32_t i=0;i<r.parameter_count;i++){const auto&a=r.parameters[i];need(a.field_id>0&&a.field_id<AM_FIELD_COUNT&&seen.insert(a.field_id).second,"PARAMETER_ID");p[a.field_id]=a;}
  for(uint32_t id=1;id<AM_FIELD_COUNT;id++){
    auto&a=p[id];const auto&f=fields[id-1];need(a.origin<=AM_PRESET&&a.mode<=AM_AUTO_BODY_MIDPOINT&&finite(a.value),"PARAMETER_TAG",id);
    need(a.datum<AM_DATUM_COUNT||(f.source==1&&f.kind==1&&a.datum>=AS_ART_BOTTOM&&a.datum<AS_DATUM_END),"PARAMETER_DATUM",id);
    need(a.reference_layer<=1000000&&a.layer_count<=1000000,"LAYER_RANGE",id);
    if(f.kind==1)need(a.mode==AM_MM||a.mode==AM_LAYERS||(id==AM_F_ringH&&a.mode==AM_AUTO_BODY_HEIGHT),"HEIGHT_MODE",id);
    else need(a.mode==AM_SCALAR||(id==AM_F_legoRanhZ&&a.mode==AM_AUTO_BODY_MIDPOINT&&a.value==0),"SCALAR_MODE",id);
    if(a.mode==AM_LAYERS)need(a.datum!=AM_BED||a.reference_layer==0,"BED_REFERENCE",id);
    v[id]=value(a,downward(a));need(v[id]>=f.lo&&v[id]<=f.hi,"PARAMETER_DOMAIN",id);if(f.kind==2||f.kind==3)need(std::floor(v[id])==v[id],"ENUM_BOOLEAN",id);
    o.params.push_back(a);if(f.source)o.bindings.push_back(a);
  }
  need(v[AM_F_layerH]==r.schedule.regular_nm/G,"SCHEDULE_ALIAS");
  if(r.product==AM_CLICKY)o.body_datum_z=std::max(v[AM_F_skirtH],v[AM_F_postH]);
  else if(r.product==AM_CHARM&&v[AM_F_charmGan]==1)o.body_datum_z=v[AM_F_charmVanhH]+v[AM_F_charmCoH];
  need(r.upstream_binding_count==7&&r.upstream_bindings,"UPSTREAM_BINDINGS_REQUIRED");seen.clear();
  for(uint32_t i=0;i<7;i++){auto&a=r.upstream_bindings[i];need(a.field_id>=1&&a.field_id<=7&&seen.insert(a.field_id).second&&exact(a,p[a.field_id]),"STALE_UPSTREAM_BINDING",a.field_id);}
  const uint32_t colors[]={0x30353bff,0xf06449ff,0xffffffff,0x30353bff,0x30353bff,0x548687ff,0x30353bff,0xffffffff,0x30353bff};
  for(uint32_t i=0;i<AM_ROLE_COUNT;i++)palette[i]={i,colors[i],i==AM_ARTWORK?2u:1u,AM_AUTO,0};seen.clear();
  for(uint32_t i=0;i<r.material_count;i++){auto m=r.materials[i];need(m.role<AM_ROLE_COUNT&&seen.insert(m.role).second&&m.slot>=1&&m.slot<=16&&(m.rgba&255)==255&&m.origin<=AM_PRESET,"MATERIAL");palette[m.role]=m;}
  need(r.point_count>=3&&r.point_count<=r.max_points&&r.ring_count>0&&r.ring_count<=r.point_count/3&&r.region_count>0&&r.region_count<=256&&r.text_count<=32,"INPUT_BUDGET");
  need(r.xy&&r.rings&&r.regions&&(!r.text_count||r.texts)&&r.source_id,"INPUT_ARRAY");
  o.input_regions.assign(r.regions,r.regions+r.region_count);if(r.text_count)o.input_texts.assign(r.texts,r.texts+r.text_count);
  o.source_id=r.source_id;o.prov=r.provenance_id;o.revision=r.revision;o.eyelet=r.eyelet_text_id;tick();
}
void Builder::geometry(){
  double xmin=1e10,ymin=1e10,xmax=-1e10,ymax=-1e10;std::set<uint64_t>ids;
  for(uint32_t i=0;i<r.region_count;i++){
    auto&a=r.regions[i];need(a.semantic_id&&ids.insert(a.semantic_id).second&&a.ring_count&&a.ring_start<=r.ring_count&&a.ring_count<=r.ring_count-a.ring_start&&a.fill_rule<=1&&a.override_height<=1,"REGION_CONTRACT",0,a.semantic_id);
    if(a.override_height){const auto&h=a.height;need(h.field_id==AM_F_artH&&(h.mode==AM_MM||h.mode==AM_LAYERS||query(h))&&h.origin<=AM_PRESET&&finite(h.value)&&(query(h)?h.reference_layer==UINT32_MAX&&h.layer_count>0&&h.layer_count<=1000000:h.reference_layer<=1000000&&h.layer_count<=1000000-h.reference_layer),"OBJECT_HEIGHT_TAG",0,a.semantic_id);if(!query(h))need(value(h)>=.2&&value(h)<=6,"OBJECT_HEIGHT_DOMAIN",0,a.semantic_id);}
    for(uint32_t j=a.ring_start;j<a.ring_start+a.ring_count;j++){
      auto&ring=r.rings[j];need(ring.point_count>=3&&ring.point_start<=r.point_count&&ring.point_count<=r.point_count-ring.point_start,"RING_RANGE");
      for(uint32_t k=0;k<ring.point_count;k++){uint32_t n=ring.point_start+k;double x=r.xy[2*n]/G,y=r.xy[2*n+1]/G;need(finite(x)&&finite(y),"INPUT_XY_RANGE");
        auto next=ring.point_start+(k+1)%ring.point_count;need(std::abs(r.xy[2*n]-r.xy[2*next])>=2||std::abs(r.xy[2*n+1]-r.xy[2*next+1])>=2,"RAW_EDGE_UNDER_TWO_GRID_UNITS");
        if(!a.text_group){xmin=std::min(xmin,x);xmax=std::max(xmax,x);ymin=std::min(ymin,y);ymax=std::max(ymax,y);}
      }
    }
  }
  need(xmax>xmin&&ymax>ymin,"MAIN_SOURCE_EXTENT");double scale=v[AM_F_size]/std::max(xmax-xmin,ymax-ymin),cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
  o.transform[0]=o.transform[3]=scale;o.transform[4]=-cx*scale;o.transform[5]=-cy*scale;
  std::map<P,P>shared;std::set<uint64_t>groups;for(uint32_t i=0;i<r.text_count;i++)need(r.texts[i].semantic_id&&groups.insert(r.texts[i].semantic_id).second,"TEXT_GROUP_ID");
  for(uint32_t i=0;i<r.region_count;i++){
    auto&a=r.regions[i];need(!a.text_group||groups.count(a.text_group),"TEXT_GROUP_MISSING");Polygons polys;std::set<P>unique;
    for(uint32_t j=a.ring_start;j<a.ring_start+a.ring_count;j++){SimplePolygon poly;auto&ring=r.rings[j];
      for(uint32_t k=0;k<ring.point_count;k++){uint32_t n=ring.point_start+k;P input{r.xy[2*n],r.xy[2*n+1]},q=input;
        if(!a.text_group){auto it=shared.find(input);if(it==shared.end())it=shared.emplace(input,P{grid((input.first/G-cx)*scale),grid((input.second/G-cy)*scale)}).first;q=it->second;}
        need(unique.insert(q).second,"SAME_REGION_POINT_CONTACT_OR_DUPLICATE",0,a.semantic_id);poly.push_back({q.first/G,q.second/G});
      }
      for(size_t k=0;k<poly.size();k++)need(std::abs(poly[k].x-poly[(k+1)%poly.size()].x)>=.0000015||std::abs(poly[k].y-poly[(k+1)%poly.size()].y)>=.0000015,"TRANSFORM_COLLAPSED_EDGE");
      polys.push_back(poly);
    }
    tick();CrossSection shape(polys,a.fill_rule?CrossSection::FillRule::EvenOdd:CrossSection::FillRule::NonZero);need(!shape.IsEmpty(),"EMPTY_REGION",0,a.semantic_id);
    auto m=a.material;uint32_t role=a.text_group?AM_TEXT:AM_ARTWORK;need(m.role==role&&m.slot>=1&&m.slot<=16&&m.origin<=AM_PRESET&&(m.rgba&255)==255,"REGION_MATERIAL",0,a.semantic_id);
    if(m.origin!=AM_USER&&palette[role].origin==AM_USER)m=palette[role];
    auto&list=a.text_group?text:main;for(auto&b:list)if(b.in->text_group==a.text_group)need(intersect(shape,b.shape).Area()<=ZERO,"CANONICAL_REGION_OVERLAP",0,a.semantic_id);
    list.push_back({shape,&a,m});if(!a.text_group)A=add(A,shape);
  }
  std::sort(main.begin(),main.end(),[](auto&a,auto&b){return a.in->semantic_id<b.in->semantic_id;});
  std::sort(text.begin(),text.end(),[](auto&a,auto&b){return a.in->semantic_id<b.in->semantic_id;});
  Polygons outers;for(const auto&poly:A.ToPolygons()){double area=0;for(size_t i=0;i<poly.size();i++)area+=poly[i].x*poly[(i+1)%poly.size()].y-poly[i].y*poly[(i+1)%poly.size()].x;if(area>0)outers.push_back(poly);}
  CrossSection filled(outers,CrossSection::FillRule::NonZero);auto holes=sub(filled,A);auto bounds=A.Bounds();double w=bounds.Size().x,h=bounds.Size().y,pad=v[AM_F_offset],rad=v[AM_F_cornerR];
  switch(int(v[AM_F_outline])){
    case 0:Pbody=offset(filled,pad,1);if(v[AM_F_weld]>0){
      // Closing a convex set by a disk is the same set, exactly. Avoid an
      // unnecessary approximate round trip that creates sub-grid edges.
      tick();auto hull=Pbody.Hull();if(contains(hull,Pbody))warn("CONVEX_CLOSING_IDENTITY",AM_F_weld);
      else{double d=v[AM_F_weld]/2;Pbody=regularize_support(add(Pbody,offset(offset(Pbody,d,2),-d,3)));}
    }break;
    case 1:Pbody=roundbox(w+2*pad,h+2*pad,0,0,rad,4);break;
    case 2:{double radius=std::hypot(w/2,h/2)+pad;Pbody=CrossSection::Circle(radius,segments(radius,5));break;}
    case 3:Pbody=CrossSection::Square({std::max(w,h)+2*pad,std::max(w,h)+2*pad},true);break;
  }
  if(!v[AM_F_fillHoles])Pbody=sub(Pbody,holes);need(contains(A,Pbody),"BODY_DOES_NOT_CONTAIN_SOURCE");
  for(const auto&part:Pbody.Decompose())if(offset(part,-v[AM_F_minFeature]/2,6).IsEmpty()){
    warn("BODY_COMPONENT_BELOW_MIN_FEATURE_PRESERVED_PROPOSAL_ONLY",AM_F_minFeature);o.proposals.push_back({AM_F_offset,0,r.source_id,v[AM_F_offset],v[AM_F_offset]+v[AM_F_minFeature]/2});
  }
}
void Builder::compose(){
  uint32_t hf=r.product==AM_CLICKY?AM_F_plateT:AM_F_baseH;
  H=height(p[hf],r.product==AM_CLICKY?AM_CAP_UNDERSIDE:AM_BODY_BOTTOM,0,r.source_id);
  int mode=int(v[AM_F_artMode]);bool rim=v[AM_F_rimOn]&&r.product!=AM_CLICKY&&r.product!=AM_LEGO;
  if(v[AM_F_rimOn]&&!rim)warn("RIM_RETAINED_INACTIVE_FOR_PRODUCT",AM_F_rimOn);
  auto body=palette[AM_BODY],rm=palette[AM_RIM];double C=v[AM_F_flatTop],D=v[AM_F_artH];
  double rbase=mode==0||mode==3?H:mode==2?H-C-v[AM_F_rimH]:0;
  if(rim)R=height(p[AM_F_rimH],AS_RIM_BOTTOM,rbase,r.source_id);else R=0;
  if(mode==0){
    emit(Pbody,0,H,body,AM_SOURCE_BODY,10);if(R)emit(Pbody,H,H+R,rm,AM_SOURCE_ART,11);
    std::set<std::pair<uint32_t,uint32_t>>materials;for(auto&a:main)materials.insert({a.mat.slot,a.mat.rgba});
    for(auto&a:main){uint32_t rank=1;if(v[AM_F_layerBand])rank=1+uint32_t(std::distance(materials.begin(),materials.find({a.mat.slot,a.mat.rgba})));
      auto hp=p[AM_F_artH];if(a.in->override_height&&v[AM_F_splitObj]){hp=a.in->height;need(hp.field_id==AM_F_artH,"OBJECT_HEIGHT_FIELD",0,a.in->semantic_id);if(!query(hp))need(value(hp)>=.2&&value(hp)<=6,"OBJECT_HEIGHT_DOMAIN",0,a.in->semantic_id);rank=1;}
      else if(a.in->override_height)warn("OBJECT_HEIGHT_RETAINED_INACTIVE",AM_F_splitObj,a.in->semantic_id);
      double d=height(hp,AS_ART_BOTTOM,H+R,a.in->semantic_id,false,rank),z=H+R+d;
      if(v[AM_F_layerBand]&&v[AM_F_bandCore]){double cap=height(p[AM_F_bandCap],AS_CAP_TOP,z,a.in->semantic_id,true);need(cap<=d,"CAP_THICKER_THAN_COLUMN",AM_F_bandCap,a.in->semantic_id);if(cap<d)emit(a.shape,H+R,z-cap,body,AM_SOURCE_BODY,12,a.in->semantic_id,a.in->provenance_id,rank);emit(a.shape,z-cap,z,a.mat,AM_SOURCE_ART,13,a.in->semantic_id,a.in->provenance_id,rank);}
      else emit(a.shape,H+R,z,a.mat,AM_SOURCE_ART,14,a.in->semantic_id,a.in->provenance_id,rank);
    }
  }else if(mode==1){
    D=height(p[AM_F_artH],AS_RECESS_TOP,H,r.source_id,true);need(H-D>R,"RECESS_REQUIRES_POSITIVE_FLOOR",AM_F_artH);
    emit(sub(Pbody,A),0,H,body,AM_SOURCE_BODY,20);if(R)emit(A,0,R,rm,AM_SOURCE_ART,21);
    for(auto&a:main)emit(a.shape,R,H-D,a.mat,AM_SOURCE_ART,22,a.in->semantic_id,a.in->provenance_id);
    // When A=P, there is no border at H: that parameter combination cannot satisfy body datum H.
    need(sub(Pbody,A).Area()>ZERO,"RECESS_REQUIRES_NONZERO_BORDER",AM_F_offset);
  }else{
    double base=mode==2?H-C:H+R;C=height(p[AM_F_flatTop],AS_FLAT_BOTTOM,base,r.source_id);
    double floor=mode==2?H-C-R:H;need(floor>0,"FLAT_REQUIRES_POSITIVE_BODY_FLOOR",AM_F_flatTop);
    emit(Pbody,0,floor,body,AM_SOURCE_BODY,30);if(R)emit(Pbody,floor,floor+R,rm,AM_SOURCE_ART,31);
    emit(sub(Pbody,A),base,base+C,rim?rm:body,rim?AM_SOURCE_ART:AM_SOURCE_BODY,32);
    for(auto&a:main)emit(a.shape,base,base+C,a.mat,AM_SOURCE_ART,33,a.in->semantic_id,a.in->provenance_id);
  }
  if(mode!=0){if(v[AM_F_layerBand])warn("LAYER_BAND_RETAINED_INACTIVE",AM_F_layerBand);if(v[AM_F_bandCore])warn("BAND_CORE_RETAINED_INACTIVE",AM_F_bandCore);for(auto&a:main)if(a.in->override_height)warn("OBJECT_HEIGHT_RETAINED_INACTIVE",AM_F_artMode,a.in->semantic_id);}
  for(auto&c:cells)top=std::max(top,c.hi);
}
void Builder::texts(){
  std::vector<const ArchSourceText*>groups;for(uint32_t i=0;i<r.text_count;i++)groups.push_back(r.texts+i);std::sort(groups.begin(),groups.end(),[](auto*a,auto*b){return a->semantic_id<b->semantic_id;});
  auto original=cells;
  for(auto*g:groups){
    need(g->placement<=1&&g->base_on<=1&&finite(g->base_pad)&&g->base_pad>=0&&g->base_pad<=8&&finite(g->base_round)&&g->base_round>=0&&g->base_round<=14,"TEXT_SETTINGS",0,g->semantic_id);
    for(const auto&h:{g->height,g->base_height}){need(h.field_id==0&&(h.mode==AM_MM||h.mode==AM_LAYERS||query(h))&&h.origin<=AM_PRESET&&finite(h.value)&&(query(h)?h.reference_layer==UINT32_MAX&&h.layer_count>0&&h.layer_count<=1000000:h.reference_layer<=1000000&&h.layer_count<=1000000-h.reference_layer),"TEXT_HEIGHT_TAG",0,g->semantic_id);if(!query(h))need(value(h)>0&&value(h)<=24,"TEXT_HEIGHT_DOMAIN",0,g->semantic_id);}
    CrossSection glyph;for(auto&a:text)if(a.in->text_group==g->semantic_id)glyph=add(glyph,a.shape);need(!glyph.IsEmpty(),"TEXT_GROUP_EMPTY",0,g->semantic_id);
    double start=g->placement?0:top;CrossSection support=glyph;
    if(g->base_on){auto b=glyph.Bounds();auto s=b.Size();support=roundbox(s.x+2*g->base_pad,s.y+2*g->base_pad,(b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,g->base_round,40);
      need(contains(glyph,support),"TEXT_BASE_MISSES_GLYPHS",0,g->semantic_id);double thick=height(g->base_height,AS_TEXT_BASE_BOTTOM,start,g->semantic_id,false,1,g->placement==1);need(thick<=24,"TEXT_BASE_HEIGHT_RANGE",0,g->semantic_id);double plate=start+thick;
      if(g->placement)emit(support,0,plate,palette[AM_TEXT_BASE],AS_SOURCE_BED_TEXT_BASE,41,g->semantic_id,g->provenance_id,0,g->semantic_id);
      else{
        need(contains(support,Pbody),"TEXT_BASE_OUTSIDE_BODY_SUPPORT",0,g->semantic_id);std::set<double>zs{0,plate};for(auto&c:original){zs.insert(c.lo);zs.insert(c.hi);}std::vector<double>z(zs.begin(),zs.end());
        for(size_t i=0;i+1<z.size();i++){double lo=z[i],hi=z[i+1];if(lo>=plate)break;CrossSection occupied;for(auto&c:original)if(c.lo<hi&&c.hi>lo)occupied=add(occupied,c.shape);
          emit(sub(support,occupied),lo,hi,palette[AM_TEXT_BASE],AM_SOURCE_TEXT_BASE,42,g->semantic_id,g->provenance_id,uint32_t(i),g->semantic_id);}
      }start=plate;
    }else if(!g->placement){CrossSection surface;for(auto&c:original)if(c.hi==top)surface=add(surface,c.shape);need(contains(glyph,surface),"TEXT_NO_BASE_REQUIRES_FLAT_CONTACT",0,g->semantic_id);}
    double h=height(g->height,AS_TEXT_BOTTOM,start,g->semantic_id,false,1,g->placement==1);need(h<=24,"TEXT_HEIGHT_RANGE",0,g->semantic_id);
    if(g->placement)need(intersect(support,Pbody).Area()<=ZERO,"DETACHED_TEXT_MUST_BE_BESIDE_FOOTPRINT",0,g->semantic_id);
    for(auto&a:text)if(a.in->text_group==g->semantic_id)emit(a.shape,start,start+h,a.mat,g->placement?AS_SOURCE_BED_TEXT:AM_SOURCE_TEXT,43,a.in->semantic_id,a.in->provenance_id,0,g->semantic_id);
  }
  need(!r.eyelet_text_id||std::any_of(groups.begin(),groups.end(),[&](auto*g){return g->semantic_id==r.eyelet_text_id;}),"EYELET_TEXT_ATTACHMENT_MISSING");
}
void Builder::finish(){
  // Canonical integer rounding once for all slab contours. Split common straight
  // boundaries at every shared endpoint; no material-dependent epsilon offset.
  std::vector<std::vector<std::vector<P>>>paths;std::map<Line,std::set<P>>ledger;
  size_t captured=0;
  auto integer_paths=[&](const CrossSection&s){Clipper2Lib::Paths64 result;for(const auto&poly:s.ToPolygons()){Clipper2Lib::Path64 q;for(auto pnt:poly)q.push_back({grid(pnt.x),grid(pnt.y)});result.push_back(std::move(q));}return result;};
  auto capture_paths=[&](const Clipper2Lib::Paths64&ps){std::vector<std::vector<P>>result;std::set<P>unique;
    for(auto&poly:ps){tick();need(captured+poly.size()<=r.max_points,"CAPTURE_POINT_BUDGET",0,0,AS_RESOURCE);captured+=poly.size();std::vector<P>q;for(auto&pnt:poly){P pntq{pnt.x,pnt.y};if(!q.empty()&&pntq==q.back())continue;q.push_back(pntq);}if(q.size()>1&&q.front()==q.back())q.pop_back();need(q.size()>=3,"OUTPUT_RING_COLLAPSE");
      for(auto pntq:q)need(unique.insert(pntq).second,"OUTPUT_POINT_CONTACT_OR_GRID_COLLAPSE");
      for(size_t i=0;i<q.size();i++){auto a=q[i],b=q[(i+1)%q.size()];need(std::abs(a.first-b.first)>=2||std::abs(a.second-b.second)>=2,"OUTPUT_EDGE_UNDER_TWO_GRID_UNITS");auto&points=ledger[line(a,b)];points.insert(a);points.insert(b);}result.push_back(q);}return result;};
  auto capture=[&](const CrossSection&s){return capture_paths(integer_paths(s));};
  const auto body_paths=integer_paths(Pbody);
  Clipper2Lib::Paths64 artwork_paths;for(const auto&a:main){auto p=integer_paths(a.shape);artwork_paths.insert(artwork_paths.end(),p.begin(),p.end());}
  paths.push_back(capture_paths(body_paths));
  for(auto&c:cells){
    if(c.stage==20||c.stage==32){
      // The complement and artwork share the FINAL integer boundary. Computing
      // P-A on ClipperD's binary grid then independently rounding P-A and A to
      // nm creates one-nm cracks. One pinned integer difference here consumes
      // the same artwork vertices emitted by every adjoining material slab.
      tick();Clipper2Lib::Clipper64 clip;clip.PreserveCollinear(true);clip.AddSubject(body_paths);clip.AddClip(artwork_paths);Clipper2Lib::Paths64 complement;
      need(clip.Execute(Clipper2Lib::ClipType::Difference,Clipper2Lib::FillRule::NonZero,complement),"INTEGER_PARTITION_LIBRARY_FAILURE",0,0,AS_KERNEL);tick();
      paths.push_back(capture_paths(complement));
    }else if(c.stage==21){
      tick();Clipper2Lib::Clipper64 clip;clip.PreserveCollinear(true);clip.AddSubject(artwork_paths);Clipper2Lib::Paths64 united;
      need(clip.Execute(Clipper2Lib::ClipType::Union,Clipper2Lib::FillRule::NonZero,united),"INTEGER_PARTITION_LIBRARY_FAILURE",0,0,AS_KERNEL);tick();
      paths.push_back(capture_paths(united));
    }else paths.push_back(capture(c.shape));
  }
  std::map<uint64_t,std::tuple<CrossSection,double,double,uint32_t,uint64_t>>atts;
  for(auto&c:cells)if(c.attachment){auto it=atts.find(c.attachment);if(it==atts.end())atts.emplace(c.attachment,std::make_tuple(c.shape,c.lo,c.hi,c.mat.role,c.prov));else{auto&[s,lo,hi,role,prov]=it->second;if(c.lo<lo){s=c.shape;lo=c.lo;role=c.mat.role;}else if(c.lo==lo)s=add(s,c.shape);hi=std::max(hi,c.hi);}}
  for(auto&[id,a]:atts)paths.push_back(capture(std::get<0>(a)));
  std::vector<std::pair<uint32_t,uint32_t>>ranges;std::vector<CrossSection>canonical;
  for(auto&shape:paths){uint32_t first=uint32_t(o.rings.size());Polygons polys;
    for(auto&ring:shape){std::vector<P>q;for(size_t i=0;i<ring.size();i++){auto a=ring[i],b=ring[(i+1)%ring.size()];auto&points=ledger.at(line(a,b));auto low=std::min(a,b),high=std::max(a,b);std::vector<P>edge(points.lower_bound(low),points.upper_bound(high));if(b<a)std::reverse(edge.begin(),edge.end());q.insert(q.end(),edge.begin(),edge.end()-1);}
      need(o.xy.size()/2+q.size()<=r.max_points,"OUTPUT_POINT_BUDGET",0,0,AS_RESOURCE);uint32_t begin=uint32_t(o.xy.size()/2);SimplePolygon poly;for(auto pnt:q){o.xy.push_back(pnt.first);o.xy.push_back(pnt.second);poly.push_back({pnt.first/G,pnt.second/G});}o.rings.push_back({begin,uint32_t(q.size()),sid(r.source_id,first,90,uint32_t(polys.size()))});polys.push_back(poly);}
    ranges.push_back({first,uint32_t(o.rings.size())-first});canonical.emplace_back(polys,CrossSection::FillRule::NonZero);
  }
  o.footprint_start=ranges[0].first;o.footprint_count=ranges[0].second;
  // Exact topological conservation, independently of the floating area
  // predicates below. Oppositely directed material seams must cancel after
  // the common line ledger has inserted every shared collinear endpoint.
  if(v[AM_F_artMode]!=0){
    std::map<std::pair<P,P>,int>balance;
    auto charge=[&](size_t index,int sign){auto range=ranges[index];for(uint32_t ri=range.first;ri<range.first+range.second;ri++){
      const auto&ring=o.rings[ri];for(uint32_t j=0;j<ring.point_count;j++){auto a=ring.point_start+j,b=ring.point_start+(j+1)%ring.point_count;
        P x{o.xy[2*a],o.xy[2*a+1]},y{o.xy[2*b],o.xy[2*b+1]};balance[{std::min(x,y),std::max(x,y)}]+=(x<y?sign:-sign);}}};
    charge(0,-1);for(size_t i=0;i<cells.size();i++)if(cells[i].stage==20||cells[i].stage==22||cells[i].stage==32||cells[i].stage==33)charge(i+1,1);
    for(const auto&edge:balance)need(edge.second==0,"INTEGER_MATERIAL_PARTITION_BOUNDARY_MISMATCH");tick();
  }
  double arcBound=0,regularizationBound=0;
  for(const auto&e:o.errors){if((e.stage>=1&&e.stage<=5)||e.stage==40)arcBound=std::max(arcBound,e.signed_max_mm);if(e.stage==7)regularizationBound=std::max(regularizationBound,e.signed_max_mm);}
  const double generatedBound=3*arcBound+regularizationBound+std::sqrt(2.)/G+o.ops*2e-8;
  need(generatedBound<=r.tolerance_mm,"GENERATED_SOURCE_ERROR_BUDGET",0,0,AS_RESOURCE);
  o.errors.push_back({100,0,0,-generatedBound,generatedBound});
  std::map<std::pair<P,P>,std::vector<uint32_t>>edges;std::set<uint64_t>slabids;
  for(uint32_t i=0;i<cells.size();i++){
    auto&c=cells[i];need(slabids.insert(c.id).second,"SEMANTIC_ID_COLLISION");auto range=ranges[i+1];o.slabs.push_back({range.first,range.second,0,c.kind,c.mat.rgba,c.mat.slot,c.mat.origin,c.mat.role,c.lo,c.hi,c.id,c.prov,c.attachment});o.lineage.push_back({c.object?c.object:r.source_id,c.id,c.mat.provenance_id,c.stage,c.band});
    for(uint32_t ri=range.first;ri<range.first+range.second;ri++){auto&ring=o.rings[ri];for(uint32_t j=0;j<ring.point_count;j++){uint32_t a=ring.point_start+j,b=ring.point_start+(j+1)%ring.point_count;P x{o.xy[2*a],o.xy[2*a+1]},y{o.xy[2*b],o.xy[2*b+1]};edges[{std::min(x,y),std::max(x,y)}].push_back(i);}}
  }
  size_t ai=cells.size()+1;for(auto&[id,a]:atts){auto&[s,lo,hi,role,prov]=a;auto range=ranges[ai++];o.attachments.push_back({range.first,range.second,0,role,lo,hi,id,prov});}
  std::map<std::pair<uint32_t,uint32_t>,double>vertical;
  auto low=[&](const Cell&c){return c.lo+(c.kind>=AS_SOURCE_BED_TEXT?0:o.body_datum_z);};
  auto high=[&](const Cell&c){return c.hi+(c.kind>=AS_SOURCE_BED_TEXT?0:o.body_datum_z);};
  for(auto&[edge,owners]:edges)for(size_t a=0;a<owners.size();a++)for(size_t b=a+1;b<owners.size();b++){
    uint32_t x=owners[a],y=owners[b];if(x==y)continue;double lo=std::max(low(cells[x]),low(cells[y])),hi=std::min(high(cells[x]),high(cells[y]));if(hi>lo)vertical[{std::min(x,y),std::max(x,y)}]+=std::hypot((edge.first.first-edge.second.first)/G,(edge.first.second-edge.second.second)/G)*(hi-lo);
  }
  for(auto&[pair,area]:vertical)o.contacts.push_back({pair.first,pair.second,0,0,area,std::max(low(cells[pair.first]),low(cells[pair.second])),std::min(high(cells[pair.first]),high(cells[pair.second]))});
  for(uint32_t i=0;i<cells.size();i++)for(uint32_t j=i+1;j<cells.size();j++){
    auto&a=cells[i];auto&b=cells[j];if(std::min(high(a),high(b))<std::max(low(a),low(b)))continue;double area=intersect(canonical[i+1],canonical[j+1]).Area();
    if(std::min(high(a),high(b))>std::max(low(a),low(b)))need(area<=ZERO,"POSITIVE_3D_MATERIAL_OVERLAP",0,a.object);
    else if(area>ZERO){double z=high(a)==low(b)?high(a):high(b);o.contacts.push_back({i,j,1,0,area,z,z});}
  }
  o.errors.push_back({99,0,0,-std::sqrt(2.)/2/G,std::sqrt(2.)/2/G});tick();
}
}
extern "C" uint32_t arch_source_abi_version(){return 1;}
extern "C" uint32_t arch_source_semantics_version(){return 2;}
static ArchSourceResult* source_build(const ArchSourceRequest*r,const ArchSourceControl*c,bool probe){
  try{auto o=std::make_unique<ArchSourceResult>();o->datum_probe=probe;try{need(r,"NULL_REQUEST");Builder b(*r,c,*o);b.initialize();b.geometry();b.compose();b.texts();b.finish();}
    catch(const Failure&e){o->verdict=e.code;ArchSourceDiagnostic d{e.code,e.field,e.id,{}};std::strncpy(d.message,e.what(),159);o->diagnostics.push_back(d);}
    catch(const std::bad_alloc&){o->verdict=AS_RESOURCE;o->diagnostics.push_back({AS_RESOURCE,0,0,"ALLOCATION_BUDGET"});}
    catch(const std::exception&e){o->verdict=AS_KERNEL;ArchSourceDiagnostic d{AS_KERNEL,0,0,{}};std::strncpy(d.message,e.what(),159);o->diagnostics.push_back(d);}
    if(o->verdict!=AS_OK){o->xy.clear();o->rings.clear();o->slabs.clear();o->contacts.clear();o->attachments.clear();o->lineage.clear();}
    ArchSourceView view{};arch_source_view(o.get(),&view);o->prepared=view.source;return o.release();
  }catch(...){return nullptr;}
}
extern "C" ArchSourceResult* arch_source_build(const ArchSourceRequest*r,const ArchSourceControl*c){return source_build(r,c,false);}
extern "C" uint32_t arch_source_datum_probe_version(){return 1;}
extern "C" int arch_source_view(const ArchSourceResult*r,ArchSourceView*v){
  if(!r||!v)return 0;*v={};v->abi_version=1;v->semantics_version=2;v->verdict=r->verdict;v->export_blocked=r->verdict!=AS_OK||r->datum_probe;
  v->source={2,AM_PREPARED_SLABS,uint32_t(r->xy.size()/2),uint32_t(r->rings.size()),r->xy.data(),r->rings.data(),r->footprint_start,r->footprint_count,0,uint32_t(r->slabs.size()),r->slabs.data(),r->source_id,r->prov,r->bindings.data(),uint32_t(r->bindings.size()),0,r->attachments.data(),uint32_t(r->attachments.size()),0,r->eyelet,nullptr,0,0};
  v->parameters=r->params.data();v->parameter_count=uint32_t(r->params.size());v->contacts=r->contacts.data();v->contact_count=uint32_t(r->contacts.size());v->lineage=r->lineage.data();v->lineage_count=uint32_t(r->lineage.size());v->intervals=r->intervals.data();v->interval_count=uint32_t(r->intervals.size());v->diagnostics=r->diagnostics.data();v->diagnostic_count=uint32_t(r->diagnostics.size());v->proposals=r->proposals.data();v->proposal_count=uint32_t(r->proposals.size());v->errors=r->errors.data();v->error_count=uint32_t(r->errors.size());v->operations=r->ops;std::copy(r->transform,r->transform+6,v->source_transform);v->revision=r->revision;
  v->input_regions=r->input_regions.data();v->input_region_count=uint32_t(r->input_regions.size());v->input_texts=r->input_texts.data();v->input_text_count=uint32_t(r->input_texts.size());v->body_datum_z=r->body_datum_z;return 1;
}
extern "C" void arch_source_destroy(ArchSourceResult*r){delete r;}
extern "C" const ArchMechSource* arch_assembly_source(const ArchAssemblyResult*r){return r&&!r->datum_probe&&r->verdict==AS_OK?&r->prepared:nullptr;}
static ArchAssemblyResult* source_indexed(const ArchSourceRequest*r,const ArchSourceIndexed*s,const ArchSourceControl*c,bool probe){
  try{
    need(r&&s&&s->xy&&s->contours&&s->indices&&s->regions,"INDEXED_ARRAY");
    need(s->point_count>=3&&s->point_count<=200000&&s->contour_count>0&&s->contour_count<=66666&&s->index_count<=200000&&s->region_count>0&&s->region_count<=256,"INDEXED_BUDGET");
    std::vector<int64_t>xy;std::vector<ArchMechRing>rings;
    for(uint32_t i=0;i<s->contour_count;i++){
      if(c&&c->cancelled&&c->cancelled(c->data))throw Failure(AS_CANCELLED,"INDEXED_CANCELLED");
      auto&a=s->contours[i];need(a.reserved==0&&a.part<s->region_count&&a.index_count>=3&&a.index_start<=s->index_count&&a.index_count<=s->index_count-a.index_start,"INDEXED_CONTOUR");
      need(xy.size()/2+a.index_count<=200000,"INDEXED_EXPANDED_BUDGET",0,0,AS_RESOURCE);
      rings.push_back({uint32_t(xy.size()/2),a.index_count,0});
      for(uint32_t j=0;j<a.index_count;j++){auto n=s->indices[a.index_start+j];need(n<s->point_count,"INDEXED_POINT");xy.push_back(s->xy[2*n]);xy.push_back(s->xy[2*n+1]);}
    }
    for(uint32_t i=0;i<s->region_count;i++){auto&a=s->regions[i];need(a.ring_start<=s->contour_count&&a.ring_count<=s->contour_count-a.ring_start,"INDEXED_REGION");for(uint32_t j=0;j<a.ring_count;j++)need(s->contours[a.ring_start+j].part==i,"INDEXED_OWNER");}
    auto request=*r;request.point_count=uint32_t(xy.size()/2);request.ring_count=uint32_t(rings.size());request.region_count=s->region_count;request.xy=xy.data();request.rings=rings.data();request.regions=s->regions;return source_build(&request,c,probe);
  }catch(const Failure&e){try{auto o=std::make_unique<ArchSourceResult>();o->verdict=e.code;ArchSourceDiagnostic d{e.code,e.field,e.id,{}};std::strncpy(d.message,e.what(),159);o->diagnostics.push_back(d);return o.release();}catch(...){return nullptr;}}
  catch(...){return nullptr;}
}

extern "C" ArchAssemblyResult* arch_source_build_indexed(const ArchSourceRequest*r,const ArchSourceIndexed*s,const ArchSourceControl*c){return source_indexed(r,s,c,false);}
extern "C" ArchAssemblyResult* arch_source_probe_indexed(const ArchSourceRequest*r,const ArchSourceIndexed*s,const ArchSourceControl*c){return source_indexed(r,s,c,true);}
