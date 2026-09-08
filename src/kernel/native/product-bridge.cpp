#include "product-bridge.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <limits>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {
constexpr uint32_t CAP=8*1024*1024;
struct RequiredField { const char* name; int kind; double min,max; uint32_t products,source; double defaults[5]; };
const RequiredField required_fields[AM_FIELD_COUNT-1]={
#include "../mechanics/src/catalog.inc"
};
void need(bool value,const char* error){if(!value)throw std::runtime_error(error);}
uint32_t u32(const uint8_t* p){return uint32_t(p[0])|uint32_t(p[1])<<8|uint32_t(p[2])<<16|uint32_t(p[3])<<24;}
uint64_t u64(const uint8_t*p){return u32(p)|uint64_t(u32(p+4))<<32;}
double f64(const uint8_t*p){uint64_t n=u64(p);double d;std::memcpy(&d,&n,8);return d;}
void put32(std::vector<uint8_t>&b,size_t at,uint32_t n){for(int i=0;i<4;i++)b.at(at+i)=uint8_t(n>>(8*i));}
void put64(std::vector<uint8_t>&b,size_t at,uint64_t n){for(int i=0;i<8;i++)b.at(at+i)=uint8_t(n>>(8*i));}
void putf(std::vector<uint8_t>&b,size_t at,double d){uint64_t n;std::memcpy(&n,&d,8);put64(b,at,n);}
template<typename T> std::vector<T> take(const uint8_t*b,size_t n,size_t&at,uint32_t count,uint32_t max){
  need(count<=max&&at<=n&&uint64_t(count)*sizeof(T)<=n-at,"PRODUCT_REQUEST_TABLE");
  std::vector<T> result(count);
  if(count)std::memcpy(result.data(),b+at,size_t(count)*sizeof(T));
  at+=size_t(count)*sizeof(T);return result;
}
template<typename T> std::vector<T> arch_table(const uint8_t*b,size_t n,size_t at,uint32_t count,uint32_t max){
  return take<T>(b,n,at,count,max);
}
struct Selection {uint32_t source_index,reserved;ArchSourceRegion region;};
static_assert(sizeof(Selection)==112&&sizeof(ArchSourceRegion)==104&&sizeof(ArchSourceText)==120,"portable input sizes");
struct SourceOwner {ArchSourceResult* p=nullptr;~SourceOwner(){arch_source_destroy(p);}};
struct MechOwner {ArchMechResult* p=nullptr;~MechOwner(){arch_mech_destroy(p);}};
struct MechControlOwner {ArchMechControl* p=nullptr;~MechControlOwner(){arch_mech_control_destroy(p);}};
struct Observer{
  const ArchBuildControl* p;
  void check(uint32_t units)const{
    if(p){need(!p->cancelled(p->data),"CANCELLED");p->progress(p->data,units);}
  }
  static uint32_t cancel(void* data){auto&o=*static_cast<Observer*>(data);return o.p?o.p->cancelled(o.p->data):0;}
  static void progress(void* data,uint32_t done,uint32_t budget){auto&o=*static_cast<Observer*>(data);if(o.p)o.p->progress(o.p->data,300+uint32_t(300ull*done/std::max(1u,budget)));}
};
struct Table {uint32_t tag,stride,count,offset;};
struct Sidecar {
 std::vector<uint8_t> bytes=std::vector<uint8_t>(256+25*16,0);
 std::vector<Table> directory;
 uint32_t limit;
 explicit Sidecar(uint32_t l):limit(l){}
 void add(uint32_t tag,uint32_t stride,uint32_t count,const void*data){
  while(bytes.size()%8)bytes.push_back(0);
  need(directory.size()<25&&uint64_t(bytes.size())+uint64_t(stride)*count<=limit,"PRODUCT_METADATA_LIMIT");
  directory.push_back({tag,stride,count,uint32_t(bytes.size())});
  if(count){need(data,"PRODUCT_METADATA_POINTER");auto*p=static_cast<const uint8_t*>(data);bytes.insert(bytes.end(),p,p+size_t(stride)*count);}
 }
 template<class T> void add(uint32_t tag,uint32_t count,const T*data){add(tag,sizeof(T),count,data);}
 void finish(){
  put32(bytes,0,0x534d5041);put32(bytes,4,1);put32(bytes,8,uint32_t(bytes.size()));put32(bytes,12,uint32_t(directory.size()));
  for(size_t i=0;i<directory.size();i++){auto&t=directory[i];size_t at=256+i*16;put32(bytes,at,t.tag);put32(bytes,at+4,t.stride);put32(bytes,at+8,t.count);put32(bytes,at+12,t.offset);}
 }
};
}
struct ArchProductNative{
 MechOwner mesh;
 std::vector<uint8_t> metadata;
 std::string error;
};
static ArchProductNative* product_native(const uint8_t*arch,uint32_t archbytes,const uint8_t*wire,uint32_t wirebytes,const ArchBuildControl*control,uint32_t generation,bool probe){
 std::unique_ptr<ArchProductNative> out;
 try{
  out=std::make_unique<ArchProductNative>();Observer observer{control};observer.check(260);
  need(wire&&wirebytes>=256&&wirebytes<=2*1024*1024,"PRODUCT_REQUEST_SIZE");
  need(u32(wire)==0x51525041&&u32(wire+4)==1&&u32(wire+8)==wirebytes&&u32(wire+12)<5,"PRODUCT_REQUEST_VERSION");
  need(u32(wire+60)==(probe?1u:0u),"PRODUCT_REQUEST_FLAGS");
  for(size_t i=224;i<256;i++)need(wire[i]==0,"PRODUCT_RESERVED");
  need(arch&&archbytes>=128&&u32(arch)==0x48435241&&u32(arch+4)==1&&u32(arch+8)==128&&u32(arch+12)==archbytes,"PRODUCT_SOURCE_ARCH");
  need(arch_mech_abi_version()==2&&arch_mech_semantics_version()==3&&arch_source_abi_version()==1&&arch_source_semantics_version()==2&&arch_mech_source_datum_extension_version()==1,"PRODUCT_LIBRARY_ABI");
  const auto parts=arch_table<ArchPart>(arch,archbytes,u32(arch+56),u32(arch+28),4096);
  auto xy=arch_table<int64_t>(arch,archbytes,u32(arch+60),u32(arch+32)*2,400000);
  auto contours=arch_table<ArchSourceContour>(arch,archbytes,u32(arch+64),u32(arch+36),200000);
  auto indices=arch_table<uint32_t>(arch,archbytes,u32(arch+68),u32(arch+40),200000);
  size_t at=256;
  auto params=take<ArchMechParam>(wire,wirebytes,at,u32(wire+16),128);
  auto mats=take<ArchMechMaterial>(wire,wirebytes,at,u32(wire+20),9);
  auto select=take<Selection>(wire,wirebytes,at,u32(wire+24),4096);
  auto texts=take<ArchSourceText>(wire,wirebytes,at,u32(wire+28),256);
  auto upstream=take<ArchMechParam>(wire,wirebytes,at,u32(wire+32),7);
  auto bevels=take<ArchMechBevelOverride>(wire,wirebytes,at,u32(wire+36),1025);
  auto provenance=take<uint8_t>(wire,wirebytes,at,u32(wire+40),1024*1024);
  need(at==wirebytes&&params.size()>=7&&upstream.size()==7&&select.size()==parts.size()&&!parts.empty(),"PRODUCT_REQUEST_COUNTS");
  std::set<uint32_t> fields,selected;std::set<uint64_t> semantics;
  for(auto&p:params)need(p.field_id>0&&p.field_id<129&&fields.insert(p.field_id).second&&p.provenance_id,"PRODUCT_PARAMETER_ID");
  for(uint32_t id=1;id<=126;id++)if(id!=AM_F_strapSeg&&id!=AM_F_impVox&&(required_fields[id-1].products&(1u<<u32(wire+12))))need(fields.count(id),"PRODUCT_EFFECTIVE_PARAMETER_MISSING");
  for(uint32_t id=1;id<=7;id++)need(fields.count(id)&&upstream[id-1].field_id==id,"PRODUCT_UPSTREAM_FIELDS");
  for(auto&p:upstream){auto it=std::find_if(params.begin(),params.end(),[&](auto&v){return v.field_id==p.field_id;});
    need(it!=params.end()&&!std::memcmp(&*it,&p,sizeof p),"PRODUCT_UPSTREAM_STALE");}
  std::vector<ArchSourceRegion> regions(parts.size());
  for(const auto&v:select){
   need(v.reserved<=32&&v.source_index<4096&&selected.insert(v.reserved*4096+v.source_index).second,"PRODUCT_DUPLICATE_SOURCE_SELECTOR");
   auto it=std::find_if(parts.begin(),parts.end(),[&](auto&p){return p.source_index==v.reserved*4096+v.source_index;});
   need(it!=parts.end(),"PRODUCT_SOURCE_SELECTOR");
   need(std::count_if(parts.begin(),parts.end(),[&](auto&p){return p.source_index==v.reserved*4096+v.source_index;})==1,"PRODUCT_AMBIGUOUS_SOURCE_SELECTOR");
   size_t pi=size_t(it-parts.begin());const auto&p=*it;
   need(v.region.ring_start==0&&(v.region.ring_count==0||v.region.ring_count==p.contour_count)&&p.contour_count>0&&uint64_t(p.contour_start)+p.contour_count<=contours.size(),"PRODUCT_REGION_CONTOURS");
   need(v.region.semantic_id&&v.region.provenance_id&&semantics.insert(v.region.semantic_id).second,"PRODUCT_SEMANTIC_ID");
   for(uint32_t i=p.contour_start;i<p.contour_start+p.contour_count;i++){
    need(contours[i].part==pi&&!contours[i].reserved,"PRODUCT_CONTOUR_OWNERSHIP");
   }
   regions[pi]=v.region;regions[pi].ring_start=p.contour_start;regions[pi].ring_count=p.contour_count;
  }
  need(u64(wire+72)&&u64(wire+80)&&!semantics.count(u64(wire+72)),"PRODUCT_SOURCE_ID");
  ArchSourceRequest request{};request.abi_version=1;request.product=u32(wire+12);
  request.parameters=params.data();request.parameter_count=uint32_t(params.size());
  request.materials=mats.data();request.material_count=uint32_t(mats.size());
  std::memcpy(&request.schedule,wire+160,40);
  request.region_count=uint32_t(regions.size());request.regions=regions.data();
  request.texts=texts.data();request.text_count=uint32_t(texts.size());
  request.upstream_bindings=upstream.data();request.upstream_binding_count=uint32_t(upstream.size());
  request.source_id=u64(wire+72);request.provenance_id=u64(wire+80);request.revision=u64(wire+64);request.eyelet_text_id=u64(wire+88);
  request.max_slabs=u32(wire+44);request.max_points=u32(wire+48);request.max_operations=u32(wire+52);
  need(request.max_slabs&&request.max_slabs<=1024&&request.max_points>=3&&request.max_points<=200000&&request.max_operations&&request.max_operations<=100000,"PRODUCT_LIMITS");
  request.tolerance_mm=f64(wire+200);const double mating=f64(wire+208),exporttol=f64(wire+216);
  need(std::isfinite(mating)&&mating>=.000001&&mating<=.001&&std::isfinite(exporttol)&&exporttol>=.000001&&exporttol<=.004,"PRODUCT_TOLERANCE");
  uint32_t metalimit=u32(wire+56);need(metalimit>=4096&&metalimit<=CAP,"PRODUCT_METADATA_CAP");
  ArchSourceIndexed indexed{uint32_t(xy.size()/2),uint32_t(contours.size()),uint32_t(indices.size()),uint32_t(regions.size()),xy.data(),contours.data(),indices.data(),regions.data()};
  ArchSourceControl sourcecontrol{&observer,Observer::cancel,Observer::progress};
  uint32_t queries=0;
  for(auto&r:regions)if(r.override_height&&r.height.mode==AS_PROBE_LAYERS)queries++;
  for(auto&t:texts){if(t.height.mode==AS_PROBE_LAYERS)queries++;if(t.base_height.mode==AS_PROBE_LAYERS){need(t.base_on,"DATUM_PROBE_INACTIVE_BASE");queries++;}}
  need(probe?(queries>0&&queries<=64):queries==0,"PRODUCT_DATUM_PROBE_TARGET_COUNT");
  SourceOwner source{probe?arch_source_probe_indexed(&request,&indexed,&sourcecontrol):arch_source_build_indexed(&request,&indexed,&sourcecontrol)};
  need(source.p,"PRODUCT_SOURCE_ALLOCATION");ArchSourceView sv{};need(arch_source_view(source.p,&sv)==1,"PRODUCT_SOURCE_VIEW");
  need(sv.semantics_version==arch_source_semantics_version(),"PRODUCT_SOURCE_SEMANTICS");observer.check(620);
  if(probe&&sv.verdict==AS_OK){
   uint32_t covered=0;for(uint32_t i=0;i<sv.interval_count;i++)if(sv.intervals[i].mode==AS_PROBE_LAYERS)covered++;
   need(covered==queries,"PRODUCT_DATUM_PROBE_INACTIVE_OR_DUPLICATE_TARGET");
   need(!arch_assembly_source(source.p)&&sv.export_blocked,"PRODUCT_DATUM_PROBE_ISOLATION");
  }
  ArchMechView mv{};mv.verdict=AM_INVALID;mv.export_blocked=1;mv.revision=request.revision;
  if(auto* prepared=arch_assembly_source(source.p)){
   ArchMechRequest mechanical{};mechanical.abi_version=2;mechanical.product=request.product;
   mechanical.parameters=sv.parameters;mechanical.parameter_count=sv.parameter_count;
   mechanical.materials=mats.data();mechanical.material_count=uint32_t(mats.size());mechanical.schedule=request.schedule;
   mechanical.source=*prepared;mechanical.source.bevel_overrides=bevels.data();mechanical.source.bevel_override_count=uint32_t(bevels.size());
   mechanical.revision=request.revision;mechanical.mating_tolerance_mm=mating;mechanical.export_tolerance_mm=exporttol;
   MechControlOwner job{arch_mech_control_create(generation)};need(job.p,"PRODUCT_CONTROL_ALLOCATION");
   observer.check(650);
   out->mesh.p=arch_mech_build_controlled(&mechanical,job.p,generation);need(out->mesh.p,"PRODUCT_MECHANICS_ALLOCATION");
   need(arch_mech_view(out->mesh.p,&mv)==1,"PRODUCT_MECHANICS_VIEW");observer.check(920);
  }
  need(mv.vertex_count<=2000000&&mv.triangle_count<=2000000&&mv.part_count<=2048&&mv.feature_count<=8192,"PRODUCT_MESH_LIMIT");
  Sidecar meta(metalimit);
  put32(meta.bytes,16,sv.verdict);put32(meta.bytes,20,mv.verdict);put32(meta.bytes,24,mv.export_blocked);put32(meta.bytes,28,0);
  put64(meta.bytes,32,request.revision);put64(meta.bytes,40,request.source_id);put64(meta.bytes,48,request.provenance_id);
  put32(meta.bytes,56,request.product);put32(meta.bytes,60,sv.operations);
  putf(meta.bytes,64,request.tolerance_mm);putf(meta.bytes,72,mating);putf(meta.bytes,80,exporttol);
  for(int i=0;i<6;i++)putf(meta.bytes,88+8*i,sv.source_transform[i]);putf(meta.bytes,136,sv.body_datum_z);
  // No global bound is invented: upstream parsing/raster and general CSG error
  // are not certified by the local curve/offset records below.
  put32(meta.bytes,144,0); // globalErrorBoundKnown=false
  put32(meta.bytes,148,arch_mech_semantics_version());
  put32(meta.bytes,152,arch_source_semantics_version());
  put32(meta.bytes,156,probe?1:0);
  meta.add(1,mv.part_count,mv.part_info);meta.add(2,mv.feature_count,mv.features);
  meta.add(3,mv.curve_count,mv.curves);meta.add(4,mv.interval_count,mv.intervals);
  meta.add(5,mv.diagnostic_count,mv.diagnostics);meta.add(6,mv.proposal_count,mv.proposals);
  meta.add(7,mv.layer_boundary_count,mv.layer_boundaries);meta.add(8,mv.parameter_count,mv.parameters);
  meta.add(9,sv.contact_count,sv.contacts);meta.add(10,sv.lineage_count,sv.lineage);
  meta.add(11,sv.interval_count,sv.intervals);meta.add(12,sv.diagnostic_count,sv.diagnostics);
  meta.add(13,sv.proposal_count,sv.proposals);meta.add(14,sv.error_count,sv.errors);
  meta.add(15,sv.input_region_count,sv.input_regions);meta.add(16,sv.input_text_count,sv.input_texts);
  meta.add(17,uint32_t(mats.size()),mats.data());meta.add(18,uint32_t(upstream.size()),upstream.data());
  meta.add(19,uint32_t(bevels.size()),bevels.data());meta.add(20,uint32_t(provenance.size()),provenance.data());
  meta.add(21,sv.source.slab_count,sv.source.slabs);meta.add(22,sv.source.recipe_binding_count,sv.source.recipe_bindings);
  meta.add(23,sv.source.attachment_count,sv.source.attachments);
  meta.add(24,sv.source.ring_count,sv.source.rings);
  meta.add(25,16,sv.source.point_count,sv.source.xy);meta.finish();out->metadata=std::move(meta.bytes);
  observer.check(950);
 }catch(const std::exception&e){if(!out)return nullptr;out->error=e.what();out->metadata.clear();}
 catch(...){if(!out)return nullptr;out->error="PRODUCT_NATIVE_FAILURE";out->metadata.clear();}
 return out.release();
}
extern "C" ArchProductNative* arch_product_native_build(const uint8_t*a,uint32_t n,const uint8_t*w,uint32_t z,const ArchBuildControl*c,uint32_t g){return product_native(a,n,w,z,c,g,false);}
extern "C" ArchProductNative* arch_product_native_probe(const uint8_t*a,uint32_t n,const uint8_t*w,uint32_t z,const ArchBuildControl*c,uint32_t g){return product_native(a,n,w,z,c,g,true);}
extern "C" int arch_product_native_mesh(const ArchProductNative*p,ArchSceneView*out){
 if(!p||!out||!p->error.empty())return 0;ArchMechView m{};if(!arch_mech_view(p->mesh.p,&m)||m.verdict!=AM_OK)return 0;
 *out={};out->abi_version=1;out->vertex_count=m.vertex_count;out->triangle_count=m.triangle_count;out->part_count=m.part_count;
 out->vertices_xyz=m.vertices_xyz;out->triangles=m.triangles;out->parts=reinterpret_cast<const ArchPart*>(m.parts);return 1;
}
extern "C" const uint8_t* arch_product_native_metadata(const ArchProductNative*p,uint32_t*n){if(!p||!n)return nullptr;*n=uint32_t(p->metadata.size());return p->metadata.data();}
extern "C" const char* arch_product_native_error(const ArchProductNative*p){return p?p->error.c_str():"PRODUCT_NATIVE_ALLOCATION";}
extern "C" ArchMechGuard* arch_product_native_take_guard(ArchProductNative*p){return p&&p->error.empty()?arch_mech_guard_take(p->mesh.p):nullptr;}
extern "C" void arch_product_native_destroy(ArchProductNative*p){delete p;}
