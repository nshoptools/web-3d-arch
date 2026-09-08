// Test-only bridge replay of exact captured ARCH/1 source and AP RQ request.
// Product bridge and mechanical dependency are unchanged owner snapshots.
#include "product-bridge.h"
#include <manifold/cross_section.h>
#include <array>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>
#include <stdexcept>
namespace {
std::string output;
bool support_started=false;
struct CancelState {uint32_t calls=0;};
uint32_t cancel_support(void*data){auto&c=*static_cast<CancelState*>(data);return support_started&&++c.calls>=12;}
void progress_support(void*,uint32_t){}
void u32(std::ostream&s,uint32_t x){for(int i=0;i<4;i++)s.put(char(x>>(8*i)));}
void f64(std::ostream&s,double d){uint64_t q;std::memcpy(&q,&d,8);for(int i=0;i<8;i++)s.put(char(q>>(8*i)));}
void snapshot(const ArchSceneView&v){
 std::ofstream f(output+".arch",std::ios::binary);uint32_t offsets[7],end=128;
 const uint32_t counts[]={v.vertex_count,v.triangle_count,v.part_count,0,0,0,0},strides[]={24,12,40,16,16,4,16},align[]={8,4,8,8,4,4,4};
 for(uint32_t i=0;i<7;i++){end=(end+align[i]-1)/align[i]*align[i];offsets[i]=end;end+=counts[i]*strides[i];}
 std::array<uint32_t,32>h{};h[0]=0x48435241;h[1]=1;h[2]=128;h[3]=end;for(uint32_t i=0;i<7;i++){h[5+i]=counts[i];h[12+i]=offsets[i];}for(auto x:h)u32(f,x);
 for(uint32_t i=0;i<v.vertex_count*3;i++)f64(f,v.vertices_xyz[i]);for(uint32_t i=0;i<v.triangle_count*3;i++)u32(f,v.triangles[i]);while(uint32_t(f.tellp())<offsets[2])f.put(0);
 for(uint32_t i=0;i<v.part_count;i++){auto&p=v.parts[i];for(auto x:{p.vertex_start,p.vertex_count,p.triangle_start,p.triangle_count,p.color_rgba,p.source_index,0u,0u})u32(f,x);f64(f,p.volume_mm3);}while(uint32_t(f.tellp())<end)f.put(0);if(!f)throw std::runtime_error("snapshot write");
}
std::vector<uint8_t> read(const char*name){std::ifstream f(name,std::ios::binary);if(!f)throw std::runtime_error("read input");return {std::istreambuf_iterator<char>(f),std::istreambuf_iterator<char>()};}
}
void arch_test_support(const manifold::Polygons&polys){ support_started=true;
 std::ofstream f(output+".support.json");f<<std::setprecision(17)<<"[";bool first=true;
 for(auto&poly:polys){if(!first)f<<",";first=false;f<<"[";bool inner=true;for(auto p:poly){if(!inner)f<<",";inner=false;f<<"["<<p.x<<","<<p.y<<"]";}f<<"]";}f<<"]";
}
int main(int argc,char**argv){try{
 if(argc<4||argc>5)throw std::runtime_error("replay SOURCE.arch REQUEST.aprq OUTPUT_PREFIX [cancel-support]");output=argv[3];auto arch=read(argv[1]),wire=read(argv[2]);auto beforeArch=arch,beforeWire=wire;
  if(argc==5){
  if(std::string(argv[4])!="cancel-support")throw std::runtime_error("cancel mode");
  CancelState state;ArchBuildControl control{&state,cancel_support,progress_support};
  auto cancelled=arch_product_native_build(arch.data(),uint32_t(arch.size()),wire.data(),uint32_t(wire.size()),&control,1);
  if(!cancelled)throw std::runtime_error("cancel allocation");ArchSceneView empty{};uint32_t n=0;arch_product_native_metadata(cancelled,&n);
  const bool ok=!arch_product_native_mesh(cancelled,&empty)&&n==0&&std::string(arch_product_native_error(cancelled))=="CANCELLED"&&state.calls>=12;
  arch_product_native_destroy(cancelled);if(!ok)throw std::runtime_error("cancel did not refuse cleanly");
  if(arch!=beforeArch||wire!=beforeWire)throw std::runtime_error("cancel input mutation");
  std::ofstream(output+".cancel.json")<<"{\"observedDuringSupport\":true,\"checks\":"<<state.calls<<",\"metadataBytes\":0,\"mesh\":false,\"inputsPreserved\":true}";
 }
 auto p=arch_product_native_build(arch.data(),uint32_t(arch.size()),wire.data(),uint32_t(wire.size()),nullptr,2);if(!p)throw std::runtime_error("allocation");
 uint32_t n=0;const auto m=arch_product_native_metadata(p,&n);if(n){std::ofstream f(output+".apms",std::ios::binary);f.write(reinterpret_cast<const char*>(m),n);}
 ArchSceneView v{};bool mesh=arch_product_native_mesh(p,&v)==1;std::string error=arch_product_native_error(p);if(mesh)snapshot(v);
 if(arch!=beforeArch||wire!=beforeWire)throw std::runtime_error("input mutated");
 std::cout<<"{\"mesh\":"<<(mesh?"true":"false")<<",\"vertices\":"<<v.vertex_count<<",\"triangles\":"<<v.triangle_count<<",\"parts\":"<<v.part_count<<",\"error\":\""<<error<<"\",\"metadataBytes\":"<<n<<"}\n";
 arch_product_native_destroy(p);return error.empty()?0:2;
}catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 1;}}
