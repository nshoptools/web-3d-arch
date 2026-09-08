#include "geometry.h"
#include <cmath>
#include <iostream>

int main(){
  int64_t xy[]={0,0,20000000,0,20000000,10000000,0,10000000,
    8000000,3000000,12000000,3000000,12000000,7000000,8000000,7000000};
  uint32_t ends[]={4,8},shapes[]={2},rules[]={1},colors[]={0x0080ffff};
  double z0[]={0},z1[]={2};char error[256];
  auto* s=arch_scene_build(xy,8,ends,2,shapes,1,rules,colors,z0,z1,error,256);
  if(!s){std::cerr<<error;return 1;}
  ArchSceneView v{};arch_scene_view(s,&v);
  std::cout<<"{\"abi\":"<<v.abi_version<<",\"vertices\":"<<v.vertex_count
    <<",\"triangles\":"<<v.triangle_count<<",\"volume\":"<<v.parts[0].volume_mm3<<"}\n";
  const bool ok=v.part_count==1&&std::abs(v.parts[0].volume_mm3-368.)<1e-8;
  arch_scene_destroy(s);return ok?0:2;
}
