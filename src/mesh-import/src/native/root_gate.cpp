#include "imported_csg.h"
#include "derived_guard.h"
#include <sstream>
#include <cstring>
#include <memory>
#include "internal.hpp"
extern "C" uint32_t arch_mesh_check_final(const ArchMechGuard*g,uint32_t csg,const uint32_t*owners,const uint32_t*groups,uint32_t count,uint32_t generation,char*report,uint32_t capacity){
 try{
  if(!report||capacity<512||capacity>65536)return 0;
  ArchcsgView c{};if(!archcsg_view(csg,&c)||c.verdict||c.part_count!=count)throw std::runtime_error("CSG_FINAL_VIEW");
  using Control=std::unique_ptr<ArchMechControl,decltype(&arch_mech_control_destroy)>;
  using Result=std::unique_ptr<ArchMechResult,decltype(&arch_mech_destroy)>;
  Control control(arch_mech_control_create(generation),arch_mech_control_destroy);
  ArchMechDerivedView v{1,c.vertex_count,c.triangle_count,c.part_count,c.vertices,c.triangles,reinterpret_cast<const ArchMechPart*>(c.parts),owners,groups,reinterpret_cast<const uint32_t*>(c.face_origins)};
  const bool append=archcsg_operation(csg)==ARCHCSG_IMPORT_AS_PART;
  Result result(append?arch_mech_guard_check_append(g,&v,control.get(),generation):arch_mech_guard_check(g,&v,control.get(),generation),arch_mech_destroy);
  ArchMechView view{};if(!result||!arch_mech_view(result.get(),&view))throw std::runtime_error("CSG_FINAL_GUARD_ALLOCATION");
  std::ostringstream s;s<<"{\"version\":\"arch-mesh-post-csg-gates/1\",\"mechanicsSemantics\":3,\"sourceSemantics\":2,\"datumExtension\":1,\"verdict\":"<<view.verdict
   <<",\"exportBlocked\":"<<(view.export_blocked?"true":"false")<<",\"checks\":[";
  for(uint32_t i=0;i<view.diagnostic_count;i++){
   if(i)s<<',';const auto&d=view.diagnostics[i];
   s<<"{\"code\":"<<d.code<<",\"field\":"<<d.field_id<<",\"message\":"<<archmi::quoted(d.message)<<'}';
  }
  s<<"],\"fitQualification\":\"unqualified\",\"totalErrorBoundMm\":null}";
  auto text=s.str();if(text.size()+1>capacity)throw std::runtime_error("CSG_FINAL_REPORT_LIMIT");
  std::memcpy(report,text.c_str(),text.size()+1);return view.verdict==AM_OK&&!view.export_blocked?1:2;
 }catch(const std::exception&e){
  if(report&&capacity){const auto text=std::string("{\"version\":\"arch-mesh-post-csg-gates/1\",\"verdict\":4,\"error\":")+archmi::quoted(e.what())+"}";
   if(text.size()+1<=capacity)std::memcpy(report,text.c_str(),text.size()+1);else report[0]=0;}
  return 0;
 }catch(...){if(report&&capacity)report[0]=0;return 0;}
}
