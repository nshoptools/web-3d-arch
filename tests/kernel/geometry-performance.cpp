// Analytic, test-only native performance probe; no output mesh files or timer
// threshold are used to manufacture a correctness verdict.
#include "geometry.h"
#include <chrono>
#include <cmath>
#include <iostream>
#include <string>
#include <vector>
using Clock=std::chrono::steady_clock;
struct Progress{Clock::time_point start;std::vector<std::pair<uint32_t,double>> samples;};
static uint32_t cancelled(void*){return 0;}
static void progress(void* data,uint32_t units){auto& p=*static_cast<Progress*>(data);if(p.samples.size()<32||units>=950){const auto seconds=std::chrono::duration<double>(Clock::now()-p.start).count();p.samples.emplace_back(units,seconds);std::cerr<<"progress "<<units<<" at "<<seconds<<"s\n"<<std::flush;}}
int main(int argc,char**argv){
  if(argc!=3)return 2;std::string kind=argv[1];unsigned count=static_cast<unsigned>(std::stoul(argv[2]));
  std::vector<int64_t> xy;std::vector<uint32_t> ends,shapes,rules,colors;std::vector<double> z0,z1;
  if(kind=="tiles"&&count>0&&count<=4096){
    for(unsigned i=0;i<count;i++){int64_t x=(i%64)*1000000LL,y=(i/64)*1000000LL;xy.insert(xy.end(),{x,y,x+1000000,y,x+1000000,y+1000000,x,y+1000000});ends.push_back(4*(i+1));shapes.push_back(i+1);rules.push_back(0);colors.push_back(0x0080ffff);z0.push_back(0);z1.push_back(2);}
  }else if(kind=="circle"&&count>=8&&count<=200000){
    for(unsigned i=0;i<count;i++){double a=6.2831853071795864769*i/count;xy.push_back(std::llround(100000000*std::cos(a)));xy.push_back(std::llround(100000000*std::sin(a)));}ends.push_back(count);shapes.push_back(1);rules.push_back(0);colors.push_back(0x0080ffff);z0.push_back(0);z1.push_back(2);
  }else return 2;
  Progress p{Clock::now(),{}};ArchBuildControl control{&p,cancelled,progress};char error[256];
  auto*scene=arch_scene_build_controlled(xy.data(),static_cast<uint32_t>(xy.size()/2),ends.data(),static_cast<uint32_t>(ends.size()),shapes.data(),static_cast<uint32_t>(shapes.size()),rules.data(),colors.data(),z0.data(),z1.data(),&control,error,256);
  if(!scene){std::cerr<<error;return 1;}ArchSceneView v{};arch_scene_view(scene,&v);double volume=0;for(unsigned i=0;i<v.part_count;i++)volume+=v.parts[i].volume_mm3;
  std::cout.precision(17);std::cout<<"{\"kind\":\""<<kind<<"\",\"count\":"<<count<<",\"seconds\":"<<std::chrono::duration<double>(Clock::now()-p.start).count()<<",\"vertices\":"<<v.vertex_count<<",\"triangles\":"<<v.triangle_count<<",\"parts\":"<<v.part_count<<",\"volume\":"<<volume<<",\"progressSamples\":[";
  for(size_t i=0;i<p.samples.size();i++){if(i)std::cout<<',';std::cout<<'['<<p.samples[i].first<<','<<p.samples[i].second<<']';}std::cout<<"]}\n";
  const bool valid=kind=="tiles"?std::abs(volume-2*count)<1e-6:std::abs(volume-10000*count*std::sin(6.2831853071795864769/count))<.01;
  arch_scene_destroy(scene);return valid?0:3;
}
