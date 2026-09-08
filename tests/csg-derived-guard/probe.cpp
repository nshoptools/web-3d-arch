#include "mechanics.h"
#include "derived_guard.h"
#include <manifold/manifold.h>
#include <manifold/cross_section.h>
#include <array>
#include <vector>
#include <string>
#include <iostream>
#include <fstream>
#include <iomanip>
#include <stdexcept>
#include <cstring>
#include <numeric>
#include <cmath>
using manifold::Manifold;
void check(bool b,const char* s){if(!b)throw std::runtime_error(s);}
#include "ancestry.h"
Manifold box(double x,double y,double z,double w,double h,double d){return Manifold::Cube({w,h,d}).Translate({x,y,z});}
Manifold slit(double lo,double hi){return Manifold::Extrude({{{-2,-.05},{2,.05},{2.000002,.05},{-1.999998,-.05}}},hi-lo).Translate({0,0,lo});}
void archive(const std::string&filename,const Data&d){std::ofstream f(filename,std::ios::binary);uint32_t head[]={uint32_t(d.xyz.size()/3),uint32_t(d.tri.size()/3),uint32_t(d.parts.size())};f.write((char*)head,sizeof(head));f.write((char*)d.xyz.data(),d.xyz.size()*8);f.write((char*)d.tri.data(),d.tri.size()*4);check(bool(f),"write probe archive");}
int main(int argc,char**argv){try{
 check(argc==3,"probe case output-prefix");const std::string id=argv[1],out=argv[2];const uint32_t product=id.rfind("lego",0)==0?AM_LEGO:AM_STRAP;
 std::vector<ArchMechParam>params;for(uint32_t f=1;f<AM_FIELD_COUNT;f++)params.push_back(arch_mech_default_parameter(product,f));
 auto set=[&](const char*n,double value){auto f=arch_mech_field_id(n);check(f>0,"field");params[f-1].value=value;params[f-1].origin=AM_USER;params[f-1].provenance_id=10000+f;};
 set("baseH",6);params[AM_F_baseH-1].mode=AM_MM;set("topBevel",0);set("rimOn",0);set("artMode",0);set("size",40);
 if(product==AM_STRAP){set("strapD",4);set("strapZ",3);set("strapCham",0);set("strapSlot",0);set("strapAngle",0);set("rotObj",0);}
 else{set("legoHoleH",3);set("legoRong",0);set("legoRanhOn",0);set("legoXeOn",0);set("legoTaiOn",0);}
 const std::vector<int64_t>xy={-20000000,-15000000,20000000,-15000000,20000000,15000000,-20000000,15000000};ArchMechRing ring{0,4,99};
 ArchMechSlab slab{};slab.ring_count=1;slab.kind=AM_SOURCE_BODY;slab.role=AM_BODY;slab.rgba=0x30353bff;slab.slot=1;slab.origin=AM_USER;slab.z1=6;slab.semantic_id=600;slab.provenance_id=1600;
 ArchMechRequest q{};q.abi_version=2;q.product=product;q.parameters=params.data();q.parameter_count=params.size();q.schedule={1,0,0,0,200000,200000,101};q.mating_tolerance_mm=.001;q.export_tolerance_mm=.004;q.revision=42;
 q.source.version=2;q.source.mode=AM_PREPARED_SLABS;q.source.xy=xy.data();q.source.point_count=4;q.source.rings=&ring;q.source.ring_count=1;q.source.footprint_ring_count=1;q.source.slabs=&slab;q.source.slab_count=1;q.source.source_id=77;q.source.provenance_id=88;q.source.recipe_bindings=params.data();q.source.recipe_binding_count=params.size();
 auto*base=arch_mech_build(&q);ArchMechView bv{};check(base&&arch_mech_view(base,&bv),"base build");
 if(bv.verdict!=AM_OK){for(uint32_t k=0;k<bv.diagnostic_count;k++)std::cerr<<bv.diagnostics[k].message<<'\n';throw std::runtime_error("base refused");}
 auto*g=arch_mech_guard_take(base);check(g&&arch_mech_guard_charge(g)>0,"owned guard");check(arch_mech_guard_take(base)==nullptr,"take once");
 Data original,derived;
 for(uint32_t p=0;p<bv.part_count;p++){
  auto a=solid(bv,p),m=a;const auto group=bv.part_info[p].assembly_group;
  original.add(a,p,group,bv.parts[p].color_rgba);
  if(group==0){
   if(id=="strap-slit")m=a-slit(4.9,5.9);
   if(id=="strap-positive-roof")m=a-slit(5.01,5.9);
   if(id=="strap-parallel-wall")m=a-box(-5,1,2,10,15,2);
   if(id=="strap-safe-side-cut")m=a-box(3,7,2,1,1,1);
   if(id=="strap-plug")m=a+box(-.5,-.5,2.5,1,1,1);
   if(id=="lego-slit")m=a-slit(2.9,5.9);
   if(id=="lego-positive-roof")m=a-slit(3.01,5.9);
  }
  derived.add(m,p,group,bv.parts[p].color_rgba);
 }
 if(id=="strap-separate")derived.add(box(30,0,0,2,2,2),UINT32_MAX,2,0x445566ff);
 auto view=derived.view();const auto xyzBefore=derived.xyz;const auto triBefore=derived.tri;const auto paramsBefore=params;
 if(id=="strap-limit")view.vertex_count=1000001;
 if(id=="strap-bad-abi")view.abi_version=99;
 archive(out+".before.bin",original);archive(out+".after.bin",derived);
 arch_mech_destroy(base); // The guard must own every retained dependency.
 auto*c=arch_mech_control_create(1);if(id=="strap-cancel")check(arch_mech_control_cancel(c,1)==1,"cancel");
 auto*result=arch_mech_guard_check(g,&view,c,id=="strap-stale"?2:1);ArchMechView actual{};check(result&&arch_mech_view(result,&actual),"derived result");
 std::ofstream f(out+".json");f<<std::setprecision(17)<<"{\"id\":\""<<id<<"\",\"verdict\":"<<actual.verdict<<",\"exportBlocked\":"<<actual.export_blocked<<",\"resultVertices\":"<<actual.vertex_count<<",\"resultTriangles\":"<<actual.triangle_count<<",\"guardCharge\":"<<arch_mech_guard_charge(g)<<",\"diagnostics\":[";
 for(uint32_t k=0;k<actual.diagnostic_count;k++){if(k)f<<',';f<<'"'<<actual.diagnostics[k].message<<'"';}f<<"],\"features\":[";
 for(uint32_t k=0;k<actual.feature_count;k++){if(k)f<<',';const auto&a=actual.features[k];f<<"{\"id\":\""<<a.id<<"\",\"dimensions\":[";for(int j=0;j<6;j++){if(j)f<<',';f<<a.dimensions[j];}f<<"]}";}f<<"],\"inputUnchanged\":"<<(derived.xyz==xyzBefore&&derived.tri==triBefore&&!std::memcmp(params.data(),paramsBefore.data(),params.size()*sizeof(params[0]))?"true":"false")<<"}\n";
 std::cout<<id<<" verdict="<<actual.verdict<<" blocked="<<actual.export_blocked<<'\n';arch_mech_destroy(result);arch_mech_control_destroy(c);arch_mech_guard_destroy(g);return 0;
 }catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
