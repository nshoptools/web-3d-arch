#include "product-bridge.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <vector>
#include <cstring>
#include <array>
std::vector<uint8_t> read(const char*f){std::ifstream s(f,std::ios::binary);if(!s)throw std::runtime_error("fixture input");return {std::istreambuf_iterator<char>(s),{}};}
void write(const std::string&f,const void*p,size_t n){std::ofstream s(f,std::ios::binary);s.write((const char*)p,n);if(!s)throw std::runtime_error("fixture output");}
int main(int argc,char**argv){try{
 if(argc!=4)throw std::runtime_error("source.arch request.aprq output-prefix");auto a=read(argv[1]),q=read(argv[2]);
 auto*r=arch_product_native_build(a.data(),uint32_t(a.size()),q.data(),uint32_t(q.size()),nullptr,1);
 if(!r)throw std::runtime_error("allocation");if(*arch_product_native_error(r))throw std::runtime_error(arch_product_native_error(r));
 uint32_t n=0;auto*p=arch_product_native_metadata(r,&n);write(std::string(argv[3])+".apms",p,n);
 ArchSceneView v{};bool ok=arch_product_native_mesh(r,&v);
 if(ok){
  std::array<uint32_t,32> h{};h[0]=0x48435241;h[1]=1;h[2]=128;h[4]=1;h[5]=v.vertex_count;h[6]=v.triangle_count;h[7]=v.part_count;
  uint32_t end=128;const uint32_t stride[]={24,12,40,16,16,4,16},align[]={8,4,8,8,4,4,4};
  for(int i=0;i<7;i++){end=(end+align[i]-1)/align[i]*align[i];h[12+i]=end;end+=h[5+i]*stride[i];}h[3]=end;
  std::vector<uint8_t>b(end);std::memcpy(b.data(),h.data(),128);
  std::memcpy(b.data()+h[12],v.vertices_xyz,v.vertex_count*24);std::memcpy(b.data()+h[13],v.triangles,v.triangle_count*12);std::memcpy(b.data()+h[14],v.parts,v.part_count*40);
  write(std::string(argv[3])+".arch",b.data(),b.size());
 }
 std::cout<<"model="<<ok<<" triangles="<<v.triangle_count<<" parts="<<v.part_count<<"\n";arch_product_native_destroy(r);return 0;
}catch(const std::exception&e){std::cerr<<e.what()<<"\n";return 1;}}
