#include "source_assembly.h"
#include <algorithm>
#include <array>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>
void snapshot(const std::string& name,const ArchMechView& v){
 std::array<uint32_t,32> h{};h[0]=0x48435241;h[1]=1;h[2]=128;h[4]=1;h[5]=v.vertex_count;h[6]=v.triangle_count;h[7]=v.part_count;
 uint32_t end=128;const uint32_t stride[]={24,12,40,16,16,4,16},align[]={8,4,8,8,4,4,4};
 for(int i=0;i<7;i++){end=(end+align[i]-1)/align[i]*align[i];h[12+i]=end;end+=h[5+i]*stride[i];}h[3]=end;
 std::vector<char>b(end);std::memcpy(b.data(),h.data(),128);if(v.vertex_count)std::memcpy(b.data()+h[12],v.vertices_xyz,v.vertex_count*24);if(v.triangle_count)std::memcpy(b.data()+h[13],v.triangles,v.triangle_count*12);if(v.part_count)std::memcpy(b.data()+h[14],v.parts,v.part_count*40);
 std::ofstream f(name,std::ios::binary);f.write(b.data(),b.size());if(!f)throw std::runtime_error("mesh output");
}
void params(std::ostream& f,const ArchMechParam* p,uint32_t n){f<<'[';for(uint32_t i=0;i<n;i++){if(i)f<<',';auto&a=p[i];f<<"["<<a.field_id<<','<<a.mode<<','<<a.origin<<','<<a.datum<<','<<a.reference_layer<<','<<a.layer_count<<','<<a.value<<",\""<<a.provenance_id<<"\"]";}f<<']';}
int main(int argc,char**argv){try{
 if(argc!=3)throw std::runtime_error("request.txt output-prefix");std::ifstream in(argv[1]);std::string token,mode="source";uint32_t product=0;in>>token>>product;if(token!="product")throw std::runtime_error("product first");
 std::vector<ArchMechParam> p;for(uint32_t i=1;i<AM_FIELD_COUNT;i++)p.push_back(arch_mech_default_parameter(product,i));
 ArchMechSchedule schedule{1,0,0,0,200000,200000,101};double tolerance=.001,mating=.001,exptol=.004;
 uint32_t max_points=200000,max_slabs=1024,max_operations=100000,footstart=0,footcount=1,source_mode=AM_RAISED_BODY;
 std::vector<int64_t>xy;std::vector<ArchMechRing>rings;std::vector<ArchSourceRegion>regions;std::vector<ArchMechSlab>slabs;
 while(in>>token){
  if(token=="mode")in>>mode;
  else if(token=="param"){std::string name;double value;in>>name>>value;auto id=arch_mech_field_id(name.c_str());if(!id)throw std::runtime_error("unknown parameter");p[id-1].value=value;p[id-1].origin=AM_USER;p[id-1].provenance_id=10000+id;if(id==AM_F_ringH)p[id-1].mode=AM_MM;if(id==AM_F_legoRanhZ)p[id-1].mode=AM_SCALAR;}
  else if(token=="bind"){std::string name;in>>name;auto id=arch_mech_field_id(name.c_str());if(!id)throw std::runtime_error("unknown binding");auto&a=p[id-1];in>>a.mode>>a.datum>>a.reference_layer>>a.layer_count>>a.value;a.origin=AM_USER;a.provenance_id=20000+id;}
  else if(token=="schedule"){in>>schedule.first_nm>>schedule.regular_nm;p[AM_F_layerH-1].value=schedule.regular_nm/1e6;}
  else if(token=="tolerance")in>>tolerance>>mating>>exptol;
  else if(token=="limits")in>>max_points>>max_slabs>>max_operations;
  else if(token=="ring"){uint32_t n;in>>n;uint32_t start=xy.size()/2;for(uint32_t i=0;i<n;i++){int64_t x,y;in>>x>>y;xy.push_back(x);xy.push_back(y);}rings.push_back({start,n,100+rings.size()});}
  else if(token=="region"){ArchSourceRegion a{};in>>a.ring_start>>a.ring_count>>a.material.slot>>a.material.rgba;a.material.role=AM_ARTWORK;a.material.origin=AM_USER;a.semantic_id=500+regions.size();a.provenance_id=1500+regions.size();a.material.provenance_id=2500+regions.size();regions.push_back(a);}
  else if(token=="footprint")in>>footstart>>footcount>>source_mode;
  else if(token=="slab"){ArchMechSlab a{};in>>a.ring_start>>a.ring_count>>a.kind>>a.role>>a.slot>>a.rgba>>a.z0>>a.z1;a.origin=AM_USER;a.semantic_id=600+slabs.size();a.provenance_id=1600+slabs.size();slabs.push_back(a);}
  else throw std::runtime_error("unknown request token "+token);
  if(!in)throw std::runtime_error("bad request");
 }
 const auto beforexy=xy;const auto beforep=p;ArchSourceResult* sr=nullptr;ArchSourceView sv{};ArchMechView mv{};ArchMechResult* mr=nullptr;
 auto prepared=[&](){ArchMechSource s{};s.version=2;s.mode=source_mode;s.point_count=xy.size()/2;s.ring_count=rings.size();s.xy=xy.data();s.rings=rings.data();s.footprint_ring_start=footstart;s.footprint_ring_count=footcount;s.slab_count=slabs.size();s.slabs=slabs.data();s.source_id=77;s.provenance_id=88;s.recipe_bindings=p.data();s.recipe_binding_count=p.size();return s;};
 ArchMechSource source=prepared();
 if(mode=="source"){
  ArchSourceRequest q{};q.abi_version=1;q.product=product;q.parameters=p.data();q.parameter_count=p.size();q.schedule=schedule;q.point_count=xy.size()/2;q.ring_count=rings.size();q.region_count=regions.size();q.xy=xy.data();q.rings=rings.data();q.regions=regions.data();q.upstream_bindings=p.data();q.upstream_binding_count=7;q.max_slabs=max_slabs;q.max_points=max_points;q.max_operations=max_operations;q.tolerance_mm=tolerance;q.source_id=77;q.provenance_id=88;q.revision=42;
  sr=arch_source_build(&q,nullptr);if(!sr)throw std::runtime_error("source null");arch_source_view(sr,&sv);source=sv.source;
 }
 if(mode=="mechanics"||sv.verdict==AS_OK){ArchMechRequest q{};q.abi_version=2;q.product=product;q.parameters=p.data();q.parameter_count=p.size();q.schedule=schedule;q.source=source;q.mating_tolerance_mm=mating;q.export_tolerance_mm=exptol;q.revision=42;mr=arch_mech_build(&q);if(!mr)throw std::runtime_error("mechanics null");arch_mech_view(mr,&mv);}
 const bool unchanged=xy==beforexy&&p.size()==beforep.size()&&!std::memcmp(p.data(),beforep.data(),p.size()*sizeof(p[0]));
 snapshot(std::string(argv[2])+".arch",mv);std::ofstream f(std::string(argv[2])+".json");f<<std::setprecision(17);
 f<<"{\"sourceVerdict\":"<<(mode=="mechanics"?-1:int(sv.verdict))<<",\"mechanicsVerdict\":"<<(mr?int(mv.verdict):-1)<<",\"inputUnchanged\":"<<(unchanged?"true":"false")<<",\"exportBlocked\":"<<mv.export_blocked<<",\"parameters\":";params(f,p.data(),p.size());f<<",\"returnedParameters\":";params(f,mv.parameters,mv.parameter_count);
 f<<",\"diagnostics\":[";bool comma=false;for(uint32_t i=0;i<sv.diagnostic_count;i++){if(comma)f<<',';comma=true;f<<'"'<<sv.diagnostics[i].message<<'"';}for(uint32_t i=0;i<mv.diagnostic_count;i++){if(comma)f<<',';comma=true;f<<'"'<<mv.diagnostics[i].message<<'"';}f<<']';
 f<<",\"source\":{\"bodyDatumZ\":"<<sv.body_datum_z<<",\"xy\":[";for(uint32_t i=0;i<source.point_count;i++){if(i)f<<',';f<<'['<<source.xy[2*i]<<','<<source.xy[2*i+1]<<']';}f<<"],\"rings\":[";for(uint32_t i=0;i<source.ring_count;i++){if(i)f<<',';f<<'['<<source.rings[i].point_start<<','<<source.rings[i].point_count<<']';}f<<"],\"footprint\":["<<source.footprint_ring_start<<','<<source.footprint_ring_count<<"],\"slabs\":[";
 for(uint32_t i=0;i<source.slab_count;i++){if(i)f<<',';auto&a=source.slabs[i];f<<'['<<a.ring_start<<','<<a.ring_count<<','<<a.kind<<','<<a.role<<','<<a.slot<<','<<a.rgba<<','<<a.z0<<','<<a.z1<<",\""<<a.semantic_id<<"\"]";}f<<"]}";
 f<<",\"contacts\":[";for(uint32_t i=0;i<sv.contact_count;i++){if(i)f<<',';auto&a=sv.contacts[i];f<<'['<<a.slab_a<<','<<a.slab_b<<','<<a.kind<<','<<a.area_mm2<<','<<a.z0<<','<<a.z1<<']';}f<<"],\"intervals\":[";for(uint32_t i=0;i<sv.interval_count;i++){if(i)f<<',';auto&a=sv.intervals[i];f<<'['<<a.field_id<<','<<a.datum<<','<<a.mode<<','<<a.reference_layer<<','<<a.z0<<','<<a.z1<<']';}f<<']';
 f<<",\"parts\":[";for(uint32_t i=0;i<mv.part_count;i++){if(i)f<<',';auto&a=mv.part_info[i];f<<'['<<a.feature_index<<','<<a.role<<','<<a.slot<<','<<a.origin<<','<<a.assembly_group<<",\""<<a.provenance_id<<"\"]";}f<<"],\"features\":[";for(uint32_t i=0;i<mv.feature_count;i++){if(i)f<<',';auto&a=mv.features[i];f<<"{\"id\":\""<<a.id<<"\",\"dimensions\":[";for(int j=0;j<6;j++){if(j)f<<',';f<<a.dimensions[j];}f<<"]}";}f<<"]}\n";
 std::cout<<"source="<<(mode=="mechanics"?-1:int(sv.verdict))<<" mechanics="<<(mr?int(mv.verdict):-1)<<" triangles="<<mv.triangle_count<<'\n';arch_mech_destroy(mr);arch_source_destroy(sr);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 2;}}
